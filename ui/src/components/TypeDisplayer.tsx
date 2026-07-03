import React, { useState } from 'react';
import type { PortType } from '../../nodes/port-types';

interface TypeDisplayerProps {
  type: string;
  value: unknown;
  compact?: boolean;
}

export default function TypeDisplayer({ type, value, compact }: TypeDisplayerProps) {
  if (value === null || value === undefined) {
    return <span className="td-null">空</span>;
  }

  switch (type as PortType) {
    // ── 基础类型 ──────────────────────────────────────
    case 'string':
      return <StringDisplayer value={value} />;
    case 'number':
      return <NumberDisplayer value={value} />;
    case 'boolean':
      return <BooleanDisplayer value={value} />;
    case 'enum':
      return <EnumDisplayer value={value} />;
    case 'color':
      return <ColorDisplayer value={value} />;
    case 'any':
      return <AnyDisplayer value={value} />;

    // ── Excel 数据类型 ─────────────────────────────────
    case 'workbook':
      return <WorkbookDisplayer value={value} />;
    case 'worksheet':
      return <WorksheetDisplayer value={value} compact={compact} />;
    case 'cell':
      return <CellDisplayer value={value} />;
    case 'range':
      return <RangeDisplayer value={value} />;
    case 'address':
      return <AddressDisplayer value={value} />;
    case 'cell-ref':
      return <CellRefDisplayer value={value} />;

    // ── 数据集合类型 ───────────────────────────────────
    case 'json-rows':
      return <JsonRowsDisplayer value={value} compact={compact} />;
    case 'aoa':
      return <AoaDisplayer value={value} compact={compact} />;
    case 'headers':
      return <HeadersDisplayer value={value} />;
    case 'options':
      return <OptionsDisplayer value={value} />;
    case 'file-data':
      return <FileDataDisplayer value={value} />;

    // ── 格式类型 ───────────────────────────────────────
    case 'csv-string':
      return <CsvStringDisplayer value={value} compact={compact} />;
    case 'html-string':
      return <HtmlStringDisplayer value={value} />;
    case 'json-string':
      return <JsonStringDisplayer value={value} />;

    // ── 配置类型 ───────────────────────────────────────
    case 'filter':
      return <FilterDisplayer value={value} />;
    case 'sort-config':
      return <SortConfigDisplayer value={value} />;
    case 'style':
      return <StyleDisplayer value={value} />;
    case 'validation-rule':
      return <ValidationRuleDisplayer value={value} />;

    // ── 流程类型 ───────────────────────────────────────
    case 'trigger':
      return <TriggerDisplayer value={value} />;

    default:
      return <AnyDisplayer value={value} />;
  }
}

// ── 基础类型 ──────────────────────────────────────────

function StringDisplayer({ value }: { value: unknown }) {
  const s = String(value);
  if (s.length > 200) {
    return <span className="td-string td-long" title={s}>{s.slice(0, 200)}…</span>;
  }
  return <span className="td-string">{s}</span>;
}

function NumberDisplayer({ value }: { value: unknown }) {
  const n = Number(value);
  if (isNaN(n)) return <span className="td-error">NaN</span>;
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return <span className="td-number">{formatted}</span>;
}

function BooleanDisplayer({ value }: { value: unknown }) {
  const b = !!value;
  return (
    <span className={`td-boolean ${b ? 'td-true' : 'td-false'}`}>
      <span className="td-boolean-dot" />
      {b ? 'true' : 'false'}
    </span>
  );
}

function EnumDisplayer({ value }: { value: unknown }) {
  return <span className="td-enum">{String(value)}</span>;
}

function ColorDisplayer({ value }: { value: unknown }) {
  const c = String(value || '#000000');
  return (
    <span className="td-color">
      <span className="td-color-swatch" style={{ background: c }} />
      {c}
    </span>
  );
}

function AnyDisplayer({ value }: { value: unknown }) {
  const s = (() => {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  })();
  if (s.length > 300) {
    return <pre className="td-any td-long">{s.slice(0, 300)}…</pre>;
  }
  return <pre className="td-any">{s}</pre>;
}

// ── Excel 数据类型 ─────────────────────────────────────

function WorkbookDisplayer({ value }: { value: unknown }) {
  const wb = value as any;
  const names: string[] = wb?.SheetNames || [];
  return (
    <div className="td-workbook">
      <div className="td-workbook-header">
        <span className="td-icon">📗</span>
        <span className="td-workbook-count">{names.length} 个工作表</span>
      </div>
      <div className="td-workbook-sheets">
        {names.map((n: string, i: number) => (
          <span key={i} className="td-tag">{n}</span>
        ))}
      </div>
    </div>
  );
}

function WorksheetDisplayer({ value, compact }: { value: unknown; compact?: boolean }) {
  const ws = value as any;
  const isProject = ws?.__fromProject;
  const headers: string[] = ws?.headers || [];
  const preview: any[] = ws?.preview || [];
  const rows = ws?.rowCount || preview.length;
  const cols = ws?.colCount || headers.length;
  const name = ws?.sheetName || '';

  if (compact) {
    return (
      <div className="td-worksheet td-compact">
        <span className="td-icon">📋</span>
        <span>{name || '工作表'}</span>
        <span className="td-dim">{rows}×{cols}</span>
      </div>
    );
  }

  return (
    <div className="td-worksheet">
      <div className="td-worksheet-header">
        <span className="td-icon">📋</span>
        <span className="td-worksheet-name">{name || '工作表'}</span>
        <span className="td-dim">{rows}行 × {cols}列</span>
        {isProject && <span className="td-badge">项目数据</span>}
      </div>
      {headers.length > 0 && (
        <div className="td-worksheet-headers">
          {headers.slice(0, 10).map((h: string, i: number) => (
            <span key={i} className="td-tag">{h}</span>
          ))}
          {headers.length > 10 && <span className="td-dim">+{headers.length - 10}</span>}
        </div>
      )}
      {preview.length > 0 && (
        <div className="td-worksheet-preview">
          <table>
            <thead>
              <tr>{headers.slice(0, 6).map((h: string, i: number) => <th key={i}>{h}</th>)}{headers.length > 6 && <th>…</th>}</tr>
            </thead>
            <tbody>
              {preview.slice(0, 3).map((row: any, ri: number) => (
                <tr key={ri}>{headers.slice(0, 6).map((h: string, ci: number) => <td key={ci}>{String(row[h] ?? '')}</td>)}{headers.length > 6 && <td>…</td>}</tr>
              ))}
            </tbody>
          </table>
          {preview.length > 3 && <div className="td-dim">… 还有 {preview.length - 3} 行</div>}
        </div>
      )}
    </div>
  );
}

function CellDisplayer({ value }: { value: unknown }) {
  const c = value as any;
  const r = c?.r ?? c?.row ?? '?';
  const col = c?.c ?? c?.col ?? '?';
  const letter = typeof col === 'number' ? String.fromCharCode(65 + col) : String(col);
  return (
    <span className="td-cell">
      <span className="td-cell-coord">({r}, {col})</span>
      <span className="td-cell-ref">{letter}{Number(r) + 1}</span>
    </span>
  );
}

function RangeDisplayer({ value }: { value: unknown }) {
  const r = value as any;
  if (r?.kind === 'complex-range' && Array.isArray(r.areas)) {
    return (
      <span className={`td-range ${r.areaCount === 0 ? 'td-error' : ''}`} title={r.address || '空交集'}>
        <span className="td-range-addr">{r.address || '∅ 空交集'}</span>
        <span className="td-dim">{r.areaCount}区 · {r.cellCount}格</span>
      </span>
    );
  }
  if (r?.s && r?.e) {
    const colName = (i: number) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
    const start = `${colName(r.s.c)}${r.s.r + 1}`;
    const end = `${colName(r.e.c)}${r.e.r + 1}`;
    const rows = r.e.r - r.s.r + 1;
    const cols = r.e.c - r.s.c + 1;
    return (
      <span className="td-range">
        <span className="td-range-addr">{start}:{end}</span>
        <span className="td-dim">{rows}×{cols}</span>
      </span>
    );
  }
  return <span className="td-range">{JSON.stringify(r)}</span>;
}

function AddressDisplayer({ value }: { value: unknown }) {
  const s = String(value);
  return <span className="td-address">{s}</span>;
}

function CellRefDisplayer({ value }: { value: unknown }) {
  return <span className="td-cell-ref">{String(value)}</span>;
}

// ── 数据集合类型 ───────────────────────────────────────

function JsonRowsDisplayer({ value, compact }: { value: unknown; compact?: boolean }) {
  const rows = value as any[];
  if (!Array.isArray(rows)) return <span className="td-error">非数组</span>;
  const count = rows.length;
  const headers = count > 0 ? Object.keys(rows[0]) : [];

  if (compact || count === 0) {
    return (
      <div className="td-json-rows td-compact">
        <span className="td-icon">📊</span>
        <span>{count} 行</span>
        {headers.length > 0 && <span className="td-dim">{headers.length} 列</span>}
      </div>
    );
  }

  return (
    <div className="td-json-rows">
      <div className="td-json-rows-header">
        <span className="td-icon">📊</span>
        <span>{count} 行 × {headers.length} 列</span>
      </div>
      <div className="td-json-rows-table">
        <table>
          <thead>
            <tr>{headers.slice(0, 8).map((h, i) => <th key={i}>{h}</th>)}{headers.length > 8 && <th>…</th>}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, ri) => (
              <tr key={ri}>{headers.slice(0, 8).map((h, ci) => <td key={ci}>{String(row[h] ?? '')}</td>)}{headers.length > 8 && <td>…</td>}</tr>
            ))}
          </tbody>
        </table>
        {count > 5 && <div className="td-dim">… 还有 {count - 5} 行</div>}
      </div>
    </div>
  );
}

function AoaDisplayer({ value, compact }: { value: unknown; compact?: boolean }) {
  const arr = value as unknown[][];
  if (!Array.isArray(arr)) return <span className="td-error">非数组</span>;
  const rows = arr.length;
  const cols = rows > 0 ? arr[0].length : 0;

  if (compact) {
    return (
      <div className="td-aoa td-compact">
        <span className="td-icon">📐</span>
        <span>{rows}×{cols} 二维数组</span>
      </div>
    );
  }

  return (
    <div className="td-aoa">
      <div className="td-aoa-header">
        <span className="td-icon">📐</span>
        <span>{rows}行 × {cols}列 二维数组</span>
      </div>
      <div className="td-aoa-grid">
        <table>
          <tbody>
            {arr.slice(0, 5).map((row, ri) => (
              <tr key={ri}>{row.slice(0, 8).map((cell, ci) => <td key={ci}>{String(cell ?? '')}</td>)}{row.length > 8 && <td>…</td>}</tr>
            ))}
          </tbody>
        </table>
        {rows > 5 && <div className="td-dim">… 还有 {rows - 5} 行</div>}
      </div>
    </div>
  );
}

function HeadersDisplayer({ value }: { value: unknown }) {
  const headers = value as string[];
  if (!Array.isArray(headers)) return <span className="td-error">非数组</span>;
  return (
    <div className="td-headers">
      {headers.map((h, i) => <span key={i} className="td-tag">{h}</span>)}
      <span className="td-dim">{headers.length} 个字段</span>
    </div>
  );
}

function OptionsDisplayer({ value }: { value: unknown }) {
  const opts = value as any[];
  if (!Array.isArray(opts)) return <span className="td-error">非数组</span>;
  return (
    <div className="td-options">
      {opts.slice(0, 6).map((opt, i) => {
        const label = typeof opt === 'string' ? opt : opt?.label ?? opt?.value ?? '?';
        const val = typeof opt === 'string' ? opt : opt?.value ?? '';
        return <span key={i} className="td-option">{label}{label !== val && <span className="td-dim">={val}</span>}</span>;
      })}
      {opts.length > 6 && <span className="td-dim">+{opts.length - 6}</span>}
    </div>
  );
}

function FileDataDisplayer({ value }: { value: unknown }) {
  if (value instanceof ArrayBuffer) {
    return (
      <span className="td-file-data">
        <span className="td-icon">📄</span>
        ArrayBuffer <span className="td-dim">{(value.byteLength / 1024).toFixed(1)} KB</span>
      </span>
    );
  }
  if (value instanceof Uint8Array) {
    return (
      <span className="td-file-data">
        <span className="td-icon">📄</span>
        Uint8Array <span className="td-dim">{(value.byteLength / 1024).toFixed(1)} KB</span>
      </span>
    );
  }
  if (typeof value === 'string') {
    return (
      <span className="td-file-data">
        <span className="td-icon">📄</span>
        字符串 <span className="td-dim">{(value.length / 1024).toFixed(1)} KB</span>
      </span>
    );
  }
  return <span className="td-file-data">文件数据</span>;
}

// ── 格式类型 ───────────────────────────────────────────

function CsvStringDisplayer({ value, compact }: { value: unknown; compact?: boolean }) {
  const s = String(value);
  const lines = s.split('\n');
  const cols = lines[0]?.split(',').length || 0;

  if (compact) {
    return (
      <div className="td-csv td-compact">
        <span className="td-icon">📊</span>
        <span>CSV {lines.length}行 × {cols}列</span>
      </div>
    );
  }

  return (
    <div className="td-csv">
      <div className="td-csv-header">
        <span className="td-icon">📊</span>
        <span>CSV {lines.length}行 × {cols}列</span>
      </div>
      <pre className="td-csv-content">{lines.slice(0, 6).join('\n')}{lines.length > 6 ? '\n…' : ''}</pre>
    </div>
  );
}

function HtmlStringDisplayer({ value }: { value: unknown }) {
  const s = String(value);
  return (
    <div className="td-html">
      <div className="td-html-header">
        <span className="td-icon">🌐</span>
        <span>HTML</span>
        <span className="td-dim">{s.length} 字符</span>
      </div>
      <div className="td-html-preview" dangerouslySetInnerHTML={{ __html: s.slice(0, 2000) }} />
    </div>
  );
}

function JsonStringDisplayer({ value }: { value: unknown }) {
  const s = String(value);
  let formatted = s;
  try { formatted = JSON.stringify(JSON.parse(s), null, 2); } catch {}
  return (
    <div className="td-json-string">
      <div className="td-json-string-header">
        <span className="td-icon">{ }</span>
        <span>JSON</span>
      </div>
      <pre className="td-json-string-content">{formatted.slice(0, 500)}{formatted.length > 500 ? '…' : ''}</pre>
    </div>
  );
}

// ── 配置类型 ───────────────────────────────────────────

function FilterDisplayer({ value }: { value: unknown }) {
  const f = value as any;
  return (
    <span className="td-filter">
      <span className="td-filter-field">{f?.field ?? '?'}</span>
      <span className="td-filter-op">{f?.operator ?? '=='}</span>
      <span className="td-filter-val">{String(f?.value ?? '?')}</span>
    </span>
  );
}

function SortConfigDisplayer({ value }: { value: unknown }) {
  const s = value as any;
  const isDesc = s?.order === 'desc';
  return (
    <span className="td-sort">
      <span className="td-sort-icon">{isDesc ? '↓' : '↑'}</span>
      <span className="td-sort-field">{s?.field ?? '?'}</span>
    </span>
  );
}

function StyleDisplayer({ value }: { value: unknown }) {
  const s = value as Record<string, unknown>;
  if (typeof s !== 'object' || s === null) return <span className="td-style">{String(s)}</span>;
  const entries = Object.entries(s).slice(0, 6);
  return (
    <div className="td-style">
      {entries.map(([k, v]) => (
        <span key={k} className="td-style-prop">
          <span className="td-style-key">{k}</span>
          <span className="td-style-val">{String(v)}</span>
        </span>
      ))}
      {Object.keys(s).length > 6 && <span className="td-dim">+{Object.keys(s).length - 6}</span>}
    </div>
  );
}

function ValidationRuleDisplayer({ value }: { value: unknown }) {
  const r = value as any;
  return (
    <span className="td-validation">
      <span className="td-validation-type">{r?.type ?? '?'}</span>
      {r?.message && <span className="td-dim">{r.message}</span>}
    </span>
  );
}

// ── 流程类型 ───────────────────────────────────────────

function TriggerDisplayer({ value }: { value: unknown }) {
  return (
    <span className="td-trigger">
      <span className="td-trigger-pulse" />
      触发信号
    </span>
  );
}
