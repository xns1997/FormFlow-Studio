import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Modal, { ModalHeader } from './Modal';
import { buildSearchIndex, loadDocCatalog, searchDocs, type DocEntry } from '../services/io/docs/catalog';

export default function ContextHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [params] = useSearchParams();
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');
  const composingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { if (open) void loadDocCatalog().then(setEntries); }, [open]);
  const context = params.get('slug') || params.get('doc') || '';
  const results = useMemo(() => searchDocs(buildSearchIndex(entries), query || context).slice(0, 8), [context, entries, query]);
  const featured = results[0]?.entry || entries.find((entry) => entry.kind === 'task');
  const openFull = (path: string) => {
    const returnTo = `${location.pathname}${location.search}`;
    onClose();
    navigate(`${path}?returnTo=${encodeURIComponent(returnTo)}`);
  };
  return (
    <Modal open={open} onClose={onClose} width="min(520px, 96vw)" maxWidth={520} maxHeight="90vh" containerClassName="docs-help-panel" ariaLabel="上下文帮助">
      <ModalHeader title="上下文帮助" description="当前任务的摘要、排错与相关参考" onClose={onClose} />
      <div className="docs-help-body">
        <input data-autofocus type="search" value={inputValue} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={(event) => {
          composingRef.current = false;
          setInputValue(event.currentTarget.value);
          setQuery(event.currentTarget.value);
        }} onChange={(event) => {
          setInputValue(event.target.value);
          if (!composingRef.current) setQuery(event.target.value);
        }} placeholder="搜索当前问题…" aria-label="搜索帮助" />
        {featured && <article><span>{featured.kind === 'task' ? '推荐任务' : '相关参考'}</span><h2>{featured.title}</h2><p>{featured.summary}</p><button type="button" onClick={() => openFull(featured.canonicalPath)}>打开完整文档</button></article>}
        <section><h3>相关内容</h3>{results.slice(featured ? 1 : 0).map((result) => <button type="button" key={result.entry.id} onClick={() => openFull(result.entry.canonicalPath)}><strong>{result.entry.title}</strong><small>{result.entry.summary}</small></button>)}</section>
      </div>
    </Modal>
  );
}
