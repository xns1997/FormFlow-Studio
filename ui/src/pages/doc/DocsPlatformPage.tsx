import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import plaintext from 'highlight.js/lib/languages/plaintext';
import HighlightText from '../../components/HighlightText';
import ComponentDocPlayground from '../../components/ComponentDocPlayground';
import { DocStepScreenshots } from '../../components/DocScreenshot';
import { CatalogBlockBody } from '../../components/doc/DocContent';
import {
  buildSearchIndex,
  findDoc,
  loadDocCatalog,
  searchDocs,
  type DocDomain,
  type DocEntry,
  type DocKind,
  type DocSearchDocument,
  type DocUserState,
} from '../../services/io/docs/catalog';
import { loadDocUserState, recordRecentSearch, saveDocUserState, sendDocEvent } from '../../services/io/docs/user-state';
import { isImeKeyboardEvent } from '../../services/io/docs/ime';
import { useListAnimation } from '../../hooks/useListAnimation';

hljs.registerLanguage('json', json);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('plain', plaintext);

function DocsHomeGrids({
  tasks, refs, entries, domainLabels, state, setParams,
}: {
  tasks: DocEntry[];
  refs: string[];
  entries: DocEntry[];
  domainLabels: Record<string, string>;
  state: DocUserState;
  setParams: (next: URLSearchParams) => void;
}) {
  const animatedTasks = useListAnimation(tasks, (entry) => entry.id);
  const animatedRefs = useListAnimation(refs, (value) => value);
  return (
    <>
      <section className="docs-v2-home-section"><div><span className="docs-v2-kicker">按任务学习</span><h2>项目全生命周期</h2></div><div className="docs-v2-task-grid">{animatedTasks.map(({ key, item: entry, style }, indexTask) => <Link to={entry.canonicalPath} key={key} style={style}><span>{String(indexTask + 1).padStart(2, '0')}</span><strong>{entry.title}</strong><p>{entry.summary}</p>{state.taskProgress[entry.id] && <b>✓ 已完成</b>}</Link>)}</div></section>
      <section className="docs-v2-home-section"><div><span className="docs-v2-kicker">查功能参考</span><h2>控件、节点、事件与 API</h2></div><div className="docs-v2-reference-grid">{animatedRefs.map(({ key, item: value, style }) => { const count = entries.filter((entry) => entry.domain === value).length; return <button type="button" key={key} style={style} onClick={() => { const next = new URLSearchParams(); next.set('q', domainLabels[value] || value); next.set('domain', value); setParams(next); }}><strong>{domainLabels[value]}</strong><span>{count} 个可检索条目</span></button>; })}</div></section>
    </>
  );
}
hljs.registerLanguage('txt', plaintext);
hljs.registerLanguage('ebnf', plaintext);

function HighlightedCode({ code, language = 'json' }: { code: string; language?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) {
      const requestedLanguage = hljs.getLanguage(language) ? language : 'text';
      ref.current.innerHTML = hljs.highlight(code, { language: requestedLanguage }).value;
    }
  }, [code, language]);
  return <code ref={ref} className={`hljs language-${language}`} />;
}

const kindLabels: Record<DocKind, string> = { task: '任务指南', troubleshooting: '排错', case: '案例', reference: '功能参考' };
const domainLabels: Record<string, string> = {
  'getting-started': '认识与创建', data: '数据', forms: '表单', behavior: '行为', workflows: '流程',
  templates: '模板', quality: '测试与质量', delivery: '交付', controls: '控件', nodes: '流程节点', events: '事件', api: 'API',
};
const emptyState: DocUserState = { version: 1, favorites: [], recent: [], taskProgress: {}, updatedAt: '' };

function DocsScrollRoot({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="docs-v2-scroll-root" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export default function DocsPlatformPage({ home = false }: { home?: boolean }) {
  const { collection, domain, slug } = useParams<{ collection?: string; domain?: string; slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [index, setIndex] = useState<DocSearchDocument[]>([]);
  const [state, setState] = useState<DocUserState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [copiedExample, setCopiedExample] = useState('');
  const query = params.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);
  const composingRef = useRef(false);
  const kind = (params.get('kind') || '') as DocKind | '';
  const filterDomain = (params.get('domain') || '') as DocDomain | '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDocCatalog(), loadDocUserState()]).then(([catalog, saved]) => {
      if (cancelled) return;
      setEntries(catalog); setIndex(buildSearchIndex(catalog)); setState(saved); setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const current = useMemo(() => findDoc(entries, domain || collection, slug), [collection, domain, entries, slug]);
  const results = useMemo(() => query ? searchDocs(index, query, { kind: kind || undefined, domain: filterDomain || undefined }) : [], [filterDomain, index, kind, query]);
  const groupedDomains = useMemo(() => [...new Set(entries.map((entry) => entry.domain))], [entries]);

  useEffect(() => {
    if (!composingRef.current) setSearchInput(query);
  }, [query]);

  function persistState(input: DocUserState) {
    const pending = { ...input, updatedAt: new Date().toISOString() };
    setState(pending);
    void saveDocUserState(pending).then((saved) => {
      setState((latest) => latest.updatedAt === pending.updatedAt ? saved : latest);
    });
  }

  useEffect(() => {
    if (!current) return;
    const next = { ...state, recent: [current.id, ...state.recent.filter((id) => id !== current.id)].slice(0, 12) };
    persistState(next); void sendDocEvent({ type: 'open', docId: current.id });
    // only record once per document
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function updateSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  }
  function commitSearch() {
    if (!query.trim()) return;
    recordRecentSearch(query);
    void sendDocEvent({ type: 'search', resultCount: results.length, outcome: results.length ? 'clicked' : 'abandoned' });
  }
  function toggleFavorite(entry: DocEntry) {
    const favorites = state.favorites.includes(entry.id) ? state.favorites.filter((id) => id !== entry.id) : [...state.favorites, entry.id];
    const next = { ...state, favorites };
    persistState(next);
  }
  function toggleProgress(entry: DocEntry) {
    const next = { ...state, taskProgress: { ...state.taskProgress, [entry.id]: !state.taskProgress[entry.id] } };
    persistState(next);
  }

  if (loading) return <DocsScrollRoot label="文档内容"><div className="docs-v2-loading" role="status">正在建立文档索引…</div></DocsScrollRoot>;
  if (!home && slug && !current) return <DocsScrollRoot label="文档内容"><div className="docs-v2-empty"><h1>未找到文档</h1><Link to="/docs">返回文档中心</Link></div></DocsScrollRoot>;

  if (current) {
    const sameDomain = entries.filter((entry) => entry.domain === current.domain);
    const currentIndex = entries.findIndex((entry) => entry.id === current.id);
    const previous = currentIndex > 0 ? entries[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < entries.length - 1 ? entries[currentIndex + 1] : undefined;
    const relatedEntries = (current.relatedIds || []).map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is DocEntry => !!entry);
    const returnTo = params.get('returnTo');
    const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '';
    return (
      <DocsScrollRoot label={`${current.title}文档`}>
        <div className="docs-v2-shell">
        <aside className="docs-v2-tree" aria-label="文档目录">
          <Link className="docs-v2-home-link" to="/docs">文档中心</Link>
          <strong>{domainLabels[current.domain] || current.domain}</strong>
          <div className="docs-v2-tree-scroll">{sameDomain.map((entry) => <Link key={entry.id} className={entry.id === current.id ? 'active' : ''} to={entry.canonicalPath}>{entry.title}</Link>)}</div>
        </aside>
        <article className="docs-v2-article">
          <nav className="docs-breadcrumb" aria-label="面包屑"><Link to="/docs">文档中心</Link><span>/</span><span>{kindLabels[current.kind]}</span><span>/</span><span>{current.title}</span></nav>
          <header>
            <div className="docs-v2-kicker">{kindLabels[current.kind]} · {domainLabels[current.domain]}</div>
            <h1>{current.title}</h1><p>{current.summary}</p>
            <div className="docs-v2-actions">
              <button type="button" onClick={() => toggleFavorite(current)} aria-pressed={state.favorites.includes(current.id)}>{state.favorites.includes(current.id) ? '★ 已收藏' : '☆ 收藏'}</button>
              {current.kind === 'task' && <button type="button" onClick={() => toggleProgress(current)} aria-pressed={!!state.taskProgress[current.id]}>{state.taskProgress[current.id] ? '✓ 已完成' : '标记完成'}</button>}
              {current.actions?.map((action) => action.href && <button key={action.label} type="button" onClick={() => navigate(action.label === '返回项目' && safeReturnTo ? safeReturnTo : action.href!)}>{action.label}</button>)}
            </div>
          </header>
          {current.domain === 'controls' && (() => {
            const componentType = current.id.startsWith('form-design:')
              ? current.id.slice('form-design:'.length)
              : current.id.startsWith('control:')
                ? current.id.slice('control:'.length)
                : null;
            if (!componentType) return null;
            const relatedEventLinks = (current.relatedIds || [])
              .map((id) => entries.find((e) => e.id === id))
              .filter((e): e is DocEntry => !!e)
              .map((e) => ({ label: e.title, href: e.canonicalPath }));
            return <ComponentDocPlayground key={current.id} componentType={componentType} title={current.title} relatedEventLinks={relatedEventLinks} />;
          })()}
          {current.blocks.map((block) => (
            <section id={block.id} key={block.id} className="docs-v2-section">
              <h2>{block.title}</h2>
              <CatalogBlockBody body={block.body} markdownBody={block.markdownBody} />
              <DocStepScreenshots entry={current} blockId={block.id} />
              {block.fields && <div className="docs-v2-table" role="table">{block.fields.map((field) => <div className="docs-v2-table-row" role="row" key={`${field.name}:${field.type}`}><div role="cell"><code>{field.name}</code><small>{field.type}</small></div><p role="cell">{field.description}</p></div>)}</div>}
              {block.examples?.map((example) => {
                const exampleId = `${current.id}:${block.id}:${example.title}`;
                const lang = block.id === 'defaults' ? 'json' : 'javascript';
                return <div className="docs-v2-code" key={example.title}><header><strong>{example.title}</strong><button type="button" aria-live="polite" onClick={() => {
                  void navigator.clipboard.writeText(example.code).then(() => {
                    setCopiedExample(exampleId);
                    window.setTimeout(() => setCopiedExample((value) => value === exampleId ? '' : value), 1500);
                  });
                }}>{copiedExample === exampleId ? '已复制' : '复制'}</button></header><pre><HighlightedCode code={example.code} language={lang} /></pre></div>;
              })}
            </section>
          ))}
          {relatedEntries.length > 0 && (
            <section className="docs-v2-section docs-v2-related-docs" aria-label="继续阅读">
              <h2>继续阅读</h2>
              <div className="docs-v2-related-grid">
                {relatedEntries.map((entry) => (
                  <Link key={entry.id} to={entry.canonicalPath} className="docs-v2-related-card">
                    <span>{kindLabels[entry.kind]} · {domainLabels[entry.domain]}</span>
                    <strong>{entry.title}</strong>
                    <p>{entry.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <nav className="docs-v2-pager" aria-label="上一篇和下一篇">
            {previous ? <Link to={previous.canonicalPath}><small>上一篇</small><strong>{previous.title}</strong></Link> : <span />}
            {next && <Link to={next.canonicalPath}><small>下一篇</small><strong>{next.title}</strong></Link>}
          </nav>
          <footer className="docs-v2-feedback"><span>这篇文档有帮助吗？</span><button type="button" onClick={() => void sendDocEvent({ type: 'feedback', docId: current.id, category: 'helpful' })}>有帮助</button><button type="button" onClick={() => void sendDocEvent({ type: 'feedback', docId: current.id, category: 'not-helpful' })}>需要改进</button></footer>
        </article>
        <aside className="docs-v2-toc" aria-label="页内目录"><strong>本页内容</strong><div className="docs-v2-toc-scroll">{current.blocks.map((block) => <a key={block.id} href={`#${block.id}`}>{block.title}</a>)}</div></aside>
        </div>
      </DocsScrollRoot>
    );
  }

  const tasks = entries.filter((entry) => entry.kind === 'task');
  const refs = groupedDomains.filter((item) => ['controls', 'nodes', 'events', 'api', 'behavior', 'templates'].includes(item));
  return (
    <DocsScrollRoot label="文档中心">
      <div className="docs-v2-home">
      <header className="docs-v2-hero">
        <span className="docs-v2-kicker">FormFlow 文档</span>
        <h1>从目标出发，快速找到下一步</h1>
        <p>按项目生命周期学习，或直接查询控件、节点、事件和 API。</p>
        <div className="docs-v2-search">
          <input autoFocus={location.pathname === '/docs'} value={searchInput} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={(event) => {
            composingRef.current = false;
            setSearchInput(event.currentTarget.value);
            updateSearch(event.currentTarget.value);
          }} onChange={(event) => {
            setSearchInput(event.target.value);
            if (!composingRef.current) updateSearch(event.target.value);
          }} onKeyDown={(event) => {
            if (isImeKeyboardEvent(event.nativeEvent)) return;
            if (event.key === 'Enter') commitSearch();
          }} placeholder="搜索任务、错误、控件、节点或 API…" aria-label="搜索全部文档" />
          <kbd>⌘K</kbd>
        </div>
        <div className="docs-v2-filters">
          <Select aria-label="内容类型" value={kind} options={[{ value: '', label: '全部类型' }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label }))]} onChange={(value) => { const next = new URLSearchParams(params); value ? next.set('kind', value) : next.delete('kind'); setParams(next); }} />
          <Select aria-label="内容领域" value={filterDomain} options={[{ value: '', label: '全部领域' }, ...groupedDomains.map((value) => ({ value, label: domainLabels[value] || value }))]} onChange={(value) => { const next = new URLSearchParams(params); value ? next.set('domain', value) : next.delete('domain'); setParams(next); }} />
        </div>
      </header>
      {query ? <section className="docs-v2-results" aria-live="polite"><h2>{results.length} 个结果</h2>{results.slice(0, 60).map((result) => <Link to={result.entry.canonicalPath} key={result.entry.id}><span>{kindLabels[result.entry.kind]} · {domainLabels[result.entry.domain]}</span><strong><HighlightText text={result.entry.title} query={query} /></strong><p><HighlightText text={result.snippet} query={query} /></p></Link>)}</section> : <>
        <DocsHomeGrids tasks={tasks} refs={refs} entries={entries} domainLabels={domainLabels} state={state} setParams={setParams} />
      </>}
      </div>
    </DocsScrollRoot>
  );
}
