import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { llmApi, projectApi } from '../services/io/api';
import { useProjectStore } from '../project/store';
import ThreadSidebar, { type ThreadSidebarHandle } from './ThreadSidebar';
import ConversationSurface from './ConversationSurface';
import DetailLayer from './DetailLayer';
import { statusLabelsShort, statusSymbols, type ProjectAgentConnectionState, type ProjectAgentThread, type SurfaceItem } from './projectAgentUiModel';
import { useAppInteraction } from './AppInteractionProvider';

interface OperationError { title: string; message: string; }
interface ProjectOption { id: string; name: string; updatedAt?: string; }

const localMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') !== 'cloud';
const connectionLabels: Record<ProjectAgentConnectionState, string> = { connecting: '连接中', connected: '已连接', reconnecting: '重连中', disconnected: '离线' };
const WIDTH_KEY = 'formflow.projectAgent.width';
const PENDING_THREAD_KEY_PREFIX = 'formflow.projectAgent.pendingThread.';

function initialWidth() { try { return clamp(Number(localStorage.getItem(WIDTH_KEY)) || 960, window.innerWidth); } catch { return 960; } }
function clamp(value: number, viewportWidth: number) {
  const available = Math.max(340, viewportWidth - 24);
  return Math.round(Math.min(1180, available, Math.max(viewportWidth <= 760 ? 340 : 860, value)));
}
function resolveDrawerPosition(launcherVariant: 'floating' | 'nav', drawerWidth: number): CSSProperties {
  if (launcherVariant !== 'nav' || typeof window === 'undefined' || window.innerWidth <= 760) return { width: drawerWidth };
  const topbarHeight = 56;
  return { top: topbarHeight, right: 0, bottom: 0, left: 'auto', width: drawerWidth, maxWidth: 'calc(100vw - 24px)', height: `calc(100vh - ${topbarHeight}px)` };
}

export default function ProjectAgentDrawer({ projectId, launcherVariant = 'floating' }: { projectId?: string; launcherVariant?: 'floating' | 'nav' }) {
  const { confirm } = useAppInteraction();
  const navigate = useNavigate();
  const refreshProject = useProjectStore((state) => state.refreshProject);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<ThreadSidebarHandle>(null);
  const lastSeq = useRef(0);
  const refreshTimer = useRef<number | undefined>(undefined);
  const automaticApprovalIds = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ProjectAgentThread[]>([]);
  const [thread, setThread] = useState<ProjectAgentThread | null>(null);
  const [activeDetail, setActiveDetail] = useState<SurfaceItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 1080);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OperationError | null>(null);
  const [connection, setConnection] = useState<ProjectAgentConnectionState>('disconnected');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [width, setWidth] = useState(initialWidth);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeProjectIds, setScopeProjectIds] = useState<string[]>([]);
  const [scopeCurrentProjectId, setScopeCurrentProjectId] = useState<string | undefined>();
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [drawerStyle, setDrawerStyle] = useState<CSSProperties>(() => ({ width: initialWidth() }));

  const loadThreadList = useCallback(async () => {
    try {
      // 全量拉取，由侧栏按「当前项目/未绑定/其它项目」分组，避免新建的未绑定对话被项目作用域过滤掉。
      const result = await llmApi.projectAgent.threads({ scope: 'all' }) as { items: ProjectAgentThread[]; total: number };
      setThreads(result.items);
    } catch { /* keep last list */ }
  }, []);

  const activateThread = useCallback((next: ProjectAgentThread | null) => {
    setThread(next);
    setActiveDetail(null);
    setPrompt('');
    setError(null);
    automaticApprovalIds.current.clear();
    lastSeq.current = next?.events[next.events.length - 1]?.seq || 0;
    setReconnectNonce((value) => value + 1);
    void loadThreadList();
  }, [loadThreadList]);

  const openDetail = useCallback((item: SurfaceItem) => {
    setActiveDetail(item);
    setDetailOpen(true);
  }, []);

  const dismissDetail = useCallback(() => {
    if (activeDetail) { setActiveDetail(null); return; }
    setDetailOpen(false);
  }, [activeDetail]);

  const loadThread = useCallback(async (id: string) => {
    const next = await llmApi.projectAgent.getThread(id) as ProjectAgentThread;
    setThread((current) => {
      if (current?.id !== id) return next;
      const currentMax = current.events[current.events.length - 1]?.seq ?? 0;
      const nextMax = next.events[next.events.length - 1]?.seq ?? 0;
      // 拒绝乱序返回的旧快照：事件是只追加的，快照不应比当前状态更短。
      return nextMax >= currentMax ? next : current;
    });
    lastSeq.current = Math.max(lastSeq.current, next.events[next.events.length - 1]?.seq || 0);
    return next;
  }, []);

  const reportError = (title: string, cause: unknown) => setError({ title, message: cause instanceof Error ? cause.message : String(cause) });

  useEffect(() => {
    let cancelled = false;
    let pendingThreadId: string | null = null;
    try {
      const key = `${PENDING_THREAD_KEY_PREFIX}${projectId || '__unbound__'}`;
      pendingThreadId = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
    } catch { /* ignore */ }
    setThread(null);
    setError(null);
    setActiveDetail(null);
    lastSeq.current = 0;
    void Promise.all([
      projectApi.list(),
      llmApi.projectAgent.threads({ scope: 'all' }),
      pendingThreadId ? llmApi.projectAgent.getThread(pendingThreadId) as Promise<ProjectAgentThread> : Promise.resolve(null),
    ])
      .then(([projectItems, threadResult, pending]: [ProjectOption[], { items: ProjectAgentThread[]; total: number }, ProjectAgentThread | null]) => {
        if (cancelled) return;
        setProjects(projectItems);
        setThreads(threadResult.items);
        activateThread(pending || threadResult.items.find((item) => item.id === projectId) || threadResult.items[0] || null);
      })
      .catch((cause) => reportError('无法读取智能体会话', cause));
    return () => { cancelled = true; };
  }, [projectId, activateThread]);

  useEffect(() => {
    if (!thread?.id) { setConnection('disconnected'); return; }
    const controller = new AbortController();
    void llmApi.projectAgent.streamEvents(thread.id, lastSeq.current, (event) => {
      lastSeq.current = Math.max(lastSeq.current, Number(event.seq || 0));
      if (event.type === 'thread_project_scope_changed') void loadThreadList();
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => { void loadThread(thread.id); void loadThreadList(); }, 80);
    }, controller.signal, thread.currentProjectId, { reconnect: true, onState: setConnection });
    return () => { controller.abort(); window.clearTimeout(refreshTimer.current); };
  }, [thread?.id, thread?.currentProjectId, projectId, loadThread, loadThreadList, reconnectNonce]);

  // 运行中兜底轮询：SSE 可能长时间无事件或掉线，定时同步线程、左侧列表与项目列表，保证「正在干什么/耗时/列表」始终新鲜。
  const runningStatus = ['executing', 'awaiting_operation_approval'].includes(thread?.status || '');
  useEffect(() => {
    if (!thread?.id || !runningStatus) return undefined;
    let cancelled = false;
    let inFlight = false;
    const tick = () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      void Promise.allSettled([
        loadThread(thread.id),
        loadThreadList(),
        projectApi.list().then((items) => { if (!cancelled) setProjects(items as ProjectOption[]); }).catch(() => undefined),
      ]).finally(() => { inFlight = false; });
    };
    const timer = window.setInterval(tick, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [thread?.id, runningStatus, loadThread, loadThreadList]);

  useEffect(() => { const resize = () => setWidth((value) => clamp(value, window.innerWidth)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const updateDrawerPosition = () => setDrawerStyle(resolveDrawerPosition(launcherVariant, width));
    updateDrawerPosition();
    window.addEventListener('resize', updateDrawerPosition);
    return () => window.removeEventListener('resize', updateDrawerPosition);
  }, [open, launcherVariant, width]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (activeDetail) { setActiveDetail(null); return; }
      if (detailOpen) { setDetailOpen(false); return; }
      if (scopeOpen) { setScopeOpen(false); return; }
      closeDrawer();
    };
    const handleSlash = (event: KeyboardEvent) => {
      if (event.key !== '/' || document.querySelector('input:focus, textarea:focus')) return;
      sidebarRef.current?.focusSearch();
      event.preventDefault();
    };
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('keydown', handleSlash);
    return () => { window.removeEventListener('keydown', handleEscape); window.removeEventListener('keydown', handleSlash); };
  }, [activeDetail, closeDrawer, detailOpen, open, scopeOpen]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, Math.max(38, textarea.scrollHeight))}px`;
  }, [prompt]);

  async function ensureThread() {
    if (thread) return thread;
    let capabilityBundleVersionId: string | undefined;
    try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ }
    const created = await llmApi.projectAgent.createThread({ projectId, projectIds: projectId ? [projectId] : [], capabilityBundleVersionId }) as ProjectAgentThread;
    activateThread(created);
    return created;
  }

  async function send(text = prompt) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setPrompt('');
    let active: ProjectAgentThread | undefined;
    try {
      active = await ensureThread();
      await llmApi.projectAgent.turn(active.id, { prompt: content, projectId: active.currentProjectId });
      const next = await loadThread(active.id);
      if (next.currentProjectId) await refreshProject();
      void loadThreadList();
    } catch (cause) {
      if (active) { try { await loadThread(active.id); } catch { /* keep error */ } }
      reportError('发送请求失败', cause);
    } finally {
      setBusy(false);
    }
  }

  async function decideOperation(approvalId: string, approved: boolean, automatic = false) {
    if (!thread || busy) return;
    setBusy(true);
    setError(null);
    try {
      await llmApi.projectAgent.decideOperation(thread.id, approvalId, { approved, automatic, projectId: thread.currentProjectId });
      await loadThread(thread.id);
      if (thread.currentProjectId) await refreshProject();
    } catch (cause) { reportError(automatic ? '本地操作自动继续失败' : approved ? '确认操作失败' : '拒绝操作失败', cause); } finally { setBusy(false); }
  }

  async function control(action: 'pause' | 'continue' | 'stop' | 'retry') {
    if (!thread || busy) return;
    setBusy(true);
    setError(null);
    const names = { pause: '暂停失败', continue: '继续执行失败', stop: '停止失败', retry: '重试任务失败' };
    try {
      await llmApi.projectAgent.control(thread.id, { action, projectId: thread.currentProjectId });
      await loadThread(thread.id);
    } catch (cause) { reportError(names[action], cause); } finally { setBusy(false); }
  }

  const refreshCheckpoints = useCallback(async (id: string) => {
    try {
      const result = await llmApi.projectAgent.checkpoints(id) as { checkpoints?: string[] };
      setCheckpoints(result?.checkpoints || []);
    } catch {
      setCheckpoints([]);
    }
  }, []);

  async function restoreCheckpoint() {
    if (!thread || busy) return;
    if (!await confirm({ title: '恢复到最近检查点？', message: '项目将回滚到该写任务开始前的状态，当前未提交的修改会丢失。', detail: '恢复由你显式触发，智能体不会自动回滚。', confirmLabel: '恢复', destructive: true })) return;
    setBusy(true);
    setError(null);
    try {
      await llmApi.projectAgent.restoreCheckpoint(thread.id, { projectId: thread.currentProjectId });
      await loadThread(thread.id);
      if (thread.currentProjectId) await refreshProject();
      await refreshCheckpoints(thread.id);
    } catch (cause) { reportError('恢复检查点失败', cause); } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!thread?.id) { setCheckpoints([]); return; }
    if (!['paused', 'stopped', 'blocked', 'failed'].includes(thread.status)) { setCheckpoints([]); return; }
    void refreshCheckpoints(thread.id);
  }, [thread?.id, thread?.status, refreshCheckpoints]);

  async function pauseBeforeLeaving(active: ProjectAgentThread) {
    if (!['executing'].includes(active.status)) return true;
    if (!await confirm({ title: '暂停当前任务？', message: '当前任务仍在执行，切换前需要先暂停。', detail: '系统会等待安全工具边界，不会中断正在进行的写操作。', confirmLabel: '暂停并继续' })) return false;
    await llmApi.projectAgent.control(active.id, { action: 'pause', projectId: active.currentProjectId });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const latest = await llmApi.projectAgent.getThread(active.id) as ProjectAgentThread;
      if (!['executing'].includes(latest.status)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    throw new Error('当前任务尚未到达安全暂停边界，请稍后重试');
  }

  async function startNewThread(boundProjectId?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (thread && !(await pauseBeforeLeaving(thread))) return;
      let capabilityBundleVersionId: string | undefined;
      try { capabilityBundleVersionId = localStorage.getItem('formflow.projectAgent.bundle') || undefined; } catch { /* ignore */ }
      const created = await llmApi.projectAgent.createThread({ projectId: boundProjectId, projectIds: boundProjectId ? [boundProjectId] : [], capabilityBundleVersionId }) as ProjectAgentThread;
      activateThread(created);
    } catch (cause) { reportError('新建会话失败', cause); } finally { setBusy(false); }
  }

  function toggleScopeProject(id: string) {
    setScopeProjectIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      setScopeCurrentProjectId((selected) => next.includes(selected || '') ? selected : next[0]);
      return next;
    });
  }

  async function saveProjectScope() {
    if (!thread || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await pauseBeforeLeaving(thread))) return;
      const next = await llmApi.projectAgent.setProjects(thread.id, { projectIds: scopeProjectIds, currentProjectId: scopeCurrentProjectId }) as ProjectAgentThread;
      activateThread(next);
      setScopeOpen(false);
    } catch (cause) { reportError('限定项目失败', cause); } finally { setBusy(false); }
  }

  async function renameThread(id: string, title: string) {
    setBusy(true);
    try {
      const updated = await llmApi.projectAgent.updateMetadata(id, { title }) as ProjectAgentThread;
      if (updated.id === thread?.id) setThread((current) => current ? { ...current, title: updated.title } : current);
      void loadThreadList();
    } catch (cause) { reportError('重命名线程失败', cause); } finally { setBusy(false); }
  }

  async function togglePin(id: string, pinnedAt?: string) {
    setBusy(true);
    try {
      await llmApi.projectAgent.updateMetadata(id, { pinned: Boolean(pinnedAt) });
      void loadThreadList();
    } catch (cause) { reportError('更新置顶状态失败', cause); } finally { setBusy(false); }
  }

  async function pauseIfRunning(target: ProjectAgentThread) {
    if (!['executing'].includes(target.status)) return true;
    await llmApi.projectAgent.control(target.id, { action: 'pause', projectId: target.currentProjectId });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const latest = await llmApi.projectAgent.getThread(target.id) as ProjectAgentThread;
      if (!['executing'].includes(latest.status)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    throw new Error('任务尚未到达安全暂停边界，请稍后重试');
  }

  async function archiveThread(id: string) {
    const target = threads.find((item) => item.id === id) || thread;
    if (!target) return;
    const terminal = ['completed', 'stopped'].includes(target.status);
    if (!terminal && !await confirm({ title: '归档未结束的任务？', message: '任务会先在安全边界暂停，然后移入归档。', detail: '已经写入的 FormFlow 项目不会被删除，之后可从归档中恢复。', confirmLabel: '暂停并归档', destructive: true })) return;
    setBusy(true);
    setError(null);
    try {
      await pauseIfRunning(target);
      await llmApi.projectAgent.archive(target.id, target.currentProjectId);
      if (target.id === thread?.id) activateThread(null);
      else void loadThreadList();
    } catch (cause) { reportError('归档失败', cause); } finally { setBusy(false); }
  }

  async function restoreThread(id: string) {
    setBusy(true);
    try {
      await llmApi.projectAgent.restore(id);
      void loadThreadList();
    } catch (cause) { reportError('恢复失败', cause); } finally { setBusy(false); }
  }

  async function deleteThread(id: string) {
    const target = threads.find((item) => item.id === id) || thread;
    if (!target) return;
    if (!await confirm({ title: '永久删除任务？', message: `将删除“${target.title}”的对话、行动、证据和审计记录。`, detail: 'FormFlow 项目内容不会被删除，但任务记录无法恢复。', confirmLabel: '继续', destructive: true })) return;
    if (!await confirm({ title: '再次确认永久删除', message: `确定永久删除“${target.title}”？`, detail: '这是最后一次确认。删除后无法从归档中恢复。', confirmLabel: '永久删除', destructive: true })) return;
    setBusy(true);
    setError(null);
    try {
      await pauseIfRunning(target);
      await llmApi.projectAgent.permanentlyDelete(target.id, target.currentProjectId);
      if (target.id === thread?.id) activateThread(null);
      else void loadThreadList();
    } catch (cause) { reportError('永久删除失败', cause); } finally { setBusy(false); }
  }

  useEffect(() => {
    const approvalId = thread?.pendingApproval?.id;
    if (!localMode || !approvalId || busy || automaticApprovalIds.current.has(approvalId)) return;
    automaticApprovalIds.current.add(approvalId);
    void decideOperation(approvalId, true, true);
  }, [thread?.pendingApproval?.id, busy]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 760) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => setWidth(clamp(startWidth + startX - next.clientX, window.innerWidth));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      setWidth((value) => { try { localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* ignore */ } return value; });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
  }

  function resizeByKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = clamp(width + (event.key === 'ArrowLeft' ? 24 : -24), window.innerWidth);
    setWidth(next);
    try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* ignore */ }
  }

  const running = ['executing'].includes(thread?.status || '');
  const pausedForQuestion = thread?.status === 'paused' && thread.messages.some((message) => message.kind === 'question');
  const launcherClassName = launcherVariant === 'nav' ? `project-agent-nav-trigger nav-link ${open ? 'active' : ''}` : `project-agent-launcher ${open ? 'active' : ''}`;
  const mergedDrawerStyle = useMemo(() => open ? drawerStyle : { width }, [drawerStyle, open, width]);
  const composerLabel = running ? '转向' : pausedForQuestion ? '回答' : '发送';

  const drawerNode = open ? (
    <aside className={`project-agent-drawer ${launcherVariant === 'nav' ? 'project-agent-drawer-anchored' : ''}`} style={mergedDrawerStyle} aria-label="项目智能体">
      <div className="project-agent-resize-handle" role="separator" aria-label="调整项目智能体工作台宽度" aria-orientation="vertical" aria-valuemin={860} aria-valuemax={1180} aria-valuenow={width} tabIndex={0} onPointerDown={beginResize} onKeyDown={resizeByKeyboard} />
      <div className="agent-workbench">
        <header className="agent-workbench-header">
          <div className="agent-title"><strong>{thread?.title || '项目智能体'}</strong><small>{thread ? `✦ ${statusSymbols[thread.status]} ${statusLabelsShort[thread.status]}` : '先检查、再规划、确认后执行'}</small></div>
          <span className={`agent-badge ${connection === 'connected' ? 'agent-badge-success' : connection === 'disconnected' ? 'agent-badge-danger' : 'agent-badge-warning'}`}>{thread ? connectionLabels[connection] : '未连接'}</span>
          <span className="agent-spacer" />
          {!thread && <button type="button" className="agent-btn agent-btn-primary" disabled={busy} onClick={() => void startNewThread(projectId)}>+ 新建</button>}
          {thread && <details className="agent-row-menu"><summary aria-label="更多操作">•••</summary><div className="agent-menu" role="menu">
            <button type="button" role="menuitem" disabled={busy} onClick={() => setScopeOpen(true)}>限定项目范围…</button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => void startNewThread(undefined)}>创建新项目</button>
            <button type="button" role="menuitem" className="agent-danger-text" disabled={busy} onClick={() => void archiveThread(thread.id)}>归档当前会话</button>
          </div></details>}
          <button type="button" className="agent-btn agent-btn-ghost" onClick={closeDrawer} aria-label="关闭项目智能体">×</button>
        </header>
        {scopeOpen && thread && (
          <section className="project-agent-project-scope-card project-agent-floating-card" aria-label="限定项目范围">
            <header><div><strong>项目范围</strong><span>只能访问选中项目，实心圆=当前。</span></div><button type="button" onClick={() => setScopeOpen(false)} aria-label="关闭项目范围">×</button></header>
            <div className="project-agent-project-options">
              {projects.map((item) => {
                const selected = scopeProjectIds.includes(item.id);
                const current = scopeCurrentProjectId === item.id;
                return (
                  <div key={item.id} className={selected ? 'selected' : ''}>
                    <input type="checkbox" checked={selected} onChange={() => toggleScopeProject(item.id)} aria-label={`限定项目 ${item.name}`} />
                    <span><strong>{item.name}</strong><small>{item.id}</small></span>
                    <button type="button" className={current ? 'current' : ''} disabled={!selected} onClick={() => setScopeCurrentProjectId(item.id)} aria-label={`设 ${item.name} 为当前项目`}>{current ? '●' : '○'}</button>
                  </div>
                );
              })}
              {!projects.length && <p>暂无可用项目。描述创建需求后，新项目会自动加入范围。</p>}
            </div>
            <footer><span>{scopeProjectIds.length ? `${scopeProjectIds.length} 个项目` : '未限定'}</span><button type="button" disabled={busy} onClick={() => void saveProjectScope()}>应用</button></footer>
          </section>
        )}
        {error && (
          <div className="project-agent-error" role="alert">
            <div><strong>{error.title}</strong><span>{error.message}</span><small>写操作不自动重放；刷新后由你决定重试。</small></div>
            <div><button type="button" onClick={() => thread && void loadThread(thread.id)}>↻ 刷新</button><button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">×</button></div>
          </div>
        )}
        <div className={`agent-workbench-body${detailOpen ? '' : ' agent-detail-collapsed'}`}>
          <ThreadSidebar ref={sidebarRef} threads={threads} activeId={thread?.id} currentProjectId={projectId} busy={busy}
            onSelect={(id) => { void (async () => { if (thread && !(await pauseBeforeLeaving(thread))) return; await loadThread(id); })(); }}
            onNew={() => void startNewThread(projectId)}
            onRename={(id, title) => void renameThread(id, title)}
            onTogglePin={(id, pinnedAt) => void togglePin(id, pinnedAt)}
            onArchive={(id) => void archiveThread(id)}
            onRestore={(id) => void restoreThread(id)}
            onDelete={(id) => void deleteThread(id)} />
          <ConversationSurface thread={thread} busy={busy} manualApproval={!localMode}
            onControl={(action) => void control(action)}
            onInterrupt={() => composerRef.current?.focus()}
            onRestoreCheckpoint={() => void restoreCheckpoint()}
            hasCheckpoints={checkpoints.length > 0}
            onOpenDetail={openDetail}
            onSendQuick={(text) => void send(text)}
            onApprove={(approvalId, approved) => void decideOperation(approvalId, approved)}
            onRetryPlanning={() => void control('retry')}
            onUseExample={() => void send('创建一个员工信息查询编辑项目，包含部门字典、录入表单、查询表单和完整测试数据')} />
          <DetailLayer thread={thread} active={activeDetail} onClose={dismissDetail} />
        </div>
        {detailOpen && <button type="button" className="agent-detail-backdrop" aria-label="关闭详情" tabIndex={-1} onClick={dismissDetail} />}
        {!detailOpen && <button type="button" className="agent-detail-reopen" title="打开详情" aria-label="打开详情" onClick={() => setDetailOpen(true)}>▸ 详情</button>}
        <footer className="agent-composer">
          <textarea ref={composerRef} rows={1} value={prompt} onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send(); }}
            placeholder={running ? '新要求（安全边界转向）…' : pausedForQuestion ? '补充说明…' : '描述目标、约束…'} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button type="button" className="agent-btn agent-btn-primary" disabled={busy || !prompt.trim()} onClick={() => void send()}>{composerLabel}</button>
            <span className="agent-composer-hint">⌘/Ctrl + Enter</span>
          </div>
        </footer>
      </div>
    </aside>
  ) : null;

  return (
    <>
      <button ref={launcherRef} type="button" className={launcherClassName} onClick={() => setOpen((value) => !value)} aria-label="项目智能体" aria-expanded={open}>
        <span aria-hidden="true">✦</span>
        <span className={launcherVariant === 'nav' ? 'nav-label' : undefined}>项目智能体</span>
      </button>
      {drawerNode && typeof document !== 'undefined' ? createPortal(drawerNode, document.body) : drawerNode}
    </>
  );
}
