import React, { forwardRef, useMemo, useState } from 'react';
import { statusLabels, threadGroups, threadProjectScope, type ProjectAgentThread } from './projectAgentUiModel';

type Filter = 'all' | 'active' | 'attention' | 'completed';

function threadFilterStatus(thread: ProjectAgentThread): Filter {
  if (['completed', 'stopped'].includes(thread.status)) return 'completed';
  if (['awaiting_plan_approval', 'awaiting_operation_approval', 'paused', 'blocked', 'failed'].includes(thread.status)) return 'attention';
  return 'active';
}

export interface ThreadSidebarHandle { focusSearch(): void; }

const ThreadSidebar = forwardRef<ThreadSidebarHandle, {
  threads: ProjectAgentThread[];
  activeId?: string;
  currentProjectId?: string;
  busy?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, pinnedAt?: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}>(({ threads, activeId, currentProjectId, busy, onSelect, onNew, onRename, onTogglePin, onArchive, onRestore, onDelete }, ref) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [renamingId, setRenamingId] = useState<string | undefined>();
  const [renameTitle, setRenameTitle] = useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }));

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return threads.filter((thread) => {
      if (filter !== 'all' && threadFilterStatus(thread) !== filter) return false;
      if (!q) return true;
      return `${thread.title}\n${thread.plan?.goal || ''}\n${threadProjectScope(thread).join(' ')}`.toLocaleLowerCase().includes(q);
    });
  }, [threads, query, filter]);
  const groups = threadGroups(filtered, currentProjectId);

  const groupEntries: Array<[string, ProjectAgentThread[]]> = [
    ['当前项目', groups.current],
    ['未绑定', groups.unbound],
    ['其它项目', groups.other],
  ].filter((entry) => entry[1].length > 0) as Array<[string, ProjectAgentThread[]]>;

  return (
    <nav className="agent-sidebar" aria-label="线程列表">
      <div className="agent-sidebar-search">
        <input ref={searchRef} type="search" value={query} aria-label="搜索线程" placeholder="搜索线程（/）"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'ArrowDown') event.currentTarget.nextElementSibling?.querySelector<HTMLButtonElement>('button')?.focus(); }} />
      </div>
      <div className="agent-sidebar-filters" role="group" aria-label="按状态筛选">
        {([['all', '全部'], ['active', '进行中'], ['attention', '需处理'], ['completed', '已完成']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <div className="agent-sidebar-actions" style={{ padding: '0 10px 8px' }}>
        <button type="button" className="agent-btn agent-btn-primary" style={{ width: '100%' }} disabled={busy} onClick={onNew}>新建线程</button>
      </div>
      <div className="agent-thread-groups">
        {!groupEntries.length && <div className="agent-empty-state" style={{ padding: '24px 12px' }}><strong>没有匹配的线程</strong><p>调整筛选条件，或新建一个线程。</p></div>}
        {groupEntries.map(([label, items]) => (
          <section key={label} className="agent-thread-group">
            <h4>{label}</h4>
            {items.map((thread) => {
              const pinned = Boolean(thread.pinnedAt);
              return (
                <div key={thread.id} className="agent-list-item" style={{ position: 'relative' }}>
                  {renamingId === thread.id ? (
                    <input
                      autoFocus
                      value={renameTitle}
                      maxLength={80}
                      aria-label="线程名称"
                      style={{ width: '100%', borderRadius: 6, border: 'var(--border)', padding: '6px 8px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)' }}
                      onChange={(event) => setRenameTitle(event.target.value)}
                      onBlur={() => { onRename(thread.id, renameTitle); setRenamingId(undefined); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { onRename(thread.id, renameTitle); setRenamingId(undefined); }
                        if (event.key === 'Escape') setRenamingId(undefined);
                      }} />
                  ) : (
                    <button type="button" className="agent-list-row" aria-current={thread.id === activeId ? 'true' : undefined} onClick={() => onSelect(thread.id)}>
                      <span className={`agent-badge ${threadFilterStatus(thread) === 'attention' ? 'agent-badge-warning' : threadFilterStatus(thread) === 'completed' ? 'agent-badge-muted' : 'agent-badge-accent'}`}>{statusLabels[thread.status]}</span>
                      <span className="agent-row-copy">
                        <strong>{thread.title}</strong>
                        <small>{thread.plan?.goal || '尚未形成目标'}{pinned ? ' · 已置顶' : ''}</small>
                      </span>
                    </button>
                  )}
                  <div className="agent-row-menu" style={{ position: 'absolute', right: 6, top: 8 }}>
                    <details>
                      <summary aria-label={`${thread.title}更多操作`}>•••</summary>
                      <div className="agent-menu" role="menu">
                        <button type="button" role="menuitem" disabled={busy} onClick={() => { setRenamingId(thread.id); setRenameTitle(thread.title); }}>重命名</button>
                        <button type="button" role="menuitem" disabled={busy} onClick={() => onTogglePin(thread.id, pinned ? undefined : new Date().toISOString())}>{pinned ? '取消置顶' : '置顶'}</button>
                        {thread.archived
                          ? <button type="button" role="menuitem" disabled={busy} onClick={() => onRestore(thread.id)}>恢复</button>
                          : <button type="button" role="menuitem" disabled={busy} onClick={() => onArchive(thread.id)}>归档</button>}
                        <button type="button" role="menuitem" className="agent-danger-text" disabled={busy} onClick={() => onDelete(thread.id)}>永久删除</button>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
});
ThreadSidebar.displayName = 'ThreadSidebar';
export default ThreadSidebar;
