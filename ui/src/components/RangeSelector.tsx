import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import { combineRangeAreas, formatRangeAddress, getEditableRangeSources, type RangeArea } from '../services/data/rangeGeometry';
import Modal, { ModalHeader, ModalFooter } from './Modal';

// ── Column name helper (supports AA, AB, ... ZZ+) ───────────
function colName(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function parseCellAddress(input: string): { r: number; c: number } | null {
  const m = input.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const letters = m[1];
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  col -= 1;
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || row < 0) return null;
  return { r: row, c: col };
}

interface CellPos { r: number; c: number; }
type Range = RangeArea;

interface RangeSelectorProps {
  tables: SrcTableEntry[];
  value?: RangeRef | null;
  onConfirm: (ref: RangeRef) => void;
  onCancel: () => void;
}

export default function RangeSelector({ tables, value, onConfirm, onCancel }: RangeSelectorProps) {
  const initialAreas = value ? getEditableRangeSources(value) : [];
  const initialCurrent = initialAreas[initialAreas.length - 1];
  const [tableId, setTableId] = useState(value?.tableId || tables[0]?.id || '');
  const [sheetName, setSheetName] = useState(value?.sheetName || '');
  const [selStart, setSelStart] = useState<CellPos | null>(
    initialCurrent ? { r: initialCurrent.startRow, c: initialCurrent.startCol } : null
  );
  const [selEnd, setSelEnd] = useState<CellPos | null>(
    initialCurrent ? { r: initialCurrent.endRow, c: initialCurrent.endCol } : null
  );
  const [dragging, setDragging] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedCols, setSelectedCols] = useState<Set<number>>(new Set());
  const [lastRowClick, setLastRowClick] = useState<number | null>(null);
  const [lastColClick, setLastColClick] = useState<number | null>(null);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState<boolean | undefined>(value?.firstRowIsHeader);

  // ── New: active cell, multi-range, context menu, name box editing ──
  const [activeCell, setActiveCell] = useState<CellPos | null>(initialCurrent ? { r: initialCurrent.startRow, c: initialCurrent.startCol } : null);
  const [multiRanges, setMultiRanges] = useState<Range[]>(initialAreas.slice(0, -1));
  const [combinationMode, setCombinationMode] = useState<'selection' | 'intersection'>(value?.operation || 'selection');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; r: number; c: number } | null>(null);
  const [nameBoxEditing, setNameBoxEditing] = useState(false);
  const [nameBoxInput, setNameBoxInput] = useState('');
  const [colWidths, setColWidths] = useState<Map<number, number>>(new Map());

  const gridRef = useRef<HTMLDivElement>(null);
  const nameBoxRef = useRef<HTMLInputElement>(null);
  const autoScrollRef = useRef<{ x: number; y: number } | null>(null);

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
  const totalRows = rows.length + 1;

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
    setMultiRanges([]);
  }, []);

  // ── Cell drag ────────────────────────────────────────────

  const handleCellMouseDown = useCallback((r: number, c: number, e: React.MouseEvent) => {
    setContextMenu(null);
    if (e.shiftKey && selStart) {
      setSelEnd({ r, c });
      setActiveCell({ r, c });
    } else if ((e.metaKey || e.ctrlKey) && selStart && selEnd) {
      // Ctrl+drag: save current range, start new one
      const curRange: Range = {
        startRow: Math.min(selStart.r, selEnd.r),
        startCol: Math.min(selStart.c, selEnd.c),
        endRow: Math.max(selStart.r, selEnd.r),
        endCol: Math.max(selStart.c, selEnd.c),
      };
      setMultiRanges(prev => [...prev, curRange]);
      setDragging(true);
      setSelStart({ r, c });
      setSelEnd({ r, c });
      setActiveCell({ r, c });
      setSelectedRows(new Set());
      setSelectedCols(new Set());
    } else {
      setDragging(true);
      setSelStart({ r, c });
      setSelEnd({ r, c });
      setActiveCell({ r, c });
      setSelectedRows(new Set());
      setSelectedCols(new Set());
      setMultiRanges([]);
    }
  }, [selStart, selEnd]);

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

  // ── Auto-scroll during drag ──────────────────────────────

  useEffect(() => {
    if (!dragging) { autoScrollRef.current = null; return; }
    let raf: number;
    const tick = () => {
      const grid = gridRef.current;
      const scroll = autoScrollRef.current;
      if (grid && scroll) {
        grid.scrollLeft += scroll.x;
        grid.scrollTop += scroll.y;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const edge = 30;
    const speed = 8;
    let dx = 0, dy = 0;
    if (e.clientX - rect.left < edge) dx = -speed;
    else if (rect.right - e.clientX < edge) dx = speed;
    if (e.clientY - rect.top < edge) dy = -speed;
    else if (rect.bottom - e.clientY < edge) dy = speed;
    autoScrollRef.current = (dx || dy) ? { x: dx, y: dy } : null;
  }, [dragging]);

  // ── Row multi-select ─────────────────────────────────────

  const handleRowHeaderClick = useCallback((r: number, e: React.MouseEvent) => {
    setSelStart(null);
    setSelEnd(null);
    setMultiRanges([]);
    setActiveCell({ r, c: 0 });

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
    setMultiRanges([]);
    setActiveCell({ r: 0, c });

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
    if (selectedRows.size > 0) {
      const sorted = [...selectedRows].sort((a, b) => a - b);
      return { startRow: sorted[0], startCol: 0, endRow: sorted[sorted.length - 1], endCol: totalCols - 1 };
    }
    if (selectedCols.size > 0) {
      const sorted = [...selectedCols].sort((a, b) => a - b);
      return { startRow: 0, startCol: sorted[0], endRow: totalRows - 1, endCol: sorted[sorted.length - 1] };
    }
    if (!selStart || !selEnd) return null;
    return {
      startRow: Math.min(selStart.r, selEnd.r),
      startCol: Math.min(selStart.c, selEnd.c),
      endRow: Math.max(selStart.r, selEnd.r),
      endCol: Math.max(selStart.c, selEnd.c),
    };
  }, [selStart, selEnd, selectedRows, selectedCols, totalCols, totalRows]);

  // ── Raw and effective ranges ─────────────────────────────

  const rawRanges = useMemo(() => {
    if (selectedRows.size > 0) {
      return [...selectedRows].sort((a, b) => a - b).map((row) => ({
        startRow: row, startCol: 0, endRow: row, endCol: Math.max(0, totalCols - 1),
      }));
    }
    if (selectedCols.size > 0) {
      return [...selectedCols].sort((a, b) => a - b).map((column) => ({
        startRow: 0, startCol: column, endRow: Math.max(0, totalRows - 1), endCol: column,
      }));
    }
    const result = [...multiRanges];
    if (normalizedRange) result.push(normalizedRange);
    return result;
  }, [multiRanges, normalizedRange, selectedRows, selectedCols, totalRows, totalCols]);

  const effectiveRanges = useMemo(() => {
    return combineRangeAreas(rawRanges, combinationMode);
  }, [combinationMode, rawRanges]);

  // ── Highlight helpers ────────────────────────────────────

  const isCellSelected = useCallback((r: number, c: number) => {
    if (selectedRows.size > 0) return selectedRows.has(r);
    if (selectedCols.size > 0) return selectedCols.has(c);
    for (const range of effectiveRanges) {
      if (r >= range.startRow && r <= range.endRow && c >= range.startCol && c <= range.endCol) return true;
    }
    return false;
  }, [effectiveRanges, selectedRows, selectedCols]);

  const isRowHighlighted = useCallback((r: number) => {
    if (selectedRows.size > 0) return selectedRows.has(r);
    return effectiveRanges.some((range) => r >= range.startRow && r <= range.endRow);
  }, [effectiveRanges, selectedRows]);

  const isColHighlighted = useCallback((c: number) => {
    if (selectedCols.size > 0) return selectedCols.has(c);
    return effectiveRanges.some((range) => c >= range.startCol && c <= range.endCol);
  }, [effectiveRanges, selectedCols]);

  const isCellStart = useCallback((r: number, c: number) => {
    return selStart?.r === r && selStart?.c === c;
  }, [selStart]);

  const isActive = useCallback((r: number, c: number) => {
    return activeCell?.r === r && activeCell?.c === c;
  }, [activeCell]);

  // ── Address & size ───────────────────────────────────────

  const address = useMemo(() => {
    if (!effectiveRanges.length || !sheet) return '';
    return formatRangeAddress(effectiveRanges, sheetName);
  }, [effectiveRanges, sheetName, sheet]);

  const rangeSize = useMemo(() => {
    if (!effectiveRanges.length) return null;
    return {
      rows: Math.max(...effectiveRanges.map((range) => range.endRow)) - Math.min(...effectiveRanges.map((range) => range.startRow)) + 1,
      cols: Math.max(...effectiveRanges.map((range) => range.endCol)) - Math.min(...effectiveRanges.map((range) => range.startCol)) + 1,
      cells: effectiveRanges.reduce((sum, range) => sum + (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1), 0),
    };
  }, [effectiveRanges]);

  const selectionMode = selectedRows.size > 0 ? 'row' : selectedCols.size > 0 ? 'col' : 'cell';

  const handleConfirm = useCallback(() => {
    if (!effectiveRanges.length) return;
    const bounds = {
      startRow: Math.min(...effectiveRanges.map((range) => range.startRow)),
      startCol: Math.min(...effectiveRanges.map((range) => range.startCol)),
      endRow: Math.max(...effectiveRanges.map((range) => range.endRow)),
      endCol: Math.max(...effectiveRanges.map((range) => range.endCol)),
    };
    onConfirm({
      tableId,
      sheetName,
      ...bounds,
      areas: effectiveRanges,
      sourceAreas: combinationMode === 'intersection' ? rawRanges : undefined,
      operation: combinationMode,
      firstRowIsHeader: autoDetectedHeader,
    });
  }, [effectiveRanges, rawRanges, combinationMode, tableId, sheetName, onConfirm, autoDetectedHeader]);

  const removeRawRange = useCallback((index: number) => {
    if (selectedRows.size > 0) {
      const row = [...selectedRows].sort((a, b) => a - b)[index];
      setSelectedRows((previous) => { const next = new Set(previous); next.delete(row); return next; });
    } else if (selectedCols.size > 0) {
      const column = [...selectedCols].sort((a, b) => a - b)[index];
      setSelectedCols((previous) => { const next = new Set(previous); next.delete(column); return next; });
    } else if (index < multiRanges.length) setMultiRanges((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    else { setSelStart(null); setSelEnd(null); setActiveCell(null); }
  }, [multiRanges.length, selectedRows, selectedCols]);

  // ── Name Box ─────────────────────────────────────────────

  const nameBoxDisplay = useMemo(() => {
    if (activeCell) return colName(activeCell.c) + (activeCell.r + 1);
    if (normalizedRange) {
      const a = colName(normalizedRange.startCol) + (normalizedRange.startRow + 1);
      const b = normalizedRange.startRow === normalizedRange.endRow && normalizedRange.startCol === normalizedRange.endCol
        ? '' : ':' + colName(normalizedRange.endCol) + (normalizedRange.endRow + 1);
      return a + b;
    }
    return '';
  }, [activeCell, normalizedRange]);

  const handleNameBoxSubmit = useCallback(() => {
    setNameBoxEditing(false);
    const parsed = parseCellAddress(nameBoxInput);
    if (!parsed) return;
    const maxR = totalRows - 1;
    const maxC = totalCols - 1;
    const r = Math.min(parsed.r, maxR);
    const c = Math.min(parsed.c, maxC);
    setActiveCell({ r, c });
    setSelStart({ r, c });
    setSelEnd({ r, c });
    setSelectedRows(new Set());
    setSelectedCols(new Set());
    setMultiRanges([]);
    // Scroll cell into view
    const cell = gridRef.current?.querySelector(`[data-cell="${r}-${c}"]`) as HTMLElement | null;
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [nameBoxInput, totalRows, totalCols]);

  // ── Formula bar content ──────────────────────────────────

  const formulaBarContent = useMemo(() => {
    if (!activeCell) return '';
    if (activeCell.r === 0) {
      // Header row
      return headers[activeCell.c] || '';
    }
    const row = rows[activeCell.r - 1];
    if (!row) return '';
    const val = row[headers[activeCell.c]];
    return val != null ? String(val) : '';
  }, [activeCell, headers, rows]);

  // ── Keyboard navigation ──────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (!activeCell) return;

      const maxR = totalRows - 1;
      const maxC = totalCols - 1;

      let nr = activeCell.r;
      let nc = activeCell.c;

      switch (e.key) {
        case 'ArrowUp': nr = Math.max(0, nr - 1); break;
        case 'ArrowDown': nr = Math.min(maxR, nr + 1); break;
        case 'ArrowLeft': nc = Math.max(0, nc - 1); break;
        case 'ArrowRight': nc = Math.min(maxC, nc + 1); break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { nc = nc > 0 ? nc - 1 : maxC; nr = nc === maxC ? Math.max(0, nr - 1) : nr; }
          else { nc = nc < maxC ? nc + 1 : 0; nr = nc === 0 ? Math.min(maxR, nr + 1) : nr; }
          break;
        case 'Enter':
          e.preventDefault();
          if (e.shiftKey) nr = Math.max(0, nr - 1);
          else nr = Math.min(maxR, nr + 1);
          break;
        case 'Home':
          e.preventDefault();
          nc = 0;
          if (e.ctrlKey || e.metaKey) nr = 0;
          break;
        case 'End':
          e.preventDefault();
          nc = maxC;
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelStart({ r: 0, c: 0 });
            setSelEnd({ r: maxR, c: maxC });
            setSelectedRows(new Set());
            setSelectedCols(new Set());
            setMultiRanges([]);
            return;
          }
          return;
        default:
          return;
      }

      e.preventDefault();
      setActiveCell({ r: nr, c: nc });

      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Extend selection
        setSelEnd(prev => {
          if (!prev) return { r: nr, c: nc };
          return { r: prev.r + (nr - activeCell.r), c: prev.c + (nc - activeCell.c) };
        });
      } else {
        setSelStart({ r: nr, c: nc });
        setSelEnd({ r: nr, c: nc });
        setSelectedRows(new Set());
        setSelectedCols(new Set());
        setMultiRanges([]);
      }

      // Scroll cell into view
      requestAnimationFrame(() => {
        const cell = gridRef.current?.querySelector(`[data-cell="${nr}-${nc}"]`) as HTMLElement | null;
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, totalRows, totalCols, onCancel]);

  // ── Context menu ─────────────────────────────────────────

  const handleContextMenu = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, r, c });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const ctxSelectRow = useCallback(() => {
    if (!contextMenu) return;
    const r = contextMenu.r;
    setSelStart(null); setSelEnd(null); setMultiRanges([]);
    setSelectedRows(new Set([r]));
    setSelectedCols(new Set());
    setLastRowClick(r);
    setActiveCell({ r, c: 0 });
    setContextMenu(null);
  }, [contextMenu]);

  const ctxSelectCol = useCallback(() => {
    if (!contextMenu) return;
    const c = contextMenu.c;
    setSelStart(null); setSelEnd(null); setMultiRanges([]);
    setSelectedRows(new Set());
    setSelectedCols(new Set([c]));
    setLastColClick(c);
    setActiveCell({ r: 0, c });
    setContextMenu(null);
  }, [contextMenu]);

  const ctxCopyAddress = useCallback(() => {
    if (!contextMenu || !sheet) return;
    const a = sheetName + '!' + colName(contextMenu.c) + (contextMenu.r + 1);
    navigator.clipboard.writeText(a).catch(() => {});
    setContextMenu(null);
  }, [contextMenu, sheet, sheetName]);

  // ── Column resize ────────────────────────────────────────

  const [resizingCol, setResizingCol] = useState<{ col: number; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((c: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const th = (e.target as HTMLElement).closest('th') as HTMLElement | null;
    const startW = th?.offsetWidth || 80;
    setResizingCol({ col: c, startX: e.clientX, startW });
  }, []);

  useEffect(() => {
    if (!resizingCol) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - resizingCol.startX;
      const newW = Math.max(40, resizingCol.startW + diff);
      setColWidths(prev => new Map(prev).set(resizingCol.col, newW));
    };
    const onUp = () => setResizingCol(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizingCol]);

  const handleResizeDblClick = useCallback((c: number) => {
    // Auto-fit: measure max content width
    const cells = gridRef.current?.querySelectorAll(`[data-col="${c}"]`);
    if (!cells || cells.length === 0) return;
    let maxW = 40;
    cells.forEach(el => {
      const w = (el as HTMLElement).scrollWidth + 16;
      if (w > maxW) maxW = w;
    });
    setColWidths(prev => new Map(prev).set(c, Math.min(maxW, 300)));
  }, []);

  // ── Selection border overlay ─────────────────────────────

  const [selBorderRect, setSelBorderRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const recalcBorder = useCallback(() => {
    if (!normalizedRange || !gridRef.current) { setSelBorderRect(null); return; }
    const grid = gridRef.current;
    const tl = grid.querySelector(`[data-cell="${normalizedRange.startRow}-${normalizedRange.startCol}"]`) as HTMLElement | null;
    const br = grid.querySelector(`[data-cell="${normalizedRange.endRow}-${normalizedRange.endCol}"]`) as HTMLElement | null;
    if (!tl || !br) { setSelBorderRect(null); return; }
    const gridRect = grid.getBoundingClientRect();
    const tlRect = tl.getBoundingClientRect();
    const brRect = br.getBoundingClientRect();
    setSelBorderRect({
      left: tlRect.left - gridRect.left + grid.scrollLeft,
      top: tlRect.top - gridRect.top + grid.scrollTop,
      width: brRect.right - tlRect.left,
      height: brRect.bottom - tlRect.top,
    });
  }, [normalizedRange, colWidths]);

  useEffect(() => { recalcBorder(); }, [recalcBorder, totalRows, totalCols]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.addEventListener('scroll', recalcBorder);
    return () => grid.removeEventListener('scroll', recalcBorder);
  }, [recalcBorder]);

  // ── Cell value helper ────────────────────────────────────

  const getCellValue = useCallback((r: number, c: number): string => {
    if (r === 0) return headers[c] || '';
    const row = rows[r - 1];
    if (!row) return '';
    const val = row[headers[c]];
    return val != null ? String(val) : '';
  }, [headers, rows]);

  return (
    <Modal open onClose={onCancel} maxWidth={900} maxHeight="85vh">
      <ModalHeader title="选择数据范围" onClose={onCancel} />

      {/* ── Toolbar with Name Box ── */}
      <div className="rs-toolbar">
        <div className="rs-name-box-wrap">
          <input
            ref={nameBoxRef}
            className="rs-name-box"
            value={nameBoxEditing ? nameBoxInput : nameBoxDisplay}
            onFocus={() => { setNameBoxEditing(true); setNameBoxInput(nameBoxDisplay); }}
            onChange={e => setNameBoxInput(e.target.value)}
            onBlur={() => setNameBoxEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNameBoxSubmit(); (e.target as HTMLInputElement).blur(); } }}
            placeholder="A1"
          />
        </div>
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
        <div className="rs-combine-mode" aria-label="区域组合方式">
          <button className={combinationMode === 'selection' ? 'active' : ''} onClick={() => setCombinationMode('selection')} title="保留所选的全部单元格区域">多区域</button>
          <button className={combinationMode === 'intersection' ? 'active' : ''} onClick={() => setCombinationMode('intersection')} title="只保留所有选区共同覆盖的单元格">交集</button>
        </div>
        {(selectionMode !== 'cell' || rawRanges.length > 0) && (
          <button className="rs-clear-btn" onClick={clearAll} title="清除选择">✕ 清除</button>
        )}
      </div>

      {/* ── Formula Bar ── */}
      {sheet && (
        <div className="rs-formula-bar">
          <span className="rs-formula-label">fx</span>
          <div className="rs-formula-content" title={formulaBarContent}>
            {rawRanges.length > 1 || (activeCell && normalizedRange && (normalizedRange.startRow !== normalizedRange.endRow || normalizedRange.startCol !== normalizedRange.endCol))
              ? effectiveRanges.length > 0
                ? `${combinationMode === 'intersection' ? '交集' : '选区'}: ${address} · ${effectiveRanges.length}区 / ${rangeSize?.cells}格`
                : '交集为空：当前选区没有共同覆盖的单元格'
              : formulaBarContent}
          </div>
        </div>
      )}

      {sheet && rawRanges.length > 0 && (
        <div className="rs-range-strip">
          <span className="rs-range-strip-label">参与运算</span>
          <div className="rs-range-chips">
            {rawRanges.map((range, index) => (
              <span className="rs-range-chip" key={`${range.startRow}:${range.startCol}:${range.endRow}:${range.endCol}:${index}`}>
                <b>{String.fromCharCode(65 + index)}</b>
                {formatRangeAddress([range])}
                <button onClick={() => removeRawRange(index)} title="移除此区域">×</button>
              </span>
            ))}
          </div>
          <span className={`rs-range-result ${effectiveRanges.length === 0 ? 'empty' : ''}`}>
            {combinationMode === 'intersection' ? 'A ∩ B' : '组合结果'}：{effectiveRanges.length ? `${effectiveRanges.length} 个子区域` : '空集'}
          </span>
        </div>
      )}

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
          <div className="rs-grid" ref={gridRef} onMouseMove={handleGridMouseMove}>
            {/* Selection border overlay */}
            {selBorderRect && (
              <div
                className="rs-selection-border"
                style={{
                  left: selBorderRect.left,
                  top: selBorderRect.top,
                  width: selBorderRect.width,
                  height: selBorderRect.height,
                }}
              >
                <div className="rs-sel-handle" />
              </div>
            )}

            <table className="rs-table">
              <thead>
                <tr>
                  <th className="rs-corner"></th>
                  {headers.map((_, c) => (
                    <th
                      key={c}
                      className={`rs-col-header clickable ${isColHighlighted(c) ? 'in-range' : ''} ${selectedCols.has(c) ? 'selected-direct' : ''}`}
                      onClick={(e) => handleColHeaderClick(c, e)}
                      style={colWidths.has(c) ? { width: colWidths.get(c), minWidth: colWidths.get(c) } : undefined}
                    >
                      {colName(c)}
                      <div
                        className="rs-col-resize"
                        onMouseDown={(e) => handleResizeStart(c, e)}
                        onDoubleClick={() => handleResizeDblClick(c)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="rs-header-row">
                  <td
                    className={`rs-row-num clickable ${isRowHighlighted(0) ? 'in-range' : ''} ${selectedRows.has(0) ? 'selected-direct' : ''}`}
                    onClick={(e) => handleRowHeaderClick(0, e)}
                    onContextMenu={(e) => handleContextMenu(0, 0, e)}
                  >H</td>
                  {headers.map((h, c) => (
                    <td
                      key={c}
                      data-cell={`0-${c}`}
                      data-col={c}
                      className={`rs-cell rs-header-cell ${isCellSelected(0, c) ? 'selected' : ''} ${isCellStart(0, c) ? 'start' : ''} ${isActive(0, c) ? 'active-cell' : ''}`}
                      onMouseDown={(e) => handleCellMouseDown(0, c, e)}
                      onMouseOver={() => handleCellMouseOver(0, c)}
                      onContextMenu={(e) => handleContextMenu(0, c, e)}
                      style={colWidths.has(c) ? { width: colWidths.get(c), minWidth: colWidths.get(c) } : undefined}
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
                      onContextMenu={(e) => handleContextMenu(r + 1, 0, e)}
                    >
                      {autoDetectedHeader && r === 0 ? '🏷' : r + 1}
                    </td>
                    {headers.map((h, c) => (
                      <td
                        key={c}
                        data-cell={`${r + 1}-${c}`}
                        data-col={c}
                        className={`rs-cell ${isCellSelected(r + 1, c) ? 'selected' : ''} ${isCellStart(r + 1, c) ? 'start' : ''} ${isActive(r + 1, c) ? 'active-cell' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(r + 1, c, e)}
                        onMouseOver={() => handleCellMouseOver(r + 1, c)}
                        onContextMenu={(e) => handleContextMenu(r + 1, c, e)}
                        style={colWidths.has(c) ? { width: colWidths.get(c), minWidth: colWidths.get(c) } : undefined}
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

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div className="rs-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="rs-context-item" onClick={ctxSelectRow}>选择整行</div>
          <div className="rs-context-item" onClick={ctxSelectCol}>选择整列</div>
          <div className="rs-context-sep" />
          <div className="rs-context-item" onClick={ctxCopyAddress}>复制单元格地址</div>
        </div>
      )}

      <ModalFooter>
        <div className="rs-selection-info">
          {address ? (
            <>
              <span className="rs-address">{address}</span>
              {rangeSize && <span className="rs-size">{rangeSize.cells} 个单元格 · {effectiveRanges.length} 个子区域</span>}
              {selectionMode === 'row' && <span className="rs-mode-tag">整行</span>}
              {selectionMode === 'col' && <span className="rs-mode-tag">整列</span>}
              {rawRanges.length > 1 && <span className="rs-mode-tag">{combinationMode === 'intersection' ? '交集' : '多区域'}</span>}
            </>
          ) : (
            <span className="rs-hint">拖拽选区 · Ctrl/Cmd+拖拽添加区域 · 切换“交集”求共同区域 · Shift+方向键扩展 · 右键菜单</span>
          )}
        </div>
        <div className="rs-actions">
          <button className="lg-btn" onClick={onCancel}>取消</button>
          <button className="lg-btn lg-btn-primary" onClick={handleConfirm} disabled={effectiveRanges.length === 0}>确认</button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
