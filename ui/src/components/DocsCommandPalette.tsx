import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal, { ModalHeader } from './Modal';
import { buildSearchIndex, loadDocCatalog, searchDocs, type DocSearchDocument } from '../services/io/docs/catalog';
import { recordRecentSearch, sendDocEvent } from '../services/io/docs/user-state';
import { isImeKeyboardEvent } from '../services/io/docs/ime';

export default function DocsCommandPalette() {
  type SearchScope = 'all' | 'tasks' | 'nodes' | 'api';
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<DocSearchDocument[]>([]);
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<SearchScope>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { void loadDocCatalog().then((entries) => setIndex(buildSearchIndex(entries))); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      setOpen(true);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);

  const results = useMemo(() => {
    const found = searchDocs(index, query).filter((result) => {
      if (scope === 'tasks') return result.entry.kind === 'task';
      if (scope === 'nodes') return result.entry.domain === 'nodes';
      if (scope === 'api') return result.entry.domain === 'api';
      return true;
    });
    const inCanvas = location.pathname.includes('/editor') && new URLSearchParams(location.search).get('mode') === 'flow';
    return found.sort((a, b) => {
      const boostA = inCanvas && a.entry.domain === 'nodes' ? 200 : 0;
      const boostB = inCanvas && b.entry.domain === 'nodes' ? 200 : 0;
      return (b.score + boostB) - (a.score + boostA);
    }).slice(0, 24);
  }, [index, location.pathname, location.search, query, scope]);

  function choose(indexResult: number) {
    const result = results[indexResult];
    if (!result) return;
    recordRecentSearch(query);
    void sendDocEvent({ type: 'search', resultCount: results.length, outcome: 'clicked' });
    setOpen(false); setInputValue(''); setQuery(''); navigate(result.entry.canonicalPath);
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} width="min(760px, 94vw)" maxWidth={760} containerClassName="docs-command-dialog" ariaLabel="搜索文档、节点和导航">
      <ModalHeader title="快速查找" description="搜索任务、错误、控件、流程节点、事件或 API" onClose={() => setOpen(false)} />
      <div className="docs-command-search">
        <input ref={inputRef} value={inputValue} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={(event) => {
          composingRef.current = false;
          setInputValue(event.currentTarget.value);
          setQuery(event.currentTarget.value);
          setActive(0);
        }} onChange={(event) => {
          setInputValue(event.target.value);
          if (!composingRef.current) setQuery(event.target.value);
          setActive(0);
        }} onKeyDown={(event) => {
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
          else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
        }} placeholder="如：字段联动、导入 Excel、主键冲突…" aria-controls="docs-command-results" aria-activedescendant={results[active] ? `docs-command-${active}` : undefined} />
        <kbd>Esc</kbd>
      </div>
      <div className="docs-command-scopes" aria-label="搜索范围">
        {([
          ['all', '全部'],
          ['tasks', '任务'],
          ['nodes', '节点'],
          ['api', 'API'],
        ] as Array<[SearchScope, string]>).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => { setScope(value); setActive(0); }}>{label}</button>
        ))}
      </div>
      <div id="docs-command-results" className="docs-command-results" role="listbox">
        {!query && <div className="docs-command-hint">输入关键词开始搜索；画布中会优先显示流程节点。</div>}
        {query && results.length === 0 && <div className="docs-command-hint">没有匹配结果。尝试更短的业务词或英文 API 名称。</div>}
        {results.map((result, indexResult) => <button id={`docs-command-${indexResult}`} role="option" aria-selected={active === indexResult} className={active === indexResult ? 'active' : ''} type="button" key={result.entry.id} onMouseEnter={() => setActive(indexResult)} onClick={() => choose(indexResult)}><span>{result.entry.kind === 'task' ? '任务' : result.entry.domain === 'nodes' ? '节点' : result.entry.domain === 'api' ? 'API' : '文档'}</span><strong>{result.entry.title}</strong><small>{result.snippet}</small></button>)}
      </div>
    </Modal>
  );
}
