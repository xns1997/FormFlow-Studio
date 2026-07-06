import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from '../designer/icons';
import { PreviewCanvas } from '../designer/PreviewCanvas';
import Modal, { ModalHeader } from '../components/Modal';
import type { DesignComponent } from '../project/types';

ModuleRegistry.registerModules([AllCommunityModule]);

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const agThemeClass = prefersDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

type PreviewRow = Record<string, unknown> & { __rowId?: string };

function withRowIds(data: Record<string, unknown>[], offset = 0): PreviewRow[] {
  return data.map((row, index) => ({ ...row, __rowId: String(row.id ?? row.customer_id ?? `${offset + index}`) }));
}

export default function UsagePage() {
  const project = useProjectStore((s) => s.project);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);

  // CRUD state
  const [pendingChanges, setPendingChanges] = useState<Map<string, Record<string, { oldValue: unknown; newValue: unknown }>>>(new Map());
  const [pendingAdds, setPendingAdds] = useState<PreviewRow[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Form preview modal state
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);
  const previewForm = project?.forms?.find((f) => f.id === previewFormId);
  const previewComponents: DesignComponent[] = previewForm?.design?.components || [];

  const selectedTable = project?.srcTable.find((t) => t.id === selectedTableId);
  const activeSheet = selectedTable?.sheets[activeSheetIdx];

  const workflows = useMemo(() => project?.workflows || [], [project?.workflows]);
  const tables = useMemo(() => project?.srcTable || [], [project?.srcTable]);

  const changeCount = pendingChanges.size + pendingAdds.length + pendingDeletes.size;

  // AG Grid columns (editable)
  const colDefs = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.headers.map((h) => ({
      headerName: h, field: h, flex: 1, minWidth: 80, resizable: true, sortable: true, filter: true, editable: true,
    }));
  }, [activeSheet?.headers]);

  // Cell edit handler
  const onCellValueChanged = useCallback((event: any) => {
    if (!selectedTableId || !activeSheet) return;
    const rowIndex = event.rowIndex;
    const field = event.colDef.field;
    const oldValue = event.oldValue;
    const newValue = event.newValue;
    if (oldValue === newValue) return;
    const rowId = `${selectedTableId}:${activeSheet.name}:${rowIndex}`;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const rowChanges = next.get(rowId) || {};
      rowChanges[field] = { oldValue, newValue };
      next.set(rowId, rowChanges);
      return next;
    });
  }, [selectedTableId, activeSheet]);

  // Add row
  const handleAddRow = useCallback(() => {
    if (!activeSheet) return;
    const newRow: PreviewRow = { __rowId: `new_${Date.now()}` };
    activeSheet.headers.forEach((h) => { newRow[h] = ''; });
    setPendingAdds((prev) => [...prev, newRow]);
    setRows((prev) => [...prev, newRow]);
    setTotalRows((prev) => prev + 1);
  }, [activeSheet]);

  // Delete row
  const handleDeleteRow = useCallback(() => {
    if (selectedRowIdx === null || selectedRowIdx >= rows.length) return;
    const row = rows[selectedRowIdx];
    if (!row) return;
    if (String(row.__rowId || '').startsWith('new_')) {
      setPendingAdds((prev) => prev.filter((r) => r.__rowId !== row.__rowId));
      setRows((prev) => prev.filter((_, i) => i !== selectedRowIdx));
      setTotalRows((prev) => prev - 1);
      setSelectedRowIdx(null);
      return;
    }
    setPendingDeletes((prev) => new Set(prev).add(selectedRowIdx));
    setSelectedRowIdx(null);
  }, [selectedRowIdx, rows]);

  const projectId = project?.config?.id;

  // Save changes
  const handleSave = useCallback(async () => {
    if (!projectId || !selectedTableId || !activeSheet) return;
    setSaving(true);
    const body = (action: string, extra: Record<string, unknown>) =>
      JSON.stringify({ projectId, tableId: selectedTableId, sheetName: activeSheet.name, ...extra });
    try {
      for (const addRow of pendingAdds) {
        const row = { ...addRow }; delete row.__rowId;
        await fetch('/api/projects/data/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('add', { row }) });
      }
      for (const [rowId, changes] of pendingChanges.entries()) {
        const rowIndex = parseInt(rowId.split(':')[2]);
        if (isNaN(rowIndex)) continue;
        const patch: Record<string, unknown> = {};
        for (const [field, change] of Object.entries(changes)) { patch[field] = change.newValue; }
        await fetch('/api/projects/data/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('update', { rowIndex, patch }) });
      }
      const sortedDeletes = Array.from(pendingDeletes).sort((a, b) => b - a);
      for (const rowIndex of sortedDeletes) {
        await fetch('/api/projects/data/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('delete', { rowIndex }) });
      }
      setPendingChanges(new Map());
      setPendingAdds([]);
      setPendingDeletes(new Set());
      const res = await fetch('/api/projects/data/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('query', { page: 1, pageSize: 5000 }) });
      if (res.ok) {
        const data = await res.json();
        setRows(withRowIds(data.rows || []));
        setTotalRows(data.total || 0);
      }
    } catch (e) {
      console.error('保存失败', e);
    }
    setSaving(false);
  }, [projectId, selectedTableId, activeSheet, pendingChanges, pendingAdds, pendingDeletes]);

  // Column info for inspector
  const derivedColumns = useMemo(() => {
    if (!activeSheet) return [];
    if (activeSheet.columns?.length) return activeSheet.columns;
    return activeSheet.headers.map((header, index) => {
      const values = rows.map((row) => row[header]);
      const nonEmpty = values.filter((v) => v !== '' && v != null);
      const sampleValues = [...new Set(nonEmpty.map(String))].slice(0, 8);
      const dataType = nonEmpty.length === 0 ? 'unknown' : nonEmpty.every((v) => typeof v === 'number') ? 'number' : 'string';
      return { name: header, index, dataType, nullable: nonEmpty.length < values.length, uniqueCount: new Set(nonEmpty.map(String)).size, sampleValues };
    });
  }, [activeSheet, rows]);

  const activeSheetData = activeSheet ? { ...activeSheet, columns: derivedColumns } : undefined;
  const selectedCol = selectedColIdx !== null ? activeSheetData?.columns?.[selectedColIdx] : null;

  // Auto-select first table
  useEffect(() => {
    if (!selectedTableId && project?.srcTable.length) setSelectedTableId(project.srcTable[0].id);
  }, [project?.srcTable, selectedTableId]);

  // Load rows from server
  useEffect(() => {
    if (!projectId || !selectedTable || !activeSheet || !selectedTableId) { setRows([]); setTotalRows(0); return; }
    let cancelled = false;
    const loadRows = async () => {
      setLoading(true);
      const fallbackRows = activeSheet.preview || [];
      try {
        const res = await fetch('/api/projects/data/query', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, tableId: selectedTable.id, sheetName: activeSheet.name, page: 1, pageSize: 5000 }),
        });
        if (!res.ok) throw new Error(`rows api failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRows(withRowIds(data.rows || []));
        setTotalRows(data.total ?? data.rows?.length ?? fallbackRows.length);
      } catch {
        if (cancelled) return;
        const limited = fallbackRows.length > 5000 ? fallbackRows.slice(0, 5000) : fallbackRows;
        setRows(withRowIds(limited));
        setTotalRows(activeSheet.rowCount || fallbackRows.length);
      } finally { if (!cancelled) setLoading(false); }
    };
    loadRows();
    setSelectedColIdx(null);
    return () => { cancelled = true; };
  }, [projectId, selectedTableId, activeSheetIdx, activeSheet?.name]);

  return (
    <div className="page-layout">
      {/* Sidebar */}
      <div className="page-sidebar">
        <div className="page-section-header"><span>数据表</span></div>
        <div className="page-section-body">
          {!project?.srcTable || project.srcTable.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}><p>暂无数据表</p></div>
          ) : project.srcTable.map((t) => (
            <div key={t.id} className={`sidebar-item ${selectedTableId === t.id ? 'active' : ''}`} onClick={() => { setSelectedTableId(t.id); setActiveSheetIdx(0); setSelectedColIdx(null); }}>
              <span className="sidebar-item-icon"><DesignerIcon name={t.fileType === 'json' ? 'text' : t.fileType === 'sqlite' ? 'data' : 'table'} /></span>
              <div className="sidebar-item-info">
                <span className="sidebar-item-name">{t.fileName}</span>
                <span className="sidebar-item-meta">{t.sheets.length} sheets</span>
              </div>
            </div>
          ))}

          {project?.forms && project.forms.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>表单</h4>
              {project.forms.map((form) => (
                <div key={form.id} className="sidebar-item" onClick={() => setPreviewFormId(form.id)}>
                  <span className="sidebar-item-icon"><DesignerIcon name="form" /></span>
                  <div className="sidebar-item-info">
                    <span className="sidebar-item-name">{form.name}</span>
                    <span className="sidebar-item-meta">{form.design?.components?.length || 0} 个控件</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="page-main">
        <div className="page-section-header">
          <span>数据预览</span>
          {activeSheet && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{totalRows} 行 × {activeSheet.headers.length} 列</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={handleAddRow} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)', cursor: 'pointer' }}>+ 新增行</button>
                <button onClick={handleDeleteRow} disabled={selectedRowIdx === null} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)', cursor: selectedRowIdx !== null ? 'pointer' : 'not-allowed', opacity: selectedRowIdx !== null ? 1 : 0.5 }}>删除行</button>
                {changeCount > 0 && (
                  <button onClick={handleSave} disabled={saving} style={{ padding: '3px 10px', fontSize: 11, border: 'none', borderRadius: 4, background: saving ? 'var(--line)' : 'var(--accent)', color: '#fff', cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? '保存中...' : `保存 (${changeCount})`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="page-section-body" style={{ padding: 0 }}>
          {!activeSheet ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}><p>选择左侧数据表查看预览</p></div>
          ) : (
            <div className="data-preview-table-pane">
              {selectedTable && selectedTable.sheets.length > 1 && (
                <div className="data-preview-sheet-tabs">
                  {selectedTable.sheets.map((s, i) => (
                    <button key={s.name} className={activeSheetIdx === i ? 'sheet-tab active' : 'sheet-tab'} onClick={() => { setActiveSheetIdx(i); setSelectedColIdx(null); }}>
                      {s.name}<span className="sheet-count">{s.rowCount}</span>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="data-preview-loading">加载中…</div>
              ) : (
                <div className={`${agThemeClass} data-preview-grid`} style={{ width: '100%', height: '100%' }}>
                  <AgGridReact
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{ resizable: true, sortable: true, filter: true }}
                    pagination={true}
                    paginationPageSize={100}
                    paginationPageSizeSelector={[50, 100, 200, 500]}
                    animateRows={true}
                    rowSelection="single"
                    onColumnHeaderClicked={(e) => {
                      const field = e.column && 'getColDef' in e.column ? e.column.getColDef().field : undefined;
                      if (!field || !activeSheetData) return;
                      const idx = activeSheetData.headers.indexOf(field);
                      setSelectedColIdx(idx >= 0 ? idx : null);
                    }}
                    onCellClicked={(e) => {
                      const field = e.colDef.field;
                      if (!field || !activeSheetData) return;
                      const idx = activeSheetData.headers.indexOf(field);
                      setSelectedColIdx(idx >= 0 ? idx : null);
                      if (e.rowIndex !== null && e.rowIndex !== undefined) setSelectedRowIdx(e.rowIndex);
                    }}
                    onCellValueChanged={onCellValueChanged}
                    getRowId={(p) => String(p.data.__rowId)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inspector */}
      <div className="page-inspector">
        <div className="page-section-header"><span>列详情</span></div>
        <div className="page-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selectedCol ? (
            <div style={{ padding: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedCol.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>类型</span><span>{selectedCol.dataType}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>唯一值</span><span>{selectedCol.uniqueCount}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>可空</span><span>{selectedCol.nullable ? '是' : '否'}</span></div>
              </div>
              {selectedCol.sampleValues.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <h4 style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>示例值</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedCol.sampleValues.slice(0, 6).map((v, i) => (
                      <span key={i} style={{ padding: '2px 6px', fontSize: 10, background: 'var(--panel-soft)', borderRadius: 4 }}>{String(v)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 11 }}>点击列头查看详情</div>
          )}
        </div>
      </div>

      {/* Form Preview Modal */}
      <Modal open={!!previewFormId} onClose={() => setPreviewFormId(null)} maxWidth={1200} maxHeight="90vh">
        <ModalHeader title={previewForm?.name || '表单预览'} onClose={() => setPreviewFormId(null)} />
        <div style={{ height: 'calc(90vh - 60px)', overflow: 'auto', position: 'relative' }}>
          {previewComponents.length > 0 ? (
            <PreviewCanvas components={previewComponents} zoom={1} workflows={workflows} tables={tables} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>该表单没有设计内容</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
