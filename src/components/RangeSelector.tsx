import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import { rangeToAddress } from '../services/rangeResolver';
import Modal, { ModalHeader, ModalFooter } from './Modal';

interface RangeSelectorProps {
  tables: SrcTableEntry[];
  value?: RangeRef | null;
  onConfirm: (ref: RangeRef) => void;
  onCancel: () => void;
}

export default function RangeSelector({ tables, value, onConfirm, onCancel }: RangeSelectorProps) {
  const [tableId, setTableId] = useState(value?.tableId || tables[0]?.id || '');
  const [sheetName, setSheetName] = useState(value?.sheetName || '');
  const [selStart, setSelStart] = useState<{ r: number; c: number } | null>(
    value ? { r: value.startRow, c: value.startCol } : null
  );
  const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(
    value ? { r: value.endRow, c: value.endCol } : null
  );
  const [dragging, setDragging] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedCols, setSelectedCols] = useState<Set<number>>(new Set());
  const [lastRowClick, setLastRowClick] = useState<number | null>(null);
  const [lastColClick, setLastColClick] = useState<number | null>(null);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState<boolean | undefined>(value?.firstRowIsHeader);

  const table = useMemo(() => tables.find(t => t.id === tableId), [tables, tableId]);
  const sheet = useMemo(() => table?.sheets.find(s => s.name === sheetName), [table, sheetName]);

  useEffect(() => {
    if (table && !table.sheets.find(s => s.name === sheetName)) {
      setSheetName(table.sheets[0]?.name || '');
      clearAll();
    }
  }, [table, sheetName]);

  const headers = sheet?.headers || [];
  const rows = sheet?.preview || [];
  const totalCols = headers.length;
  const totalRows = rows.length + 1; // +1 for header row

  // 自动检测首行是否为标题
  const autoDetectedHeader = useMemo(() => {
    if (firstRowIsHeader !== undefined) return firstRowIsHeader;
    if (rows.length < 2) return false;
    const firstRow = rows[0];
    for (let c = 0; c < headers.length; c++) {
      const val = firstRow[headers[c]];
      if (val === null || val === undefined) continue;
      const isText = isNaN(Number(val)) || val === '';
      const restNumeric = rows.slice(1, 6)
        .filter(r => r[headers[c]] !== null && r[headers[c]] !== undefined && r[headers[c]] !== '')
        .every(r => !isNaN(Number(r[headers[c]])));
      if (isText && restNumeric) return true;
    }
    return false;
  }, [firstRowIsHeader, rows, headers]);

  const clearAll = useCallback(() => {
    setSelStart(null);
    setSelEnd(null);
    setSelectedRows(new Set());
    setSelectedCols(new Set());
    setLastRowClick(null);
    setLastColClick(null);
  }, []);

  // ── Cell drag ────────────────────────────────────────────

  const handleCellMouseDown = useCallback((r: number, c: number, e: React.MouseEvent) => {
    if (e.shiftKey && selStart) {
      setSelEnd({ r, c });
    } else {
      setDragging(true);
      setSelStart({ r, c });
      setSelEnd({ r, c });
      setSelectedRows(new Set());
      setSelectedCols(new Set());
    }
  }, [selStart]);

  const handleCellMouseOver = useCallback((r: number, c: number) => {
    if (!dragging || !selStart) return;
    setSelEnd({ r, c });
  }, [dragging, selStart]);

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragging]);

  // ── Row multi-select ─────────────────────────────────────

  const handleRowHeaderClick = useCallback((r: number, e: React.MouseEvent) => {
    setSelStart(null);
    setSelEnd(null);

    if (e.shiftKey && lastRowClick !== null) {
      const from = Math.min(lastRowClick, r);
      const to = Math.max(lastRowClick, r);
      setSelectedRows(prev => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      });
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(r)) next.delete(r); else next.add(r);
        return next;
      });
      setLastRowClick(r);
    } else {
      setSelectedRows(new Set([r]));
      setLastRowClick(r);
    }
  }, [lastRowClick]);

  // ── Column multi-select ──────────────────────────────────

  const handleColHeaderClick = useCallback((c: number, e: React.MouseEvent) => {
    setSelStart(null);
    setSelEnd(null);

    if (e.shiftKey && lastColClick !== null) {
      const from = Math.min(lastColClick, c);
      const to = Math.max(lastColClick, c);
      setSelectedCols(prev => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      });
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedCols(prev => {
        const next = new Set(prev);
        if (next.has(c)) next.delete(c); else next.add(c);
        return next;
      });
      setLastColClick(c);
    } else {
      setSelectedCols(new Set([c]));
      setLastColClick(c);
    }
  }, [lastColClick]);

  // ── Normalized range ─────────────────────────────────────

  const normalizedRange = useMemo(() => {
    // Row selection mode
    if (selectedRows.size > 0) {
      const sorted = [...selectedRows].sort((a, b) => a - b);
      return {
        startRow: sorted[0],
        startCol: 0,
        endRow: sorted[sorted.length - 1],
        endCol: totalCols - 1,
      };
    }
    // Column selection mode
    if (selectedCols.size > 0) {
      const sorted = [...selectedCols].sort((a, b) => a - b);
      return {
        startRow: 0,
        startCol: sorted[0],
        endRow: totalRows - 1,
        endCol: sorted[sorted.length - 1],
      };
    }
    // Cell drag mode
    if (!selStart || !selEnd) return null;
    return {
      startRow: Math.min(selStart.r, selEnd.r),
      startCol: Math.min(selStart.c, selEnd.c),
      endRow: Math.max(selStart.r, selEnd.r),
      endCol: Math.max(selStart.c, selEnd.c),
    };
  }, [selStart, selEnd, selectedRows, selectedCols, totalCols, totalRows]);

  // ── Highlight helpers ────────────────────────────────────

  const isCellSelected = useCallback((r: number, c: number) => {
    if (selectedRows.size > 0) return selectedRows.has(r);
    if (selectedCols.size > 0) return selectedCols.has(c);
    if (!normalizedRange) return false;
    return r >= normalizedRange.startRow && r <= normalizedRange.endRow &&
           c >= normalizedRange.startCol && c <= normalizedRange.endCol;
  }, [normalizedRange, selectedRows, selectedCols]);

  const isRowHighlighted = useCallback((r: number) => {
    if (selectedRows.size > 0) return selectedRows.has(r);
    if (!normalizedRange) return false;
    return r >= normalizedRange.startRow && r <= normalizedRange.endRow;
  }, [normalizedRange, selectedRows]);

  const isColHighlighted = useCallback((c: number) => {
    if (selectedCols.size > 0) return selectedCols.has(c);
    if (!normalizedRange) return false;
    return c >= normalizedRange.startCol && c <= normalizedRange.endCol;
  }, [normalizedRange, selectedCols]);

  const isCellStart = useCallback((r: number, c: number) => {
    return selStart?.r === r && selStart?.c === c;
  }, [selStart]);

  // ── Address & size ───────────────────────────────────────

  const address = useMemo(() => {
    if (!normalizedRange || !sheet) return '';
    return rangeToAddress({ tableId, sheetName, ...normalizedRange });
  }, [normalizedRange, tableId, sheetName, sheet]);

  const rangeSize = useMemo(() => {
    if (!normalizedRange) return null;
    return {
      rows: normalizedRange.endRow - normalizedRange.startRow + 1,
      cols: normalizedRange.endCol - normalizedRange.startCol + 1,
    };
  }, [normalizedRange]);

  const selectionMode = selectedRows.size > 0 ? 'row' : selectedCols.size > 0 ? 'col' : 'cell';

  const handleConfirm = useCallback(() => {
    if (!normalizedRange) return;
    onConfirm({ tableId, sheetName, ...normalizedRange, firstRowIsHeader: autoDetectedHeader });
  }, [normalizedRange, tableId, sheetName, onConfirm, autoDetectedHeader]);

  return (
    <Modal open onClose={onCancel} maxWidth={860} maxHeight="85vh">
      <ModalHeader title="选择数据范围" onClose={onCancel} />

      <div className="rs-toolbar">
        <div className="rs-field">
          <label>工作簿</label>
          <select
            className="lg-select"
            value={tableId}
            onChange={e => { setTableId(e.target.value); setSheetName(''); clearAll(); }}
          >
            {tables.map(t => <option key={t.id} value={t.id}>{t.fileName}</option>)}
          </select>
        </div>
        {table && (
          <div className="rs-sheets">
            {table.sheets.map(s => (
              <button
                key={s.name}
                className={`rs-sheet-tab ${sheetName === s.name ? 'active' : ''}`}
                onClick={() => { setSheetName(s.name); clearAll(); }}
              >
                {s.name}
                <span className="rs-sheet-count">{s.rowCount}×{s.colCount}</span>
              </button>
            ))}
          </div>
        )}
        {selectionMode !== 'cell' && (
          <button className="rs-clear-btn" onClick={clearAll} title="清除选择">✕ 清除</button>
        )}
      </div>

      {sheet && (
        <label className="rs-header-check">
          <span>首行标题</span>
          <select
            className="rs-header-select"
            value={firstRowIsHeader === true ? 'yes' : firstRowIsHeader === false ? 'no' : 'auto'}
            onChange={(e) => setFirstRowIsHeader(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : undefined)}
          >
            <option value="auto">自动检测</option>
            <option value="yes">是，首行是标题</option>
            <option value="no">否，全部是数据</option>
          </select>
          <span className="rs-header-check-hint">
            {firstRowIsHeader === undefined ? '自动识别字段名行' : firstRowIsHeader ? '第一行作为列名，不纳入数据' : '所有行都作为数据'}
          </span>
        </label>
      )}

      {sheet ? (
        <div className="rs-grid-wrapper">
          <div className="rs-grid">
            <table className="rs-table">
              <thead>
                <tr>
                  <th className="rs-corner"></th>
                  {headers.map((_, c) => (
                    <th
                      key={c}
                      className={`rs-col-header clickable ${isColHighlighted(c) ? 'in-range' : ''} ${selectedCols.has(c) ? 'selected-direct' : ''}`}
                      onClick={(e) => handleColHeaderClick(c, e)}
                    >
                      {String.fromCharCode(65 + c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="rs-header-row">
                  <td
                    className={`rs-row-num clickable ${isRowHighlighted(0) ? 'in-range' : ''} ${selectedRows.has(0) ? 'selected-direct' : ''}`}
                    onClick={(e) => handleRowHeaderClick(0, e)}
                  >H</td>
                  {headers.map((h, c) => (
                    <td
                      key={c}
                      className={`rs-cell rs-header-cell ${isCellSelected(0, c) ? 'selected' : ''} ${isCellStart(0, c) ? 'start' : ''}`}
                      onMouseDown={(e) => handleCellMouseDown(0, c, e)}
                      onMouseOver={() => handleCellMouseOver(0, c)}
                    >
                      {h}
                    </td>
                  ))}
                </tr>
                {rows.slice(0, 100).map((row, r) => (
                  <tr key={r} className={autoDetectedHeader && r === 0 ? 'rs-data-header-row' : undefined}>
                    <td
                      className={`rs-row-num clickable ${isRowHighlighted(r + 1) ? 'in-range' : ''} ${selectedRows.has(r + 1) ? 'selected-direct' : ''}`}
                      onClick={(e) => handleRowHeaderClick(r + 1, e)}
                    >
                      {autoDetectedHeader && r === 0 ? '🏷' : r + 1}
                    </td>
                    {headers.map((h, c) => (
                      <td
                        key={c}
                        className={`rs-cell ${isCellSelected(r + 1, c) ? 'selected' : ''} ${isCellStart(r + 1, c) ? 'start' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(r + 1, c, e)}
                        onMouseOver={() => handleCellMouseOver(r + 1, c)}
                      >
                        {row[h] != null ? String(row[h]) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rs-empty">请先选择工作表</div>
      )}

      <ModalFooter>
        <div className="rs-selection-info">
          {address ? (
            <>
              <span className="rs-address">{address}</span>
              {rangeSize && <span className="rs-size">{rangeSize.rows}行 × {rangeSize.cols}列</span>}
              {selectionMode === 'row' && <span className="rs-mode-tag">整行</span>}
              {selectionMode === 'col' && <span className="rs-mode-tag">整列</span>}
            </>
          ) : (
            <span className="rs-hint">拖拽选区 · 点击行号选整行 · 点击列号选整列 · Shift 多选 · ⌘/Ctrl 加选 · 勾选「首行标题」排除标题行</span>
          )}
        </div>
        <div className="rs-actions">
          <button className="lg-btn" onClick={onCancel}>取消</button>
          <button className="lg-btn lg-btn-primary" onClick={handleConfirm} disabled={!normalizedRange}>确认</button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
