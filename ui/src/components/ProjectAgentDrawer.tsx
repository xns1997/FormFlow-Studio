import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { llmApi, projectApi } from '../services/io/api';
import { buildProjectPath } from '../services/io/routes';
import { useProjectStore } from '../project/store';
import ProjectAgentTimeline from './ProjectAgentTimeline';
import ProjectAgentActivityNotice from './ProjectAgentActivityNotice';
import ProjectAgentHistory from './ProjectAgentHistory';
import { activeProjectAgentPlan, buildProjectAgentTaskLineages, clampProjectAgentWidth, phaseLabels, requiresPauseBeforeSessionSwitch, sessionProjectScope, taskStatus, type ProjectAgentConnectionState, type ProjectAgentConversationMessage, type ProjectAgentHistorySummary, type ProjectAgentPhase, type ProjectAgentSessionV2 } from './projectAgentUiModel';
import { useAppInteraction } from './AppInteractionProvider';

interface Session extends ProjectAgentSessionV2 { title: string; messages: ProjectAgentConversationMessage[]; capabilityBundleVersionId: string; createdAt: string; updatedAt: string; }
interface OperationError { title: string; message: string; }
interface ProjectOption { id: string; name: string; updatedAt?: string; }

const phaseHelp: Record<ProjectAgentPhase, string> = { idle: '等待你描述目标和约束', grounding: '正在只读检查项目', analyzing_requirements: '大模型正在整体理解业务需求', clarifying: '需要补充少量关键决策', planning: '正在完善目标、成功标准和风险边界', awaiting_plan_approval: '目标契约尚未调用写工具', executing: '正在判断并执行最合适的下一步', recovering: '正在根据最新反馈调整下一步', awaiting_operation_approval: '等待高风险操作确认', paused: '已在安全工具边界暂停', completed: '目标和交付条件已通过验收', failed: '决策预算已耗尽或存在硬阻断', stopped: '执行已停止' };
const journey = [{ label: '描述目标', phases: ['idle'] }, { label: '检查项目', phases: ['grounding'] }, { label: '理解需求', phases: ['analyzing_requirements', 'clarifying'] }, { label: '生成计划', phases: ['planning'] }, { label: '确认计划', phases: ['awaiting_plan_approval'] }, { label: '执行与验收', phases: ['executing', 'recovering', 'awaiting_operation_approval', 'paused', 'completed', 'failed', 'stopped'] }] as const;
const localMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') !== 'cloud';
const connectionLabels: Record<ProjectAgentConnectionState, string> = { connecting: '连接中', connected: '实时连接', reconnecting: '正在重连', disconnected: '连接已断开' };
const WIDTH_KEY = 'formflow.projectAgent.width';
const PENDING_SESSION_KEY_PREFIX = 'formflow.projectAgent.pendingSession.';

function planningFailure(session: Session | null) { if (session?.phase !== 'failed') return undefined; const phaseEvent = [...session.events].reverse().find((event) => event.type === 'phase_changed'); return phaseEvent?.data?.stage === 'planning' ? [...session.events].reverse().find((event) => event.type === 'turn_failed' && event.data?.stage === 'planning' && event.seq <= phaseEvent.seq) : undefined; }
function journeyIndex(session: Session) { if (planningFailure(session)) return 3; const found = journey.findIndex((item) => (item.phases as readonly string[]).includes(session.phase)); return found < 0 ? journey.length - 1 : found; }
function initialWidth() { try { return clampProjectAgentWidth(Number(localStorage.getItem(WIDTH_KEY)) || 780, window.innerWidth); } catch { return 780; } }
function resolveDrawerPosition(launcherVariant: 'floating' | 'nav', drawerWidth: number): CSSProperties {
  if (launcherVariant !== 'nav' || typeof window === 'undefined' || window.innerWidth <= 760) return { width: drawerWidth };
  const topbarHeight = 56;
  return {
    top: topbarHeight,
    right: 0,
    bottom: 0,
    left: 'auto',
    width: drawerWidth,
    maxWidth: 'calc(100vw - 24px)',
    height: `calc(100vh - ${topbarHeight}px)`,
  };
}
export default function ProjectAgentDrawer({ projectId, launcherVariant = 'floating' }: { projectId?: string; launcherVariant?: 'floating' | 'nav' }) {
  const { confirm } = useAppInteraction();
  const navigate = useNavigate();
  const refreshProject = useProjectStore((state) => state.refreshProject);
  const launcherRef = useRef<HTMLButtonElement>(null); const historyButtonRef = useRef<HTMLButtonElement>(null); const composerRef = useRef<HTMLTextAreaElement>(null); const lastSeq = useRef(0); const refreshTimer = useRef<number | undefined>(undefined); const automaticApprovalIds = useRef(new Set<string>());
  const [open, setOpen] = useState(false); const [session, setSession] = useState<Session | null>(null); const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OperationError | null>(null); const [connection, setConnection] = useState<ProjectAgentConnectionState>('disconnected'); const [reconnectNonce, setReconnectNonce] = useState(0);
  const [width, setWidth] = useState(initialWidth); const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activityClock, setActivityClock] = useState(Date.now()); const [projects, setProjects] = useState<ProjectOption[]>([]); const [scopeOpen, setScopeOpen] = useState(false); const [historyMode, setHistoryMode] = useState(false); const [scopeProjectIds, setScopeProjectIds] = useState<string[]>([]); const [scopeCurrentProjectId, setScopeCurrentProjectId] = useState<string>();
  const [drawerStyle, setDrawerStyle] = useState<CSSProperties>(() => ({ width: initialWidth() }));

  const activateSession = useCallback((next: Session | null) => { setSession(next); setScopeProjectIds(next ? sessionProjectScope(next) : []); setScopeCurrentProjectId(next?.projectId); setPrompt(''); setAnswers({}); setError(null); automaticApprovalIds.current.clear(); lastSeq.current = next?.events[next.events.length - 1]?.seq || 0; setReconnectNonce((value) => value + 1); }, []);
  const loadSession = useCallback(async (id: string, boundProjectId?: string) => { const next = await llmApi.projectAgent.getSession(id, boundProjectId) as Session; setSession(next); setScopeProjectIds(sessionProjectScope(next)); setScopeCurrentProjectId(next.projectId); lastSeq.current = Math.max(lastSeq.current, next.events[next.events.length - 1]?.seq || 0); return next; }, []);
  const reportError = (title: string, cause: unknown) => setError({ title, message: cause instanceof Error ? cause.message : String(cause) });

  useEffect(() => { let cancelled = false; let pendingSessionId: string | null = null; try { const key = `${PENDING_SESSION_KEY_PREFIX}${projectId || '__unbound__'}`; pendingSessionId = sessionStorage.getItem(key); sessionStorage.removeItem(key); } catch { /* ignore */ } setSession(null); setError(null); setHistoryMode(false); lastSeq.current = 0;
    void Promise.all([projectApi.list(), pendingSessionId ? llmApi.projectAgent.getSession(pendingSessionId, projectId) as Promise<Session> : Promise.resolve(null)]).then(([projectItems, next]: [ProjectOption[], Session | null]) => { if (cancelled) return; setProjects(projectItems); activateSession(next); }).catch((cause) => reportError('无法读取智能体会话', cause)); return () => { cancelled = true; }; }, [projectId, activateSession]);
  useEffect(() => {
    if (!session?.id) { setConnection('disconnected'); return; }
    const controller = new AbortController(); let retryTimer: number | undefined; let failures = 0; let opened = false;
    const connect = async () => {
      if (controller.signal.aborted) return;
      setConnection(failures ? 'reconnecting' : 'connecting'); opened = false;
      try {
        await llmApi.projectAgent.streamEvents(session.id, lastSeq.current, (event) => {
          lastSeq.current = Math.max(lastSeq.current, Number(event.seq || 0));
          if (event.type === 'session_project_scope_changed') void projectApi.list().then((items) => setProjects(items)).catch(() => undefined);
          window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(() => void loadSession(session.id, session.projectId), 80);
        }, controller.signal, session.projectId, { onOpen: () => { opened = true; failures = 0; setConnection('connected'); }, onClose: () => { if (!controller.signal.aborted) setConnection('reconnecting'); } });
        if (!controller.signal.aborted) { failures += 1; setConnection(failures >= 3 ? 'disconnected' : 'reconnecting'); retryTimer = window.setTimeout(() => void connect(), Math.min(5000, 1000 * 2 ** failures)); }
      } catch {
        if (!controller.signal.aborted) { failures += 1; setConnection(failures >= 3 ? 'disconnected' : 'reconnecting'); retryTimer = window.setTimeout(() => void connect(), Math.min(5000, opened ? 1200 : 1000 * 2 ** failures)); }
      }
    };
    void connect(); return () => { controller.abort(); if (retryTimer) window.clearTimeout(retryTimer); window.clearTimeout(refreshTimer.current); };
  }, [session?.id, session?.projectId, projectId, loadSession, reconnectNonce]);

  useEffect(() => { const resize = () => setWidth((value) => clampProjectAgentWidth(value, window.innerWidth)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const updateDrawerPosition = () => setDrawerStyle(resolveDrawerPosition(launcherVariant, width));
    updateDrawerPosition();
    window.addEventListener('resize', updateDrawerPosition);
    return () => {
      window.removeEventListener('resize', updateDrawerPosition);
    };
  }, [open, launcherVariant, width]);
  useEffect(() => { if (!session || !['grounding', 'analyzing_requirements', 'planning', 'executing', 'recovering'].includes(session.phase)) return; setActivityClock(Date.now()); const timer = window.setInterval(() => setActivityClock(Date.now()), 1000); return () => window.clearInterval(timer); }, [session?.id, session?.phase]);
  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (historyMode) { setHistoryMode(false); window.requestAnimationFrame(() => historyButtonRef.current?.focus()); return; }
      if (scopeOpen) { setScopeOpen(false); return; }
      closeDrawer();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeDrawer, historyMode, open, scopeOpen]);
  useEffect(() => {
    const textarea = composerRef.current; if (!textarea) return;
    textarea.style.height = 'auto'; textarea.style.height = `${Math.min(120, Math.max(36, textarea.scrollHeight))}px`;
  }, [prompt]);

  async function ensureSession() { if (session) return session; let capabilityBundleVersionId: string | undefined; try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ } const created = await llmApi.projectAgent.createSession({ projectId, projectIds: projectId ? [projectId] : [], capabilityBundleVersionId }) as Session; activateSession(created); return created; }
  async function send(text = prompt) {
    const content = text.trim(); if (!content || busy) return; setBusy(true); setError(null); setPrompt('');
    let active: Session | undefined;
    try { active = await ensureSession(); const response = await llmApi.projectAgent.turn(active.id, { prompt: content, projectId: active.projectId }); const next = await loadSession(active.id, response.session?.projectId || active.projectId); if (next.projectId) await refreshProject(); setProjects(await projectApi.list()); setAnswers({}); }
    catch (cause) { let recovered: Session | undefined; if (active) { try { recovered = await loadSession(active.id, active.projectId); } catch { /* keep request error */ } } if (!planningFailure(recovered || null)) reportError('发送请求失败', cause); } finally { setBusy(false); }
  }
  async function retryPlanning() { if (!session || busy) return; setBusy(true); setError(null); try { const response = await llmApi.projectAgent.retryTurn(session.id, session.projectId); const next = await loadSession(session.id, response.session?.projectId || session.projectId); if (next.projectId) await refreshProject(); } catch (cause) { let recovered: Session | undefined; try { recovered = await loadSession(session.id, session.projectId); } catch { /* ignore */ } if (!planningFailure(recovered || null)) reportError('重新生成计划失败', cause); } finally { setBusy(false); } }
  async function confirmPlan(planId: string, requirementRevision: number) { if (!session || busy) return; setBusy(true); setError(null); try { await llmApi.projectAgent.confirmPlan(session.id, planId, { projectId: session.projectId, requirementsAcknowledged: true, requirementRevision }); await loadSession(session.id, session.projectId); } catch (cause) { reportError('确认计划失败', cause); } finally { setBusy(false); } }
  async function decideOperation(approvalId: string, approved: boolean, automatic = false) { if (!session || busy) return; setBusy(true); setError(null); try { await llmApi.projectAgent.decideOperation(session.id, approvalId, { approved, automatic, projectId: session.projectId }); await loadSession(session.id, session.projectId); if (session.projectId) await refreshProject(); } catch (cause) { reportError(automatic ? '本地操作自动继续失败' : approved ? '确认操作失败' : '拒绝操作失败', cause); } finally { setBusy(false); } }
  async function control(action: 'pause' | 'continue' | 'stop' | 'retry' | 'repair') { if (!session || busy) return; setBusy(true); setError(null); const names = { pause: '暂停失败', continue: '继续执行失败', stop: '停止失败', retry: '重试任务失败', repair: '启动自动修复失败' }; try { await llmApi.projectAgent.control(session.id, { action, projectId: session.projectId }); await loadSession(session.id, session.projectId); } catch (cause) { reportError(names[action], cause); } finally { setBusy(false); } }

  async function pauseBeforeLeaving(active: Session) {
    if (!requiresPauseBeforeSessionSwitch(active.phase)) return true;
    if (!await confirm({
      title: '暂停当前任务？',
      message: '当前任务仍在执行，切换前需要先暂停。',
      detail: '系统会等待安全工具边界，不会中断正在进行的写操作。',
      confirmLabel: '暂停并继续',
    })) return false;
    await llmApi.projectAgent.control(active.id, { action: 'pause', projectId: active.projectId });
    for (let attempt = 0; attempt < 40; attempt += 1) { const latest = await llmApi.projectAgent.getSession(active.id, active.projectId) as Session; if (!requiresPauseBeforeSessionSwitch(latest.phase)) return true; await new Promise((resolve) => window.setTimeout(resolve, 250)); }
    throw new Error('当前任务尚未到达安全暂停边界，请稍后重试');
  }
  async function startNewSession(boundProjectId?: string) { if (busy) return; setBusy(true); setError(null); try { if (session && !(await pauseBeforeLeaving(session))) return; let capabilityBundleVersionId: string | undefined; try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ } const created = await llmApi.projectAgent.createSession({ projectId: boundProjectId, projectIds: boundProjectId ? [boundProjectId] : [], capabilityBundleVersionId }) as Session; activateSession(created); } catch (cause) { reportError('新建会话失败', cause); } finally { setBusy(false); } }
  function toggleScopeProject(id: string) { setScopeProjectIds((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; setScopeCurrentProjectId((selected) => next.includes(selected || '') ? selected : next[0]); return next; }); }
  async function saveProjectScope() {
    if (!session || busy) return; setBusy(true); setError(null);
    try { if (!(await pauseBeforeLeaving(session))) return; const next = await llmApi.projectAgent.setProjects(session.id, { projectIds: scopeProjectIds, currentProjectId: scopeCurrentProjectId }) as Session; activateSession(next); setScopeOpen(false); }
    catch (cause) { reportError('限定项目失败', cause); } finally { setBusy(false); }
  }
  async function archiveCurrentSession() { if (!session || busy) return; const terminal = ['completed', 'stopped'].includes(session.phase); if (!terminal && !await confirm({ title: '归档未结束的任务？', message: '任务会先在安全边界暂停，然后移入归档。', detail: '已经写入的 FormFlow 项目不会被删除，之后可从历史任务中恢复。', confirmLabel: '暂停并归档', destructive: true })) return; setBusy(true); setError(null); try { if (requiresPauseBeforeSessionSwitch(session.phase)) { await llmApi.projectAgent.control(session.id, { action: 'pause', projectId: session.projectId }); let paused = false; for (let attempt = 0; attempt < 40; attempt += 1) { const latest = await llmApi.projectAgent.getSession(session.id, session.projectId) as Session; if (!requiresPauseBeforeSessionSwitch(latest.phase)) { paused = true; break; } await new Promise((resolve) => window.setTimeout(resolve, 250)); } if (!paused) throw new Error('任务尚未到达安全暂停边界，暂未归档'); } await llmApi.projectAgent.archive(session.id, session.projectId); activateSession(null); } catch (cause) { reportError('归档会话失败', cause); } finally { setBusy(false); } }
  async function activateHistorySession(next: ProjectAgentSessionV2 & { title: string }) { if (next.id === session?.id) { setHistoryMode(false); return; } setBusy(true); setError(null); try { if (session && !(await pauseBeforeLeaving(session))) return; activateSession(await llmApi.projectAgent.getSession(next.id, next.projectId) as Session); setHistoryMode(false); } catch (cause) { reportError('继续历史任务失败', cause); } finally { setBusy(false); } }
  function navigateToHistoryProject(summary: ProjectAgentHistorySummary) { const target = summary.projectId || summary.projectIds[0]; if (!target) return; try { sessionStorage.setItem(`${PENDING_SESSION_KEY_PREFIX}${target}`, summary.id); } catch { /* ignore */ } setHistoryMode(false); navigate(buildProjectPath(target)); }
  async function renameHistory(summary: ProjectAgentHistorySummary, title: string) { setBusy(true); try { const updated = await llmApi.projectAgent.updateMetadata(summary.id, { title }, summary.projectId) as Session; if (updated.id === session?.id) setSession((current) => current ? { ...current, title: updated.title } : current); } catch (cause) { reportError('重命名历史任务失败', cause); } finally { setBusy(false); } }
  async function toggleHistoryPin(summary: ProjectAgentHistorySummary) { setBusy(true); try { await llmApi.projectAgent.updateMetadata(summary.id, { pinned: !summary.pinnedAt }, summary.projectId); } catch (cause) { reportError('更新置顶状态失败', cause); } finally { setBusy(false); } }
  async function archiveHistory(summary: ProjectAgentHistorySummary) {
    const terminal = ['completed', 'stopped'].includes(summary.phase);
    if (!terminal && !await confirm({ title: '归档未结束的任务？', message: '任务会先在安全边界暂停，然后移入归档。', detail: '项目中的既有修改不会被撤销，之后可从归档中恢复任务。', confirmLabel: '暂停并归档', destructive: true })) return;
    setBusy(true); setError(null);
    try {
      const full = summary.id === session?.id && session ? session : await llmApi.projectAgent.getSession(summary.id, summary.projectId) as Session;
      if (requiresPauseBeforeSessionSwitch(full.phase)) { await llmApi.projectAgent.control(full.id, { action: 'pause', projectId: full.projectId }); let paused = false; for (let attempt = 0; attempt < 40; attempt += 1) { const latest = await llmApi.projectAgent.getSession(full.id, full.projectId) as Session; if (!requiresPauseBeforeSessionSwitch(latest.phase)) { paused = true; break; } await new Promise((resolve) => window.setTimeout(resolve, 250)); } if (!paused) throw new Error('任务尚未到达安全暂停边界，暂未归档'); }
      await llmApi.projectAgent.archive(full.id, full.projectId); if (full.id === session?.id) activateSession(null);
    } catch (cause) { reportError('归档历史任务失败', cause); } finally { setBusy(false); }
  }
  async function restoreHistory(summary: ProjectAgentHistorySummary) { setBusy(true); try { await llmApi.projectAgent.restore(summary.id, summary.projectId); } catch (cause) { reportError('恢复历史任务失败', cause); } finally { setBusy(false); } }
  async function deleteHistory(summary: ProjectAgentHistorySummary) {
    if (!await confirm({ title: '永久删除任务？', message: `将删除“${summary.title}”的对话、行动、证据和审计记录。`, detail: 'FormFlow 项目内容不会被删除，但任务记录无法恢复。', confirmLabel: '继续', destructive: true })) return false;
    if (!await confirm({ title: '再次确认永久删除', message: `确定永久删除“${summary.title}”？`, detail: '这是最后一次确认。删除后无法从归档中恢复。', confirmLabel: '永久删除', destructive: true })) return false;
    setBusy(true); setError(null);
    try {
      const full = summary.id === session?.id && session ? session : await llmApi.projectAgent.getSession(summary.id, summary.projectId) as Session;
      if (requiresPauseBeforeSessionSwitch(full.phase)) { await llmApi.projectAgent.control(full.id, { action: 'pause', projectId: full.projectId }); let paused = false; for (let attempt = 0; attempt < 40; attempt += 1) { const latest = await llmApi.projectAgent.getSession(full.id, full.projectId) as Session; if (!requiresPauseBeforeSessionSwitch(latest.phase)) { paused = true; break; } await new Promise((resolve) => window.setTimeout(resolve, 250)); } if (!paused) throw new Error('任务尚未到达安全暂停边界，暂未删除'); }
      await llmApi.projectAgent.permanentlyDelete(full.id, full.projectId); if (full.id === session?.id) activateSession(null); return true;
    } catch (cause) { reportError('永久删除历史任务失败', cause); return false; } finally { setBusy(false); }
  }

  useEffect(() => { const approvalId = session?.pendingApproval?.id; if (!localMode || !approvalId || busy || automaticApprovalIds.current.has(approvalId)) return; automaticApprovalIds.current.add(approvalId); void decideOperation(approvalId, true, true); }, [session?.pendingApproval?.id, busy]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 760) return; event.preventDefault(); const startX = event.clientX; const startWidth = width; const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => setWidth(clampProjectAgentWidth(startWidth + startX - next.clientX, window.innerWidth));
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); setWidth((value) => { try { localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* ignore */ } return value; }); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end);
  }
  function resizeByKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const next = clampProjectAgentWidth(width + (event.key === 'ArrowLeft' ? 20 : -20), window.innerWidth); setWidth(next); try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* ignore */ } }
  function submitAnswers() { if (!session?.questions.length) return; const content = session.questions.map((question) => `${question.header}：${answers[question.id]?.trim() || ''}`).join('\n'); void send(content); }
  const currentJourney = session ? journeyIndex(session) : 0;
  const activePlan = activeProjectAgentPlan(session || ({ plans: [] } as unknown as Session));
  const taskLineages = buildProjectAgentTaskLineages(activePlan?.tasks || []); const taskCount = taskLineages.length;
  const passedTaskCount = taskLineages.filter((lineage) => taskStatus(lineage.representative.status) === 'passed').length;
  const taskPercent = taskCount ? Math.round(passedTaskCount / taskCount * 100) : 0;
  const awaitingPlan = session?.phase === 'awaiting_plan_approval';
  const composerLabel = awaitingPlan ? '提交修改意见' : session && ['executing', 'recovering'].includes(session.phase) ? '请求转向' : session?.phase === 'clarifying' ? '回答问题' : '发送';
  function submitComposer() { void send(); }

  const launcherClassName = launcherVariant === 'nav'
    ? `project-agent-nav-trigger nav-link ${open ? 'active' : ''}`
    : `project-agent-launcher ${open ? 'active' : ''}`;
  const mergedDrawerStyle = useMemo(() => open ? drawerStyle : { width }, [drawerStyle, open, width]);

  const drawerNode = open ? <aside className={`project-agent-drawer ${launcherVariant === 'nav' ? 'project-agent-drawer-anchored' : ''}`} style={mergedDrawerStyle} aria-label="项目智能体">
      <div className="project-agent-resize-handle" role="separator" aria-label="调整项目智能体工作台宽度" aria-orientation="vertical" aria-valuemin={520} aria-valuemax={920} aria-valuenow={width} tabIndex={0} onPointerDown={beginResize} onKeyDown={resizeByKeyboard} />
      <header className="project-agent-workbench-header"><div className="project-agent-workbench-title"><strong>{historyMode ? '历史任务' : session?.title || '项目智能体'}</strong><small>{historyMode ? '搜索、查看和管理过去的任务' : session ? `项目智能体 · ${phaseHelp[session.phase]}` : '先检查、再规划、确认后执行'}</small></div><div className="project-agent-header-actions"><span className={`project-agent-connection-badge ${connection}`} title={connectionLabels[connection]}><i />{session ? connectionLabels[connection] : '未连接'}</span><button ref={historyButtonRef} type="button" className={`project-agent-history-button ${historyMode ? 'active' : ''}`} aria-pressed={historyMode} onClick={() => { setHistoryMode((value) => !value); setScopeOpen(false); }}>历史</button>{!historyMode && <button type="button" className="primary" disabled={busy} onClick={() => void startNewSession(projectId)}>新建任务</button>}{!historyMode && <details className="project-agent-more-menu"><summary aria-label="更多操作">•••</summary><div>{session && <button type="button" disabled={busy} onClick={() => setScopeOpen(true)}>限定项目范围…</button>}<button type="button" disabled={busy} onClick={() => void startNewSession(undefined)}>创建新项目</button>{session && <button type="button" className="danger-text" disabled={busy} onClick={() => void archiveCurrentSession()}>归档当前会话</button>}</div></details>}<button type="button" className="project-agent-close" onClick={closeDrawer} aria-label="关闭项目智能体">×</button></div></header>
      {historyMode ? <ProjectAgentHistory activeSession={session} currentProjectId={projectId} projects={projects} busy={busy} onClose={() => { setHistoryMode(false); window.requestAnimationFrame(() => historyButtonRef.current?.focus()); }} onActivate={activateHistorySession} onNavigate={navigateToHistoryProject} onRename={renameHistory} onTogglePin={toggleHistoryPin} onArchive={archiveHistory} onRestore={restoreHistory} onDelete={deleteHistory} /> : <>
      {scopeOpen && session && <section className="project-agent-project-scope-card project-agent-floating-card" aria-label="限定项目范围"><header><div><strong>限定项目范围</strong><span>专家只能访问选中的项目，实心圆表示当前项目。</span></div><button type="button" onClick={() => setScopeOpen(false)} aria-label="关闭项目范围">×</button></header><div className="project-agent-project-options">{projects.map((item) => { const selected = scopeProjectIds.includes(item.id); const current = scopeCurrentProjectId === item.id; return <div key={item.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={selected} onChange={() => toggleScopeProject(item.id)} aria-label={`限定项目 ${item.name}`} /><span><strong>{item.name}</strong><small>{item.id}</small></span><button type="button" className={current ? 'current' : ''} disabled={!selected} onClick={() => setScopeCurrentProjectId(item.id)} aria-label={`设 ${item.name} 为当前项目`}>{current ? '●' : '○'}</button></div>; })}{!projects.length && <p>暂无可用项目。描述创建需求后，新项目会自动加入范围。</p>}</div><footer><span>{scopeProjectIds.length ? `已限定 ${scopeProjectIds.length} 个项目` : '未限定项目，可创建新项目'}</span><button type="button" disabled={busy} onClick={() => void saveProjectScope()}>应用范围</button></footer></section>}
      {session && <section className={`project-agent-statusbar ${session.phase}`} aria-label="会话状态"><div className="project-agent-status-summary"><strong>{planningFailure(session) ? '规划未完成' : phaseLabels[session.phase]}</strong><small>{taskCount ? `${passedTaskCount}/${taskCount} 项行动已完成` : session.phase === 'idle' ? '等待你描述目标' : ['executing', 'recovering'].includes(session.phase) ? '正在判断下一步行动' : '正在完善目标契约'}{session.requirementCoverage?.total ? ` · 需求 ${['planning', 'clarifying', 'awaiting_plan_approval'].includes(session.phase) ? `${session.requirementCoverage.supported}/${session.requirementCoverage.total} 已明确` : `${session.requirementCoverage.verified}/${session.requirementCoverage.total} 已验证`}` : ''}</small></div><nav className="project-agent-stagebar" aria-label="会话阶段">{journey.map((item, index) => { const state = index < currentJourney ? 'passed' : index === currentJourney ? planningFailure(session) || session.phase === 'failed' ? 'failed' : 'active' : ''; return <span key={item.label} className={state} title={item.label}><i>{index < currentJourney ? '✓' : index + 1}</i><b>{item.label}</b></span>; })}</nav>{taskCount > 0 && session.phase !== 'completed' && <div className="project-agent-status-progress" aria-label={`行动完成度 ${taskPercent}%`}><span style={{ width: `${taskPercent}%` }} /></div>}<div className="project-agent-status-actions">{(['executing', 'recovering'] as ProjectAgentPhase[]).includes(session.phase) && <button type="button" disabled={busy} onClick={() => void control('pause')}>暂停</button>}{(['paused', 'stopped'] as ProjectAgentPhase[]).includes(session.phase) && <button type="button" disabled={busy} onClick={() => void control('continue')}>继续</button>}{!['idle', 'clarifying', 'awaiting_plan_approval', 'awaiting_operation_approval', 'paused', 'completed', 'stopped', 'failed'].includes(session.phase) && <button type="button" className="danger" disabled={busy} onClick={() => void control('stop')}>停止</button>}</div></section>}
      {session && connection !== 'connected' && <div className={`project-agent-connection-notice ${connection}`} role="status"><div><strong>{connection === 'disconnected' ? '实时连接已断开' : connectionLabels[connection]}</strong><span>任务状态会从最后事件序号 #{lastSeq.current} 恢复，不会自动重放写操作。</span></div><button type="button" onClick={() => setReconnectNonce((value) => value + 1)}>立即重连</button></div>}
      <ProjectAgentActivityNotice session={session} connection={connection} now={activityClock} onRefresh={() => session && void loadSession(session.id, session.projectId)} />
      <main id="project-agent-workbench-panel" className="project-agent-workbench-content" aria-label="对话与任务时间线">
        {session ? <ProjectAgentTimeline session={session} busy={busy} answers={answers} manualOperationApproval={!localMode} onAnswer={(id, answer) => setAnswers((current) => ({ ...current, [id]: answer }))} onSubmitAnswers={submitAnswers} onUseExample={() => void send('创建一个员工信息查询编辑项目，包含部门字典、录入表单、查询表单和完整测试数据')} onConfirmPlan={(id, requirementRevision) => void confirmPlan(id, requirementRevision)} onConfirmOperation={(id, approved) => void decideOperation(id, approved)} onControl={(action) => void control(action)} onRetryPlanning={() => void retryPlanning()} /> : <div className="project-agent-empty-workbench"><strong>开始一个新任务</strong><p>选择工作范围后描述目标，智能体会先检查现状并生成可确认的目标契约。</p><div>{projectId && <button type="button" onClick={() => void startNewSession(projectId)}>修改当前项目</button>}<button type="button" onClick={() => void startNewSession(undefined)}>创建新项目</button></div></div>}
      </main>
      <footer className="project-agent-input"><textarea ref={composerRef} rows={1} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitComposer(); }} placeholder={awaitingPlan ? '输入需求或计划修改意见' : session && ['executing', 'recovering'].includes(session.phase) ? '输入新要求，在安全边界转向' : session?.phase === 'clarifying' ? '统一回答问题' : '描述目标、约束和完成标准'} /><div><small>⌘/Ctrl + Enter</small><button type="button" disabled={busy || !prompt.trim()} onClick={submitComposer}>{composerLabel}</button></div></footer>
      </>}
      {error && <div className="project-agent-error" role="alert"><div><strong>{error.title}</strong><span>{error.message}</span><small>系统不会自动重放写操作。可先刷新状态，再由你决定是否重新执行。</small></div><div><button type="button" onClick={() => historyMode ? setError(null) : session && void loadSession(session.id, session.projectId)}>{historyMode ? '知道了' : '刷新状态'}</button><button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">×</button></div></div>}
    </aside> : null;

  return <>
    <button ref={launcherRef} type="button" className={launcherClassName} onClick={() => setOpen((value) => !value)} aria-label="项目智能体" aria-expanded={open}>
      <span aria-hidden="true">✦</span>
      <span className={launcherVariant === 'nav' ? 'nav-label' : undefined}>项目智能体</span>
    </button>
    {drawerNode && typeof document !== 'undefined' ? createPortal(drawerNode, document.body) : drawerNode}
  </>;
}
