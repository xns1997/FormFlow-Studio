import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { llmApi, projectApi } from '../services/io/api';
import { useProjectStore } from '../project/store';
import ProjectAgentProgressCards from './ProjectAgentProgressCards';
import ProjectAgentConversation, { type ProjectAgentConversationMessage } from './ProjectAgentConversation';
import ProjectAgentActivityNotice from './ProjectAgentActivityNotice';
import { activeProjectAgentPlan, buildProjectAgentTaskLineages, chooseCurrentTaskId, chooseInitialProjectAgentSession, clampProjectAgentWidth, groupProjectAgentSessions, isAffirmativePlanConfirmation, phaseLabels, projectAgentSessionStorageKey, requiresPauseBeforeSessionSwitch, sessionProjectScope, taskStatus, type ProjectAgentConnectionState, type ProjectAgentPhase, type ProjectAgentSessionV2 } from './projectAgentUiModel';
import { useAppInteraction } from './AppInteractionProvider';

interface Session extends ProjectAgentSessionV2 { title: string; messages: ProjectAgentConversationMessage[]; capabilityBundleVersionId: string; createdAt: string; updatedAt: string; }
interface OperationError { title: string; message: string; }
interface ProjectOption { id: string; name: string; updatedAt?: string; }
type WorkbenchTab = 'tasks' | 'conversation';

const phaseHelp: Record<ProjectAgentPhase, string> = { grounding: '正在只读检查项目', clarifying: '需要补充少量关键决策', planning: '正在生成决策完整的任务图', awaiting_plan_approval: '计划尚未调用写工具', executing: '按依赖关系执行专职任务', recovering: '正在诊断失败并动态修订任务图', awaiting_operation_approval: '等待高风险操作确认', paused: '已在安全工具边界暂停', completed: '所有任务已通过验收', failed: '自动恢复预算已耗尽或存在硬阻断', stopped: '执行已停止' };
const journey = [{ label: '检查项目', phases: ['grounding'] }, { label: '生成计划', phases: ['clarifying', 'planning'] }, { label: '确认计划', phases: ['awaiting_plan_approval'] }, { label: '执行与验收', phases: ['executing', 'recovering', 'awaiting_operation_approval', 'paused', 'completed', 'failed', 'stopped'] }] as const;
const localMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') !== 'cloud';
const connectionLabels: Record<ProjectAgentConnectionState, string> = { connecting: '连接中', connected: '实时连接', reconnecting: '正在重连', disconnected: '连接已断开' };
const WIDTH_KEY = 'formflow.projectAgent.width';
const TAB_KEY = 'formflow.projectAgent.tab';

function planningFailure(session: Session | null) { if (session?.phase !== 'failed') return undefined; const phaseEvent = [...session.events].reverse().find((event) => event.type === 'phase_changed'); return phaseEvent?.data?.stage === 'planning' ? [...session.events].reverse().find((event) => event.type === 'turn_failed' && event.data?.stage === 'planning' && event.seq <= phaseEvent.seq) : undefined; }
function journeyIndex(session: Session) { if (planningFailure(session)) return 1; const found = journey.findIndex((item) => (item.phases as readonly string[]).includes(session.phase)); return found < 0 ? 3 : found; }
function initialWidth() { try { return clampProjectAgentWidth(Number(localStorage.getItem(WIDTH_KEY)) || 780, window.innerWidth); } catch { return 780; } }
function initialTab(): WorkbenchTab { try { return localStorage.getItem(TAB_KEY) === 'conversation' ? 'conversation' : 'tasks'; } catch { return 'tasks'; } }
function relativeTime(value: string) { const elapsed = Date.now() - new Date(value).getTime(); if (!Number.isFinite(elapsed) || elapsed < 0) return '刚刚'; const minutes = Math.floor(elapsed / 60_000); if (minutes < 1) return '刚刚'; if (minutes < 60) return `${minutes} 分钟前`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} 小时前`; const days = Math.floor(hours / 24); return days < 30 ? `${days} 天前` : new Date(value).toLocaleDateString('zh-CN'); }

export default function ProjectAgentDrawer({ projectId }: { projectId?: string }) {
  const { confirm } = useAppInteraction();
  const refreshProject = useProjectStore((state) => state.refreshProject);
  const launcherRef = useRef<HTMLButtonElement>(null); const historyButtonRef = useRef<HTMLButtonElement>(null); const historyContainerRef = useRef<HTMLDivElement>(null); const composerRef = useRef<HTMLTextAreaElement>(null); const lastSeq = useRef(0); const refreshTimer = useRef<number | undefined>(undefined); const automaticApprovalIds = useRef(new Set<string>()); const manualTaskSelection = useRef(false);
  const [open, setOpen] = useState(false); const [session, setSession] = useState<Session | null>(null); const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OperationError | null>(null); const [connection, setConnection] = useState<ProjectAgentConnectionState>('disconnected'); const [reconnectNonce, setReconnectNonce] = useState(0);
  const [tab, setTabState] = useState<WorkbenchTab>(initialTab); const [width, setWidth] = useState(initialWidth); const [selectedTaskId, setSelectedTaskId] = useState<string>(); const [answers, setAnswers] = useState<Record<string, string>>({}); const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [activityClock, setActivityClock] = useState(Date.now()); const [projects, setProjects] = useState<ProjectOption[]>([]); const [scopeOpen, setScopeOpen] = useState(false); const [historyOpen, setHistoryOpen] = useState(false); const [historyQuery, setHistoryQuery] = useState(''); const [scopeProjectIds, setScopeProjectIds] = useState<string[]>([]); const [scopeCurrentProjectId, setScopeCurrentProjectId] = useState<string>();

  const setTab = (next: WorkbenchTab) => { setTabState(next); try { localStorage.setItem(TAB_KEY, next); } catch { /* ignore */ } };
  const activateSession = useCallback((next: Session | null) => { setSession(next); setScopeProjectIds(next ? sessionProjectScope(next) : []); setScopeCurrentProjectId(next?.projectId); setPrompt(''); setAnswers({}); setError(null); setSelectedTaskId(undefined); manualTaskSelection.current = false; automaticApprovalIds.current.clear(); lastSeq.current = next?.events[next.events.length - 1]?.seq || 0; setReconnectNonce((value) => value + 1); try { const key = projectAgentSessionStorageKey(projectId); if (next) localStorage.setItem(key, next.id); else localStorage.removeItem(key); } catch { /* ignore */ } }, [projectId]);
  const loadSession = useCallback(async (id: string, boundProjectId?: string) => { const next = await llmApi.projectAgent.getSession(id, boundProjectId) as Session; setSession(next); setScopeProjectIds(sessionProjectScope(next)); setScopeCurrentProjectId(next.projectId); lastSeq.current = Math.max(lastSeq.current, next.events[next.events.length - 1]?.seq || 0); return next; }, []);
  const reportError = (title: string, cause: unknown) => setError({ title, message: cause instanceof Error ? cause.message : String(cause) });

  useEffect(() => { let cancelled = false; let remembered: string | null = null; try { remembered = localStorage.getItem(projectAgentSessionStorageKey(projectId)); } catch { /* ignore */ } setSession(null); setError(null); setSelectedTaskId(undefined); manualTaskSelection.current = false; lastSeq.current = 0; const scopedQuery = projectId ? { projectId } : { scope: 'unbound' as const }; void Promise.all([llmApi.projectAgent.sessions(scopedQuery), llmApi.projectAgent.sessions({ scope: 'all' }), projectApi.list()]).then(([scoped, all, projectItems]: [Session[], Session[], ProjectOption[]]) => { if (cancelled) return; setAllSessions(all); setProjects(projectItems); activateSession(chooseInitialProjectAgentSession(scoped, remembered) || null); }).catch((cause) => reportError('无法读取智能体会话', cause)); return () => { cancelled = true; }; }, [projectId, activateSession]);
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

  const taskSignature = activeProjectAgentPlan(session || ({ plans: [] } as unknown as Session))?.tasks.map((task) => `${task.id}:${task.status}`).join('|') || '';
  useEffect(() => {
    if (!session) { setSelectedTaskId(undefined); return; }
    const tasks = activeProjectAgentPlan(session)?.tasks || [];
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) { manualTaskSelection.current = false; setSelectedTaskId(undefined); }
    if (!manualTaskSelection.current) setSelectedTaskId(chooseCurrentTaskId(session));
  }, [session?.id, taskSignature, session?.pendingApproval?.taskId]);
  useEffect(() => { const resize = () => setWidth((value) => clampProjectAgentWidth(value, window.innerWidth)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (!session || !['grounding', 'planning', 'executing', 'recovering'].includes(session.phase)) return; setActivityClock(Date.now()); const timer = window.setInterval(() => setActivityClock(Date.now()), 1000); return () => window.clearInterval(timer); }, [session?.id, session?.phase]);
  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (historyOpen) { setHistoryOpen(false); window.requestAnimationFrame(() => historyButtonRef.current?.focus()); return; }
      if (scopeOpen) { setScopeOpen(false); return; }
      closeDrawer();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeDrawer, historyOpen, open, scopeOpen]);
  useEffect(() => {
    if (!historyOpen) return undefined;
    const dismiss = (event: PointerEvent) => { if (!historyContainerRef.current?.contains(event.target as Node)) setHistoryOpen(false); };
    window.addEventListener('pointerdown', dismiss); return () => window.removeEventListener('pointerdown', dismiss);
  }, [historyOpen]);
  useEffect(() => {
    const textarea = composerRef.current; if (!textarea) return;
    textarea.style.height = 'auto'; textarea.style.height = `${Math.min(120, Math.max(36, textarea.scrollHeight))}px`;
  }, [prompt]);

  async function refreshSessionHistory() { const items = await llmApi.projectAgent.sessions({ scope: 'all' }) as Session[]; setAllSessions(items); return items; }
  async function ensureSession() { if (session) return session; let capabilityBundleVersionId: string | undefined; try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ } const created = await llmApi.projectAgent.createSession({ projectId, projectIds: projectId ? [projectId] : [], capabilityBundleVersionId }) as Session; activateSession(created); setAllSessions((items) => [created, ...items.filter((item) => item.id !== created.id)]); return created; }
  async function send(text = prompt) {
    const content = text.trim(); if (!content || busy) return; setBusy(true); setError(null); setPrompt('');
    let active: Session | undefined;
    try { active = await ensureSession(); const response = await llmApi.projectAgent.turn(active.id, { prompt: content, projectId: active.projectId }); const next = await loadSession(active.id, response.session?.projectId || active.projectId); if (next.projectId) await refreshProject(); setProjects(await projectApi.list()); await refreshSessionHistory(); setAnswers({}); }
    catch (cause) { let recovered: Session | undefined; if (active) { try { recovered = await loadSession(active.id, active.projectId); } catch { /* keep request error */ } } if (!planningFailure(recovered || null)) reportError('发送请求失败', cause); } finally { setBusy(false); }
  }
  async function retryPlanning() { if (!session || busy) return; setBusy(true); setError(null); try { const response = await llmApi.projectAgent.retryTurn(session.id, session.projectId); const next = await loadSession(session.id, response.session?.projectId || session.projectId); if (next.projectId) await refreshProject(); } catch (cause) { let recovered: Session | undefined; try { recovered = await loadSession(session.id, session.projectId); } catch { /* ignore */ } if (!planningFailure(recovered || null)) reportError('重新生成计划失败', cause); } finally { setBusy(false); } }
  async function confirmPlan(planId: string) { if (!session || busy) return; setBusy(true); setError(null); try { await llmApi.projectAgent.confirmPlan(session.id, planId, session.projectId); await loadSession(session.id, session.projectId); } catch (cause) { reportError('确认计划失败', cause); } finally { setBusy(false); } }
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
  async function startNewSession(boundProjectId?: string) { if (busy) return; setBusy(true); setError(null); try { if (session && !(await pauseBeforeLeaving(session))) return; let capabilityBundleVersionId: string | undefined; try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ } const created = await llmApi.projectAgent.createSession({ projectId: boundProjectId, projectIds: boundProjectId ? [boundProjectId] : [], capabilityBundleVersionId }) as Session; activateSession(created); setAllSessions((items) => [created, ...items.filter((item) => item.id !== created.id)]); setTab('tasks'); } catch (cause) { reportError('新建会话失败', cause); } finally { setBusy(false); } }
  function toggleScopeProject(id: string) { setScopeProjectIds((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; setScopeCurrentProjectId((selected) => next.includes(selected || '') ? selected : next[0]); return next; }); }
  async function saveProjectScope() {
    if (!session || busy) return; setBusy(true); setError(null);
    try { if (!(await pauseBeforeLeaving(session))) return; const next = await llmApi.projectAgent.setProjects(session.id, { projectIds: scopeProjectIds, currentProjectId: scopeCurrentProjectId }) as Session; activateSession(next); await refreshSessionHistory(); setScopeOpen(false); }
    catch (cause) { reportError('限定项目失败', cause); } finally { setBusy(false); }
  }
  async function switchSession(next: Session) { if (busy || next.id === session?.id) return; setBusy(true); setError(null); try { if (session && !(await pauseBeforeLeaving(session))) return; activateSession(await llmApi.projectAgent.getSession(next.id, next.projectId) as Session); } catch (cause) { reportError('切换会话失败', cause); } finally { setBusy(false); } }
  async function archiveCurrentSession() { if (!session || busy || !await confirm({ title: '归档当前会话？', message: '归档后会从历史会话列表中移除。', detail: '已经写入的 FormFlow 项目不会被删除。', confirmLabel: '归档会话', destructive: true })) return; setBusy(true); setError(null); try { if (!(await pauseBeforeLeaving(session))) return; await llmApi.projectAgent.archive(session.id, session.projectId); const items = await refreshSessionHistory(); const scoped = projectId ? items.filter((item) => item.projectId === projectId) : items.filter((item) => !item.projectId); activateSession(scoped[0] || null); } catch (cause) { reportError('归档会话失败', cause); } finally { setBusy(false); } }

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
  const normalizedHistoryQuery = historyQuery.trim().toLocaleLowerCase();
  const filteredSessions = normalizedHistoryQuery ? allSessions.filter((item) => `${item.title} ${sessionProjectScope(item).join(' ')}`.toLocaleLowerCase().includes(normalizedHistoryQuery)) : allSessions;
  const historyGroups = groupProjectAgentSessions(filteredSessions, projectId);
  const awaitingPlan = session?.phase === 'awaiting_plan_approval';
  const confirmsPlan = Boolean(awaitingPlan && (!prompt.trim() || isAffirmativePlanConfirmation(prompt)));
  const composerLabel = confirmsPlan ? '确认并执行' : awaitingPlan ? '提交计划修改' : session && ['executing', 'recovering'].includes(session.phase) ? '请求转向' : session?.phase === 'clarifying' ? '回答问题' : '发送';
  function submitComposer() { const plan = session && activeProjectAgentPlan(session); if (confirmsPlan && plan?.status === 'pending') void confirmPlan(plan.id); else void send(); }
  function handleTabKeys(event: ReactKeyboardEvent<HTMLDivElement>) { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const next: WorkbenchTab = event.key === 'ArrowLeft' ? 'tasks' : 'conversation'; setTab(next); window.requestAnimationFrame(() => document.getElementById(`project-agent-${next}-tab`)?.focus()); }
  function renderSessionGroup(label: string, items: Session[], disabled = false) { if (!items.length) return null; return <section><strong>{label}</strong>{items.map((item) => <button type="button" key={item.id} className={item.id === session?.id ? 'active' : ''} disabled={busy || disabled} title={disabled ? '请在对应项目中打开该会话' : item.title} onClick={() => { setHistoryOpen(false); void switchSession(item); }}><span><b>{item.title || '未命名会话'}</b><i>{phaseLabels[item.phase]}</i></span><small>{sessionProjectScope(item).join('、') || '新项目'} · {relativeTime(item.updatedAt)}</small></button>)}</section>; }

  return <>
    <button ref={launcherRef} type="button" className={`project-agent-launcher ${open ? 'active' : ''}`} onClick={() => setOpen((value) => !value)} aria-label="项目智能体" aria-expanded={open}>✦<span>项目智能体</span></button>
    {open && <aside className="project-agent-drawer" style={{ width }} aria-label="项目智能体">
      <div className="project-agent-resize-handle" role="separator" aria-label="调整项目智能体工作台宽度" aria-orientation="vertical" aria-valuemin={520} aria-valuemax={920} aria-valuenow={width} tabIndex={0} onPointerDown={beginResize} onKeyDown={resizeByKeyboard} />
      <header className="project-agent-workbench-header"><div className="project-agent-workbench-title"><strong>{session?.title || '项目智能体'}</strong><small>{session ? `项目智能体 · ${phaseHelp[session.phase]}` : '先检查、再规划、确认后执行'}</small></div><div className="project-agent-header-actions"><span className={`project-agent-connection-badge ${connection}`} title={connectionLabels[connection]}><i />{session ? connectionLabels[connection] : '未连接'}</span><div className="project-agent-history" ref={historyContainerRef}><button ref={historyButtonRef} type="button" className="project-agent-history-button" aria-haspopup="true" aria-expanded={historyOpen} onClick={() => { setHistoryOpen((value) => !value); setScopeOpen(false); }}>历史</button>{historyOpen && <div className="project-agent-history-panel" role="region" aria-label="历史会话"><header><strong>历史会话</strong><small>切换执行中的任务前会先安全暂停</small></header><input autoFocus type="search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索会话或项目" aria-label="搜索历史会话" /><div className="project-agent-history-groups">{renderSessionGroup('当前项目', historyGroups.currentProject)}{renderSessionGroup('新项目', historyGroups.unbound)}{renderSessionGroup('其他项目', historyGroups.otherProjects, Boolean(projectId))}{!filteredSessions.length && <p>没有匹配的会话</p>}</div></div>}</div><button type="button" className="primary" disabled={busy} onClick={() => void startNewSession(projectId)}>新建任务</button><details className="project-agent-more-menu"><summary aria-label="更多操作">•••</summary><div>{session && <button type="button" disabled={busy} onClick={() => { setScopeOpen(true); setHistoryOpen(false); }}>限定项目范围…</button>}<button type="button" disabled={busy} onClick={() => void startNewSession(undefined)}>创建新项目</button>{session && <button type="button" className="danger-text" disabled={busy} onClick={() => void archiveCurrentSession()}>归档当前会话</button>}</div></details><button type="button" className="project-agent-close" onClick={closeDrawer} aria-label="关闭项目智能体">×</button></div></header>
      {scopeOpen && session && <section className="project-agent-project-scope-card project-agent-floating-card" aria-label="限定项目范围"><header><div><strong>限定项目范围</strong><span>专家只能访问选中的项目，实心圆表示当前项目。</span></div><button type="button" onClick={() => setScopeOpen(false)} aria-label="关闭项目范围">×</button></header><div className="project-agent-project-options">{projects.map((item) => { const selected = scopeProjectIds.includes(item.id); const current = scopeCurrentProjectId === item.id; return <div key={item.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={selected} onChange={() => toggleScopeProject(item.id)} aria-label={`限定项目 ${item.name}`} /><span><strong>{item.name}</strong><small>{item.id}</small></span><button type="button" className={current ? 'current' : ''} disabled={!selected} onClick={() => setScopeCurrentProjectId(item.id)} aria-label={`设 ${item.name} 为当前项目`}>{current ? '●' : '○'}</button></div>; })}{!projects.length && <p>暂无可用项目。描述创建需求后，新项目会自动加入范围。</p>}</div><footer><span>{scopeProjectIds.length ? `已限定 ${scopeProjectIds.length} 个项目` : '未限定项目，可创建新项目'}</span><button type="button" disabled={busy} onClick={() => void saveProjectScope()}>应用范围</button></footer></section>}
      {session && <section className={`project-agent-statusbar ${session.phase}`} aria-label="会话状态"><div className="project-agent-status-summary"><strong>{planningFailure(session) ? '规划未完成' : phaseLabels[session.phase]}</strong><small>{taskCount ? `${passedTaskCount}/${taskCount} 个任务` : '等待任务计划'}{session.requirementCoverage?.total ? ` · 需求 ${session.requirementCoverage.verified}/${session.requirementCoverage.total}` : ''}{session.checkpointRevision ? ` · revision ${session.checkpointRevision.slice(0, 12)}` : ''}</small></div><nav className="project-agent-stagebar" aria-label="会话阶段">{journey.map((item, index) => { const state = index < currentJourney ? 'passed' : index === currentJourney ? planningFailure(session) || session.phase === 'failed' ? 'failed' : 'active' : ''; return <span key={item.label} className={state} title={item.label}><i>{index < currentJourney ? '✓' : index + 1}</i><b>{item.label}</b></span>; })}</nav>{taskCount > 0 && session.phase !== 'completed' && <div className="project-agent-status-progress" aria-label={`任务完成度 ${taskPercent}%`}><span style={{ width: `${taskPercent}%` }} /></div>}<div className="project-agent-status-actions">{(['executing', 'recovering'] as ProjectAgentPhase[]).includes(session.phase) && <button type="button" disabled={busy} onClick={() => void control('pause')}>暂停</button>}{(['paused', 'stopped'] as ProjectAgentPhase[]).includes(session.phase) && <button type="button" disabled={busy} onClick={() => void control('continue')}>继续</button>}{!['completed', 'stopped'].includes(session.phase) && <button type="button" className="danger" disabled={busy} onClick={() => void control('stop')}>停止</button>}</div></section>}
      <div className="project-agent-workbench-tabs" role="tablist" aria-label="智能体视图" onKeyDown={handleTabKeys}><button id="project-agent-tasks-tab" type="button" role="tab" aria-selected={tab === 'tasks'} aria-controls="project-agent-workbench-panel" tabIndex={tab === 'tasks' ? 0 : -1} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>任务 <span>{taskCount}</span></button><button id="project-agent-conversation-tab" type="button" role="tab" aria-selected={tab === 'conversation'} aria-controls="project-agent-workbench-panel" tabIndex={tab === 'conversation' ? 0 : -1} className={tab === 'conversation' ? 'active' : ''} onClick={() => setTab('conversation')}>对话 <span>{session?.messages.length || 0}</span></button></div>
      {session && connection !== 'connected' && <div className={`project-agent-connection-notice ${connection}`} role="status"><div><strong>{connection === 'disconnected' ? '实时连接已断开' : connectionLabels[connection]}</strong><span>任务状态会从最后事件序号 #{lastSeq.current} 恢复，不会自动重放写操作。</span></div><button type="button" onClick={() => setReconnectNonce((value) => value + 1)}>立即重连</button></div>}
      <ProjectAgentActivityNotice session={session} connection={connection} now={activityClock} onRefresh={() => session && void loadSession(session.id, session.projectId)} />
      <main id="project-agent-workbench-panel" className="project-agent-workbench-content" role="tabpanel" aria-labelledby={`project-agent-${tab}-tab`}>
        {tab === 'tasks' ? session ? <ProjectAgentProgressCards session={session} busy={busy} selectedTaskId={selectedTaskId} onSelectTask={(id) => { manualTaskSelection.current = true; setSelectedTaskId(id); }} manualOperationApproval={!localMode} onConfirmPlan={(id) => void confirmPlan(id)} onConfirmOperation={(id, approved) => void decideOperation(id, approved)} onControl={(action) => void control(action)} onRetryPlanning={() => void retryPlanning()} /> : <div className="project-agent-empty-workbench"><strong>开始一个新任务</strong><p>选择工作范围后描述目标，智能体会先检查现状并生成可确认的任务图。</p><div>{projectId && <button type="button" onClick={() => void startNewSession(projectId)}>修改当前项目</button>}<button type="button" onClick={() => void startNewSession(undefined)}>创建新项目</button></div></div> : <ProjectAgentConversation messages={session?.messages || []} questions={session?.questions || []} answers={answers} busy={busy} onAnswer={(id, answer) => setAnswers((current) => ({ ...current, [id]: answer }))} onSubmitAnswers={submitAnswers} onUseExample={() => void send('创建一个员工信息查询编辑项目，包含部门字典、录入表单、查询表单和完整测试数据')} />}
      </main>
      {error && <div className="project-agent-error" role="alert"><div><strong>{error.title}</strong><span>{error.message}</span><small>系统不会自动重放写操作。可先刷新状态，再由你决定是否重新执行。</small></div><div><button type="button" onClick={() => session && void loadSession(session.id, session.projectId)}>刷新状态</button><button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">×</button></div></div>}
      <footer className="project-agent-input"><textarea ref={composerRef} rows={1} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitComposer(); }} placeholder={awaitingPlan ? '确认计划，或输入修改意见' : session && ['executing', 'recovering'].includes(session.phase) ? '输入新要求，在安全边界转向' : session?.phase === 'clarifying' ? '统一回答问题' : '描述目标、约束和完成标准'} /><div><small>⌘/Ctrl + Enter</small><button type="button" disabled={busy || (!confirmsPlan && !prompt.trim())} onClick={submitComposer}>{composerLabel}</button></div></footer>
    </aside>}
  </>;
}
