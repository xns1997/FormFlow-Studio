import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  portalToBody?: boolean;
}

type ServerLogResponse = {
  logs?: Array<Record<string, unknown>>;
};

type DebugSourceFilter = 'runtime' | 'all' | DebugEntrySource;

function sourceLabel(source: DebugEntrySource) {
  switch (source) {
    case 'script': return '脚本';
    case 'flow': return '流程';
    case 'workflow-node': return '节点';
    case 'ui': return '界面';
    case 'server': return '服务端';
    default: return source;
  }
}

function levelLabel(level: DebugEntryLevel) {
  switch (level) {
    case 'info': return '信息';
    case 'warn': return '警告';
    case 'error': return '错误';
    case 'debug': return '调试';
    default: return level;
  }
}

function levelTone(level: DebugEntryLevel) {
  return level === 'error'
    ? { accent: '#dc2626', soft: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.16)' }
    : level === 'warn'
      ? { accent: '#d97706', soft: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.18)' }
      : level === 'debug'
        ? { accent: '#2563eb', soft: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.16)' }
        : { accent: '#0f766e', soft: 'rgba(15,118,110,0.08)', border: 'rgba(15,118,110,0.16)' };
}

function formatEntrySummary(entry: DebugEntry) {
  const title = String(entry.title || '').trim();
  const message = String(entry.message || '').trim();
  if (!title) return { heading: message || sourceLabel(entry.source), body: '' };
  if (!message) return { heading: title, body: '' };
  if (title === message || message.includes(title)) return { heading: message, body: '' };
  return { heading: title, body: message };
}

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
  portalToBody = false,
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

  const drawer = (
    <div className="debug-drawer" data-debug-portal={portalToBody || undefined} style={{
      position: portalToBody ? 'fixed' : 'absolute',
      right: 16,
      bottom: 16,
      width: open ? 'min(460px, calc(100vw - 32px))' : 188,
      height: open ? 'min(72vh, 720px)' : 52,
      maxHeight: open ? 'calc(100vh - 32px)' : 52,
      borderRadius: 18,
      background: 'rgba(255,255,255,0.94)',
      boxShadow: '0 24px 64px rgba(15,23,42,0.18)',
      border: '1px solid rgba(148,163,184,0.18)',
      overflow: 'hidden',
      backdropFilter: 'blur(18px)',
      zIndex: portalToBody ? 1500 : 30,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: open ? '1px solid rgba(148,163,184,0.14)' : 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(248,250,252,0.92))' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 13, color: '#0f172a' }}>{title}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: '#64748b' }}>
            {filteredEntries.length === mergedEntries.length ? `${mergedEntries.length} 条` : `${filteredEntries.length} / ${mergedEntries.length} 条`}
            {filteredEntries.some((entry) => entry.level === 'error') && <span style={{ ...pillStyle, color: '#b91c1c', background: 'rgba(220,38,38,0.08)' }}>含错误</span>}
            {!filteredEntries.some((entry) => entry.level === 'error') && filteredEntries.some((entry) => entry.level === 'warn') && <span style={{ ...pillStyle, color: '#b45309', background: 'rgba(217,119,6,0.08)' }}>含警告</span>}
          </div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-xs"
          style={{ minWidth: 56 }}
          aria-expanded={open}
          aria-label={open ? '收起调试抽屉' : '展开调试抽屉'}
          onClick={() => onToggle(!open)}
        >
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(2, minmax(112px, 132px))', gap: 8, padding: 12, borderBottom: '1px solid rgba(148,163,184,0.14)', background: 'rgba(248,250,252,0.76)', flex: '0 0 auto' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索字段、节点、流程"
              style={filterInputStyle}
            />
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
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredEntries.length === 0 ? (
              <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '20px 0' }}>暂无调试日志</div>
            ) : filteredEntries.map((entry) => {
              const expanded = expandedId === entry.id;
              const tone = levelTone(entry.level);
              const summary = formatEntrySummary(entry);
              return (
                <div
                  key={entry.id}
                  style={{
                    border: `1px solid ${tone.border}`,
                    background: expanded ? `linear-gradient(180deg, ${tone.soft}, rgba(255,255,255,0.92))` : 'rgba(255,255,255,0.88)',
                    borderRadius: 14,
                    overflow: 'visible',
                    boxShadow: expanded ? '0 10px 24px rgba(15,23,42,0.08)' : 'none',
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => {
                      setExpandedId(expanded ? null : entry.id);
                      onSelectEntry?.(entry);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setExpandedId(expanded ? null : entry.id);
                        onSelectEntry?.(entry);
                      }
                    }}
                    style={{
                      display: 'grid',
                      width: '100%',
                      minWidth: 0,
                      minHeight: expanded ? 88 : 76,
                      padding: '12px 14px',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                      lineHeight: 1.45,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'stretch', gap: 12, minWidth: 0 }}>
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 22 }}>
                          <span style={{ ...pillStyle, color: tone.accent, background: tone.soft }}>{levelLabel(entry.level)}</span>
                          <span style={{ ...pillStyle, color: '#475569', background: 'rgba(148,163,184,0.12)' }}>{sourceLabel(entry.source)}</span>
                          {entry.channel && <span style={{ ...pillStyle, color: '#64748b', background: 'rgba(148,163,184,0.08)' }}>{entry.channel}</span>}
                        </div>
                        <div
                          title={summary.heading}
                          style={{
                            minWidth: 0,
                            minHeight: expanded ? undefined : 18,
                            overflow: expanded ? 'visible' : 'hidden',
                            textOverflow: expanded ? 'clip' : 'ellipsis',
                            whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
                            fontSize: 12.5,
                            fontWeight: 650,
                            lineHeight: 1.5,
                            color: '#0f172a',
                            wordBreak: 'break-word',
                          }}
                        >
                          {summary.heading}
                        </div>
                        {!!summary.body && (
                          <div
                            title={expanded ? undefined : summary.body}
                            style={{
                              fontSize: 11,
                              lineHeight: 1.5,
                              color: '#64748b',
                              overflow: expanded ? 'visible' : 'hidden',
                              textOverflow: expanded ? 'clip' : 'ellipsis',
                              whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
                              wordBreak: expanded ? 'break-word' : undefined,
                              maxHeight: expanded ? 180 : undefined,
                              overflowY: expanded ? 'auto' : undefined,
                            }}
                          >
                            {summary.body}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: expanded ? 64 : 52, flexShrink: 0 }}>
                        <div style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.2 }}>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        <span style={{ fontSize: 11, color: tone.accent, lineHeight: 1.2 }}>{expanded ? '收起' : '详情'}</span>
                      </div>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 12px 8px' }}>
                      {entry.field && <span style={chipStyle}>字段: {entry.field}</span>}
                      {entry.componentId && <span style={chipStyle}>控件: {entry.componentId}</span>}
                      {entry.workflowId && <span style={chipStyle}>流程: {entry.workflowId}</span>}
                      {entry.nodeId && <span style={chipStyle}>节点: {entry.nodeId}</span>}
                      {entry.requestId && <span style={chipStyle}>请求: {entry.requestId}</span>}
                    </div>
                  )}
                  {expanded && entry.context && (
                    <pre style={{ margin: '0 12px 12px', padding: 10, background: 'rgba(15,23,42,0.05)', borderRadius: 10, fontSize: 10, lineHeight: 1.5, overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', color: '#334155' }}>
                      {JSON.stringify(entry.context, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return portalToBody && typeof document !== 'undefined'
    ? createPortal(drawer, document.body)
    : drawer;
}

const chipStyle: React.CSSProperties = {
  padding: '3px 7px',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.14)',
  color: '#475569',
  fontSize: 10,
};

const pillStyle: React.CSSProperties = {
  padding: '2px 7px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
};

const filterInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 32,
  padding: '0 10px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.92)',
  color: '#0f172a',
  fontSize: 12,
  outline: 'none',
};
