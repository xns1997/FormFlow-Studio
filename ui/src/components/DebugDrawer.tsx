import React, { useEffect, useMemo, useState } from 'react';
import { AntdCompatSelect } from './AntdFormControls';
import type { DebugEntry, DebugEntryLevel, DebugEntrySource } from '../project/types';
import { useSystemSettingsStore } from '../project/systemSettingsStore';

interface DebugDrawerProps {
  entries: DebugEntry[];
  open: boolean;
  onToggle: (next: boolean) => void;
  title?: string;
  enableServerLogs?: boolean;
  onSelectEntry?: (entry: DebugEntry) => void;
}

type ServerLogResponse = {
  logs?: Array<Record<string, unknown>>;
};

type DebugSourceFilter = 'runtime' | 'all' | DebugEntrySource;

function parseServerEntry(raw: Record<string, unknown>): DebugEntry {
  return {
    id: String(raw.id || `server_${raw.timestamp || Date.now()}`),
    timestamp: Number(raw.timestamp || Date.now()),
    level: (raw.level as DebugEntryLevel) || 'info',
    source: 'server',
    channel: 'backend',
    title: typeof raw.source === 'string' ? raw.source : 'server',
    message: String(raw.message || ''),
    requestId: typeof raw.requestId === 'string' ? raw.requestId : undefined,
    context: (raw.context && typeof raw.context === 'object' && !Array.isArray(raw.context)) ? raw.context as Record<string, unknown> : undefined,
  };
}

export default function DebugDrawer({
  entries,
  open,
  onToggle,
  title = '调试抽屉',
  enableServerLogs = false,
  onSelectEntry,
}: DebugDrawerProps) {
  const apiBase = useSystemSettingsStore((state) => state.settings.storage.apiBase);
  const [serverEntries, setServerEntries] = useState<DebugEntry[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<'all' | DebugEntryLevel>('all');
  const [source, setSource] = useState<DebugSourceFilter>('runtime');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !enableServerLogs) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, '')}/debug/logs?limit=100`);
        if (!response.ok) return;
        const data = await response.json() as ServerLogResponse;
        if (cancelled) return;
        setServerEntries((data.logs || []).map((item) => parseServerEntry(item)));
      } catch {
        if (!cancelled) setServerEntries([]);
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, enableServerLogs, open]);

  const mergedEntries = useMemo(() => {
    const all = [...entries, ...serverEntries];
    return all.sort((left, right) => right.timestamp - left.timestamp);
  }, [entries, serverEntries]);

  const filteredEntries = useMemo(() => {
    return mergedEntries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (source === 'runtime' && entry.source === 'server') return false;
      if (source !== 'runtime' && source !== 'all' && entry.source !== source) return false;
      if (!search.trim()) return true;
      const haystack = [
        entry.title,
        entry.message,
        entry.field,
        entry.componentId,
        entry.nodeId,
        entry.workflowId,
        entry.requestId,
        entry.context ? JSON.stringify(entry.context) : '',
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [level, mergedEntries, search, source]);

  return (
    <div style={{
      position: 'absolute',
      right: 16,
      bottom: 16,
      width: open ? 'min(420px, calc(100vw - 32px))' : 180,
      maxHeight: open ? '60vh' : 52,
      borderRadius: 16,
      background: 'rgba(255,255,255,0.96)',
      boxShadow: '0 20px 50px rgba(15,23,42,0.18)',
      border: '1px solid rgba(148,163,184,0.22)',
      overflow: 'hidden',
      backdropFilter: 'blur(16px)',
      zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: open ? '1px solid rgba(148,163,184,0.18)' : 'none' }}>
        <div>
          <strong style={{ fontSize: 12, color: '#0f172a' }}>{title}</strong>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {filteredEntries.length === mergedEntries.length ? `${mergedEntries.length} 条` : `${filteredEntries.length} / ${mergedEntries.length} 条`}
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn-xs" onClick={() => onToggle(!open)}>
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: 8, padding: 12, borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索字段 / 节点 / 文本" />
            <AntdCompatSelect value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
              <option value="all">全部级别</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
              <option value="debug">debug</option>
            </AntdCompatSelect>
            <AntdCompatSelect value={source} onChange={(event) => setSource(event.target.value as DebugSourceFilter)}>
              <option value="runtime">运行日志</option>
              <option value="all">全部来源</option>
              <option value="script">script</option>
              <option value="flow">flow</option>
              <option value="workflow-node">workflow-node</option>
              <option value="server">server</option>
            </AntdCompatSelect>
          </div>
          <div style={{ maxHeight: 'calc(60vh - 112px)', overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredEntries.length === 0 ? (
              <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '20px 0' }}>暂无调试日志</div>
            ) : filteredEntries.map((entry) => {
              const expanded = expandedId === entry.id;
              const tone = entry.level === 'error' ? '#dc2626' : entry.level === 'warn' ? '#d97706' : entry.level === 'debug' ? '#2563eb' : '#0f766e';
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="debug-drawer-entry"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedId(expanded ? null : entry.id);
                    onSelectEntry?.(entry);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    minWidth: 0,
                    textAlign: 'left',
                    border: `1px solid ${tone}22`,
                    background: `${tone}08`,
                    borderRadius: 12,
                    padding: 10,
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, minWidth: 0 }}>
                    <div title={entry.title || entry.source} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: tone }}>{entry.title || entry.source}</div>
                    <div style={{ flexShrink: 0, fontSize: 10, color: '#64748b' }}>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <div title={expanded ? undefined : entry.message} style={{ fontSize: 11, lineHeight: 1.45, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'pre-wrap' : 'nowrap', wordBreak: expanded ? 'break-word' : undefined }}>{entry.message}</div>
                  {expanded && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {entry.field && <span style={chipStyle}>字段: {entry.field}</span>}
                      {entry.componentId && <span style={chipStyle}>控件: {entry.componentId}</span>}
                      {entry.workflowId && <span style={chipStyle}>流程: {entry.workflowId}</span>}
                      {entry.nodeId && <span style={chipStyle}>节点: {entry.nodeId}</span>}
                      {entry.requestId && <span style={chipStyle}>请求: {entry.requestId}</span>}
                    </div>
                  )}
                  {expanded && entry.context && (
                    <pre style={{ margin: '8px 0 0', padding: 8, background: 'rgba(15,23,42,0.06)', borderRadius: 8, fontSize: 10, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(entry.context, null, 2)}
                    </pre>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.16)',
  color: '#475569',
  fontSize: 10,
};
