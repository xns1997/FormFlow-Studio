import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Select } from 'antd';
import { llmApi } from '../services/io/api';
import ProjectAgentTimeline from './ProjectAgentTimeline';
import {
  groupProjectAgentHistoryByTime, phaseLabels, requiresPauseBeforeSessionSwitch,
  type ProjectAgentHistoryPage, type ProjectAgentHistoryStatus, type ProjectAgentHistorySummary, type ProjectAgentSessionV2,
} from './projectAgentUiModel';

interface ProjectOption { id: string; name: string; }
interface Props {
  activeSession: (ProjectAgentSessionV2 & { title: string }) | null;
  currentProjectId?: string;
  projects: ProjectOption[];
  busy: boolean;
  onClose(): void;
  onActivate(session: ProjectAgentSessionV2 & { title: string }): Promise<void>;
  onNavigate(summary: ProjectAgentHistorySummary): void;
  onRename(summary: ProjectAgentHistorySummary, title: string): Promise<void>;
  onTogglePin(summary: ProjectAgentHistorySummary): Promise<void>;
  onArchive(summary: ProjectAgentHistorySummary): Promise<void>;
  onRestore(summary: ProjectAgentHistorySummary): Promise<void>;
  onDelete(summary: ProjectAgentHistorySummary): Promise<boolean>;
}

const statusLabels: Record<ProjectAgentHistoryStatus, string> = { active: '进行中', attention: '需处理', completed: '已完成' };
const statusIcons: Record<ProjectAgentHistoryStatus, string> = { active: '↻', attention: '!', completed: '✓' };
const timeGroupLabels = { pinned: '已置顶', today: '今天', recent: '近七天', earlier: '更早' } as const;

function relativeTime(value: string) { const elapsed = Date.now() - new Date(value).getTime(); if (!Number.isFinite(elapsed) || elapsed < 60_000) return '刚刚'; const minutes = Math.floor(elapsed / 60_000); if (minutes < 60) return `${minutes} 分钟前`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} 小时前`; const days = Math.floor(hours / 24); return days < 30 ? `${days} 天前` : new Date(value).toLocaleDateString('zh-CN'); }

export default function ProjectAgentHistory({ activeSession, currentProjectId, projects, busy, onClose, onActivate, onNavigate, onRename, onTogglePin, onArchive, onRestore, onDelete }: Props) {
  const [queryDraft, setQueryDraft] = useState(''); const [query, setQuery] = useState(''); const [status, setStatus] = useState<'all' | ProjectAgentHistoryStatus>('all');
  const [projectFilter, setProjectFilter] = useState('all'); const [archived, setArchived] = useState(false); const [items, setItems] = useState<ProjectAgentHistorySummary[]>([]); const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [loadError, setLoadError] = useState(''); const [selected, setSelected] = useState<ProjectAgentHistorySummary>();
  const [preview, setPreview] = useState<(ProjectAgentSessionV2 & { title: string })>(); const [previewLoading, setPreviewLoading] = useState(false); const [editingId, setEditingId] = useState<string>(); const [editingTitle, setEditingTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number }>(); const listRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null); const scrollTop = useRef(0); const requestSeq = useRef(0);
  const projectNames = useMemo(() => new Map(projects.map((item) => [item.id, item.name])), [projects]);
  const projectOptions = useMemo(() => [{ value: 'all', label: '全部项目' }, { value: '__unbound__', label: '新项目任务' }, ...projects.map((item) => ({ value: item.id, label: item.name }))], [projects]);

  useEffect(() => { const timer = window.setTimeout(() => setQuery(queryDraft.trim()), 250); return () => window.clearTimeout(timer); }, [queryDraft]);
  async function load(reset = true) {
    const seq = ++requestSeq.current; if (reset) { setLoading(true); setLoadError(''); } else setLoadingMore(true);
    try {
      const result = await llmApi.projectAgent.history({ q: query || undefined, status: status === 'all' ? undefined : status, projectId: projectFilter === 'all' ? undefined : projectFilter, archived, cursor: reset ? undefined : nextCursor, limit: 30 }) as ProjectAgentHistoryPage;
      if (seq !== requestSeq.current) return; setItems((current) => reset ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]); setNextCursor(result.nextCursor);
    } catch (error) { if (seq === requestSeq.current) setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { if (seq === requestSeq.current) { setLoading(false); setLoadingMore(false); } }
  }
  useEffect(() => { void load(true); }, [query, status, projectFilter, archived]);
  useEffect(() => { const dismiss = () => setContextMenu(undefined); window.addEventListener('pointerdown', dismiss); return () => window.removeEventListener('pointerdown', dismiss); }, []);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const groups = groupProjectAgentHistoryByTime(items); const contextItem = contextMenu ? items.find((item) => item.id === contextMenu.id) : undefined;
  const projectLabel = (item: ProjectAgentHistorySummary) => item.projectIds.length ? item.projectIds.map((id) => projectNames.get(id) || id).join('、') : '新项目任务';
  const sameProject = (item: ProjectAgentHistorySummary) => currentProjectId ? item.projectIds.includes(currentProjectId) : item.projectIds.length === 0;
  const closeMenus = () => { setContextMenu(undefined); listRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((menu) => { menu.open = false; }); };
  const beginRename = (item: ProjectAgentHistorySummary) => { setEditingId(item.id); setEditingTitle(item.title); closeMenus(); window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-history-rename="${CSS.escape(item.id)}"]`)?.select()); };
  const commitRename = async (item: ProjectAgentHistorySummary) => { const title = editingTitle.trim(); if (!title || title === item.title) { setEditingId(undefined); return; } await onRename(item, title); setEditingId(undefined); await load(true); };
  const manage = async (action: 'pin' | 'archive' | 'restore' | 'delete', item: ProjectAgentHistorySummary) => { closeMenus(); if (action === 'pin') await onTogglePin(item); else if (action === 'archive') await onArchive(item); else if (action === 'restore') await onRestore(item); else if (!await onDelete(item)) return; if (selected?.id === item.id && ['archive', 'delete'].includes(action)) { setSelected(undefined); setPreview(undefined); } else if (selected?.id === item.id && action === 'restore') setSelected({ ...item, archived: false }); await load(true); };
  const openPreview = async (item: ProjectAgentHistorySummary) => { scrollTop.current = listRef.current?.scrollTop || 0; setSelected(item); setPreview(undefined); setPreviewLoading(true); try { setPreview(await llmApi.projectAgent.getSession(item.id, item.projectId) as ProjectAgentSessionV2 & { title: string }); } catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); } finally { setPreviewLoading(false); } };
  const backToList = () => { const id = selected?.id; setSelected(undefined); setPreview(undefined); window.requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = scrollTop.current; if (id) document.querySelector<HTMLButtonElement>(`[data-history-row="${CSS.escape(id)}"]`)?.focus(); }); };
  const moveRowFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, direction: number) => { const rows = [...document.querySelectorAll<HTMLButtonElement>('[data-history-row]')]; const index = rows.indexOf(event.currentTarget); const target = rows[index + direction]; if (target) { event.preventDefault(); target.focus(); } };

  const renderMenu = (item: ProjectAgentHistorySummary, className = '') => <div className={`project-agent-history-item-menu ${className}`} role="menu" aria-label={`${item.title}操作`}>
    {!item.archived && <button type="button" role="menuitem" onClick={() => beginRename(item)}>重命名</button>}
    {!item.archived && <button type="button" role="menuitem" onClick={() => void manage('pin', item)}>{item.pinnedAt ? '取消置顶' : '置顶'}</button>}
    {item.archived ? <button type="button" role="menuitem" onClick={() => void manage('restore', item)}>恢复</button> : <button type="button" role="menuitem" onClick={() => void manage('archive', item)}>归档</button>}
    <button type="button" role="menuitem" className="danger-text" onClick={() => void manage('delete', item)}>永久删除…</button>
  </div>;

  if (selected) return <section className="project-agent-history-mode project-agent-history-detail" aria-label="历史任务只读详情" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); backToList(); } }}>
    <header className="project-agent-history-mode-header"><button type="button" className="project-agent-history-back" onClick={backToList}>‹ 返回历史</button><div><strong>{selected.title}</strong><small>{projectLabel(selected)} · 只读记录</small></div><span className={`project-agent-history-status ${selected.status}`}>{statusIcons[selected.status]} {statusLabels[selected.status]}</span></header>
    <div className="project-agent-history-detail-actions"><span>浏览不会影响当前任务。</span>{selected.archived ? <button type="button" className="primary" disabled={busy} onClick={() => void manage('restore', selected)}>恢复任务</button> : sameProject(selected) ? <button type="button" className="primary" disabled={busy || !preview} onClick={() => preview && void onActivate(preview)}>继续此任务</button> : <button type="button" className="primary" disabled={busy} onClick={() => onNavigate(selected)}>前往对应项目继续</button>}</div>
    {previewLoading ? <div className="project-agent-history-state" role="status">正在读取历史任务…</div> : preview ? <ProjectAgentTimeline session={preview} busy readOnly answers={{}} manualOperationApproval={false} onAnswer={() => {}} onSubmitAnswers={() => {}} onUseExample={() => {}} onConfirmPlan={() => {}} onConfirmOperation={() => {}} onControl={() => {}} onRetryPlanning={() => {}} /> : <div className="project-agent-history-state error" role="alert"><strong>无法读取历史详情</strong><button type="button" onClick={() => void openPreview(selected)}>重试</button></div>}
  </section>;

  return <section className="project-agent-history-mode" aria-label="历史任务" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } else if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) && document.activeElement !== searchRef.current) { event.preventDefault(); searchRef.current?.focus(); } }}>
    <header className="project-agent-history-mode-header"><button type="button" className="project-agent-history-back" onClick={onClose}>‹ 当前任务</button><div><strong>历史任务</strong><small>浏览不会切换或暂停当前任务</small></div></header>
    {activeSession && requiresPauseBeforeSessionSwitch(activeSession.phase) && <div className="project-agent-history-running" role="status"><span>↻</span><div><strong>当前任务仍在后台运行</strong><small>{activeSession.title}</small></div><button type="button" onClick={onClose}>查看进展</button></div>}
    <div className="project-agent-history-filters"><label><span className="sr-only">搜索历史任务</span><input ref={searchRef} type="search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索标题、目标或项目" /></label><div className="project-agent-history-status-filters" role="group" aria-label="按状态筛选">{([['all', '全部'], ['active', '进行中'], ['attention', '需处理'], ['completed', '已完成']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div><div className="project-agent-history-secondary-filters"><div className="project-agent-history-project-filter"><span>项目</span><Select aria-label="按项目筛选历史任务" value={projectFilter} onChange={setProjectFilter} options={projectOptions} popupMatchSelectWidth={false} /></div><label className="project-agent-history-archive-toggle"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} /> 查看归档</label></div></div>
    <div ref={listRef} className="project-agent-history-list" role="list" aria-busy={loading} onScroll={(event) => { const element = event.currentTarget; if (nextCursor && !loadingMore && element.scrollHeight - element.scrollTop - element.clientHeight < 160) void load(false); }}>
      {loading ? <div className="project-agent-history-state" role="status">正在加载历史任务…</div> : loadError ? <div className="project-agent-history-state error" role="alert"><strong>历史任务加载失败</strong><p>{loadError}</p><button type="button" onClick={() => void load(true)}>重试</button></div> : !items.length ? <div className="project-agent-history-state"><strong>{query || status !== 'all' || projectFilter !== 'all' ? '没有匹配的历史任务' : archived ? '归档中没有任务' : '还没有历史任务'}</strong><p>调整筛选条件，或返回当前任务继续工作。</p></div> : (Object.entries(groups) as Array<[keyof typeof groups, ProjectAgentHistorySummary[]]>).map(([key, values]) => values.length ? <section key={key} className="project-agent-history-time-group"><h3>{timeGroupLabels[key]}</h3>{values.map((item) => <article key={item.id} role="listitem" className={`project-agent-history-row ${item.id === activeSession?.id ? 'current' : ''}`} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }); }}>
        {editingId === item.id ? <div className="project-agent-history-row-edit"><span className={`project-agent-history-status-icon ${item.status}`}>{statusIcons[item.status]}</span><input data-history-rename={item.id} value={editingTitle} maxLength={80} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void commitRename(item); if (event.key === 'Escape') setEditingId(undefined); }} onBlur={() => void commitRename(item)} aria-label="历史任务名称" /></div> : <button type="button" data-history-row={item.id} aria-current={item.id === activeSession?.id ? 'true' : undefined} aria-label={`${item.title}，${statusLabels[item.status]}，${projectLabel(item)}`} onClick={() => void openPreview(item)} onKeyDown={(event) => { if (event.key === 'ArrowDown') moveRowFocus(event, 1); else if (event.key === 'ArrowUp') moveRowFocus(event, -1); }}><span className={`project-agent-history-status-icon ${item.status}`}>{statusIcons[item.status]}</span><span className="project-agent-history-row-copy"><strong>{item.title}</strong><small>{item.goal || '尚未形成目标摘要'}</small><span>{projectLabel(item)} · {item.requirementCoverage.total ? `已验证 ${item.requirementCoverage.verified}/${item.requirementCoverage.total}` : phaseLabels[item.phase]} · {relativeTime(item.updatedAt)}</span></span>{item.pinnedAt && <span className="project-agent-history-pin" aria-label="已置顶">⌃</span>}</button>}
        <details className="project-agent-history-overflow"><summary aria-label={`${item.title}更多操作`}>•••</summary>{renderMenu(item)}</details>
      </article>)}</section> : null)}
      {loadingMore && <div className="project-agent-history-loading-more" role="status">正在加载更多…</div>}
    </div>
    {contextItem && contextMenu && <div className="project-agent-history-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>{renderMenu(contextItem, 'context')}</div>}
  </section>;
}
