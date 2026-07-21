import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { AntdCompatSelect } from '../../components/AntdFormControls';
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
import {
  countCellChanges,
  dataPreviewApi,
  defaultPreviewQuery,
  serializeUpdates,
  validateCellValue,
  validateChanges,
  type PreviewQuery,
  type PreviewRow,
  type RowChanges,
} from '../../services/data/dataPreviewClient';
import { describeApi, fileApi } from '../../services/io/api';
import { inferFormFields, inferLikelyKey } from '../../services/formGeneration/fieldInference';
import { generateFormScaffold } from '../../services/formGeneration/formScaffold';
import { recordAuthoringEvent } from '../../services/formGeneration/authoringTelemetry';

ModuleRegistry.registerModules([AllCommunityModule]);

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const agThemeClass = prefersDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

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
type GenerateFormDraft = {
  name: string;
  purpose: 'entry' | 'lookup-edit' | 'approval' | 'detail' | 'statistics';
  selectedFields: string[];
  columns: 1 | 2 | 3;
  includeSave: boolean;
  includeReset: boolean;
};

function withRowIds(data: Record<string, unknown>[], offset = 0): PreviewRow[] {
  return data.map((row, index) => ({
    ...row,
    __rowKey: `idx:${offset + index}`,
    __rowIndex: offset + index,
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

function loadPersonalView(projectId: string | undefined, viewKey: string): PreviewQuery | null {
  if (!projectId || !viewKey) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(`formflow.data-view:${projectId}:${viewKey}`) || 'null');
    return parsed && typeof parsed === 'object' ? { ...defaultPreviewQuery(), ...parsed, page: 1 } : null;
  } catch { return null; }
}

function savePersonalView(projectId: string | undefined, viewKey: string, query: PreviewQuery) {
  if (!projectId || !viewKey) return;
  try { localStorage.setItem(`formflow.data-view:${projectId}:${viewKey}`, JSON.stringify({ ...query, page: 1 })); } catch { /* storage unavailable */ }
}

export default function DataPreviewPage() {
  const navigate = useNavigate();
  const { id: routeProjectId } = useParams<{ id: string }>();
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const refreshProject = useProjectStore((s) => s.refreshProject);
  const addTable = useProjectStore((s) => s.addTable);
  const removeTable = useProjectStore((s) => s.removeTable);
  const saveSheetConfig = useProjectStore((s) => s.updateTableSheetConfig);
  const setPendingRowData = useSharedDataStore((s) => s.setPendingRowData);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [queryTotal, setQueryTotal] = useState(0);
  const [query, setQuery] = useState<PreviewQuery>(defaultPreviewQuery);
  const [searchDraft, setSearchDraft] = useState('');
  const [keyJumpDraft, setKeyJumpDraft] = useState('');
  const [dataVersion, setDataVersion] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [describeReport, setDescribeReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DataTab>('table');
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingChanges, setPendingChanges] = useState<Map<string, RowChanges>>(new Map());
  const [pendingAdds, setPendingAdds] = useState<PreviewRow[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<null | (() => void)>(null);
  const [showDeleteRowConfirm, setShowDeleteRowConfirm] = useState(false);
  const [showDeleteTableConfirm, setShowDeleteTableConfirm] = useState<SrcTableEntry | null>(null);
  const [uploadStage, setUploadStage] = useState('');
  const [duplicateUploadFile, setDuplicateUploadFile] = useState<File | null>(null);
  const savedViewsRef = useRef(new Map<string, PreviewQuery>());
  const navigationBypassRef = useRef(false);

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
  const [columnSearch, setColumnSearch] = useState('');
  const [showFormGenerator, setShowFormGenerator] = useState(false);
  const [generateFormDraft, setGenerateFormDraft] = useState<GenerateFormDraft>({ name: '', purpose: 'entry', selectedFields: [], columns: 2, includeSave: true, includeReset: true });
  const [generateFormError, setGenerateFormError] = useState('');

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

  const changedCellCount = countCellChanges(pendingChanges);
  const changeCount = changedCellCount + pendingAdds.length + pendingDeletes.size;
  const currentViewKey = selectedTable && activeSheet ? `${selectedTable.id}:${activeSheet.name}` : '';

  const guardAction = useCallback((action: () => void) => {
    if (changeCount > 0) setPendingNavigation(() => action);
    else action();
  }, [changeCount]);

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
  const typeConversionFailures = useMemo(() => {
    if (!selectedCol || selectedCol.dataType === columnTypeDraft) return [] as unknown[];
    return rows.map((row) => row[selectedCol.name]).filter((value) => validateCellValue(value, columnTypeDraft)).slice(0, 5);
  }, [selectedCol, columnTypeDraft, rows]);
  const inferredGeneratorFields = useMemo(
    () => activeSheetData ? inferFormFields(activeSheetData, generateFormDraft.selectedFields) : [],
    [activeSheetData, generateFormDraft.selectedFields],
  );

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
          valueGetter: (params) => params.data?.__isNew ? '新' : String((params.data?.__rowIndex ?? 0) + 1),
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
          editable: !saving && !currentConfig.lockedColumns.includes(header),
          pinned: currentConfig.frozenColumns > activeSheet.headers.indexOf(header) ? 'left' : undefined,
          lockPinned: currentConfig.frozenColumns > activeSheet.headers.indexOf(header),
          sort: currentConfig.defaultSort?.column === header ? (currentConfig.defaultSort.ascending ? 'asc' : 'desc') : undefined,
          headerClass: isKeyField ? 'ag-col-key' : undefined,
          cellClass: (params: any) => [
            isKeyField ? 'ag-cell-key' : '',
            validationErrors.has(`${params.data?.__rowKey}:${header}`) ? 'ag-cell-validation-error' : '',
          ].filter(Boolean).join(' '),
          tooltipValueGetter: (params: any) => validationErrors.get(`${params.data?.__rowKey}:${header}`) || String(params.value ?? ''),
        } satisfies ColDef;
      }),
    ];
  }, [activeSheet, currentConfig, keyFieldSet, saving, validationErrors]);

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
    const field = event.colDef.field;
    if (!field || field === '__rowNumber') return;
    const oldValue = event.oldValue;
    const newValue = event.newValue;
    if (oldValue === newValue) return;
    const rowKey = event.data?.__rowKey as string | undefined;
    if (!rowKey || event.data?.__isNew) {
      if (event.data?.__isNew) setPendingAdds((current) => current.map((row) => row.__rowKey === rowKey ? { ...row, [field]: newValue } : row));
      setSaveState('dirty');
      return;
    }
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const rowChanges = { ...(next.get(rowKey) || {}) };
      rowChanges[field] = { oldValue, newValue };
      next.set(rowKey, rowChanges);
      return next;
    });
    setSaveState('dirty');
  }, [selectedTableId, activeSheet]);

  const handleAddRow = useCallback(() => {
    if (!activeSheet) return;
    const newRow: PreviewRow = { __rowKey: `new:${Date.now()}`, __rowIndex: totalRows + pendingAdds.length, __isNew: true };
    activeSheet.headers.forEach((header) => { newRow[header] = ''; });
    setPendingAdds((prev) => [...prev, newRow]);
    setRows((prev) => [...prev, newRow]);
    setSaveState('dirty');
  }, [activeSheet, totalRows, pendingAdds.length]);

  const handleDeleteRow = useCallback(() => {
    if (!selectedRowKey) return;
    const row = rows.find((item) => item.__rowKey === selectedRowKey);
    if (!row) return;
    if (row.__isNew) {
      setPendingAdds((prev) => prev.filter((item) => item.__rowKey !== row.__rowKey));
      setRows((prev) => prev.filter((item) => item.__rowKey !== row.__rowKey));
      setSelectedRowIdx(null);
      setSelectedRowKey(null);
      setSaveState(changeCount > 1 ? 'dirty' : 'saved');
      return;
    }
    setPendingDeletes((prev) => new Set(prev).add(row.__rowKey));
    setSelectedRowIdx(null);
    setSelectedRowKey(null);
    setShowDeleteRowConfirm(false);
    setSaveState('dirty');
  }, [selectedRowKey, rows, changeCount]);

  const discardChanges = useCallback(() => {
    setPendingChanges(new Map());
    setPendingAdds([]);
    setPendingDeletes(new Set());
    setValidationErrors(new Map());
    setSelectedRowIdx(null);
    setSelectedRowKey(null);
    setSaveState('saved');
    setReloadToken((value) => value + 1);
  }, []);

  const switchDataContext = useCallback((tableId: string, sheetIndex: number) => {
    guardAction(() => {
      if (currentViewKey) savedViewsRef.current.set(currentViewKey, query);
      const table = project?.srcTable.find((entry) => entry.id === tableId);
      const sheet = table?.sheets[sheetIndex];
      const nextKey = table && sheet ? `${table.id}:${sheet.name}` : '';
      const nextQuery = savedViewsRef.current.get(nextKey) || loadPersonalView(projectId, nextKey) || defaultPreviewQuery();
      setSelectedTableId(tableId);
      setActiveSheetIdx(sheetIndex);
      setQuery(nextQuery);
      setSearchDraft(nextQuery.search);
      setSelectedColIdx(null);
      setSelectedRowIdx(null);
      setSelectedRowKey(null);
      setActiveTab('table');
      discardChanges();
    });
  }, [guardAction, currentViewKey, query, project, projectId, discardChanges]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!projectId || !selectedTable || !activeSheet || changeCount === 0) return true;
    const errors = validateChanges(pendingChanges, pendingAdds, activeSheetData?.columns || []);
    setValidationErrors(errors);
    if (errors.size > 0) {
      setFeedback({ type: 'error', message: `发现 ${errors.size} 个类型错误，已在表格中标记` });
      setSaveState('error');
      return false;
    }
    const additions = pendingAdds.map((row) => {
      const { __rowKey: _rowKey, __rowIndex: _rowIndex, __isNew: _isNew, ...clean } = row;
      return clean;
    });
    const keyFields = currentConfig?.keyFields || [];
    const invalidKey = additions.find((row) => keyFields.some((field) => row[field] == null || row[field] === ''));
    if (invalidKey) {
      setFeedback({ type: 'error', message: `新增记录必须填写 Key 字段：${keyFields.join('、')}` });
      setSaveState('error');
      return false;
    }
    setSaving(true);
    setSaveState('saving');
    try {
      await dataPreviewApi.batch({
        projectId,
        tableId: selectedTable.id,
        sheetName: activeSheet.name,
        baseVersion: dataVersion,
        adds: additions,
        updates: serializeUpdates(pendingChanges),
        deletes: [...pendingDeletes],
      });
      setPendingChanges(new Map());
      setPendingAdds([]);
      setPendingDeletes(new Set());
      setValidationErrors(new Map());
      setSaveState('saved');
      setFeedback({ type: 'success', message: '数据修改已保存' });
      setDescribeReport(null);
      void describeApi.delete(selectedTable.id, activeSheet.name, projectId).catch(() => undefined);
      await refreshProject();
      setReloadToken((value) => value + 1);
      return true;
    } catch (error) {
      setSaveState('error');
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '保存失败，请重试' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId, selectedTable, activeSheet, activeSheetData, changeCount, pendingAdds, pendingChanges, pendingDeletes, currentConfig, dataVersion, refreshProject]);

  const syncLocalSheet = useCallback((table: SrcTableEntry, sheetName: string) => {
    const sheet = table.sheets.find((entry) => entry.name === sheetName);
    if (!sheet) return;
    setRows(withRowIds(sheet.preview || []));
    setTotalRows(sheet.rowCount || 0);
    setPendingChanges(new Map());
    setPendingAdds([]);
    setPendingDeletes(new Set());
    setSaveState('saved');
  }, []);

  const applyTableMutation = useCallback(async (
    mutate: (table: SrcTableEntry) => SrcTableEntry,
    after?: (updatedTable: SrcTableEntry) => void,
  ) => {
    if (!project || !selectedTable || !activeSheet) return;
    setSaving(true);
    try {
      if (changeCount > 0 && !(await handleSave())) return;
      const baseProject = useProjectStore.getState().project || project;
      if (!baseProject) return;
      const baseTable = baseProject.srcTable.find((table) => table.id === selectedTable.id);
      if (!baseTable) return;
      const updatedTable = mutate(baseTable);
      const nextProject = buildProjectWithUpdatedTable(baseProject, baseTable.id, updatedTable);
      await setProject(nextProject);
      syncLocalSheet(updatedTable, activeSheet.name);
      setReloadToken((value) => value + 1);
      after?.(updatedTable);
    } finally {
      setSaving(false);
    }
  }, [project, selectedTable, activeSheet, changeCount, handleSave, setProject, syncLocalSheet]);

  const handleUpload = useCallback(async (file: File, displayName = file.name) => {
    setLoading(true);
    setUploadStage('上传文件');
    let fileId = `local_${Date.now()}`;
    try {
      const meta = await fileApi.upload(file);
      fileId = meta.id;
    } catch (error) {
      setFeedback({ type: 'info', message: '服务端上传不可用，将继续在本地解析文件' });
    }

    try {
      setUploadStage('解析数据');
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['csv', 'json', 'xlsx', 'xls', 'db', 'sqlite', 'sqlite3'].includes(ext)) throw new Error(`不支持的文件格式：.${ext}`);
      let sheets: SrcSheetInfo[];

      if (ext === 'csv') {
        const parsed = await parseCsvStreaming(file);
        const preview = parsed.rows as Record<string, unknown>[];
        sheets = [{
          name: 'Sheet1', rowCount: parsed.rowCount, colCount: parsed.headers.length, headers: parsed.headers,
          columns: parsed.headers.map((header, index) => inferColumnInfo(header, index, preview.slice(0, 5000))),
          preview,
          config: createDefaultTableConfig(`${fileId}:Sheet1`, `${displayName} / Sheet1`),
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
          config: createDefaultTableConfig(`${fileId}:Sheet1`, `${displayName} / Sheet1`),
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
            config: createDefaultTableConfig(`${fileId}:${name}`, `${displayName} / ${name}`),
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

      if (!sheets.length || sheets.every((sheet) => sheet.headers.length === 0)) throw new Error('文件中没有可导入的数据表');
      setUploadStage('推断字段类型');
      const table: SrcTableEntry = {
        id: fileId,
        fileName: displayName,
        fileSize: file.size,
        fileType,
        uploadedAt: new Date().toISOString(),
        sheets,
        dataHash: `${file.size}_${file.lastModified}`,
      };
      setUploadStage('写入项目');
      await addTable(table);
      setRows(withRowIds(sheets[0]?.preview || []));
      setTotalRows(sheets[0]?.rowCount || 0);
      setSelectedTableId(fileId);
      setActiveSheetIdx(0);
      setSelectedColIdx(null);
      setSelectedRowIdx(null);
      setSelectedRowKey(null);
      setActiveTab('table');
      setFeedback({ type: 'success', message: `已导入 ${displayName}，共 ${sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行` });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '文件解析失败' });
    } finally {
      setLoading(false);
      setUploadStage('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [addTable]);

  const startUpload = useCallback((file: File) => {
    if (project?.srcTable.some((table) => table.fileName === file.name)) setDuplicateUploadFile(file);
    else void handleUpload(file);
  }, [project, handleUpload]);

  const regenerateDescribe = useCallback(() => {
    if (!selectedTable || !activeSheet) return;
    setDescribeLoading(true);
    describeApi.delete(selectedTable.id, activeSheet.name, projectId)
      .then(() => describeApi.get(selectedTable.id, activeSheet.name, projectId))
      .then((data) => setDescribeReport(data))
      .catch((error) => setFeedback({ type: 'error', message: error instanceof Error ? error.message : '分析失败' }))
      .finally(() => setDescribeLoading(false));
  }, [selectedTable, activeSheet, projectId]);

  const createWizardCanContinue = useMemo(() => {
    if (createDraft.step === 0) return createDraft.tableName.trim().length > 0 && createDraft.sheetName.trim().length > 0;
    if (createDraft.step === 1) return createDraft.columns.every((column) => column.name.trim().length > 0);
    return true;
  }, [createDraft]);

  useEffect(() => {
    if (!selectedTableId && project?.srcTable.length) {
      const table = project.srcTable[0];
      const viewKey = table.sheets[0] ? `${table.id}:${table.sheets[0].name}` : '';
      const initialQuery = loadPersonalView(projectId, viewKey) || defaultPreviewQuery();
      setSelectedTableId(table.id);
      setQuery(initialQuery);
      setSearchDraft(initialQuery.search);
    }
  }, [project?.srcTable, selectedTableId, projectId]);

  useEffect(() => {
    if (!currentViewKey) return;
    savedViewsRef.current.set(currentViewKey, query);
    savePersonalView(projectId, currentViewKey, query);
  }, [currentViewKey, projectId, query]);

  useEffect(() => {
    if (!projectId || !selectedTable || !activeSheet || !selectedTableId) {
      setRows([]);
      setTotalRows(0);
      return;
    }
    let cancelled = false;
    const loadRows = async () => {
      setLoading(true);
      try {
        const data = await dataPreviewApi.page({ projectId, tableId: selectedTable.id, sheetName: activeSheet.name, ...query });
        if (cancelled) return;
        const loadedRows = (data.rows || []).map((row) => {
          const changes = pendingChanges.get(row.__rowKey);
          return changes
            ? { ...row, ...Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.newValue])) }
            : row;
        });
        setRows(query.page === 1 ? [...loadedRows, ...pendingAdds] : loadedRows);
        setTotalRows(data.total ?? data.rows?.length ?? 0);
        setQueryTotal(data.queryTotal ?? data.total ?? 0);
        setDataVersion(data.dataVersion || '');
      } catch (error) {
        if (cancelled) return;
        setRows([]);
        setFeedback({ type: 'error', message: error instanceof Error ? error.message : '数据加载失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadRows();
    setSelectedColIdx(null);
    setSelectedRowIdx(null);
    setDescribeReport(null);
    return () => { cancelled = true; };
  }, [projectId, selectedTableId, activeSheetIdx, activeSheet?.name, query, reloadToken]);

  useEffect(() => {
    if (!selectedTable || !activeSheet || activeTab !== 'describe') return;
    let cancelled = false;
    setDescribeLoading(true);
    describeApi.get(selectedTable.id, activeSheet.name, projectId)
      .then((data) => { if (!cancelled) setDescribeReport(data); })
      .catch((error) => {
        if (!cancelled) {
          setDescribeReport(null);
          setFeedback({ type: 'error', message: error instanceof Error ? error.message : '数据分析失败' });
        }
      })
      .finally(() => { if (!cancelled) setDescribeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTable, activeSheet, activeTab, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => current.search === searchDraft ? current : { ...current, page: 1, search: searchDraft });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (changeCount === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changeCount]);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      if (navigationBypassRef.current) {
        navigationBypassRef.current = false;
        return;
      }
      if (changeCount === 0) return;
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('.unified-mode-btn, .unified-toolbar a');
      if (!element || element.classList.contains('active')) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(() => () => {
        navigationBypassRef.current = true;
        element.click();
      });
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [changeCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches('input, textarea, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'z' && !editingText) {
        event.preventDefault();
        discardChanges();
      } else if (event.key === 'Delete' && selectedRowKey && !editingText) {
        event.preventDefault();
        setShowDeleteRowConfirm(true);
      } else if (event.key === 'Escape') {
        setShowDeleteRowConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, discardChanges, selectedRowKey]);

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

  const openFormGenerator = useCallback(() => {
    if (!activeSheetData) return;
    setGenerateFormDraft({
      name: `${activeSheetData.name}录入`,
      purpose: 'entry',
      selectedFields: activeSheetData.columns.filter((column) => !column.hidden && column.visible !== false).map((column) => column.name),
      columns: activeSheetData.columns.length <= 6 ? 2 : 3,
      includeSave: true,
      includeReset: true,
    });
    setGenerateFormError('');
    setShowFormGenerator(true);
  }, [activeSheetData]);

  const handleGenerateForm = useCallback(async () => {
    if (!project || !selectedTable || !activeSheetData || !generateFormDraft.name.trim() || !generateFormDraft.selectedFields.length) return;
    try {
      const generationTable = {
        ...selectedTable,
        sheets: selectedTable.sheets.map((sheet, index) => index === activeSheetIdx ? activeSheetData : sheet),
      };
      const generated = generateFormScaffold(generationTable, activeSheetData.name, {
        name: generateFormDraft.name,
        purpose: generateFormDraft.purpose,
        selectedFields: generateFormDraft.selectedFields,
        columns: generateFormDraft.columns,
        includeSave: generateFormDraft.includeSave,
        includeReset: generateFormDraft.includeReset,
      });
      const nextProject: ProjectStructure = {
        ...project,
        forms: [...(project.forms || []), generated.form],
        designs: [...(project.designs || []), generated.design],
        workflows: generated.workflow ? [...project.workflows, generated.workflow] : project.workflows,
        config: { ...project.config, updatedAt: new Date().toISOString() },
      };
      await setProject(nextProject);
      recordAuthoringEvent('form_generated', { creationMethod: 'data-wizard', fieldCount: generated.fields.length, manualControls: 0, manualEdges: 0, purpose: generateFormDraft.purpose, hasWorkflow: !!generated.workflow }, project.config.id);
      setShowFormGenerator(false);
      const id = routeProjectId || project.config.id;
      navigate(`/projects/${encodeURIComponent(id)}/editor?mode=design&form=${encodeURIComponent(generated.form.id)}`);
    } catch (error) {
      setGenerateFormError(error instanceof Error ? error.message : String(error));
    }
  }, [project, selectedTable, activeSheetData, activeSheetIdx, generateFormDraft, setProject, navigate, routeProjectId]);

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
            onChange={(event) => event.target.files?.[0] && startUpload(event.target.files[0])}
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
                onClick={() => switchDataContext(table.id, 0)}
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
                    setShowDeleteTableConfirm(table);
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
              <span className="data-preview-summary">{queryTotal !== totalRows ? `${queryTotal} / ${totalRows}` : totalRows} 行 × {activeSheetData?.colCount || 0} 列</span>
              {activeTab === 'table' && (
                <>
                  <div className="data-preview-tool-group">
                    <span>查找</span>
                    <input aria-label="全表搜索" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索全部字段" />
                    {(query.search || query.keySearch || Object.keys(query.filterModel).length > 0) && <button type="button" className="ui-btn ui-btn-xs" onClick={() => { setSearchDraft(''); setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, search: '', keySearch: '', filterModel: {} })); }}>清除筛选</button>}
                  </div>
                  <div className="data-preview-tool-group">
                    <span>编辑</span>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={handleAddRow} disabled={saving}>+ 新增行</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowDeleteRowConfirm(true)} disabled={!selectedRowKey || saving}>删除行</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={discardChanges} disabled={changeCount === 0 || saving}>撤销</button>
                    <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={() => void handleSave()} disabled={changeCount === 0 || saving}>{saving ? '保存中…' : '保存'}</button>
                  </div>
                  <div className="data-preview-tool-group">
                    <span>使用</span>
                    <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={openFormGenerator}>生成表单</button>
                    <button type="button" className="ui-btn ui-btn-xs" disabled={!selectedRowKey} onClick={() => {
                      const rowData = rows.find((row) => row.__rowKey === selectedRowKey);
                      if (!rowData) return;
                      const { __rowKey: _rowKey, __rowIndex: _rowIndex, __isNew: _isNew, ...clean } = rowData;
                      setPendingRowData(clean, `${selectedTable?.fileName || ''} / ${activeSheet.name} / 行${rowData.__rowIndex + 1}`);
                      setFeedback({ type: 'success', message: '已将选中行发送到表单' });
                    }}>发送到表单</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={async () => {
                      if (!projectId || !selectedTable) return;
                      try {
                        await dataPreviewApi.exportQuery({ projectId, tableId: selectedTable.id, sheetName: activeSheet.name, search: query.search, keySearch: query.keySearch, sortModel: query.sortModel, filterModel: query.filterModel }, `${selectedTable.fileName.replace(/\.[^.]+$/, '')}_${activeSheet.name}`);
                        setFeedback({ type: 'success', message: `已导出当前结果（${queryTotal} 行）` });
                      } catch (error) { setFeedback({ type: 'error', message: error instanceof Error ? error.message : '导出失败' }); }
                    }}>导出结果</button>
                  </div>
                  <span className={`data-preview-save-state is-${saveState}`}>{saveState === 'saved' ? '已保存' : saveState === 'saving' ? '保存中' : saveState === 'error' ? '保存失败' : `未保存：${changedCellCount} 单元格 / ${pendingAdds.length} 新增 / ${pendingDeletes.size} 删除`}</span>
                  {(query.search || query.keySearch || Object.keys(query.filterModel).length > 0) && <div className="data-preview-filter-chips">
                    {query.search && <button type="button" onClick={() => { setSearchDraft(''); setQuery((current) => ({ ...current, page: 1, search: '' })); }}>搜索：{query.search} ×</button>}
                    {query.keySearch && <button type="button" onClick={() => { setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, keySearch: '' })); }}>Key：{query.keySearch} ×</button>}
                    {Object.keys(query.filterModel).map((field) => <button key={field} type="button" onClick={() => setQuery((current) => { const filterModel = { ...current.filterModel }; delete filterModel[field]; return { ...current, page: 1, filterModel }; })}>{field} ×</button>)}
                  </div>}
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
                      onClick={() => selectedTable && switchDataContext(selectedTable.id, index)}
                    >
                      {sheet.name}
                      <span className="sheet-count">{sheet.rowCount}</span>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="data-preview-loading">{uploadStage || '加载数据'}…</div>
              ) : totalRows === 0 && rows.length === 0 ? (
                <div className="data-preview-empty-panel">
                  <h3>这张表还没有数据</h3>
                  <p>可以直接录入第一行，也可以导入现有文件后继续配置。</p>
                  <div className="data-preview-inline-actions">
                    <button type="button" className="ui-btn ui-btn-primary" onClick={handleAddRow}>新增第一行</button>
                    <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>导入数据</button>
                    <button type="button" className="ui-btn" onClick={() => setActiveTab('config')}>配置字段</button>
                    <button type="button" className="ui-btn" onClick={openFormGenerator}>生成表单</button>
                  </div>
                </div>
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
                    animateRows
                    rowSelection={{ mode: 'singleRow' }}
                    getRowId={(params) => String(params.data.__rowKey)}
                    getRowClass={(params) => {
                      if (params.data.__isNew) return 'ag-row-new';
                      if (pendingDeletes.has(params.data.__rowKey)) return 'ag-row-deleted';
                      return '';
                    }}
                    onColumnResized={onColumnResized}
                    onFirstDataRendered={(event) => {
                      if (currentConfig?.autoFitColumns && Object.keys(currentConfig.columnWidths).length === 0) event.api.sizeColumnsToFit();
                    }}
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
                      setSelectedRowKey(event.data?.__rowKey || null);
                    }}
                    onFilterChanged={(event) => {
                      const filterModel = event.api.getFilterModel();
                      setQuery((current) => JSON.stringify(current.filterModel) === JSON.stringify(filterModel) ? current : { ...current, page: 1, filterModel });
                    }}
                    onSortChanged={(event) => {
                      const sortModel = event.api.getColumnState().filter((column) => column.sort).map((column) => ({ colId: column.colId, sort: column.sort || undefined })) as PreviewQuery['sortModel'];
                      setQuery((current) => JSON.stringify(current.sortModel) === JSON.stringify(sortModel) ? current : { ...current, page: 1, sortModel });
                    }}
                    onCellValueChanged={onCellValueChanged}
                  />
                </div>
              )}
              <div className="data-preview-pager">
                <button type="button" className="ui-btn ui-btn-xs" disabled={query.page <= 1 || loading} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>上一页</button>
                <span>第 {query.page} / {Math.max(1, Math.ceil(queryTotal / query.pageSize))} 页</span>
                <button type="button" className="ui-btn ui-btn-xs" disabled={query.page >= Math.max(1, Math.ceil(queryTotal / query.pageSize)) || loading} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
                <AntdCompatSelect aria-label="每页行数" value={String(query.pageSize)} onChange={(event) => setQuery((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))}>{[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size} 行/页</option>)}</AntdCompatSelect>
                <label>跳转 <input aria-label="跳转页码" type="number" min={1} max={Math.max(1, Math.ceil(queryTotal / query.pageSize))} value={query.page} onChange={(event) => setQuery((current) => ({ ...current, page: Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, Math.ceil(queryTotal / current.pageSize)))) }))} /></label>
                <label>Key <input aria-label="跳转到 Key" value={keyJumpDraft} onChange={(event) => setKeyJumpDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setQuery((current) => ({ ...current, page: 1, keySearch: keyJumpDraft.trim() })); }} /></label>
                <button type="button" className="ui-btn ui-btn-xs" disabled={!keyJumpDraft.trim()} onClick={() => setQuery((current) => ({ ...current, page: 1, keySearch: keyJumpDraft.trim() }))}>定位</button>
              </div>
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
                  <p className="data-preview-analysis-meta">分析范围：{selectedTable?.fileName} / {activeSheet.name} · 当前为缓存结果，保存数据后可重新分析</p>
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
                            <span className="describe-col-actions">
                              <button type="button" className="ui-btn ui-btn-xs" onClick={() => { const columnIndex = activeSheet.headers.indexOf(col.name); setSelectedColIdx(columnIndex >= 0 ? columnIndex : null); setActiveTab('table'); }}>查看列</button>
                              {!currentKeyFields.includes(col.name) && <button type="button" className="ui-btn ui-btn-xs" onClick={() => void updateKeyFields([...currentKeyFields, col.name])}>设为 Key</button>}
                            </span>
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

              {selectedRowKey && (() => {
                const selectedRow = rows.find((row) => row.__rowKey === selectedRowKey);
                return selectedRow ? (
                  <section className="data-preview-inspector-card">
                    <div className="data-preview-section-title"><h4>行详情</h4><span>第 {selectedRow.__rowIndex + 1} 行</span></div>
                    <div className="data-preview-row-detail">
                      {activeSheet.headers.map((header) => <div key={header}><strong>{header}</strong><span>{String(selectedRow[header] ?? '') || '—'}</span></div>)}
                    </div>
                  </section>
                ) : null;
              })()}

              <section className="data-preview-inspector-card">
                <div className="data-preview-section-title">
                  <h4>新增列</h4>
                </div>
                <div className="data-preview-column-form">
                  <label><span>列名</span><input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} placeholder="例如：状态" /></label>
                  <label>
                    <span>数据类型</span>
                    <AntdCompatSelect value={newColumnType} onChange={(event) => setNewColumnType(event.target.value as ColumnType)}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="enum">enum</option>
                      <option value="unknown">unknown</option>
                    </AntdCompatSelect>
                  </label>
                  <label><span>默认值</span><input value={newColumnDefaultValue} onChange={(event) => setNewColumnDefaultValue(event.target.value)} placeholder="为空时写入空字符串" /></label>
                  <button type="button" className="ui-btn ui-btn-primary" onClick={handleAddColumn} disabled={!newColumnName.trim() || saving}>新增列</button>
                </div>
              </section>

              <section className="data-preview-inspector-card">
                <div className="data-preview-section-title">
                  <h4>列列表</h4>
                </div>
                <input className="data-preview-column-search" value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="搜索列名或类型" />
                <div className="data-preview-column-list">
                  {activeSheetData?.columns.map((column, index) => ({ column, index })).filter(({ column }) => !columnSearch.trim() || `${column.name} ${column.dataType}`.toLocaleLowerCase().includes(columnSearch.trim().toLocaleLowerCase())).map(({ column, index }) => (
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
                      <AntdCompatSelect value={columnTypeDraft} onChange={(event) => setColumnTypeDraft(event.target.value as ColumnType)}>
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                        <option value="enum">enum</option>
                        <option value="unknown">unknown</option>
                      </AntdCompatSelect>
                    </label>
                    {typeConversionFailures.length > 0 && <div className="data-preview-conversion-warning">当前页至少有 {typeConversionFailures.length} 个值不能转换为 {columnTypeDraft}，例如：{typeConversionFailures.map(String).join('、')}</div>}
                    <label><span>描述</span><textarea rows={3} value={columnDescriptionDraft} onChange={(event) => setColumnDescriptionDraft(event.target.value)} /></label>
                    <label><span>标签</span><input value={columnTagsDraft} onChange={(event) => setColumnTagsDraft(event.target.value)} placeholder="用逗号分隔" /></label>
                    <label className="data-preview-toggle"><input type="checkbox" checked={currentConfig?.hiddenColumns.includes(selectedCol.name) || false} onChange={(event) => void updateConfig({ hiddenColumns: event.target.checked ? [...(currentConfig?.hiddenColumns || []), selectedCol.name] : (currentConfig?.hiddenColumns || []).filter((name) => name !== selectedCol.name) })} /><span>隐藏此列</span></label>
                    <label className="data-preview-toggle"><input type="checkbox" checked={currentConfig?.lockedColumns.includes(selectedCol.name) || false} onChange={(event) => void updateConfig({ lockedColumns: event.target.checked ? [...(currentConfig?.lockedColumns || []), selectedCol.name] : (currentConfig?.lockedColumns || []).filter((name) => name !== selectedCol.name) })} /><span>锁定编辑</span></label>
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

      {feedback && <div className={`data-preview-feedback is-${feedback.type}`} role="status"><span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)}>×</button></div>}

      <Modal open={!!pendingNavigation} onClose={() => setPendingNavigation(null)} maxWidth={520}>
        <ModalHeader title="有未保存的数据修改" onClose={() => setPendingNavigation(null)} />
        <div className="modal-body"><p>当前有 {changeCount} 项修改。保存后继续，或放弃这些修改。</p></div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setPendingNavigation(null)}>留在当前页</button>
          <button type="button" className="ui-btn ui-btn-danger" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); discardChanges(); action?.(); }}>放弃修改</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={async () => { const action = pendingNavigation; if (await handleSave()) { setPendingNavigation(null); action?.(); } }}>保存并继续</button>
        </ModalFooter>
      </Modal>

      <Modal open={showDeleteRowConfirm} onClose={() => setShowDeleteRowConfirm(false)} maxWidth={480}>
        <ModalHeader title="删除选中行" onClose={() => setShowDeleteRowConfirm(false)} />
        <div className="modal-body"><p>该行将标记为待删除，点击“保存”后才会真正删除。</p></div>
        <ModalFooter><button type="button" className="ui-btn" onClick={() => setShowDeleteRowConfirm(false)}>取消</button><button type="button" className="ui-btn ui-btn-danger" onClick={handleDeleteRow}>标记删除</button></ModalFooter>
      </Modal>

      <Modal open={!!showDeleteTableConfirm} onClose={() => setShowDeleteTableConfirm(null)} maxWidth={520}>
        <ModalHeader title="删除数据表" onClose={() => setShowDeleteTableConfirm(null)} />
        <div className="modal-body"><p>将删除“{showDeleteTableConfirm?.fileName}”及其全部 Sheet。引用该数据表的表单或流程可能失效。</p></div>
        <ModalFooter><button type="button" className="ui-btn" onClick={() => setShowDeleteTableConfirm(null)}>取消</button><button type="button" className="ui-btn ui-btn-danger" onClick={() => {
          const table = showDeleteTableConfirm;
          setShowDeleteTableConfirm(null);
          if (!table) return;
          guardAction(() => { void removeTable(table.id); if (selectedTableId === table.id) { setSelectedTableId(null); discardChanges(); } });
        }}>确认删除</button></ModalFooter>
      </Modal>

      <Modal open={!!duplicateUploadFile} onClose={() => setDuplicateUploadFile(null)} maxWidth={520}>
        <ModalHeader title="发现同名数据表" onClose={() => setDuplicateUploadFile(null)} />
        <div className="modal-body"><p>项目中已存在“{duplicateUploadFile?.name}”。请选择如何导入。</p></div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setDuplicateUploadFile(null)}>取消</button>
          <button type="button" className="ui-btn" onClick={() => {
            const file = duplicateUploadFile; setDuplicateUploadFile(null); if (!file) return;
            const dot = file.name.lastIndexOf('.');
            const base = dot > 0 ? file.name.slice(0, dot) : file.name;
            const ext = dot > 0 ? file.name.slice(dot) : '';
            let index = 2; let name = `${base} (${index})${ext}`;
            while (project?.srcTable.some((table) => table.fileName === name)) { index += 1; name = `${base} (${index})${ext}`; }
            void handleUpload(file, name);
          }}>另存为新表</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => {
            const file = duplicateUploadFile; setDuplicateUploadFile(null); if (!file) return;
            const existing = project?.srcTable.find((table) => table.fileName === file.name);
            guardAction(() => { void (async () => { if (existing) await removeTable(existing.id); await handleUpload(file); })(); });
          }}>替换原表</button>
        </ModalFooter>
      </Modal>

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
                    <AntdCompatSelect value={column.dataType} onChange={(event) => setCreateDraft((current) => ({
                      ...current,
                      columns: current.columns.map((item) => item.id === column.id ? { ...item, dataType: event.target.value as ColumnType } : item),
                    }))}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="enum">enum</option>
                    </AntdCompatSelect>
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

      <Modal open={showFormGenerator} onClose={() => setShowFormGenerator(false)} width="760px" maxWidth="94vw">
        <ModalHeader title="从数据生成可运行表单" onClose={() => setShowFormGenerator(false)} />
        <div className="modal-body data-preview-wizard">
          <div className="project-wizard-summary-card">
            <strong>{selectedTable?.fileName} / {activeSheetData?.name}</strong>
            <div className="project-wizard-summary-list">
              <p>系统会自动创建控件、字段绑定、必填校验、保存按钮{activeSheetData && inferLikelyKey(activeSheetData) ? '和主键写回流程' : '。当前未识别主键，暂不创建写回流程'}。</p>
            </div>
          </div>
          <div className="data-preview-wizard-panel">
            <label><span>表单名称</span><input value={generateFormDraft.name} onChange={(event) => setGenerateFormDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>用途</span><AntdCompatSelect value={generateFormDraft.purpose} onChange={(event) => {
              const purpose = event.target.value as GenerateFormDraft['purpose'];
              const readonly = purpose === 'detail' || purpose === 'statistics';
              setGenerateFormDraft((current) => ({ ...current, purpose, includeSave: readonly ? false : true, includeReset: readonly ? false : current.includeReset, name: current.name.replace(/(录入|查询修改|审批|详情|统计)$/, '') + ({ entry: '录入', 'lookup-edit': '查询修改', approval: '审批', detail: '详情', statistics: '统计' } as const)[purpose] }));
            }}><option value="entry">录入</option><option value="lookup-edit">查询修改</option><option value="approval">审批</option><option value="detail">明细查看</option><option value="statistics">统计</option></AntdCompatSelect></label>
            <label>
              <span>每行字段数</span>
              <AntdCompatSelect value={generateFormDraft.columns} onChange={(event) => setGenerateFormDraft((current) => ({ ...current, columns: Number(event.target.value) as 1 | 2 | 3 }))}>
                <option value={1}>1 列</option><option value={2}>2 列</option><option value={3}>3 列</option>
              </AntdCompatSelect>
            </label>
            <div className="settings-toggle-list">
              <label className="settings-option-item"><input type="checkbox" disabled={generateFormDraft.purpose === 'detail' || generateFormDraft.purpose === 'statistics'} checked={generateFormDraft.includeSave} onChange={(event) => setGenerateFormDraft((current) => ({ ...current, includeSave: event.target.checked }))} /><span>生成“校验并保存”按钮与流程</span></label>
              <label className="settings-option-item"><input type="checkbox" disabled={generateFormDraft.purpose === 'detail' || generateFormDraft.purpose === 'statistics'} checked={generateFormDraft.includeReset} onChange={(event) => setGenerateFormDraft((current) => ({ ...current, includeReset: event.target.checked }))} /><span>生成重置按钮</span></label>
            </div>
            <div className="data-preview-section-title">
              <h4>选择字段（{generateFormDraft.selectedFields.length}/{activeSheetData?.columns.length || 0}）</h4>
              <div className="data-preview-inline-actions">
                <button type="button" className="ui-btn ui-btn-xs" onClick={() => setGenerateFormDraft((current) => ({ ...current, selectedFields: activeSheetData?.columns.map((column) => column.name) || [] }))}>全选</button>
                <button type="button" className="ui-btn ui-btn-xs" onClick={() => setGenerateFormDraft((current) => ({ ...current, selectedFields: [] }))}>清空</button>
              </div>
            </div>
            <div className="settings-option-grid">
              {activeSheetData?.columns.map((column) => {
                const inferred = inferredGeneratorFields.find((field) => field.name === column.name);
                return <label key={column.name} className="settings-option-item">
                  <input type="checkbox" checked={generateFormDraft.selectedFields.includes(column.name)} onChange={(event) => setGenerateFormDraft((current) => ({ ...current, selectedFields: event.target.checked ? [...current.selectedFields, column.name] : current.selectedFields.filter((field) => field !== column.name) }))} />
                  <span>{column.name}{inferred ? ` · ${inferred.controlType}${inferred.required ? ' · 必填' : ''}${inferred.readonly ? ' · 只读' : ''}` : ''}</span>
                </label>;
              })}
            </div>
            {generateFormError && <div className="property-editor-warning">{generateFormError}</div>}
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setShowFormGenerator(false)}>取消</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => void handleGenerateForm()} disabled={!generateFormDraft.name.trim() || !generateFormDraft.selectedFields.length}>创建并进入表单设计</button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
