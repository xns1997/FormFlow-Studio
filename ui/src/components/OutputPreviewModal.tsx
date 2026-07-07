import React, { useEffect, useMemo, useState } from 'react';
import Modal, { ModalHeader } from './Modal';
import TypeDisplayer from './TypeDisplayer';
import CodeEditor from './CodeEditor';
import {
  getWorkbookSheetNames,
  formatOutputPreviewText,
  filterPreviewRows,
  getOutputPreviewMode,
  isBinaryPreviewValue,
  outputToPreviewTable,
} from '../services/display/outputPreview';

export interface OutputPreviewTarget {
  key: string;
  type: string;
  value: unknown;
  label: string;
  fileName?: string;
  mimeType?: string;
}

interface Props {
  target: OutputPreviewTarget | null;
  onClose: () => void;
  onDownload?: (value: unknown, fileName: string, mimeType: string) => void;
}

const PAGE_SIZE = 50;

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

export default function OutputPreviewModal({ target, onClose, onDownload }: Props) {
  const sheetNames = useMemo(() => target?.type === 'workbook' ? getWorkbookSheetNames(target.value) : [], [target]);
  const [sheetName, setSheetName] = useState('');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSheetName(sheetNames[0] || '');
    setPage(0);
    setView('preview');
    setCopied(false);
    setQuery('');
  }, [target?.key, target?.value, sheetNames.join('\u0000')]);

  const table = useMemo(() => target ? outputToPreviewTable(target.type, target.value, sheetName) : null, [target, sheetName]);
  const filteredRows = useMemo(() => table ? filterPreviewRows(table.rows, query) : [], [table, query]);
  const totalPages = table ? Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)) : 1;
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const previewMode = useMemo(() => target ? getOutputPreviewMode(target.type, target.value, sheetName) : 'text', [target, sheetName]);
  const raw = useMemo(() => target && (view === 'raw' || previewMode === 'text') ? formatOutputPreviewText(target.type, target.value) : '', [target, view, previewMode]);

  if (!target) return null;
  const isHtml = target.type === 'html-string';
  const isBinary = isBinaryPreviewValue(target.value);
  const canDownload = target.type === 'file-data' && target.value !== null && target.value !== undefined;
  const copyRaw = () => {
    const content = raw || formatOutputPreviewText(target.type, target.value);
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} maxWidth={1180} maxHeight="92vh">
      <ModalHeader title={`${target.label} · ${target.type}`} onClose={onClose} />
      <div className="output-preview-shell">
        <div className="output-preview-toolbar">
          <div className="output-preview-summary"><TypeDisplayer type={target.type} value={target.value} compact /></div>
          {sheetNames.length > 0 && (
            <label>工作表<select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setPage(0); }}>{sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
          )}
          {table && (
            <label className="output-preview-search">
              <span>⌕</span>
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="查找单元格…" />
              {query && <button title="清除查找" onClick={() => { setQuery(''); setPage(0); }}>×</button>}
            </label>
          )}
          <div className="output-preview-tabs">
            <button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>预览</button>
            <button className={view === 'raw' ? 'active' : ''} onClick={() => setView('raw')}>原始数据</button>
          </div>
          <button onClick={copyRaw}>{copied ? '已复制' : '复制'}</button>
          {canDownload && onDownload && (
            <button className="primary" onClick={() => onDownload(target.value, target.fileName || 'output.bin', target.mimeType || 'application/octet-stream')}>下载</button>
          )}
        </div>

        <div className="output-preview-body">
          {view === 'raw' ? (
            (typeof target.value === 'object' && target.value !== null && !isBinary) ? (
              <CodeEditor
                value={raw}
                onChange={() => {}}
                language="json"
                theme="light"
                disabled
                lineNumbers
                options={{ folding: true, lineNumbersMinChars: 2, wordWrap: 'on', scrollbar: { vertical: 'auto', horizontal: 'auto' } }}
                title={`${target.label} · 原始数据`}
              />
            ) : (
              <pre className="output-preview-raw">{raw}</pre>
            )
          ) : isHtml ? (
            <iframe className="output-preview-html" sandbox="" srcDoc={String(target.value || '')} title={`${target.label} HTML 预览`} />
          ) : table ? (
            <div className="output-preview-table-wrap">
              <table className="output-preview-table">
                <thead><tr><th className="output-preview-row-number">#</th>{table.headers.map((header, index) => <th key={`${header}:${index}`}>{header || columnFallback(index)}</th>)}</tr></thead>
                <tbody>
                  {pageRows.map(({ row, sourceIndex }) => (
                    <tr key={sourceIndex}><td className="output-preview-row-number">{sourceIndex + 1}</td>{Array.from({ length: table.headers.length }, (_, columnIndex) => <td key={columnIndex} title={displayCell(row[columnIndex])}>{displayCell(row[columnIndex])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 && <div className="output-preview-empty">{query ? `没有找到“${query}”` : '没有可显示的数据'}</div>}
            </div>
          ) : isBinary ? (
            <div className="output-preview-empty"><TypeDisplayer type={target.type} value={target.value} /><p>二进制内容不直接渲染，请下载后使用对应应用打开。</p></div>
          ) : (
            <pre className="output-preview-raw wrap">{raw}</pre>
          )}
        </div>

        {view === 'preview' && table && (filteredRows.length > PAGE_SIZE || query) && (
          <div className="output-preview-pagination">
            <span>{query ? `${filteredRows.length.toLocaleString()} 条命中 / ` : ''}{table.rows.length.toLocaleString()} 行 · 第 {page + 1}/{totalPages} 页</span>
            <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>下一页</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function columnFallback(index: number) {
  return `列 ${index + 1}`;
}
