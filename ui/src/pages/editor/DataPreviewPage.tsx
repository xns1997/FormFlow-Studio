import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { DesignerIcon } from '../../designer/icons';
import { useProjectStore } from '../../project/store';
import { useSharedDataStore } from '../../services/data/sharedDataStore';
import { applySheetKeyConfig } from '../../services/data/tableKeys';
import {
  createDefaultTableConfig,
  type ProjectStructure,
  type SrcColumnInfo,
  type SrcSheetInfo,
  type SrcTableEntry,
  type TableConfig,
} from '../../project/types';
import {
  appendColumnToSheet,
  createEmptyTableEntry,
  removeColumnFromSheet,
  renameColumnInSheet,
  reorderColumnsInSheet,
} from '../../services/data/tableEditor';
import { parseCsvStreaming } from '../../services/data/streamingParser';

ModuleRegistry.registerModules([AllCommunityModule]);

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const agThemeClass = prefersDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

type PreviewRow = Record<string, unknown> & { __rowId?: string };
type DataTab = 'table' | 'describe' | 'config';
type ColumnType = SrcColumnInfo['dataType'];
type WizardColumnDraft = { id: string; name: string; dataType: ColumnType };
type CreateTableDraft = {
  step: 0 | 1 | 2;
  tableName: string;
  fileName: string;
  sheetName: string;
  columns: WizardColumnDraft[];
};

function withRowIds(data: Record<string, unknown>[], offset = 0): PreviewRow[] {
  return data.map((row, index) => ({
    ...row,
    __rowId: String(row.id ?? row.customer_id ?? `${offset + index}`),
  }));
}

function inferColumnInfo(
  name: string,
  index: number,
  data: Record<string, unknown>[],
  preferredType?: ColumnType,
): SrcColumnInfo {
  const values = data.map((row) => row[name]);
  const nonEmpty = values.filter((value) => value !== '' && value != null);
  const sampleValues = [...new Set(nonEmpty.map(String))].slice(0, 8);
  const inferredType: ColumnType =
    nonEmpty.length === 0
      ? preferredType || 'string'
      : nonEmpty.every((value) => typeof value === 'number')
        ? 'number'
        : nonEmpty.every((value) => typeof value === 'boolean')
          ? 'boolean'
          : nonEmpty.every((value) => !Number.isNaN(Date.parse(String(value))))
            ? 'date'
            : sampleValues.length <= 20
              ? 'enum'
              : 'string';

  return {
    name,
    index,
    dataType: preferredType && preferredType !== 'unknown' ? preferredType : inferredType,
    nullable: nonEmpty.length < values.length,
    uniqueCount: new Set(nonEmpty.map(String)).size,
    sampleValues,
  };
}

function sanitizeRows(rows: PreviewRow[], pendingDeletes: Set<number>) {
  return rows
    .filter((_, index) => !pendingDeletes.has(index))
    .map((row) => {
      const next = { ...row };
      delete next.__rowId;
      return next;
    });
}

function rebuildSheetFromRows(sheet: SrcSheetInfo, nextRows: Record<string, unknown>[]) {
  const nextColumns = sheet.headers.map((header, index) => {
    const previous = sheet.columns.find((column) => column.name === header);
    return {
      ...inferColumnInfo(header, index, nextRows, previous?.dataType),
      ...previous,
      name: header,
      index,
    };
  });
  return {
    ...sheet,
    preview: nextRows,
    rowCount: nextRows.length,
    colCount: sheet.headers.length,
    columns: nextColumns,
  };
}

function buildProjectWithUpdatedTable(project: ProjectStructure, tableId: string, updatedTable: SrcTableEntry): ProjectStructure {
  return {
    ...project,
    srcTable: project.srcTable.map((table) => (table.id === tableId ? updatedTable : table)),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

function createDefaultWizardDraft(): CreateTableDraft {
  return {
    step: 0,
    tableName: '',
    fileName: '',
    sheetName: 'Sheet1',
    columns: [{ id: `col_${Date.now()}`, name: '列1', dataType: 'string' }],
  };
}

export default function DataPreviewPage() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const addTable = useProjectStore((s) => s.addTable);
  const removeTable = useProjectStore((s) => s.removeTable);
  const saveSheetConfig = useProjectStore((s) => s.updateTableSheetConfig);
  const setPendingRowData = useSharedDataStore((s) => s.setPendingRowData);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [serverPage, setServerPage] = useState(1);
  const serverPageSize = 5000;
  const [describeReport, setDescribeReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DataTab>('table');
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingChanges, setPendingChanges] = useState<Map<string, Record<string, { oldValue: unknown; newValue: unknown }>>>(new Map());
  const [pendingAdds, setPendingAdds] = useState<PreviewRow[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateTableDraft>(createDefaultWizardDraft());
  const [columnNameDraft, setColumnNameDraft] = useState('');
  const [columnTypeDraft, setColumnTypeDraft] = useState<ColumnType>('string');
  const [columnDescriptionDraft, setColumnDescriptionDraft] = useState('');
  const [columnTagsDraft, setColumnTagsDraft] = useState('');
  const [showDeleteColumnConfirm, setShowDeleteColumnConfirm] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('string');
  const [newColumnDefaultValue, setNewColumnDefaultValue] = useState('');

  const projectId = project?.config?.id;
  const selectedTable = project?.srcTable.find((table) => table.id === selectedTableId) || null;
  const activeSheet = selectedTable?.sheets[activeSheetIdx] || null;
  const currentConfig = useMemo(() => {
    if (!selectedTable || !activeSheet) return null;
    const defaults = createDefaultTableConfig(
      `${selectedTable.id}:${activeSheet.name}`,
      `${selectedTable.fileName} / ${activeSheet.name}`,
    );
    return { ...defaults, ...activeSheet.config };
  }, [selectedTable, activeSheet]);
  const currentKeyFields = currentConfig?.keyFields || [];
  const keyFieldSet = useMemo(() => new Set(currentKeyFields), [currentKeyFields]);

  const changeCount = pendingChanges.size + pendingAdds.length + pendingDeletes.size;

  const derivedColumns = useMemo(() => {
    if (!activeSheet) return [];
    if (activeSheet.columns?.length) {
      return activeSheet.headers.map((header, index) => {
        const previous = activeSheet.columns.find((column) => column.name === header);
        return { ...inferColumnInfo(header, index, rows, previous?.dataType), ...previous, name: header, index };
      });
    }
    return activeSheet.headers.map((header, index) => inferColumnInfo(header, index, rows));
  }, [activeSheet, rows]);

  const activeSheetData = activeSheet ? { ...activeSheet, columns: derivedColumns } : undefined;
  const selectedCol = selectedColIdx !== null ? activeSheetData?.columns?.[selectedColIdx] || null : null;

  useEffect(() => {
    if (selectedCol) {
      setColumnNameDraft(selectedCol.name);
      setColumnTypeDraft(selectedCol.dataType);
      setColumnDescriptionDraft(currentConfig?.columnDescriptions[selectedCol.name] || selectedCol.description || '');
      setColumnTagsDraft((currentConfig?.columnTags[selectedCol.name] || selectedCol.tags || []).join(', '));
      setShowDeleteColumnConfirm(false);
    } else {
      setColumnNameDraft('');
      setColumnTypeDraft('string');
      setColumnDescriptionDraft('');
      setColumnTagsDraft('');
      setShowDeleteColumnConfirm(false);
    }
  }, [selectedCol?.name, selectedCol?.dataType, currentConfig?.columnDescriptions, currentConfig?.columnTags]);

  const colDefs = useMemo<ColDef[]>(() => {
    if (!activeSheet || !currentConfig) return [];
    const rowNumberCol: ColDef[] = currentConfig.showRowNumbers !== false
      ? [{
          headerName: '#',
          colId: '__rowNumber',
          valueGetter: (params) => String((params.node?.rowIndex ?? 0) + 1),
          width: 64,
          minWidth: 56,
          maxWidth: 72,
          pinned: 'left',
          lockPinned: true,
          suppressMovable: true,
          sortable: false,
          filter: false,
          editable: false,
          resizable: false,
          cellClass: 'data-preview-row-number-cell',
          headerClass: 'data-preview-row-number-header',
        }]
      : [];

    return [
      ...rowNumberCol,
      ...activeSheet.headers.map((header) => {
        const isKeyField = keyFieldSet.has(header);
        return {
          headerName: header,
          field: header,
          flex: currentConfig.columnWidths[header] ? undefined : 1,
          width: currentConfig.columnWidths[header],
          minWidth: 160,
          resizable: true,
          sortable: currentConfig.sortEnabled !== false,
          filter: currentConfig.filterEnabled !== false,
          hide: currentConfig.hiddenColumns?.includes(header) || false,
          editable: totalRows <= rows.length,
          headerClass: isKeyField ? 'ag-col-key' : undefined,
          cellClass: isKeyField ? 'ag-cell-key' : undefined,
        } satisfies ColDef;
      }),
    ];
  }, [activeSheet, currentConfig, keyFieldSet, totalRows, rows.length]);

  const updateConfig = useCallback(async (patch: Partial<TableConfig>) => {
    if (!selectedTable || !activeSheet || !currentConfig) return;
    await saveSheetConfig(selectedTable.id, activeSheet.name, { ...currentConfig, ...patch });
  }, [selectedTable, activeSheet, currentConfig, saveSheetConfig]);

  const updateKeyFields = useCallback(async (keyFields: string[]) => {
    if (!activeSheet) return;
    await updateConfig(applySheetKeyConfig(activeSheet, keyFields));
  }, [activeSheet, updateConfig]);

  const onColumnResized = useCallback((event: any) => {
    if (!event.finished || !selectedTable || !activeSheet || !currentConfig || !event.column) return;
    const colId = event.column.colDef?.field;
    const newWidth = event.column.getActualWidth();
    if (!colId || colId === '__rowNumber') return;
    if (Math.abs(newWidth - (currentConfig.columnWidths[colId] || 0)) <= 2) return;
    void updateConfig({
      columnWidths: { ...currentConfig.columnWidths, [colId]: newWidth },
    });
  }, [selectedTable, activeSheet, currentConfig, updateConfig]);

  const onCellValueChanged = useCallback((event: any) => {
    if (!selectedTableId || !activeSheet) return;
    const rowIndex = event.rowIndex;
    const field = event.colDef.field;
    if (!field || field === '__rowNumber') return;
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

  const handleAddRow = useCallback(() => {
    if (!activeSheet) return;
    const newRow: PreviewRow = { __rowId: `new_${Date.now()}` };
    activeSheet.headers.forEach((header) => { newRow[header] = ''; });
    setPendingAdds((prev) => [...prev, newRow]);
    setRows((prev) => [...prev, newRow]);
    setTotalRows((prev) => prev + 1);
  }, [activeSheet]);

  const handleDeleteRow = useCallback(() => {
    if (selectedRowIdx === null || selectedRowIdx >= rows.length) return;
    const row = rows[selectedRowIdx];
    if (!row) return;
    if (String(row.__rowId || '').startsWith('new_')) {
      setPendingAdds((prev) => prev.filter((item) => item.__rowId !== row.__rowId));
      setRows((prev) => prev.filter((_, index) => index !== selectedRowIdx));
      setTotalRows((prev) => prev - 1);
      setSelectedRowIdx(null);
      return;
    }
    setPendingDeletes((prev) => new Set(prev).add(selectedRowIdx));
    setSelectedRowIdx(null);
  }, [selectedRowIdx, rows]);

  const persistCurrentRows = useCallback(async (): Promise<ProjectStructure | null> => {
    if (!project || !selectedTable || !activeSheet) return null;
    const nextRows = sanitizeRows(rows, pendingDeletes);
    const updatedSheet = rebuildSheetFromRows(activeSheet, nextRows);
    const updatedTable: SrcTableEntry = {
      ...selectedTable,
      sheets: selectedTable.sheets.map((sheet, index) => index === activeSheetIdx ? updatedSheet : sheet),
    };
    const nextProject = buildProjectWithUpdatedTable(project, selectedTable.id, updatedTable);
    await setProject(nextProject);
    setRows(withRowIds(updatedSheet.preview));
    setTotalRows(updatedSheet.rowCount);
    setPendingChanges(new Map());
    setPendingAdds([]);
    setPendingDeletes(new Set());
    return nextProject;
  }, [project, selectedTable, activeSheet, rows, pendingDeletes, activeSheetIdx, setProject]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await persistCurrentRows();
    } finally {
      setSaving(false);
    }
  }, [persistCurrentRows]);

  const syncLocalSheet = useCallback((table: SrcTableEntry, sheetName: string) => {
    const sheet = table.sheets.find((entry) => entry.name === sheetName);
    if (!sheet) return;
    setRows(withRowIds(sheet.preview || []));
    setTotalRows(sheet.rowCount || 0);
    setPendingChanges(new Map());
    setPendingAdds([]);
    setPendingDeletes(new Set());
  }, []);

  const applyTableMutation = useCallback(async (
    mutate: (table: SrcTableEntry) => SrcTableEntry,
    after?: (updatedTable: SrcTableEntry) => void,
  ) => {
    if (!project || !selectedTable || !activeSheet) return;
    setSaving(true);
    try {
      const baseProject = changeCount > 0 ? await persistCurrentRows() : project;
      if (!baseProject) return;
      const baseTable = baseProject.srcTable.find((table) => table.id === selectedTable.id);
      if (!baseTable) return;
      const updatedTable = mutate(baseTable);
      const nextProject = buildProjectWithUpdatedTable(baseProject, baseTable.id, updatedTable);
      await setProject(nextProject);
      syncLocalSheet(updatedTable, activeSheet.name);
      after?.(updatedTable);
    } finally {
      setSaving(false);
    }
  }, [project, selectedTable, activeSheet, changeCount, persistCurrentRows, setProject, syncLocalSheet]);

  const handleUpload = useCallback(async (file: File) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    let fileId = `local_${Date.now()}`;
    try {
      const uploadRes = await fetch('http://localhost:3001/api/files/upload', { method: 'POST', body: formData });
      if (uploadRes.ok) {
        const meta = await uploadRes.json();
        fileId = meta.id;
      }
    } catch {}

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let sheets: SrcSheetInfo[];

      if (ext === 'csv') {
        const parsed = await parseCsvStreaming(file);
        const preview = parsed.rows as Record<string, unknown>[];
        sheets = [{
          name: 'Sheet1', rowCount: parsed.rowCount, colCount: parsed.headers.length, headers: parsed.headers,
          columns: parsed.headers.map((header, index) => inferColumnInfo(header, index, preview.slice(0, 5000))),
          preview,
          config: createDefaultTableConfig(`${fileId}:Sheet1`, `${file.name} / Sheet1`),
        }];
      } else if (ext === 'json') {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const sheetRows = Array.isArray(parsed) ? parsed : parsed.data || parsed.rows || [parsed];
        const headers = sheetRows.length > 0 ? Object.keys(sheetRows[0]) : [];
        const preview = sheetRows as Record<string, unknown>[];
        sheets = [{
          name: 'Sheet1',
          rowCount: preview.length,
          colCount: headers.length,
          headers,
          columns: headers.map((header, index) => inferColumnInfo(header, index, preview)),
          preview,
          config: createDefaultTableConfig(`${fileId}:Sheet1`, `${file.name} / Sheet1`),
        }];
      } else {
        const XLSX = await import('xlsx');
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        sheets = workbook.SheetNames.map((name) => {
          const worksheet = workbook.Sheets[name];
          const preview = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
          const headers = preview.length > 0 ? Object.keys(preview[0]) : [];
          return {
            name,
            rowCount: preview.length,
            colCount: headers.length,
            headers,
            columns: headers.map((header, index) => inferColumnInfo(header, index, preview)),
            preview,
            config: createDefaultTableConfig(`${fileId}:${name}`, `${file.name} / ${name}`),
          };
        });
      }

      const fileType = (
        ext === 'json'
          ? 'json'
          : ext === 'db' || ext === 'sqlite' || ext === 'sqlite3'
            ? 'sqlite'
            : ext || 'xlsx'
      ) as SrcTableEntry['fileType'];

      const table: SrcTableEntry = {
        id: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType,
        uploadedAt: new Date().toISOString(),
        sheets,
        dataHash: `${file.size}_${file.lastModified}`,
      };
      await addTable(table);
      setRows(withRowIds(sheets[0]?.preview || []));
      setTotalRows(sheets[0]?.rowCount || 0);
      setSelectedTableId(fileId);
      setActiveSheetIdx(0);
      setSelectedColIdx(null);
      setSelectedRowIdx(null);
      setActiveTab('table');
    } catch (error) {
      console.error('解析失败', error);
    } finally {
      setLoading(false);
    }
  }, [addTable]);

  const regenerateDescribe = useCallback(() => {
    if (!selectedTable || !activeSheet) return;
    setDescribeLoading(true);
    const fileId = selectedTable.id;
    const sheetName = activeSheet.name;
    const projectQuery = projectId ? `projectId=${encodeURIComponent(projectId)}&` : '';
    fetch(`http://localhost:3001/api/describe/${encodeURIComponent(fileId)}?${projectQuery}sheet=${encodeURIComponent(sheetName)}`, { method: 'DELETE' })
      .then(() => fetch(`http://localhost:3001/api/describe/${encodeURIComponent(fileId)}?${projectQuery}sheet=${encodeURIComponent(sheetName)}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDescribeReport(data))
      .finally(() => setDescribeLoading(false));
  }, [selectedTable, activeSheet, projectId]);

  const createWizardCanContinue = useMemo(() => {
    if (createDraft.step === 0) return createDraft.tableName.trim().length > 0 && createDraft.sheetName.trim().length > 0;
    if (createDraft.step === 1) return createDraft.columns.every((column) => column.name.trim().length > 0);
    return true;
  }, [createDraft]);

  useEffect(() => {
    if (!selectedTableId && project?.srcTable.length) setSelectedTableId(project.srcTable[0].id);
  }, [project?.srcTable, selectedTableId]);

  useEffect(() => { setServerPage(1); }, [selectedTableId, activeSheetIdx]);

  useEffect(() => {
    if (!projectId || !selectedTable || !activeSheet || !selectedTableId) {
      setRows([]);
      setTotalRows(0);
      return;
    }
    let cancelled = false;
    const loadRows = async () => {
      setLoading(true);
      const fallbackRows = activeSheet.preview || [];
      try {
        const response = await fetch('/api/data/paginated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, tableId: selectedTable.id, sheetName: activeSheet.name, page: serverPage, pageSize: serverPageSize }),
        });
        if (!response.ok) throw new Error(`rows api failed: ${response.status}`);
        const data = await response.json();
        if (cancelled) return;
        setRows(withRowIds(data.rows || [], (serverPage - 1) * serverPageSize));
        setTotalRows(data.total ?? data.rows?.length ?? fallbackRows.length);
      } catch {
        if (cancelled) return;
        const limited = fallbackRows.length > 5000 ? fallbackRows.slice(0, 5000) : fallbackRows;
        setRows(withRowIds(limited));
        setTotalRows(activeSheet.rowCount || fallbackRows.length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadRows();
    setSelectedColIdx(null);
    setSelectedRowIdx(null);
    setPendingChanges(new Map());
    setPendingAdds([]);
    setPendingDeletes(new Set());
    setDescribeReport(null);
    return () => { cancelled = true; };
  }, [projectId, selectedTableId, activeSheetIdx, activeSheet?.name, serverPage]);

  useEffect(() => {
    if (!selectedTable || !activeSheet || activeTab !== 'describe') return;
    let cancelled = false;
    setDescribeLoading(true);
    const projectQuery = projectId ? `projectId=${encodeURIComponent(projectId)}&` : '';
    fetch(`http://localhost:3001/api/describe/${encodeURIComponent(selectedTable.id)}?${projectQuery}sheet=${encodeURIComponent(activeSheet.name)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setDescribeReport(data); })
      .catch(() => { if (!cancelled) setDescribeReport(null); })
      .finally(() => { if (!cancelled) setDescribeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTable, activeSheet, activeTab, projectId]);

  const handleCreateTable = useCallback(async () => {
    const table = createEmptyTableEntry({
      tableName: createDraft.tableName,
      fileName: createDraft.fileName,
      sheetName: createDraft.sheetName,
      columns: createDraft.columns.map((column) => ({ name: column.name, dataType: column.dataType })),
    });
    await addTable(table);
    setSelectedTableId(table.id);
    setActiveSheetIdx(0);
    setSelectedColIdx(0);
    setSelectedRowIdx(null);
    setActiveTab('table');
    setShowCreateWizard(false);
    setCreateDraft(createDefaultWizardDraft());
  }, [addTable, createDraft]);

  const handleAddColumn = useCallback(async () => {
    if (!selectedTable || !activeSheet || !newColumnName.trim()) return;
    await applyTableMutation(
      (table) => appendColumnToSheet(table, activeSheet.name, {
        name: newColumnName,
        dataType: newColumnType,
        defaultValue: newColumnDefaultValue,
      }),
      (updatedTable) => {
        const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
        const nextIndex = updatedSheet?.headers.findIndex((header) => header === newColumnName.trim()) ?? -1;
        setSelectedColIdx(nextIndex >= 0 ? nextIndex : updatedSheet ? updatedSheet.headers.length - 1 : null);
        setNewColumnName('');
        setNewColumnType('string');
        setNewColumnDefaultValue('');
      },
    );
  }, [selectedTable, activeSheet, newColumnName, newColumnType, newColumnDefaultValue, applyTableMutation]);

  const handleSaveColumn = useCallback(async () => {
    if (!selectedTable || !activeSheet || !selectedCol) return;
    const nextName = columnNameDraft.trim();
    if (!nextName) return;
    const currentName = selectedCol.name;
    await applyTableMutation((table) => {
      let updatedTable = table;
      if (nextName !== currentName) {
        updatedTable = renameColumnInSheet(updatedTable, activeSheet.name, currentName, nextName);
      }
      const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
      if (!updatedSheet) return updatedTable;
      const nextHeaders = updatedSheet.headers;
      const targetName = nextName !== currentName ? nextName : currentName;
      const nextSheetConfig =
        updatedSheet.config ||
        createDefaultTableConfig(`${updatedTable.id}:${updatedSheet.name}`, `${updatedTable.fileName} / ${updatedSheet.name}`);
      const nextColumns = updatedSheet.columns.map((column) =>
        column.name !== targetName
          ? column
          : {
              ...column,
              dataType: columnTypeDraft,
              description: columnDescriptionDraft.trim(),
              tags: columnTagsDraft.split(',').map((tag) => tag.trim()).filter(Boolean),
            },
      );
      return {
        ...updatedTable,
        sheets: updatedTable.sheets.map((sheet) =>
          sheet.name !== activeSheet.name
            ? sheet
            : {
                ...sheet,
                columns: nextColumns.map((column, index) => ({ ...column, index })),
                config: {
                  ...nextSheetConfig,
                  columnDescriptions: {
                    ...(nextSheetConfig.columnDescriptions || {}),
                    [targetName]: columnDescriptionDraft.trim(),
                  },
                  columnTags: {
                    ...(nextSheetConfig.columnTags || {}),
                    [targetName]: columnTagsDraft.split(',').map((tag) => tag.trim()).filter(Boolean),
                  },
                },
                headers: nextHeaders,
              },
        ),
      };
    }, (updatedTable) => {
      const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
      if (!updatedSheet) return;
      const targetName = nextName !== currentName ? nextName : currentName;
      setSelectedColIdx(updatedSheet.headers.findIndex((header) => header === targetName));
    });
  }, [selectedTable, activeSheet, selectedCol, columnNameDraft, columnTypeDraft, columnDescriptionDraft, columnTagsDraft, applyTableMutation]);

  const handleDeleteColumn = useCallback(async () => {
    if (!selectedTable || !activeSheet || !selectedCol) return;
    await applyTableMutation(
      (table) => removeColumnFromSheet(table, activeSheet.name, selectedCol.name),
      (updatedTable) => {
        const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
        setSelectedColIdx(updatedSheet && updatedSheet.headers.length > 0 ? Math.min(selectedColIdx || 0, updatedSheet.headers.length - 1) : null);
        setShowDeleteColumnConfirm(false);
      },
    );
  }, [selectedTable, activeSheet, selectedCol, selectedColIdx, applyTableMutation]);

  const handleMoveColumn = useCallback(async (direction: 'up' | 'down') => {
    if (!selectedTable || !activeSheet || !selectedCol) return;
    await applyTableMutation(
      (table) => reorderColumnsInSheet(table, activeSheet.name, selectedCol.name, direction),
      (updatedTable) => {
        const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
        if (!updatedSheet) return;
        setSelectedColIdx(updatedSheet.headers.findIndex((header) => header === selectedCol.name));
      },
    );
  }, [selectedTable, activeSheet, selectedCol, applyTableMutation]);

  return (
    <div className="page-layout data-preview-layout">
      <div className="page-sidebar data-preview-sidebar">
        <div className="page-section-header">
          <span>数据表 ({project?.srcTable.length || 0})</span>
          <div className="data-preview-sidebar-actions">
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowCreateWizard(true)}>+ 建表</button>
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => fileRef.current?.click()}>+ 上传</button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json,.db,.sqlite,.sqlite3"
            style={{ display: 'none' }}
            onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])}
          />
        </div>
        <div className="page-section-body">
          {!project?.srcTable.length ? (
            <div className="data-preview-empty-state">
              <p>暂无数据表</p>
              <p>点击「建表」创建空表，或用「上传」导入文件</p>
            </div>
          ) : (
            project.srcTable.map((table) => (
              <div
                key={table.id}
                className={`sidebar-item ${selectedTableId === table.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTableId(table.id);
                  setActiveSheetIdx(0);
                  setSelectedColIdx(null);
                  setSelectedRowIdx(null);
                  setActiveTab('table');
                }}
              >
                <span className="sidebar-item-icon">
                  <DesignerIcon name={table.fileType === 'json' ? 'text' : table.fileType === 'sqlite' ? 'data' : 'table'} />
                </span>
                <div className="sidebar-item-info">
                  <span className="sidebar-item-name">{table.fileName}</span>
                  <span className="sidebar-item-meta">{table.sheets.length} sheets · {table.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行</span>
                </div>
                <button
                  type="button"
                  className="sidebar-item-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeTable(table.id);
                    if (selectedTableId === table.id) setSelectedTableId(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="page-main data-preview-main">
        <div className="page-section-header data-preview-main-header">
          <div className="data-preview-tabbar">
            <button type="button" className={activeTab === 'table' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('table')}>数据表</button>
            <button type="button" className={activeTab === 'describe' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('describe')}>数据概览</button>
            <button type="button" className={activeTab === 'config' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('config')}>配置</button>
          </div>
          {activeSheet && (
            <div className="data-preview-toolbar">
              <span className="data-preview-summary">{totalRows} 行 × {activeSheetData?.colCount || 0} 列</span>
              {totalRows > serverPageSize && <span className="data-preview-server-pager">
                <button type="button" className="ui-btn ui-btn-xs" disabled={serverPage <= 1} onClick={() => setServerPage((page) => Math.max(1, page - 1))}>上一批</button>
                <span>{serverPage} / {Math.ceil(totalRows / serverPageSize)}</span>
                <button type="button" className="ui-btn ui-btn-xs" disabled={serverPage >= Math.ceil(totalRows / serverPageSize)} onClick={() => setServerPage((page) => page + 1)}>下一批</button>
              </span>}
              {activeTab === 'table' && (
                <>
                  <button type="button" className="ui-btn ui-btn-xs" onClick={handleAddRow} disabled={totalRows > rows.length}>+ 新增行</button>
                  <button type="button" className="ui-btn ui-btn-xs" onClick={handleDeleteRow} disabled={selectedRowIdx === null || totalRows > rows.length}>删除行</button>
                  {changeCount > 0 && (
                    <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : `保存 (${changeCount})`}
                    </button>
                  )}
                  {selectedRowIdx !== null && selectedRowIdx < rows.length && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary ui-btn-xs"
                      onClick={() => {
                        const rowData = rows[selectedRowIdx];
                        if (!rowData) return;
                        setPendingRowData(rowData, `${selectedTable?.fileName || ''} / ${activeSheet?.name || ''} / 行${selectedRowIdx + 1}`);
                      }}
                    >
                      发送到表单 (行 {selectedRowIdx + 1})
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="page-section-body data-preview-main-body" style={{ padding: 0 }}>
          {!activeSheet ? (
            <div className="data-preview-empty-panel">
              <p>{project?.srcTable.length ? '选择左侧数据表查看预览' : '创建或上传数据表开始工作'}</p>
            </div>
          ) : activeTab === 'table' ? (
            <div className="data-preview-table-pane">
              {selectedTable && selectedTable.sheets.length > 1 && (
                <div className="data-preview-sheet-tabs">
                  {selectedTable.sheets.map((sheet, index) => (
                    <button
                      key={sheet.name}
                      type="button"
                      className={activeSheetIdx === index ? 'sheet-tab active' : 'sheet-tab'}
                      onClick={() => {
                        setActiveSheetIdx(index);
                        setSelectedColIdx(null);
                        setSelectedRowIdx(null);
                      }}
                    >
                      {sheet.name}
                      <span className="sheet-count">{sheet.rowCount}</span>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="data-preview-loading">加载中…</div>
              ) : (
                <div
                  className={[
                    agThemeClass,
                    'data-preview-grid',
                    currentConfig?.alternateRowColor === false ? 'no-zebra' : '',
                    currentConfig?.showGridLines === false ? 'no-grid-lines' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ width: '100%', height: '100%' }}
                >
                  <AgGridReact
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{
                      resizable: true,
                      sortable: currentConfig?.sortEnabled !== false,
                      filter: currentConfig?.filterEnabled !== false,
                    }}
                    rowHeight={currentConfig?.rowHeight}
                    headerHeight={currentConfig?.headerHeight}
                    pagination
                    paginationPageSize={100}
                    paginationPageSizeSelector={[50, 100, 200, 500]}
                    animateRows
                    rowSelection="single"
                    getRowId={(params) => String(params.data.__rowId)}
                    getRowClass={(params) => {
                      if (String(params.data.__rowId || '').startsWith('new_')) return 'ag-row-new';
                      if (pendingDeletes.has(params.node.rowIndex ?? -1)) return 'ag-row-deleted';
                      return '';
                    }}
                    onColumnResized={onColumnResized}
                    onColumnHeaderClicked={(event) => {
                      const field = event.column && 'getColDef' in event.column ? event.column.getColDef().field : undefined;
                      if (!field || !activeSheetData) {
                        setSelectedColIdx(null);
                        return;
                      }
                      const index = activeSheetData.headers.indexOf(field);
                      setSelectedColIdx(index >= 0 ? index : null);
                    }}
                    onCellClicked={(event) => {
                      const field = event.colDef.field;
                      if (field && field !== '__rowNumber' && activeSheetData) {
                        const index = activeSheetData.headers.indexOf(field);
                        setSelectedColIdx(index >= 0 ? index : null);
                      }
                      if (event.rowIndex != null) setSelectedRowIdx(event.rowIndex);
                    }}
                    onCellValueChanged={onCellValueChanged}
                  />
                </div>
              )}
            </div>
          ) : activeTab === 'describe' ? (
            <div className="describe-report" style={{ padding: '12px 16px', overflow: 'auto', flex: 1 }}>
              <div className="data-preview-section-title">
                <h3>数据概览</h3>
                <button type="button" className="ui-btn ui-btn-xs" onClick={regenerateDescribe} disabled={describeLoading}>
                  {describeLoading ? '分析中…' : '重新分析'}
                </button>
              </div>
              {!describeReport ? (
                <div className="data-preview-empty-panel">{describeLoading ? '正在分析数据…' : '加载数据概览中…'}</div>
              ) : (
                <>
                  <div className="describe-overview">
                    <div className="describe-stat"><strong>{describeReport.overview?.rows || 0}</strong><span>行</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.columns || 0}</strong><span>列</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.memoryUsage || '-'}</strong><span>内存</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.duplicateRows || 0}</strong><span>重复行</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.missingPercent || '0%'}</strong><span>缺失率</span></div>
                    <div className="describe-stat"><strong>{describeReport.qualityScore || 0}</strong><span>质量分</span></div>
                  </div>
                  <div className="describe-section">
                    <h4>字段信息</h4>
                    <div className="describe-col-list">
                      {describeReport.columns?.map((col: any, index: number) => (
                        <div key={index} className="describe-col-item">
                          <div className="describe-col-header">
                            <span className="describe-col-name">{col.name}</span>
                            {col.hasOutliers && <span className="describe-outlier-badge">⚠ {col.outlierCount} 异常值</span>}
                            <span className="describe-col-type">{col.type}</span>
                          </div>
                          <div className="describe-col-stats">
                            <span>非空: {col.nonNull}</span>
                            <span>唯一: {col.uniqueCount}</span>
                            <span>空值: {col.nullPercent}</span>
                            {col.cardinality && <span>基数: {col.cardinality}</span>}
                          </div>
                          <div className="describe-col-samples">
                            {col.sampleValues?.slice(0, 4).map((value: string, itemIndex: number) => (
                              <span key={itemIndex} className="describe-sample">{value}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="table-config-panel">
              {currentConfig && (
                <div className="settings-page-body settings-page-body--wide">
                  <section className="settings-card">
                    <div className="config-summary">
                      <div className="settings-card-title">
                        <h3>数据表配置</h3>
                        <p>{selectedTable?.fileName || '-'} / {activeSheet?.name || '-'}</p>
                      </div>
                      <div className="settings-kpi-row">
                        <span className="settings-kpi-chip"><strong>{activeSheet?.rowCount || 0}</strong> 行</span>
                        <span className="settings-kpi-chip"><strong>{activeSheet?.colCount || 0}</strong> 列</span>
                        <span className="settings-kpi-chip"><strong>{Object.keys(currentConfig.columnWidths).length}</strong> 列宽配置</span>
                      </div>
                    </div>
                  </section>

                  <div className="settings-form">
                    <section className="settings-card settings-group">
                      <div className="settings-card-header">
                        <div className="settings-card-title">
                          <h4>Key 配置</h4>
                          <p>按当前 sheet 选择用于唯一定位的字段，支持组合 key。</p>
                        </div>
                      </div>
                      <div className="settings-option-grid">
                        {activeSheet?.headers.map((header) => (
                          <label key={header} className="settings-option-item">
                            <input
                              type="checkbox"
                              checked={currentKeyFields.includes(header)}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...currentKeyFields, header]
                                  : currentKeyFields.filter((field) => field !== header);
                                void updateKeyFields(next);
                              }}
                            />
                            <span>{header}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="settings-card settings-group">
                      <div className="settings-card-header">
                        <div className="settings-card-title">
                          <h4>尺寸</h4>
                          <p>控制表头、行高和冻结区。</p>
                        </div>
                      </div>
                      <div className="settings-grid">
                        <label><span>表头高度</span><input type="number" value={currentConfig.headerHeight} min={24} max={80} onChange={(event) => void updateConfig({ headerHeight: Number(event.target.value) })} /></label>
                        <label><span>行高</span><input type="number" value={currentConfig.rowHeight} min={20} max={64} onChange={(event) => void updateConfig({ rowHeight: Number(event.target.value) })} /></label>
                        <label><span>冻结列数</span><input type="number" value={currentConfig.frozenColumns} min={0} max={10} onChange={(event) => void updateConfig({ frozenColumns: Number(event.target.value) })} /></label>
                        <label><span>冻结行数</span><input type="number" value={currentConfig.frozenRows} min={0} max={10} onChange={(event) => void updateConfig({ frozenRows: Number(event.target.value) })} /></label>
                      </div>
                    </section>

                    <section className="settings-card settings-group">
                      <div className="settings-card-header">
                        <div className="settings-card-title">
                          <h4>显示与交互</h4>
                          <p>控制表格展示、筛选排序与行号。</p>
                        </div>
                      </div>
                      <div className="settings-toggle-list">
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.showRowNumbers !== false} onChange={(event) => void updateConfig({ showRowNumbers: event.target.checked })} /><span>显示行号</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.alternateRowColor} onChange={(event) => void updateConfig({ alternateRowColor: event.target.checked })} /><span>交替行颜色</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.showGridLines} onChange={(event) => void updateConfig({ showGridLines: event.target.checked })} /><span>显示网格线</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.filterEnabled} onChange={(event) => void updateConfig({ filterEnabled: event.target.checked })} /><span>启用筛选</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.sortEnabled} onChange={(event) => void updateConfig({ sortEnabled: event.target.checked })} /><span>启用排序</span></label>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="page-inspector data-preview-inspector">
        <div className="page-section-header">
          <span>{selectedCol ? `列：${selectedCol.name}` : '表结构编辑'}</span>
        </div>
        <div className="page-section-body data-preview-inspector-body">
          {activeSheet ? (
            <>
              <section className="data-preview-inspector-card">
                <div className="data-preview-section-title">
                  <h4>表信息</h4>
                </div>
                <div className="data-preview-info-grid">
                  <label><span>表名</span><input value={selectedTable?.fileName || ''} readOnly /></label>
                  <label><span>Sheet</span><input value={activeSheet.name} readOnly /></label>
                  <label><span>行数</span><input value={String(totalRows)} readOnly /></label>
                  <label><span>列数</span><input value={String(activeSheet.headers.length)} readOnly /></label>
                </div>
                <label className="data-preview-toggle">
                  <input type="checkbox" checked={currentConfig?.showRowNumbers !== false} onChange={(event) => void updateConfig({ showRowNumbers: event.target.checked })} />
                  <span>显示行号列</span>
                </label>
              </section>

              <section className="data-preview-inspector-card">
                <div className="data-preview-section-title">
                  <h4>新增列</h4>
                </div>
                <div className="data-preview-column-form">
                  <label><span>列名</span><input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} placeholder="例如：状态" /></label>
                  <label>
                    <span>数据类型</span>
                    <select value={newColumnType} onChange={(event) => setNewColumnType(event.target.value as ColumnType)}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="enum">enum</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </label>
                  <label><span>默认值</span><input value={newColumnDefaultValue} onChange={(event) => setNewColumnDefaultValue(event.target.value)} placeholder="为空时写入空字符串" /></label>
                  <button type="button" className="ui-btn ui-btn-primary" onClick={handleAddColumn} disabled={!newColumnName.trim() || saving}>新增列</button>
                </div>
              </section>

              <section className="data-preview-inspector-card">
                <div className="data-preview-section-title">
                  <h4>列列表</h4>
                </div>
                <div className="data-preview-column-list">
                  {activeSheetData?.columns.map((column, index) => (
                    <button
                      key={column.name}
                      type="button"
                      className={`data-preview-column-chip ${selectedColIdx === index ? 'active' : ''}`}
                      onClick={() => setSelectedColIdx(index)}
                    >
                      <span>{column.name}</span>
                      <small>{column.dataType}</small>
                    </button>
                  ))}
                </div>
              </section>

              {selectedCol ? (
                <section className="data-preview-inspector-card">
                  <div className="data-preview-section-title">
                    <h4>编辑列</h4>
                    <div className="data-preview-inline-actions">
                      <button type="button" className="ui-btn ui-btn-xs" onClick={() => void handleMoveColumn('up')} disabled={selectedColIdx === 0 || saving}>上移</button>
                      <button type="button" className="ui-btn ui-btn-xs" onClick={() => void handleMoveColumn('down')} disabled={selectedColIdx === activeSheet.headers.length - 1 || saving}>下移</button>
                    </div>
                  </div>
                  <div className="data-preview-column-form">
                    <label><span>列名</span><input value={columnNameDraft} onChange={(event) => setColumnNameDraft(event.target.value)} /></label>
                    <label>
                      <span>数据类型</span>
                      <select value={columnTypeDraft} onChange={(event) => setColumnTypeDraft(event.target.value as ColumnType)}>
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                        <option value="enum">enum</option>
                        <option value="unknown">unknown</option>
                      </select>
                    </label>
                    <label><span>描述</span><textarea rows={3} value={columnDescriptionDraft} onChange={(event) => setColumnDescriptionDraft(event.target.value)} /></label>
                    <label><span>标签</span><input value={columnTagsDraft} onChange={(event) => setColumnTagsDraft(event.target.value)} placeholder="用逗号分隔" /></label>
                    <div className="data-preview-inline-actions">
                      <button type="button" className="ui-btn ui-btn-primary" onClick={handleSaveColumn} disabled={!columnNameDraft.trim() || saving}>保存列设置</button>
                      {!showDeleteColumnConfirm ? (
                        <button type="button" className="ui-btn ui-btn-danger" onClick={() => setShowDeleteColumnConfirm(true)}>删除列</button>
                      ) : (
                        <>
                          <button type="button" className="ui-btn ui-btn-danger" onClick={handleDeleteColumn}>确认删除</button>
                          <button type="button" className="ui-btn" onClick={() => setShowDeleteColumnConfirm(false)}>取消</button>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              ) : (
                <div className="data-preview-empty-state data-preview-empty-state--compact">
                  <p>点击列头或右侧列列表开始编辑结构</p>
                </div>
              )}
            </>
          ) : (
            <div className="data-preview-empty-state data-preview-empty-state--compact">
              <p>请选择一个数据表</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={showCreateWizard} onClose={() => setShowCreateWizard(false)} maxWidth={760}>
        <ModalHeader title="创建数据表" onClose={() => setShowCreateWizard(false)} />
        <div className="modal-body data-preview-wizard">
          <div className="project-wizard-steps">
            {['基本信息', '列定义', '确认创建'].map((label, index) => (
              <div key={label} className={`project-wizard-step ${createDraft.step === index ? 'active' : createDraft.step > index ? 'done' : ''}`}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          {createDraft.step === 0 && (
            <div className="data-preview-wizard-panel">
              <label><span>表名</span><input value={createDraft.tableName} onChange={(event) => setCreateDraft((current) => ({ ...current, tableName: event.target.value, fileName: current.fileName || `${event.target.value || '新建数据表'}.json` }))} placeholder="例如：客户台账" /></label>
              <label><span>文件名/资源名</span><input value={createDraft.fileName} onChange={(event) => setCreateDraft((current) => ({ ...current, fileName: event.target.value }))} placeholder="例如：customer-ledger.json" /></label>
              <label><span>首个 Sheet 名</span><input value={createDraft.sheetName} onChange={(event) => setCreateDraft((current) => ({ ...current, sheetName: event.target.value }))} placeholder="Sheet1" /></label>
            </div>
          )}

          {createDraft.step === 1 && (
            <div className="data-preview-wizard-panel">
              <div className="data-preview-section-title">
                <h4>列定义</h4>
                <button
                  type="button"
                  className="ui-btn ui-btn-xs"
                  onClick={() => setCreateDraft((current) => ({
                    ...current,
                    columns: [...current.columns, { id: `col_${Date.now()}_${current.columns.length}`, name: `列${current.columns.length + 1}`, dataType: 'string' }],
                  }))}
                >
                  + 新增列
                </button>
              </div>
              <div className="data-preview-wizard-columns">
                {createDraft.columns.map((column, index) => (
                  <div key={column.id} className="data-preview-wizard-column-row">
                    <input value={column.name} onChange={(event) => setCreateDraft((current) => ({
                      ...current,
                      columns: current.columns.map((item) => item.id === column.id ? { ...item, name: event.target.value } : item),
                    }))} />
                    <select value={column.dataType} onChange={(event) => setCreateDraft((current) => ({
                      ...current,
                      columns: current.columns.map((item) => item.id === column.id ? { ...item, dataType: event.target.value as ColumnType } : item),
                    }))}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="enum">enum</option>
                    </select>
                    <div className="data-preview-inline-actions">
                      <button type="button" className="ui-btn ui-btn-xs" disabled={index === 0} onClick={() => setCreateDraft((current) => {
                        const next = [...current.columns];
                        const [moved] = next.splice(index, 1);
                        next.splice(index - 1, 0, moved);
                        return { ...current, columns: next };
                      })}>上移</button>
                      <button type="button" className="ui-btn ui-btn-xs" disabled={index === createDraft.columns.length - 1} onClick={() => setCreateDraft((current) => {
                        const next = [...current.columns];
                        const [moved] = next.splice(index, 1);
                        next.splice(index + 1, 0, moved);
                        return { ...current, columns: next };
                      })}>下移</button>
                      <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" disabled={createDraft.columns.length === 1} onClick={() => setCreateDraft((current) => ({ ...current, columns: current.columns.filter((item) => item.id !== column.id) }))}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {createDraft.step === 2 && (
            <div className="data-preview-wizard-panel">
              <div className="project-wizard-summary-card">
                <strong>{createDraft.tableName || '未命名数据表'}</strong>
                <div className="project-wizard-summary-list">
                  <p>文件名：{createDraft.fileName || `${createDraft.tableName || '新建数据表'}.json`}</p>
                  <p>Sheet：{createDraft.sheetName || 'Sheet1'}</p>
                  <p>列数：{createDraft.columns.length}</p>
                </div>
                <div className="project-wizard-tags">
                  {createDraft.columns.map((column) => <span key={column.id}>{column.name} · {column.dataType}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setShowCreateWizard(false)}>取消</button>
          <button type="button" className="ui-btn" onClick={() => setCreateDraft((current) => ({ ...current, step: Math.max(0, current.step - 1) as 0 | 1 | 2 }))} disabled={createDraft.step === 0}>上一步</button>
          {createDraft.step < 2 ? (
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setCreateDraft((current) => ({ ...current, step: Math.min(2, current.step + 1) as 0 | 1 | 2 }))} disabled={!createWizardCanContinue}>下一步</button>
          ) : (
            <button type="button" className="ui-btn ui-btn-primary" onClick={handleCreateTable}>创建数据表</button>
          )}
        </ModalFooter>
      </Modal>
    </div>
  );
}
