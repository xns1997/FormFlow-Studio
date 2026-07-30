import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi } from 'ag-grid-community';
import { ServerSideRowModelModule } from 'ag-grid-enterprise';
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
import {
  formatSequenceValue,
  getNextSequenceNumber,
  normalizeSequenceRule,
  resolveSequenceDateTokens,
} from '../../services/data/sequenceRules';
import { describeApi, projectApi } from '../../services/io/api';
import { createServerSideDatasource, refreshServerSideDatasource } from '../../services/data/serverSideDatasource';
import { FilterBar } from '../../components/FilterBar';
import {
  HistogramChart,
  CategoryBarChart,
  PieChart,
  CorrelationHeatmap,
  QualityRadarChart,
  MissingValueHeatmap,
  BoxPlotChart,
} from '../../components/DataCharts';
import DataTemplateRecommendationModal from './DataTemplateRecommendationModal';

ModuleRegistry.registerModules([AllCommunityModule, ServerSideRowModelModule]);

type DataTab = 'table' | 'describe' | 'config';
type ColumnType = SrcColumnInfo['dataType'];
type DataPreviewFeedback = {
  type: 'success' | 'error' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};
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

function formatDataPreviewError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const status = message.match(/API Error:\s*(\d{3})/i)?.[1];
  if (status === '502' || status === '503' || status === '504') return `数据服务暂时不可用（${status}），请稍后重试`;
  if (status) return `${fallback}（${status}）`;
  return message || fallback;
}

export default function DataPreviewPage({
  onOpenTemplateCenter = () => {},
}: {
  onOpenTemplateCenter?: (view?: 'library' | 'results') => void;
}) {
  const [searchParams] = useSearchParams();
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
  const [feedback, setFeedback] = useState<DataPreviewFeedback | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [describeReport, setDescribeReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DataTab>('table');
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi | null>(null);

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
  const [columnSequenceEnabledDraft, setColumnSequenceEnabledDraft] = useState(false);
  const [columnSequenceStartDraft, setColumnSequenceStartDraft] = useState('1');
  const [columnSequenceStepDraft, setColumnSequenceStepDraft] = useState('1');
  const [columnSequenceFormatterDraft, setColumnSequenceFormatterDraft] = useState('{n}');
  const [columnSequenceOnlyWhenEmptyDraft, setColumnSequenceOnlyWhenEmptyDraft] = useState(true);
  const [showDeleteColumnConfirm, setShowDeleteColumnConfirm] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('string');
  const [newColumnDefaultValue, setNewColumnDefaultValue] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [selectedTemplateFields, setSelectedTemplateFields] = useState<string[]>([]);
  const [showTemplateRecommendations, setShowTemplateRecommendations] = useState(false);
  const [showExternalDsModal, setShowExternalDsModal] = useState(false);
  const [externalDsDraft, setExternalDsDraft] = useState({ name: '', type: 'mysql' as string, host: '', port: '3306', database: '', user: '', password: '', query: '', url: '', method: 'GET', dataPath: '' });
  const [externalDsTesting, setExternalDsTesting] = useState(false);
  const [externalDsTestResult, setExternalDsTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manuallyResizedColumns, setManuallyResizedColumns] = useState<Set<string>>(new Set());

  const projectId = project?.config?.id;
  const selectedTable = project?.srcTable.find((table) => table.id === selectedTableId) || null;
  const activeSheet = selectedTable?.sheets[activeSheetIdx] || null;

  // Server-side datasource for AG Grid virtual scrolling
  const serverSideDatasource = useMemo(() => {
    if (!projectId || !selectedTableId || !activeSheet) return null;
    return createServerSideDatasource({
      projectId,
      tableId: selectedTableId,
      sheetName: activeSheet.name,
      getSearch: () => query.search,
      getKeySearch: () => query.keySearch,
      onError: (message) => setFeedback({ type: 'error', message }),
      onDataLoaded: (total) => setQueryTotal(total),
    });
  }, [projectId, selectedTableId, activeSheet?.name]);

  // Update datasource when it changes
  useEffect(() => {
    if (gridApiRef.current && serverSideDatasource) {
      gridApiRef.current.setGridOption('serverSideDatasource', serverSideDatasource);
    }
  }, [serverSideDatasource]);

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
  useEffect(() => {
    if (selectedCol) {
      setColumnNameDraft(selectedCol.name);
      setColumnTypeDraft(selectedCol.dataType);
      setColumnDescriptionDraft(currentConfig?.columnDescriptions[selectedCol.name] || selectedCol.description || '');
      setColumnTagsDraft((currentConfig?.columnTags[selectedCol.name] || selectedCol.tags || []).join(', '));
      const sequenceRule = currentConfig?.sequenceRules?.[selectedCol.name];
      const normalizedRule = normalizeSequenceRule(sequenceRule);
      setColumnSequenceEnabledDraft(!!sequenceRule);
      setColumnSequenceStartDraft(String(normalizedRule.start));
      setColumnSequenceStepDraft(String(normalizedRule.step));
      setColumnSequenceFormatterDraft(normalizedRule.formatter);
      setColumnSequenceOnlyWhenEmptyDraft(normalizedRule.onlyWhenEmpty !== false);
      setShowDeleteColumnConfirm(false);
    } else {
      setColumnNameDraft('');
      setColumnTypeDraft('string');
      setColumnDescriptionDraft('');
      setColumnTagsDraft('');
      setColumnSequenceEnabledDraft(false);
      setColumnSequenceStartDraft('1');
      setColumnSequenceStepDraft('1');
      setColumnSequenceFormatterDraft('{n}');
      setColumnSequenceOnlyWhenEmptyDraft(true);
      setShowDeleteColumnConfirm(false);
    }
  }, [selectedCol?.name, selectedCol?.dataType, currentConfig?.columnDescriptions, currentConfig?.columnTags, currentConfig?.sequenceRules]);

  const sequenceTemplatePresets = useMemo(
    () => [
      { label: '纯数字', value: '{n}' },
      { label: '四位补零', value: 'P-{n:4}' },
      { label: '年月流水号', value: 'BX-{yyyyMM}-{n:4}' },
      { label: '日期流水号', value: 'SN-{yyyyMMdd}-{n:3}' },
    ],
    [],
  );

  const sequenceTokenHints = useMemo(
    () => ['{n}', '{n:4}', '{yyyyMM}', '{yyyyMMdd}', '{yyyy}', '{yy}', '{MM}', '{dd}'],
    [],
  );

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
        const isTemplateField = selectedTemplateFields.includes(header);
        return {
          headerName: header,
          field: header,
          headerComponent: (params: any) => (
            <div className="data-preview-selectable-header">
              <input
                type="checkbox"
                checked={isTemplateField}
                aria-label={`选择字段 ${header}`}
                title={`选择字段 ${header}`}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedTemplateFields((current) => checked
                    ? current.includes(header) ? current : [...current, header]
                    : current.filter((field) => field !== header));
                }}
              />
              <button
                type="button"
                className="data-preview-header-sort"
                aria-label={`按 ${header} 排序`}
                onClick={(event) => params.progressSort(event.shiftKey)}
              >
                <span>{header}</span>
                <span className="data-preview-sort-indicator" aria-hidden="true">
                  {params.column?.getSort() === 'asc' ? '↑' : params.column?.getSort() === 'desc' ? '↓' : '↕'}
                </span>
              </button>
            </div>
          ),
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
          headerClass: [isKeyField ? 'ag-col-key' : '', isTemplateField ? 'data-preview-template-header-selected' : ''].filter(Boolean).join(' '),
          cellClass: (params: any) => [
            isKeyField ? 'ag-cell-key' : '',
            isTemplateField ? 'data-preview-template-field-selected' : '',
            pendingChanges.has(params.data?.__rowKey) && pendingChanges.get(params.data?.__rowKey)?.[header] ? 'ag-cell-dirty' : '',
            validationErrors.has(`${params.data?.__rowKey}:${header}`) ? 'ag-cell-validation-error' : '',
          ].filter(Boolean).join(' '),
          tooltipValueGetter: (params: any) => validationErrors.get(`${params.data?.__rowKey}:${header}`) || String(params.value ?? ''),
        } satisfies ColDef;
      }),
    ];
  }, [activeSheet, currentConfig, keyFieldSet, saving, pendingChanges, selectedTemplateFields, validationErrors]);

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
    // Track manually resized columns
    setManuallyResizedColumns((prev) => {
      const next = new Set(prev);
      next.add(colId);
      return next;
    });
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
    if (!activeSheet || !currentConfig) return;
    const newRow: PreviewRow = { __rowKey: `new:${Date.now()}`, __rowIndex: totalRows + pendingAdds.length, __isNew: true };
    activeSheet.headers.forEach((header) => { newRow[header] = ''; });
    const referenceRows = rows;
    for (const header of activeSheet.headers) {
      const rule = currentConfig.sequenceRules?.[header];
      if (!rule) continue;
      if (rule.onlyWhenEmpty !== false && newRow[header] !== '') continue;
      const nextNumber = getNextSequenceNumber(referenceRows, header, rule);
      newRow[header] = formatSequenceValue(nextNumber, rule.formatter);
    }
    setPendingAdds((prev) => [...prev, newRow]);
    setRows((prev) => [...prev, newRow]);
    setSaveState('dirty');
  }, [activeSheet, currentConfig, totalRows, pendingAdds, rows]);

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
      setSelectedTemplateFields([]);
      setShowTemplateRecommendations(false);
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

  const handleUpload = useCallback(async (file: File, displayName = file.name, replaceTableId?: string) => {
    setLoading(true);
    setUploadStage('上传文件');
    try {
      if (!projectId) throw new Error('项目尚未加载');
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['csv', 'tsv', 'json', 'xlsx', 'xls', 'xml', 'parquet'].includes(ext)) throw new Error(`不支持的文件格式：.${ext}。支持: xlsx, xls, csv, tsv, json, xml, parquet`);
      const result = await projectApi.importDataSource(projectId, file, {
        mode: replaceTableId ? 'replace' : 'create',
        tableId: replaceTableId,
        fileName: displayName,
      });
      const table = result.table as SrcTableEntry;
      await refreshProject();
      setRows(withRowIds(table.sheets[0]?.preview || []));
      setTotalRows(table.sheets[0]?.rowCount || 0);
      setSelectedTableId(table.id);
      setActiveSheetIdx(0);
      setSelectedColIdx(null);
      setSelectedRowIdx(null);
      setSelectedRowKey(null);
      setActiveTab('table');
      setFeedback({ type: 'success', message: `已导入 ${displayName}，共 ${table.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行` });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '文件解析失败' });
    } finally {
      setLoading(false);
      setUploadStage('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [projectId, refreshProject]);

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
      const requestedTableId = searchParams.get('table');
      const table = project.srcTable.find((item) => item.id === requestedTableId) || project.srcTable[0];
      const requestedSheet = searchParams.get('sheet');
      const sheetIndex = Math.max(0, table.sheets.findIndex((item) => item.name === requestedSheet));
      const viewKey = table.sheets[sheetIndex] ? `${table.id}:${table.sheets[sheetIndex].name}` : '';
      const initialQuery = loadPersonalView(projectId, viewKey) || defaultPreviewQuery();
      setSelectedTableId(table.id);
      setActiveSheetIdx(sheetIndex);
      setQuery(initialQuery);
      setSearchDraft(initialQuery.search);
    }
  }, [project?.srcTable, selectedTableId, projectId, searchParams]);

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
    // Server-side datasource handles data loading automatically
    // Just reset selection state when context changes
    setSelectedColIdx(null);
    setSelectedRowIdx(null);
    setDescribeReport(null);
    // Refresh server-side datasource when context changes
    if (gridApiRef.current) {
      refreshServerSideDatasource(gridApiRef.current);
    }
  }, [projectId, selectedTableId, activeSheetIdx, activeSheet?.name, reloadToken]);

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
      if (gridApiRef.current) refreshServerSideDatasource(gridApiRef.current);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    const compactWindow = window.matchMedia('(max-width: 1279px)');
    const adaptInspector = (event: MediaQueryListEvent | MediaQueryList) => setInspectorOpen(!event.matches);
    adaptInspector(compactWindow);
    compactWindow.addEventListener('change', adaptInspector);
    return () => compactWindow.removeEventListener('change', adaptInspector);
  }, []);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container || !currentConfig?.autoFitColumns || Object.keys(currentConfig.columnWidths).length > 0) return;
    const fitVisibleGrid = () => {
      if (container.clientWidth > 0 && gridApiRef.current && !gridApiRef.current.isDestroyed()) gridApiRef.current.sizeColumnsToFit();
    };
    fitVisibleGrid();
    const observer = new ResizeObserver(fitVisibleGrid);
    observer.observe(container);
    return () => observer.disconnect();
  }, [currentConfig?.autoFitColumns, currentConfig?.columnWidths, activeTab]);

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
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('.unified-mode-btn, .project-workspace-link, .unified-toolbar a');
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
      const sequenceRule = columnSequenceEnabledDraft
          ? normalizeSequenceRule({
            start: Number(columnSequenceStartDraft),
            step: Number(columnSequenceStepDraft),
            formatter: columnSequenceFormatterDraft,
            onlyWhenEmpty: columnSequenceOnlyWhenEmptyDraft,
          })
        : null;
      const nextSequenceRules = { ...(nextSheetConfig.sequenceRules || {}) };
      if (nextName !== currentName) delete nextSequenceRules[currentName];
      if (sequenceRule) nextSequenceRules[targetName] = sequenceRule;
      else delete nextSequenceRules[targetName];
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
                  sequenceRules: nextSequenceRules,
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
  }, [selectedTable, activeSheet, selectedCol, columnNameDraft, columnTypeDraft, columnDescriptionDraft, columnTagsDraft, columnSequenceEnabledDraft, columnSequenceStartDraft, columnSequenceStepDraft, columnSequenceFormatterDraft, columnSequenceOnlyWhenEmptyDraft, applyTableMutation]);

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

  const selectAllVisibleTemplateFields = useCallback(() => {
    setSelectedTemplateFields(activeSheetData?.columns
      .filter((column) => !column.hidden && column.visible !== false)
      .map((column) => column.name) || []);
  }, [activeSheetData]);

  const selectAllAndOpenTemplateRecommendations = useCallback(() => {
    const fields = activeSheetData?.columns
      .filter((column) => !column.hidden && column.visible !== false)
      .map((column) => column.name) || [];
    setSelectedTemplateFields(fields);
    if (fields.length) setShowTemplateRecommendations(true);
  }, [activeSheetData]);

  return (
    <div className="page-layout data-preview-layout">
      <div className="page-sidebar data-preview-sidebar">
        <div className="page-section-header">
          <span>数据表 ({project?.srcTable.length || 0})</span>
          <div className="data-preview-sidebar-actions">
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowCreateWizard(true)}>+ 建表</button>
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => fileRef.current?.click()}>+ 上传</button>
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowExternalDsModal(true)}>+ 连接</button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.json,.xml,.parquet"
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
              >
                <button
                  type="button"
                  className="data-preview-table-select"
                  aria-current={selectedTableId === table.id ? 'true' : undefined}
                  onClick={() => switchDataContext(table.id, 0)}
                >
                  <span className="sidebar-item-icon" aria-hidden="true">
                    <DesignerIcon name={table.fileType === 'json' ? 'text' : 'table'} />
                  </span>
                  <span className="sidebar-item-info">
                    <span className="sidebar-item-name">{table.fileName}</span>
                    <span className="sidebar-item-meta">{table.sheets.length} 个工作表 · {table.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)} 行</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="sidebar-item-delete"
                  aria-label={`删除数据表 ${table.fileName}`}
                  title="删除数据表"
                  onClick={() => setShowDeleteTableConfirm(table)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="page-main data-preview-main">
        <div className="page-section-header data-preview-main-header">
          <div className="data-preview-viewbar">
            <div className="data-preview-tabbar" role="tablist" aria-label="数据视图">
              <button id="data-preview-tab-table" type="button" role="tab" aria-selected={activeTab === 'table'} aria-controls="data-preview-panel" className={activeTab === 'table' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('table')}>数据表</button>
              <button id="data-preview-tab-describe" type="button" role="tab" aria-selected={activeTab === 'describe'} aria-controls="data-preview-panel" className={activeTab === 'describe' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('describe')}>数据概览</button>
              <button id="data-preview-tab-config" type="button" role="tab" aria-selected={activeTab === 'config'} aria-controls="data-preview-panel" className={activeTab === 'config' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActiveTab('config')}>配置</button>
            </div>
            {activeSheet && <span className="data-preview-summary">{queryTotal !== totalRows ? `${queryTotal} / ${totalRows}` : totalRows} 行 × {activeSheetData?.colCount || 0} 列</span>}
            <button
              type="button"
              className="ui-btn ui-btn-xs data-preview-inspector-toggle"
              aria-pressed={inspectorOpen}
              aria-controls="data-preview-inspector"
              onClick={() => setInspectorOpen((value) => !value)}
            >
              {inspectorOpen ? '隐藏表结构' : '显示表结构'}
            </button>
          </div>
          {activeSheet && activeTab === 'table' && (
            <div className="data-preview-toolbar" role="toolbar" aria-label="数据表操作">
                  <div className="data-preview-tool-group">
                    <label htmlFor="data-preview-search">查找</label>
                    <input id="data-preview-search" type="search" aria-label="全表搜索" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索全部字段" />
                    {(query.search || query.keySearch || Object.keys(query.filterModel).length > 0) && <button type="button" className="ui-btn ui-btn-xs" onClick={() => { setSearchDraft(''); setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, search: '', keySearch: '', filterModel: {} })); if (gridApiRef.current) { gridApiRef.current.setFilterModel(null); refreshServerSideDatasource(gridApiRef.current); } }}>清除筛选</button>}
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
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary ui-btn-xs"
                      disabled={!selectedTemplateFields.length}
                      onClick={() => setShowTemplateRecommendations(true)}
                    >
                      {selectedTemplateFields.length ? '选择模板生成表单' : '先选择字段'}
                    </button>
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
                  <span className={`data-preview-save-state is-${saveState}`} role="status" aria-live="polite">
                    <span className="data-preview-state-icon" aria-hidden="true">{saveState === 'saved' ? '✓' : saveState === 'error' ? '!' : '●'}</span>
                    {saveState === 'saved' ? '已保存' : saveState === 'saving' ? '保存中' : saveState === 'error' ? '保存失败' : `未保存：${changedCellCount} 单元格 / ${pendingAdds.length} 新增 / ${pendingDeletes.size} 删除`}
                  </span>
                  {(query.search || query.keySearch) && <div className="data-preview-filter-chips">
                    {query.search && <button type="button" onClick={() => { setSearchDraft(''); setQuery((current) => ({ ...current, page: 1, search: '' })); if (gridApiRef.current) refreshServerSideDatasource(gridApiRef.current); }}>搜索：{query.search} ×</button>}
                    {query.keySearch && <button type="button" onClick={() => { setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, keySearch: '' })); if (gridApiRef.current) refreshServerSideDatasource(gridApiRef.current); }}>Key：{query.keySearch} ×</button>}
                  </div>}
            </div>
          )}
          {activeSheet && activeTab === 'table' && (
            <FilterBar
              filterModel={query.filterModel}
              columns={(activeSheet.columns || []).map((col) => ({ name: col.name, dataType: col.dataType }))}
              onFilterChange={(field, rule) => {
                setQuery((current) => {
                  const filterModel = { ...current.filterModel };
                  if (rule) {
                    filterModel[field] = rule;
                  } else {
                    delete filterModel[field];
                  }
                  return { ...current, page: 1, filterModel };
                });
                // Also sync with AG Grid's filter model
                if (gridApiRef.current) {
                  if (rule) {
                    gridApiRef.current.setColumnFilterModel(field, rule).then(() => gridApiRef.current?.onFilterChanged());
                  } else {
                    gridApiRef.current.setColumnFilterModel(field, null).then(() => gridApiRef.current?.onFilterChanged());
                  }
                }
              }}
              onClearAll={() => {
                setSearchDraft('');
                setKeyJumpDraft('');
                setQuery((current) => ({ ...current, page: 1, search: '', keySearch: '', filterModel: {} }));
                if (gridApiRef.current) {
                  gridApiRef.current.setFilterModel(null);
                  refreshServerSideDatasource(gridApiRef.current);
                }
              }}
            />
          )}
          {activeSheet && activeTab === 'table' && selectedTemplateFields.length > 0 && (
            <div className="data-preview-template-selection" role="status" aria-live="polite">
              <span><strong>已选 {selectedTemplateFields.length} 个字段</strong><small>{selectedTemplateFields.slice(0, 4).join('、')}{selectedTemplateFields.length > 4 ? '…' : ''}</small></span>
              <div>
                <button type="button" className="ui-btn ui-btn-xs" onClick={selectAllVisibleTemplateFields}>全选可见</button>
                <button type="button" className="ui-btn ui-btn-xs" onClick={() => setSelectedTemplateFields([])}>清空</button>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={() => setShowTemplateRecommendations(true)}>选择模板生成表单</button>
              </div>
            </div>
          )}
        </div>

        <div
          id="data-preview-panel"
          className="page-section-body data-preview-main-body"
          role="tabpanel"
          aria-labelledby={`data-preview-tab-${activeTab}`}
          style={{ padding: 0 }}
        >
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
                <div className="data-preview-loading" role="status" aria-live="polite">
                  <span className="data-preview-progress" aria-hidden="true" />
                  <strong>{uploadStage || '正在加载数据'}</strong>
                  <span>请稍候…</span>
                </div>
              ) : totalRows === 0 && rows.length === 0 ? (
                <div className="data-preview-empty-panel">
                  <h3>这张表还没有数据</h3>
                  <p>可以直接录入第一行，也可以导入现有文件后继续配置。</p>
                  <div className="data-preview-inline-actions">
                    <button type="button" className="ui-btn ui-btn-primary" onClick={handleAddRow}>新增第一行</button>
                    <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>导入数据</button>
                    <button type="button" className="ui-btn" onClick={() => setActiveTab('config')}>配置字段</button>
                    <button type="button" className="ui-btn" onClick={selectAllAndOpenTemplateRecommendations}>选择模板生成表单</button>
                  </div>
                </div>
              ) : (
                <div
                  ref={gridContainerRef}
                  className={[
                    'ag-theme-quartz',
                    'data-preview-grid',
                    currentConfig?.alternateRowColor === false ? 'no-zebra' : '',
                    currentConfig?.showGridLines === false ? 'no-grid-lines' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ width: '100%', height: '100%' }}
                  role="region"
                  aria-label={`${activeSheet.name} 数据表格`}
                  aria-busy={loading}
                >
                  <AgGridReact
                    rowModelType="serverSide"
                    serverSideDatasource={serverSideDatasource || undefined}
                    columnDefs={colDefs}
                    defaultColDef={{
                      resizable: true,
                      sortable: currentConfig?.sortEnabled !== false,
                      filter: currentConfig?.filterEnabled !== false,
                    }}
                    rowHeight={currentConfig?.rowHeight}
                    headerHeight={currentConfig?.headerHeight}
                    rowSelection={{ mode: 'singleRow' }}
                    getRowId={(params) => String(params.data.__rowKey)}
                    cacheBlockSize={500}
                    maxBlocksInCache={10}
                    onGridReady={(event) => {
                      gridApiRef.current = event.api;
                      if (serverSideDatasource) {
                        event.api.setGridOption('serverSideDatasource', serverSideDatasource);
                      }
                      if (gridContainerRef.current?.clientWidth && currentConfig?.autoFitColumns && Object.keys(currentConfig.columnWidths).length === 0) event.api.sizeColumnsToFit();
                    }}
                    getRowClass={(params) => {
                      if (params.data.__isNew) return 'ag-row-new';
                      if (pendingDeletes.has(params.data.__rowKey)) return 'ag-row-deleted';
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
                      setSelectedRowKey(event.data?.__rowKey || null);
                    }}
                    onSelectionChanged={(event) => {
                      const selected = event.api.getSelectedRows()[0] as PreviewRow | undefined;
                      setSelectedRowIdx(selected?.__rowIndex ?? null);
                      setSelectedRowKey(selected?.__rowKey || null);
                    }}
                    onFilterChanged={(event) => {
                      const filterModel = event.api.getFilterModel();
                      setQuery((current) => ({ ...current, page: 1, filterModel }));
                      // Server-side datasource refreshes automatically via getRows
                    }}
                    onSortChanged={(event) => {
                      const sortModel = event.api.getColumnState().filter((column) => column.sort).map((column) => ({ colId: column.colId, sort: column.sort || undefined })) as PreviewQuery['sortModel'];
                      setQuery((current) => ({ ...current, page: 1, sortModel }));
                      // Server-side datasource refreshes automatically via getRows
                    }}
                    onCellValueChanged={onCellValueChanged}
                  />
                </div>
              )}
              <div className="data-preview-pager">
                <div className="data-preview-pager-group data-preview-pager-group-nav">
                  <span className="data-preview-pager-status">共 {queryTotal} 行{queryTotal !== totalRows ? `（筛选自 ${totalRows} 行）` : ''}</span>
                </div>
                <div className="data-preview-pager-group data-preview-pager-group-key">
                  <label><span>Key</span><input aria-label="跳转到 Key" value={keyJumpDraft} onChange={(event) => setKeyJumpDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setQuery((current) => ({ ...current, keySearch: keyJumpDraft.trim() })); if (gridApiRef.current) refreshServerSideDatasource(gridApiRef.current); } }} /></label>
                  <button type="button" className="ui-btn ui-btn-xs" disabled={!keyJumpDraft.trim()} onClick={() => { setQuery((current) => ({ ...current, keySearch: keyJumpDraft.trim() })); if (gridApiRef.current) refreshServerSideDatasource(gridApiRef.current); }}>定位</button>
                </div>
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
                  {/* Insight Summary */}
                  {(() => {
                    const insights: string[] = [];
                    const r = describeReport;
                    insights.push(`该数据集包含 ${r.overview?.rows || 0} 行 × ${r.overview?.columns || 0} 列，整体质量评分 ${r.qualityScore || 0}/100。`);
                    const missingCols = (r.columns || []).filter((c: any) => parseFloat(c.nullPercent) > 5);
                    if (missingCols.length > 0) insights.push(`${missingCols.length} 列存在显著缺失值，其中"${missingCols[0].name}"缺失率最高（${missingCols[0].nullPercent}）。`);
                    const outlierCols = (r.columns || []).filter((c: any) => c.hasOutliers);
                    if (outlierCols.length > 0) insights.push(`${outlierCols.length} 个数值列存在异常值。`);
                    const keyCandidates = (r.columns || []).filter((c: any) => c.cardinality === 'high' && parseFloat(c.nullPercent) === 0);
                    if (keyCandidates.length > 0) insights.push(`推荐主键候选："${keyCandidates[0].name}"（唯一值 ${keyCandidates[0].uniqueCount}）。`);
                    if (r.overview?.duplicateRows > 0) insights.push(`发现 ${r.overview.duplicateRows} 行重复数据（${r.overview.duplicatePercent}）。`);
                    return (
                      <div className="describe-insight-summary">
                        {insights.map((text, i) => <p key={i}>{text}</p>)}
                      </div>
                    );
                  })()}

                  <p className="data-preview-analysis-meta">分析范围：{selectedTable?.fileName} / {activeSheet.name} · 当前为缓存结果，保存数据后可重新分析</p>

                  {/* Stats Cards */}
                  <div className="describe-overview">
                    <div className="describe-stat"><strong>{describeReport.overview?.rows || 0}</strong><span>行</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.columns || 0}</strong><span>列</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.memoryUsage || '-'}</strong><span>内存</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.duplicateRows || 0}</strong><span>重复行</span></div>
                    <div className="describe-stat"><strong>{describeReport.overview?.missingPercent || '0%'}</strong><span>缺失率</span></div>
                    <div className="describe-stat"><strong>{describeReport.qualityScore || 0}</strong><span>质量分</span></div>
                  </div>

                  {/* Charts Row: Quality Radar + Missing Heatmap */}
                  <div className="describe-charts-row">
                    <div className="describe-chart-card">
                      <h4>数据质量</h4>
                      <QualityRadarChart report={describeReport} />
                    </div>
                    <div className="describe-chart-card">
                      <h4>缺失值分布</h4>
                      <MissingValueHeatmap columns={describeReport.columns || []} totalRows={describeReport.overview?.rows || 1} />
                    </div>
                  </div>

                  {/* Column Analysis */}
                  <div className="describe-section">
                    <h4>字段分析</h4>
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
                          <div className="describe-col-chart">
                            {col.stats && (col.type === 'number' || col.type === 'numeric') && <BoxPlotChart column={col} />}
                            {col.topValues && col.topValues.length > 0 && (col.cardinality === 'low' || col.topValues.length <= 8
                              ? <PieChart column={col.name} topValues={col.topValues} />
                              : <CategoryBarChart column={col.name} topValues={col.topValues} />
                            )}
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

                  {/* Distributions */}
                  {describeReport.distributions && describeReport.distributions.length > 0 && (
                    <div className="describe-section">
                      <h4>数值分布</h4>
                      <div className="describe-charts-grid">
                        {describeReport.distributions.map((dist: any, i: number) => (
                          <div key={i} className="describe-chart-card">
                            <h5>{dist.column}</h5>
                            <HistogramChart distribution={dist} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Correlation Heatmap */}
                  {describeReport.correlations && Object.keys(describeReport.correlations).length >= 2 && (
                    <div className="describe-section">
                      <h4>相关性矩阵</h4>
                      <CorrelationHeatmap correlations={describeReport.correlations} />
                    </div>
                  )}
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
                        <button type="button" className="ui-btn ui-btn-xs" onClick={() => void updateConfig({
                          showRowNumbers: true,
                          alternateRowColor: true,
                          showGridLines: true,
                          filterEnabled: true,
                          sortEnabled: true,
                        })}>重置</button>
                      </div>
                      <div className="settings-toggle-list">
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.showRowNumbers !== false} onChange={(event) => void updateConfig({ showRowNumbers: event.target.checked })} /><span>显示行号</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.alternateRowColor} onChange={(event) => void updateConfig({ alternateRowColor: event.target.checked })} /><span>交替行颜色</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.showGridLines} onChange={(event) => void updateConfig({ showGridLines: event.target.checked })} /><span>显示网格线</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.filterEnabled} onChange={(event) => void updateConfig({ filterEnabled: event.target.checked })} /><span>启用筛选</span></label>
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.sortEnabled} onChange={(event) => void updateConfig({ sortEnabled: event.target.checked })} /><span>启用排序</span></label>
                      </div>
                    </section>

                    <section className="settings-card settings-group">
                      <div className="settings-card-header">
                        <div className="settings-card-title">
                          <h4>列宽管理</h4>
                          <p>查看和管理手动调整过的列宽。仅显示手动拖拽修改过的列。</p>
                        </div>
                        {manuallyResizedColumns.size > 0 && (
                          <button type="button" className="ui-btn ui-btn-xs" onClick={() => {
                            setManuallyResizedColumns(new Set());
                            void updateConfig({ columnWidths: {} });
                          }}>重置全部</button>
                        )}
                      </div>
                      {manuallyResizedColumns.size === 0 ? (
                        <p className="config-empty-hint">暂无手动调整的列宽。拖拽列边框可调整列宽。</p>
                      ) : (
                        <div className="config-column-width-list">
                          {Array.from(manuallyResizedColumns).map((colId) => (
                            <div key={colId} className="config-column-width-item">
                              <span className="config-column-width-name">{colId}</span>
                              <span className="config-column-width-value">{currentConfig.columnWidths[colId] || '-'}px</span>
                              <button type="button" className="ui-btn ui-btn-xs" onClick={() => {
                                setManuallyResizedColumns((prev) => { const next = new Set(prev); next.delete(colId); return next; });
                                const { [colId]: _, ...rest } = currentConfig.columnWidths;
                                void updateConfig({ columnWidths: rest });
                              }}>重置</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div id="data-preview-inspector" className={`page-inspector data-preview-inspector ${inspectorOpen ? 'is-open' : 'is-collapsed'}`} hidden={!inspectorOpen}>
        <div className="page-section-header">
          <span>{selectedCol ? `列：${selectedCol.name}` : '表结构编辑'}</span>
          <button type="button" className="data-preview-inspector-close" aria-label="关闭表结构编辑器" onClick={() => setInspectorOpen(false)}>×</button>
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
                    <section className="data-preview-sequence-card">
                      <label className="data-preview-toggle">
                        <input type="checkbox" checked={columnSequenceEnabledDraft} onChange={(event) => setColumnSequenceEnabledDraft(event.target.checked)} />
                        <span>新增行时自动生成自增序列</span>
                      </label>
                      {columnSequenceEnabledDraft && (
                        <div className="data-preview-sequence-grid">
                          <label><span>起始值</span><input type="number" min={0} value={columnSequenceStartDraft} onChange={(event) => setColumnSequenceStartDraft(event.target.value)} /></label>
                          <label><span>步长</span><input type="number" min={1} value={columnSequenceStepDraft} onChange={(event) => setColumnSequenceStepDraft(event.target.value)} /></label>
                          <label><span>格式模板</span><input value={columnSequenceFormatterDraft} onChange={(event) => setColumnSequenceFormatterDraft(event.target.value)} placeholder="例如 P-{n:4}" /></label>
                          <div className="data-preview-sequence-helper">
                            <span>快速套用</span>
                            <div className="data-preview-sequence-preset-list">
                              {sequenceTemplatePresets.map((preset) => (
                                <button key={preset.value} type="button" className={`data-preview-sequence-preset${columnSequenceFormatterDraft === preset.value ? ' is-active' : ''}`} onClick={() => setColumnSequenceFormatterDraft(preset.value)}>
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="data-preview-toggle data-preview-sequence-toggle">
                            <input type="checkbox" checked={columnSequenceOnlyWhenEmptyDraft} onChange={(event) => setColumnSequenceOnlyWhenEmptyDraft(event.target.checked)} />
                            <span>仅在目标单元格为空时自动生成</span>
                          </label>
                          <div className="data-preview-sequence-hints">
                            <span>可用 token</span>
                            <div className="data-preview-sequence-token-list">
                              {sequenceTokenHints.map((token) => (
                                <button key={token} type="button" className="data-preview-sequence-token" onClick={() => setColumnSequenceFormatterDraft((prev) => `${prev}${token}`)}>
                                  {token}
                                </button>
                              ))}
                            </div>
                            <small>支持数字占位和日期前缀，例如 {`BX-{yyyyMM}-{n:4}`}。</small>
                          </div>
                          <div className="data-preview-sequence-preview">
                            <span>预览</span>
                            <strong>{formatSequenceValue(Number(columnSequenceStartDraft) || 1, columnSequenceFormatterDraft || '{n}')}</strong>
                          </div>
                          <div className="data-preview-sequence-preview data-preview-sequence-preview-subtle">
                            <span>模板展开</span>
                            <strong>{resolveSequenceDateTokens(columnSequenceFormatterDraft || '{n}')}</strong>
                          </div>
                        </div>
                      )}
                    </section>
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

      {feedback && (
        <div className={`data-preview-feedback is-${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}>
          <span className="data-preview-feedback-icon" aria-hidden="true">{feedback.type === 'success' ? '✓' : feedback.type === 'error' ? '!' : 'i'}</span>
          <span>{feedback.message}</span>
          {feedback.actionLabel && feedback.onAction && (
            <button type="button" className="data-preview-feedback-action" onClick={() => { const action = feedback.onAction; setFeedback(null); action?.(); }}>{feedback.actionLabel}</button>
          )}
          <button type="button" aria-label="关闭提示" onClick={() => setFeedback(null)}><span aria-hidden="true">×</span></button>
        </div>
      )}

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
            guardAction(() => { void handleUpload(file, file.name, existing?.id); });
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

      {selectedTable && activeSheet && (
        <DataTemplateRecommendationModal
          open={showTemplateRecommendations}
          onClose={() => setShowTemplateRecommendations(false)}
          tableId={selectedTable.id}
          tableName={selectedTable.fileName}
          sheetName={activeSheet.name}
          fields={selectedTemplateFields}
          hasUnsavedChanges={changeCount > 0}
          onSaveData={async () => {
            const saved = await handleSave();
            if (!saved) throw new Error('请先修正表格中的类型错误');
          }}
          onOpenAdvanced={onOpenTemplateCenter}
        />
      )}

      <Modal open={showExternalDsModal} onClose={() => { setShowExternalDsModal(false); setExternalDsTestResult(null); }} maxWidth={560}>
        <ModalHeader title="连接外部数据源" onClose={() => { setShowExternalDsModal(false); setExternalDsTestResult(null); }} />
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 24px' }}>
          <label className="schema-field">
            <span>数据源名称</span>
            <input value={externalDsDraft.name} onChange={(e) => setExternalDsDraft((d) => ({ ...d, name: e.target.value }))} placeholder="例如：生产数据库" />
          </label>
          <label className="schema-field">
            <span>类型</span>
            <AntdCompatSelect value={externalDsDraft.type} onChange={(e) => {
              const type = e.target.value;
              setExternalDsDraft((d) => ({ ...d, type, port: type === 'mysql' ? '3306' : type === 'postgresql' ? '5432' : d.port }));
            }}>
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="api">API (REST)</option>
            </AntdCompatSelect>
          </label>

          {(externalDsDraft.type === 'mysql' || externalDsDraft.type === 'postgresql') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                <label className="schema-field"><span>主机</span><input value={externalDsDraft.host} onChange={(e) => setExternalDsDraft((d) => ({ ...d, host: e.target.value }))} placeholder="localhost" /></label>
                <label className="schema-field"><span>端口</span><input value={externalDsDraft.port} onChange={(e) => setExternalDsDraft((d) => ({ ...d, port: e.target.value }))} placeholder={externalDsDraft.type === 'mysql' ? '3306' : '5432'} /></label>
              </div>
              <label className="schema-field"><span>数据库</span><input value={externalDsDraft.database} onChange={(e) => setExternalDsDraft((d) => ({ ...d, database: e.target.value }))} placeholder="mydb" /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="schema-field"><span>用户名</span><input value={externalDsDraft.user} onChange={(e) => setExternalDsDraft((d) => ({ ...d, user: e.target.value }))} placeholder="root" /></label>
                <label className="schema-field"><span>密码</span><input type="password" value={externalDsDraft.password} onChange={(e) => setExternalDsDraft((d) => ({ ...d, password: e.target.value }))} /></label>
              </div>
              <label className="schema-field"><span>SQL 查询</span><textarea value={externalDsDraft.query} onChange={(e) => setExternalDsDraft((d) => ({ ...d, query: e.target.value }))} placeholder="SELECT * FROM users LIMIT 10000" rows={3} /></label>
            </>
          )}

          {externalDsDraft.type === 'api' && (
            <>
              <label className="schema-field"><span>URL</span><input value={externalDsDraft.url} onChange={(e) => setExternalDsDraft((d) => ({ ...d, url: e.target.value }))} placeholder="https://api.example.com/data" /></label>
              <label className="schema-field">
                <span>方法</span>
                <AntdCompatSelect value={externalDsDraft.method} onChange={(e) => setExternalDsDraft((d) => ({ ...d, method: e.target.value }))}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </AntdCompatSelect>
              </label>
              <label className="schema-field"><span>数据路径（JSONPath）</span><input value={externalDsDraft.dataPath} onChange={(e) => setExternalDsDraft((d) => ({ ...d, dataPath: e.target.value }))} placeholder="data.items（可选，留空自动检测）" /></label>
            </>
          )}

          {externalDsTestResult && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: externalDsTestResult.success ? '#f0fdf4' : '#fef2f2', color: externalDsTestResult.success ? '#166534' : '#991b1b', fontSize: 13 }}>
              {externalDsTestResult.success ? '✓' : '✗'} {externalDsTestResult.message}
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => { setShowExternalDsModal(false); setExternalDsTestResult(null); }}>取消</button>
          <button
            type="button"
            className="ui-btn"
            disabled={externalDsTesting}
            onClick={async () => {
              setExternalDsTesting(true);
              setExternalDsTestResult(null);
              try {
                const conn = externalDsDraft.type === 'api'
                  ? { url: externalDsDraft.url, method: externalDsDraft.method, dataPath: externalDsDraft.dataPath }
                  : { host: externalDsDraft.host, port: Number(externalDsDraft.port), database: externalDsDraft.database, user: externalDsDraft.user, password: externalDsDraft.password };
                const res = await fetch('/api/datasources/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: externalDsDraft.type, connection: conn }),
                });
                const result = await res.json();
                setExternalDsTestResult(result);
              } catch (err) {
                setExternalDsTestResult({ success: false, message: String(err) });
              } finally {
                setExternalDsTesting(false);
              }
            }}
          >
            {externalDsTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={async () => {
              if (!projectId || !externalDsDraft.name) return;
              const conn = externalDsDraft.type === 'api'
                ? { url: externalDsDraft.url, method: externalDsDraft.method, dataPath: externalDsDraft.dataPath }
                : { host: externalDsDraft.host, port: Number(externalDsDraft.port), database: externalDsDraft.database, user: externalDsDraft.user, password: externalDsDraft.password };
              try {
                const res = await fetch(`/api/datasources/${projectId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: externalDsDraft.name, type: externalDsDraft.type, connection: conn, query: externalDsDraft.query, cache: { enabled: false, ttl: 300 }, writeBack: false }),
                });
                const result = await res.json();
                if (result.success) {
                  setShowExternalDsModal(false);
                  setExternalDsTestResult(null);
                  setExternalDsDraft({ name: '', type: 'mysql', host: '', port: '3306', database: '', user: '', password: '', query: '', url: '', method: 'GET', dataPath: '' });
                }
              } catch (err) {
                setExternalDsTestResult({ success: false, message: `保存失败: ${err}` });
              }
            }}
          >
            保存
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
