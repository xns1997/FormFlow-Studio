import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FlowNodeSpec, SchemaPort } from '../flowRegistry';
import type { SrcTableEntry } from '../project/types';
import {
  NODE_DISCOVERY_GROUPS,
  NODE_DISCOVERY_STORAGE_KEY,
  buildNodeSearchIndex,
  findBestCompatiblePort,
  parseNodeDiscoveryPreferences,
  recordRecentNode,
  searchNodeDocuments,
  toggleFavoriteNode,
  type NodeConnectionContext,
  type NodeDiscoveryGroup,
  type NodeDiscoveryPreferences,
  type NodeSearchResult,
} from '../services/config/nodeDiscovery';

type CompatibilityDirection = 'downstream' | 'upstream';

interface NodePaletteProps {
  specs: FlowNodeSpec[];
  tables: SrcTableEntry[];
  selectedSpec?: FlowNodeSpec;
  onAdd: (spec: FlowNodeSpec) => void;
  onPointerDragStart?: (spec: FlowNodeSpec, event: React.PointerEvent) => void;
  onClose: () => void;
}

interface NodeResultRowProps {
  result: NodeSearchResult;
  query: string;
  favorite: boolean;
  active?: boolean;
  compatibilityText?: string;
  onChoose: () => void;
  onToggleFavorite: () => void;
  onPointerDragStart?: (event: React.PointerEvent) => void;
}

function directHighlight(label: string, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return label;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!escaped) return label;
  const re = new RegExp(`(${escaped})`, 'ig');
  return label.split(re).map((part, index) => terms.some((term) => part.toLocaleLowerCase('zh-CN') === term.toLocaleLowerCase('zh-CN')) ? <mark key={index}>{part}</mark> : part);
}

function portCounts(spec: FlowNodeSpec) {
  const inputs = spec.ports.filter((port) => port.direction === 'input' || port.direction === 'both').length;
  const outputs = spec.ports.filter((port) => port.direction === 'output' || port.direction === 'both').length;
  return { inputs, outputs };
}

function NodeResultRow({ result, query, favorite, active, compatibilityText, onChoose, onToggleFavorite, onPointerDragStart }: NodeResultRowProps) {
  const { spec } = result.document;
  const counts = portCounts(spec);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  return (
    <div
      className={`node-result-row ${active ? 'active' : ''}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        onChoose();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        suppressClickRef.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        onPointerDragStart?.(event);
      }}
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) suppressClickRef.current = true;
      }}
      onPointerUp={() => { pointerStartRef.current = null; }}
      onPointerCancel={() => { pointerStartRef.current = null; suppressClickRef.current = false; }}
      title={spec.description}
    >
      <span className="node-drag-grip" aria-hidden="true">⠿</span>
      <div className="node-result-main">
        <span className="node-result-label">{directHighlight(spec.label, query)}</span>
        <span className="node-result-category">{spec.category}</span>
        {compatibilityText && <span className="node-result-compatibility">{compatibilityText}</span>}
      </div>
      <div className="node-result-actions">
        <span className="node-result-ports">{counts.inputs}入 · {counts.outputs}出</span>
        <button
          className={`node-favorite ${favorite ? 'active' : ''}`}
          aria-label={favorite ? `取消收藏 ${spec.label}` : `收藏 ${spec.label}`}
          title={favorite ? '取消收藏' : '收藏'}
          onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}
        >{favorite ? '★' : '☆'}</button>
      </div>
    </div>
  );
}

function readPreferences(specs: FlowNodeSpec[]): NodeDiscoveryPreferences {
  if (typeof window === 'undefined') return { favorites: [], recent: [] };
  return parseNodeDiscoveryPreferences(localStorage.getItem(NODE_DISCOVERY_STORAGE_KEY), specs.map((spec) => spec.id));
}

export default function NodePalette({ specs, tables, selectedSpec, onAdd, onPointerDragStart, onClose }: NodePaletteProps) {
  const index = useMemo(() => buildNodeSearchIndex(specs), [specs]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<NodeDiscoveryGroup | 'all'>('all');
  const [preferences, setPreferences] = useState<NodeDiscoveryPreferences>(() => readPreferences(specs));
  const [compatibleOnly, setCompatibleOnly] = useState(false);
  const [compatibilityDirection, setCompatibilityDirection] = useState<CompatibilityDirection>('downstream');
  const [activeIndex, setActiveIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<NodeDiscoveryGroup>>(() => new Set(
    NODE_DISCOVERY_GROUPS.filter((item) => item !== '场景模板' && item !== '输入与选择'),
  ));
  const [dataOpen, setDataOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(NODE_DISCOVERY_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const onNodeUsed = (event: Event) => {
      const specId = (event as CustomEvent<string>).detail;
      if (specId) setPreferences((current) => recordRecentNode(current, specId));
    };
    window.addEventListener('formflow:node-used', onNodeUsed);
    return () => window.removeEventListener('formflow:node-used', onNodeUsed);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]') || target?.closest('.monaco-editor');
      if (typing) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const compatibilityFor = (spec: FlowNodeSpec): { context: NodeConnectionContext; port: SchemaPort } | null => {
    if (!selectedSpec) return null;
    const sourcePorts = selectedSpec.ports.filter((port) => compatibilityDirection === 'downstream'
      ? port.direction === 'output' || port.direction === 'both'
      : port.direction === 'input' || port.direction === 'both');
    for (const sourcePort of sourcePorts) {
      const context: NodeConnectionContext = {
        direction: compatibilityDirection === 'downstream' ? 'from-output' : 'to-input',
        port: sourcePort,
      };
      const port = findBestCompatiblePort(spec, context);
      if (port) return { context, port };
    }
    return null;
  };

  const results = useMemo(() => {
    const base = searchNodeDocuments(index, query, {
      group,
      favorites: preferences.favorites,
      recent: preferences.recent,
    });
    if (!compatibleOnly || !selectedSpec) return base;
    return base.filter((result) => compatibilityFor(result.document.spec));
  }, [index, query, group, preferences, compatibleOnly, selectedSpec, compatibilityDirection]);

  useEffect(() => { setActiveIndex(0); }, [query, group, compatibleOnly, compatibilityDirection]);

  const resultById = useMemo(() => new Map(results.map((result) => [result.document.spec.id, result])), [results]);
  const choose = (spec: FlowNodeSpec) => {
    onAdd(spec);
  };
  const toggleFavorite = (specId: string) => setPreferences((current) => toggleFavoriteNode(current, specId));

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(displayedSearchResults.length - 1, value + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); }
    else if (event.key === 'Enter' && displayedSearchResults[activeIndex]) { event.preventDefault(); choose(displayedSearchResults[activeIndex].document.spec); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      if (query) setQuery(''); else searchRef.current?.blur();
    }
  };

  const renderResult = (result: NodeSearchResult, indexInResults?: number) => {
    const match = compatibleOnly ? compatibilityFor(result.document.spec) : null;
    const compatibilityText = match
      ? compatibilityDirection === 'downstream'
        ? `${match.context.port.label} → ${match.port.label}`
        : `${match.port.label} → ${match.context.port.label}`
      : undefined;
    return (
      <NodeResultRow
        key={result.document.spec.id}
        result={result}
        query={query}
        favorite={preferences.favorites.includes(result.document.spec.id)}
        active={indexInResults === activeIndex}
        compatibilityText={compatibilityText}
        onChoose={() => choose(result.document.spec)}
        onToggleFavorite={() => toggleFavorite(result.document.spec.id)}
        onPointerDragStart={(event) => onPointerDragStart?.(result.document.spec, event)}
      />
    );
  };

  const isSearching = query.trim().length > 0;
  const displayedSearchResults = isSearching ? results.slice(0, 50) : results;
  const favorites = preferences.favorites.map((id) => resultById.get(id)).filter(Boolean) as NodeSearchResult[];
  const recent = preferences.recent.map((id) => resultById.get(id)).filter(Boolean) as NodeSearchResult[];

  return (
    <aside className="canvas-palette">
      <div className="palette-header"><span>节点面板 <small>{specs.length}</small></span><button onClick={onClose} aria-label="关闭节点面板">×</button></div>
      <div className="palette-search-wrap">
        <span className="palette-search-icon">⌕</span>
        <input
          ref={searchRef}
          className="palette-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="搜索名称、拼音、关键词…"
          aria-label="搜索节点"
        />
        {query && <button className="palette-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">×</button>}
        <kbd>⌘K</kbd>
      </div>
      <div className="palette-group-filter" aria-label="节点分组筛选">
        <button className={group === 'all' ? 'active' : ''} onClick={() => setGroup('all')}>全部</button>
        {NODE_DISCOVERY_GROUPS.map((item) => <button key={item} className={group === item ? 'active' : ''} onClick={() => setGroup(item)}>{item}</button>)}
      </div>
      <div className="palette-compatibility-controls">
        <label><input type="checkbox" checked={compatibleOnly} disabled={!selectedSpec} onChange={(event) => setCompatibleOnly(event.target.checked)} /> 仅看兼容节点</label>
        {compatibleOnly && selectedSpec && <div className="compatibility-direction">
          <button className={compatibilityDirection === 'downstream' ? 'active' : ''} onClick={() => setCompatibilityDirection('downstream')}>接在后面</button>
          <button className={compatibilityDirection === 'upstream' ? 'active' : ''} onClick={() => setCompatibilityDirection('upstream')}>接在前面</button>
        </div>}
      </div>

      {!isSearching && tables.length > 0 && (
        <div className="palette-data-source">
          <button className="palette-section-toggle" onClick={() => setDataOpen((value) => !value)}><span>数据源</span><span>{dataOpen ? '−' : '+'}</span></button>
          {dataOpen && tables.map((table) => <div key={table.id} className="palette-data-file">
            <span className="palette-data-file-name">{table.fileName}</span>
            {table.sheets.map((sheet) => <span key={sheet.name} className="palette-data-sheet">{sheet.name} <small>{sheet.rowCount}×{sheet.colCount}</small></span>)}
          </div>)}
        </div>
      )}

      <div className="palette-list" role="listbox" aria-label="节点搜索结果">
        {isSearching ? (
          <>
            <div className="palette-result-summary"><span>{results.length} 个结果{results.length > 50 ? ' · 显示前 50' : ''}</span>{group !== 'all' && <button onClick={() => setGroup('all')}>搜索全部分组</button>}</div>
            {displayedSearchResults.map((result, itemIndex) => renderResult(result, itemIndex))}
          </>
        ) : (
          <>
            {favorites.length > 0 && <section className="palette-virtual-section"><h2>★ 收藏</h2>{favorites.map((result) => renderResult(result))}</section>}
            {recent.length > 0 && <section className="palette-virtual-section">
              <button className="palette-section-toggle" aria-expanded={recentOpen} onClick={() => setRecentOpen((value) => !value)}>
                <span>最近使用 <small>{recent.length}</small></span><span>{recentOpen ? '−' : '+'}</span>
              </button>
              {recentOpen && recent.slice(0, 5).map((result) => renderResult(result))}
            </section>}
            {NODE_DISCOVERY_GROUPS.filter((item) => group === 'all' || group === item).map((item) => {
              const grouped = results.filter((result) => result.document.group === item);
              if (!grouped.length) return null;
              const isCollapsed = collapsed.has(item);
              return <section key={item}>
                <button className="palette-section-toggle" onClick={() => setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(item)) next.delete(item); else next.add(item);
                  return next;
                })}><span>{item} <small>{grouped.length}</small></span><span>{isCollapsed ? '+' : '−'}</span></button>
                {!isCollapsed && grouped.map((result) => renderResult(result))}
              </section>;
            })}
          </>
        )}
        {results.length === 0 && <div className="palette-empty">
          <strong>没有找到节点</strong>
          <span>试试“筛选”“导出”“sheet”或拼音首字母</span>
          <div><button onClick={() => setQuery('')}>清空搜索</button>{group !== 'all' && <button onClick={() => setGroup('all')}>搜索全部</button>}</div>
        </div>}
      </div>
    </aside>
  );
}

interface QuickNodePickerProps {
  specs: FlowNodeSpec[];
  context: NodeConnectionContext;
  clientPosition: { x: number; y: number };
  onChoose: (spec: FlowNodeSpec, port: SchemaPort) => void;
  onClose: () => void;
}

export function QuickNodePicker({ specs, context, clientPosition, onChoose, onClose }: QuickNodePickerProps) {
  const index = useMemo(() => buildNodeSearchIndex(specs), [specs]);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchNodeDocuments(index, query, { connection: context }).slice(0, 12), [index, query, context]);
  const [active, setActive] = useState(0);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);

  const choose = (result: NodeSearchResult | undefined) => {
    if (result?.compatiblePort) onChoose(result.document.spec, result.compatiblePort);
  };

  const safePosition = {
    left: Math.max(8, Math.min(clientPosition.x, window.innerWidth - 320)),
    top: Math.max(8, Math.min(clientPosition.y, window.innerHeight - 430)),
  };

  return <div className="quick-node-picker-backdrop" onMouseDown={onClose}>
    <div className="quick-node-picker" style={safePosition} onMouseDown={(event) => event.stopPropagation()}>
      <div className="quick-picker-title">添加兼容节点 <span>{context.port.label} · {context.port.type}</span></div>
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索节点、拼音或关键词…"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
          else if (event.key === 'Enter') { event.preventDefault(); choose(results[active]); }
          else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        }}
      />
      <div className="quick-picker-results" role="listbox">
        {results.map((result, indexInResults) => <button key={result.document.spec.id} className={indexInResults === active ? 'active' : ''} onClick={() => choose(result)}>
          <span><strong>{result.document.spec.label}</strong><small>{result.document.group}</small></span>
          <em>{context.direction === 'from-output' ? '→' : '←'} {result.compatiblePort?.label}</em>
        </button>)}
        {results.length === 0 && <div className="quick-picker-empty">没有兼容节点</div>}
      </div>
    </div>
  </div>;
}
