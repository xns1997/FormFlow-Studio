import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { AntdCompatSelect } from '../../components/AntdFormControls';
import DataPreviewContextMenu, { type DataPreviewMenuItem } from '../../components/DataPreviewContextMenu';
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
  insertColumnInSheet,
  removeColumnFromSheet,
  renameColumnInSheet,
  reorderColumnsInSheet,
} from '../../services/data/tableEditor';
import {
  dataPreviewApi,
  defaultPreviewQuery,
  normalizeCellForType,
  parseClipboardTable,
  validateCellValue,
  type CellUndoChange,
  type PreviewQuery,
  type PreviewRow,
} from '../../services/data/dataPreviewClient';
import { useDataWorkbench } from '../../services/data/workbench';
import {
  formatSequenceValue,
  getNextSequenceNumber,
  normalizeSequenceRule,
  resolveSequenceDateTokens,
} from '../../services/data/sequenceRules';
import { describeApi, projectApi } from '../../services/io/api';
import { FilterBar, FilterEditor, getFilterTypesForDataType, type FilterRule } from '../../components/FilterBar';
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
import { JsonModeView } from '../../services/schemaEditor/JsonModeView';
import { useJsonModeEditor } from '../../services/schemaEditor/useJsonModeEditor';

ModuleRegistry.registerModules([AllCommunityModule]);

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
type ContextMenuState = {
  x: number;
  y: number;
  menu: 'cell' | 'row' | 'header' | 'empty';
  rowKey?: string;
  field?: string;
};
type PasteOverflowState = {
  matrix: string[][];
  anchorRow: number;
  anchorCol: number;
  extraRows: number;
  extraCols: number;
};

function withRowIds(data: Record<string, unknown>[], offset = 0): PreviewRow[] {
  return data.map((row, index) => ({
    ...row,
    __rowKey: `idx:${offset + index}`,
    __rowIndex: offset + index,
  }));
}

function DataPreviewRowNumberCell({ value, data, reorderEnabled, draggingRowKey, dragOverRowKey, onDragStart, onDragOver, onDrop }: any) {
  const rowKey = data?.__rowKey as string | undefined;
  return (
    <span
      className={[
        'data-preview-row-drag-handle',
        draggingRowKey === rowKey ? 'is-dragging' : '',
        reorderEnabled ? '' : 'is-disabled',
      ].filter(Boolean).join(' ')}
      draggable={reorderEnabled}
      title={reorderEnabled ? '拖拽调整行顺序（Alt+↑/↓ 也可）' : '有排序或筛选时不能调整行顺序'}
      onDragStart={(event) => {
        if (!reorderEnabled || !rowKey) { event.preventDefault(); return; }
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(rowKey);
      }}
      onDragOver={(event) => {
        if (!reorderEnabled || !rowKey) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDragOver(rowKey);
      }}
      onDrop={(event) => {
        if (!reorderEnabled || !rowKey) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop(rowKey);
      }}
    >
      <span className="data-preview-row-drag-grip" aria-hidden="true">⋮⋮</span>
      <span className="data-preview-row-drag-value">{String(value ?? '')}</span>
    </span>
  );
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

function orderRowsBy(rows: PreviewRow[], order: string[]): PreviewRow[] {
  const byKey = new Map(rows.map((row) => [row.__rowKey, row]));
  const ordered: PreviewRow[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const row = byKey.get(key);
    if (row && !seen.has(key)) {
      ordered.push(row);
      seen.add(key);
    }
  }
  for (const row of rows) {
    if (!seen.has(row.__rowKey)) ordered.push(row);
  }
  return ordered;
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
  const [jsonPendingSheetKey, setJsonPendingSheetKey] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [queryTotal, setQueryTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [keyJumpDraft, setKeyJumpDraft] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [feedback, setFeedback] = useState<DataPreviewFeedback | null>(null);
  const [describeReport, setDescribeReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DataTab>('table');
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi | null>(null);

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showBatchEdit, setShowBatchEdit] = useState<{ field: string } | null>(null);
  const [batchEditValue, setBatchEditValue] = useState('');
  const [showFillDialog, setShowFillDialog] = useState<{ field: string; rowKey: string; maxRows: number } | null>(null);
  const [fillCount, setFillCount] = useState(1);
  const [pasteOverflow, setPasteOverflow] = useState<PasteOverflowState | null>(null);
  const [showInsertColumn, setShowInsertColumn] = useState<{ anchor: string; direction: 'left' | 'right' } | null>(null);
  const [insertColumnName, setInsertColumnName] = useState('');
  const [insertColumnType, setInsertColumnType] = useState<ColumnType>('string');
  const [insertColumnDefault, setInsertColumnDefault] = useState('');
  const [draggingRowKey, setDraggingRowKey] = useState<string | null>(null);
  const [dragOverRowKey, setDragOverRowKey] = useState<string | null>(null);
  const [dragRange, setDragRange] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [isRangeDragging, setIsRangeDragging] = useState(false);
  const [headerFilterField, setHeaderFilterField] = useState<string | null>(null);
  const [headerFilterPos, setHeaderFilterPos] = useState<{ left: number; top: number } | null>(null);
  const pasteFallbackRef = useRef<HTMLTextAreaElement>(null);
  const rangeAnchorRef = useRef<{ row: number; col: number; x: number; y: number } | null>(null);
  const rangeDraggingRef = useRef(false);
  const headerFilterPopupRef = useRef<HTMLDivElement>(null);

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

  const currentViewKey = selectedTable && activeSheet ? `${selectedTable.id}:${activeSheet.name}` : '';

  const updateConfig = useCallback(async (patch: Partial<TableConfig>) => {
    if (!selectedTable || !activeSheet || !currentConfig) return;
    await saveSheetConfig(selectedTable.id, activeSheet.name, { ...currentConfig, ...patch });
  }, [selectedTable, activeSheet, currentConfig, saveSheetConfig]);

  const tableJsonSemanticContext = useMemo(() => ({
    headers: activeSheet?.headers || [],
  }), [activeSheet?.headers]);

  const handleApplyTableJson = useCallback((value: unknown) => {
    if (!selectedTable || !activeSheet || !currentConfig || !value || typeof value !== 'object') return;
    void saveSheetConfig(selectedTable.id, activeSheet.name, { ...currentConfig, ...(value as Partial<TableConfig>) });
  }, [selectedTable, activeSheet, currentConfig, saveSheetConfig]);

  const tableJson = useJsonModeEditor({
    kind: 'table-config',
    entityKey: currentViewKey || 'none',
    committed: currentConfig,
    semanticContext: tableJsonSemanticContext,
    onApply: handleApplyTableJson,
  });

  useEffect(() => {
    if (!jsonPendingSheetKey) return;
    const [tableId, indexStr] = jsonPendingSheetKey.split(':');
    const index = Number(indexStr);
    if (selectedTable?.id !== tableId || activeSheetIdx !== index) return;
    setJsonPendingSheetKey(null);
    tableJson.enterJson();
  }, [jsonPendingSheetKey, selectedTable?.id, activeSheetIdx, tableJson]);

  const workbench = useDataWorkbench({
    viewKey: currentViewKey,
    autoSave: currentConfig?.autoSave === true,
    keyFields: currentKeyFields,
    projectId,
    tableId: selectedTable?.id,
    sheetName: activeSheet?.name,
    getColumns: () => activeSheetData?.columns || [],
    onCommitted: async () => {
      setFeedback({ type: 'success', message: '数据修改已保存' });
      setDescribeReport(null);
      if (selectedTable && activeSheet) void describeApi.delete(selectedTable.id, activeSheet.name, projectId).catch(() => undefined);
      await refreshProject();
      setReloadToken((value) => value + 1);
    },
    onRefreshed: async () => {
      await refreshProject();
      setReloadToken((value) => value + 1);
    },
    onError: (message) => setFeedback({ type: 'error', message }),
    onApplyRowOrder: (order) => { void updateConfig({ rowOrder: order }); },
  });
  const {
    query,
    setQuery,
    rows,
    setRows,
    selectedColIdx,
    setSelectedColIdx,
    selectedRowIdx,
    setSelectedRowIdx,
    selectedRowKey,
    setSelectedRowKey,
    pendingChanges,
    setPendingChanges,
    pendingAdds,
    setPendingAdds,
    pendingDeletes,
    setPendingDeletes,
    validationErrors,
    setValidationErrors,
    saveState,
    setSaveState,
    saving,
    setSaving,
    dataVersion,
    setDataVersion,
    changeCount,
    changedCellCount,
    commitMutation,
    pushUndo,
    clearUndoForContext,
    scheduleAutoSave,
    performUndo: workbenchPerformUndo,
    performRedo: workbenchPerformRedo,
    commit: workbenchCommit,
    resetPending: workbenchResetPending,
    loadRows: workbenchLoadRows,
  } = workbench;

  const performUndo = useCallback(async () => {
    const outcome = await workbenchPerformUndo();
    if (!outcome.ok) setFeedback({ type: 'info', message: '没有可撤销的操作' });
    else if (outcome.error) setFeedback({ type: 'error', message: outcome.error });
    else if (outcome.unresolved) setFeedback({ type: 'info', message: `已撤销，但有 ${outcome.unresolved} 项因缺少稳定主键未能自动处理` });
  }, [workbenchPerformUndo]);

  const performRedo = useCallback(async () => {
    const outcome = await workbenchPerformRedo();
    if (!outcome.ok) setFeedback({ type: 'info', message: '没有可重做的操作' });
    else if (outcome.error) setFeedback({ type: 'error', message: outcome.error });
    else if (outcome.unresolved) setFeedback({ type: 'info', message: `已重做，但有 ${outcome.unresolved} 项因缺少稳定主键未能自动处理` });
  }, [workbenchPerformRedo]);

  const reorderEnabled = !query.sortModel.some((rule) => rule.sort)
    && Object.keys(query.filterModel).length === 0
    && !query.search.trim()
    && !query.keySearch.trim();

  const safeGridApi = useCallback((): GridApi | null => {
    const api = gridApiRef.current;
    return api && !api.isDestroyed() ? api : null;
  }, []);

  const setColumnFilter = useCallback((field: string, rule: FilterRule | null) => {
    setQuery((current) => {
      const filterModel = { ...current.filterModel };
      if (rule) filterModel[field] = rule;
      else delete filterModel[field];
      return { ...current, page: 1, filterModel };
    });
    const api = safeGridApi();
    if (!api) return;
    if (rule) void api.setColumnFilterModel(field, rule).then(() => api.onFilterChanged());
    else void api.setColumnFilterModel(field, null).then(() => api.onFilterChanged());
  }, [safeGridApi]);

  const guardAction = useCallback((action: () => void) => {
    if (changeCount > 0) setPendingNavigation(() => action);
    else action();
  }, [changeCount]);

  const getSelectedRowsSnapshot = useCallback((): PreviewRow[] => {
    const selected = safeGridApi()?.getSelectedRows() as PreviewRow[] | undefined;
    if (selected && selected.length > 0) return selected;
    if (selectedRowKey) {
      const row = rows.find((item) => item.__rowKey === selectedRowKey);
      return row ? [row] : [];
    }
    return [];
  }, [selectedRowKey, rows, safeGridApi]);

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

  const persistRowOrder = useCallback((order: string[]) => {
    void updateConfig({ rowOrder: order });
  }, [updateConfig]);

  const handleRowDragStart = useCallback((rowKey: string) => {
    setDraggingRowKey(rowKey);
    setDragOverRowKey(null);
  }, []);

  const handleRowDragOver = useCallback((rowKey: string) => {
    if (draggingRowKey && rowKey !== draggingRowKey) setDragOverRowKey(rowKey);
  }, [draggingRowKey]);

  const handleRowDrop = useCallback((targetRowKey: string) => {
    const sourceKey = draggingRowKey;
    setDraggingRowKey(null);
    setDragOverRowKey(null);
    if (!sourceKey || sourceKey === targetRowKey || !reorderEnabled) return;
    const before = rows.map((row) => row.__rowKey);
    const sourceIndex = before.indexOf(sourceKey);
    const targetIndex = before.indexOf(targetRowKey);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...before];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(next.indexOf(targetRowKey), 0, moved);
    setRows(orderRowsBy(rows, next));
    persistRowOrder(next);
    pushUndo({ changes: [], addedRows: [], deletedRows: [], rowOrderBefore: before, rowOrderAfter: next, committed: false });
  }, [draggingRowKey, reorderEnabled, rows, persistRowOrder, pushUndo]);

  const moveSelectedRow = useCallback((direction: 'up' | 'down') => {
    const keys = getSelectedRowsSnapshot().map((row) => row.__rowKey);
    if (keys.length !== 1) return;
    const key = keys[0];
    const before = rows.map((row) => row.__rowKey);
    const index = before.indexOf(key);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= before.length) return;
    const next = [...before];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setRows(orderRowsBy(rows, next));
    persistRowOrder(next);
    pushUndo({ changes: [], addedRows: [], deletedRows: [], rowOrderBefore: before, rowOrderAfter: next, committed: false });
  }, [getSelectedRowsSnapshot, rows, persistRowOrder, pushUndo]);

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
          suppressSizeToFit: true,
          cellClass: 'data-preview-row-number-cell',
          headerClass: 'data-preview-row-number-header',
          cellRenderer: DataPreviewRowNumberCell,
          cellRendererParams: {
            reorderEnabled,
            draggingRowKey,
            dragOverRowKey,
            onDragStart: handleRowDragStart,
            onDragOver: handleRowDragOver,
            onDrop: handleRowDrop,
          },
        }]
      : [];

    return [
      ...rowNumberCol,
      ...activeSheet.headers.map((header) => {
        const isKeyField = keyFieldSet.has(header);
        const isTemplateField = selectedTemplateFields.includes(header);
        const headerIndex = activeSheet.headers.indexOf(header);
        const isColumnSelected = selectedColIdx === headerIndex;
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
              {currentConfig.filterEnabled !== false && (
                <button
                  type="button"
                  className={`data-preview-header-filter${query.filterModel[header] != null ? ' is-active' : ''}`}
                  aria-label={`筛选 ${header}`}
                  title={query.filterModel[header] != null ? '修改筛选条件' : '添加筛选'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setHeaderFilterField(header);
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M1.5 2.5h13L10 8.2v5.3l-4 2V8.2L1.5 2.5z" fill="currentColor" />
                  </svg>
                </button>
              )}
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
          headerClass: [
            isKeyField ? 'ag-col-key' : '',
            isTemplateField ? 'data-preview-template-header-selected' : '',
            isColumnSelected ? 'data-preview-header-selected' : '',
          ].filter(Boolean).join(' '),
          cellClass: (params: any) => [
            isKeyField ? 'ag-cell-key' : '',
            isTemplateField ? 'data-preview-template-field-selected' : '',
            isColumnSelected ? 'data-preview-column-selected' : '',
            dragRange && params.rowIndex != null
              && params.rowIndex >= dragRange.startRow && params.rowIndex <= dragRange.endRow
              && headerIndex >= dragRange.startCol && headerIndex <= dragRange.endCol
              ? 'data-preview-range-cell'
              : '',
            pendingChanges.has(params.data?.__rowKey) && pendingChanges.get(params.data?.__rowKey)?.[header] ? 'ag-cell-dirty' : '',
            validationErrors.has(`${params.data?.__rowKey}:${header}`) ? 'ag-cell-validation-error' : '',
          ].filter(Boolean).join(' '),
          tooltipValueGetter: (params: any) => validationErrors.get(`${params.data?.__rowKey}:${header}`) || String(params.value ?? ''),
        } satisfies ColDef;
      }),
    ];
  }, [activeSheet, currentConfig, keyFieldSet, saving, pendingChanges, selectedTemplateFields, validationErrors, reorderEnabled, draggingRowKey, dragOverRowKey, handleRowDragStart, handleRowDragOver, handleRowDrop, selectedColIdx, dragRange, query.filterModel]);

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
    if (!rowKey) return;
    commitMutation({
      changes: [{ rowKey, field, oldValue, newValue }],
      addedRows: [],
      deletedRows: [],
      committed: false,
    });
  }, [selectedTableId, activeSheet, commitMutation]);

  const buildNewRow = useCallback((position?: number): PreviewRow => {
    const newRow: PreviewRow = {
      __rowKey: `new:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      __rowIndex: position ?? rows.length,
      __isNew: true,
    };
    if (!activeSheet || !currentConfig) return newRow;
    activeSheet.headers.forEach((header) => { newRow[header] = ''; });
    for (const header of activeSheet.headers) {
      const rule = currentConfig.sequenceRules?.[header];
      if (!rule) continue;
      if (rule.onlyWhenEmpty !== false && newRow[header] !== '') continue;
      const nextNumber = getNextSequenceNumber(rows, header, rule);
      newRow[header] = formatSequenceValue(nextNumber, rule.formatter);
    }
    return newRow;
  }, [activeSheet, currentConfig, rows]);

  const handleAddRow = useCallback(() => {
    if (!activeSheet || !currentConfig) return;
    commitMutation({ changes: [], addedRows: [buildNewRow()], deletedRows: [], committed: false });
  }, [activeSheet, currentConfig, buildNewRow, commitMutation]);

  const handleDeleteRows = useCallback((rowKeys: string[]) => {
    const snapshots = rowKeys
      .map((key) => rows.find((row) => row.__rowKey === key))
      .filter((row): row is PreviewRow => !!row);
    if (snapshots.length === 0) return;
    commitMutation({ changes: [], addedRows: [], deletedRows: snapshots, committed: false });
    setSelectedRowIdx(null);
    setSelectedRowKey(null);
    setShowDeleteRowConfirm(false);
  }, [rows, commitMutation]);

  const handleDeleteRow = useCallback(() => {
    const keys = getSelectedRowsSnapshot().map((row) => row.__rowKey);
    handleDeleteRows(keys.length > 0 ? keys : (selectedRowKey ? [selectedRowKey] : []));
  }, [getSelectedRowsSnapshot, selectedRowKey, handleDeleteRows]);

  const handleInsertRow = useCallback((rowKey: string, above: boolean) => {
    const row = rows.find((item) => item.__rowKey === rowKey);
    const position = row ? rows.indexOf(row) + (above ? 0 : 1) : rows.length;
    commitMutation({ changes: [], addedRows: [buildNewRow(position)], deletedRows: [], committed: false });
  }, [rows, buildNewRow, commitMutation]);

  const handleDuplicateRow = useCallback((rowKey: string) => {
    const source = rows.find((row) => row.__rowKey === rowKey);
    if (!source) return;
    const sourceIndex = rows.indexOf(source);
    const clone: PreviewRow = {
      ...Object.fromEntries(Object.entries(source).filter(([key]) => !key.startsWith('__'))),
      __rowKey: `new:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      __rowIndex: sourceIndex + 1,
      __isNew: true,
    };
    commitMutation({ changes: [], addedRows: [clone], deletedRows: [], committed: false });
  }, [rows, commitMutation]);

  const handleBatchEdit = useCallback(() => {
    if (!showBatchEdit || !activeSheet || !activeSheetData) return;
    const field = showBatchEdit.field;
    const column = activeSheetData.columns.find((col) => col.name === field);
    const targetRows = getSelectedRowsSnapshot();
    const targetKeys = targetRows.length > 0
      ? targetRows.map((row) => row.__rowKey)
      : (contextMenu?.rowKey ? [contextMenu.rowKey] : []);
    if (targetKeys.length === 0) {
      setFeedback({ type: 'info', message: '请先选择要批量修改的行' });
      return;
    }
    const locked = currentConfig?.lockedColumns.includes(field) || false;
    const changes: CellUndoChange[] = [];
    let skipped = 0;
    for (const rowKey of targetKeys) {
      const row = rows.find((item) => item.__rowKey === rowKey);
      if (!row) continue;
      if (locked) { skipped += 1; continue; }
      const newValue = normalizeCellForType(batchEditValue, column?.dataType || 'string');
      if (String(row[field] ?? '') === String(newValue ?? '')) continue;
      changes.push({ rowKey, field, oldValue: row[field], newValue });
    }
    if (changes.length === 0) {
      setFeedback({ type: 'info', message: locked ? '目标列已锁定，未修改任何值' : '没有需要修改的值' });
      return;
    }
    commitMutation({ changes, addedRows: [], deletedRows: [], committed: false });
    setShowBatchEdit(null);
    setBatchEditValue('');
    setFeedback({ type: 'success', message: `已更新 ${changes.length} 个单元格${skipped > 0 ? `，跳过 ${skipped} 个锁定单元格` : ''}` });
  }, [showBatchEdit, activeSheet, activeSheetData, getSelectedRowsSnapshot, contextMenu, currentConfig, rows, batchEditValue, commitMutation]);

  const handleFillDown = useCallback(() => {
    if (!showFillDialog || !activeSheet) return;
    const { field, rowKey, maxRows } = showFillDialog;
    const count = Math.max(1, Math.min(fillCount, maxRows));
    const source = rows.find((row) => row.__rowKey === rowKey);
    if (!source) return;
    const sourceValue = source[field];
    const changes: CellUndoChange[] = [];
    let skipped = 0;
    const startIndex = rows.indexOf(source);
    for (let i = 1; i <= count; i += 1) {
      const target = rows[startIndex + i];
      if (!target) break;
      if (currentConfig?.lockedColumns.includes(field)) { skipped += 1; continue; }
      if (String(target[field] ?? '') === String(sourceValue ?? '')) continue;
      changes.push({ rowKey: target.__rowKey, field, oldValue: target[field], newValue: sourceValue });
    }
    if (changes.length === 0) {
      setFeedback({ type: 'info', message: '没有需要填充的值' });
      return;
    }
    commitMutation({ changes, addedRows: [], deletedRows: [], committed: false });
    setShowFillDialog(null);
    setFillCount(1);
    setFeedback({ type: 'success', message: `已向下填充 ${changes.length} 个单元格${skipped > 0 ? `，跳过 ${skipped} 个锁定单元格` : ''}` });
  }, [showFillDialog, fillCount, rows, currentConfig, commitMutation]);

  const copyRangeToClipboard = useCallback(() => {
    if (!dragRange || !activeSheet) return;
    const lines: string[] = [];
    for (let row = dragRange.startRow; row <= dragRange.endRow; row += 1) {
      const source = rows[row];
      if (!source) continue;
      const cells: string[] = [];
      for (let col = dragRange.startCol; col <= dragRange.endCol; col += 1) {
        const field = activeSheet.headers[col];
        cells.push(String(source[field] ?? ''));
      }
      lines.push(cells.join('\t'));
    }
    void navigator.clipboard.writeText(lines.join('\n'));
    setFeedback({ type: 'success', message: `已复制选区 ${dragRange.endRow - dragRange.startRow + 1} 行 × ${dragRange.endCol - dragRange.startCol + 1} 列` });
  }, [dragRange, activeSheet, rows]);

  const clearRange = useCallback(() => {
    if (!dragRange || !activeSheet) return;
    const changes: CellUndoChange[] = [];
    let skipped = 0;
    for (let row = dragRange.startRow; row <= dragRange.endRow; row += 1) {
      const source = rows[row];
      if (!source) continue;
      for (let col = dragRange.startCol; col <= dragRange.endCol; col += 1) {
        const field = activeSheet.headers[col];
        if (currentConfig?.lockedColumns.includes(field)) { skipped += 1; continue; }
        if (source[field] == null || source[field] === '') continue;
        changes.push({ rowKey: source.__rowKey, field, oldValue: source[field], newValue: '' });
      }
    }
    setDragRange(null);
    if (changes.length === 0) {
      setFeedback({ type: 'info', message: skipped > 0 ? '选区内单元格均已锁定' : '选区内没有需要清除的内容' });
      return;
    }
    commitMutation({ changes, addedRows: [], deletedRows: [], committed: false });
    setFeedback({ type: 'success', message: `已清除 ${changes.length} 个单元格${skipped > 0 ? `，跳过 ${skipped} 个锁定单元格` : ''}` });
  }, [dragRange, activeSheet, rows, currentConfig, commitMutation]);

  const handleClearCells = useCallback((field: string, rowKey?: string) => {
    if (!field) return;
    if (dragRange && (dragRange.startRow !== dragRange.endRow || dragRange.startCol !== dragRange.endCol)) {
      clearRange();
      return;
    }
    const targets = rowKey
      ? [rows.find((row) => row.__rowKey === rowKey)].filter((row): row is PreviewRow => !!row)
      : getSelectedRowsSnapshot();
    const locked = currentConfig?.lockedColumns.includes(field) || false;
    const changes: CellUndoChange[] = [];
    for (const target of targets) {
      if (locked) continue;
      if (target[field] == null || target[field] === '') continue;
      changes.push({ rowKey: target.__rowKey, field, oldValue: target[field], newValue: '' });
    }
    if (changes.length === 0) {
      setFeedback({ type: 'info', message: locked ? '该列已锁定编辑' : '没有需要清除的内容' });
      return;
    }
    commitMutation({ changes, addedRows: [], deletedRows: [], committed: false });
    setFeedback({ type: 'success', message: `已清除 ${changes.length} 个单元格` });
  }, [rows, getSelectedRowsSnapshot, currentConfig, commitMutation, dragRange, clearRange]);

  const readClipboardText = useCallback(async (): Promise<string | null> => {
    try {
      if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
    } catch {
      // 剪贴板读取被拒绝或不可用，回退到隐藏 textarea 粘贴
    }
    return null;
  }, []);

  const applyPasteMatrix = useCallback((matrix: string[][], anchorRow: number, anchorCol: number, mode: 'append' | 'discard') => {
    if (!activeSheet || !currentConfig || !activeSheetData) return;
    const headers = activeSheet.headers;
    const changes: CellUndoChange[] = [];
    const addedRows: PreviewRow[] = [];
    let skippedLocked = 0;
    let droppedCols = 0;
    let droppedRows = 0;
    let nextRows = [...rows];
    matrix.forEach((line, r) => {
      const rowIndex = anchorRow + r;
      let row: PreviewRow;
      if (rowIndex < nextRows.length) {
        row = nextRows[rowIndex];
      } else {
        if (mode === 'discard') { droppedRows += 1; return; }
        row = {
          __rowKey: `new:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          __rowIndex: rowIndex,
          __isNew: true,
        };
        headers.forEach((header) => { row[header] = ''; });
        nextRows.push(row);
        addedRows.push(row);
      }
      line.forEach((cellText, c) => {
        const colIndex = anchorCol + c;
        if (colIndex >= headers.length) { droppedCols += 1; return; }
        const field = headers[colIndex];
        if (currentConfig.lockedColumns.includes(field)) { skippedLocked += 1; return; }
        const column = activeSheetData.columns.find((col) => col.name === field);
        const newValue = normalizeCellForType(cellText, column?.dataType || 'string');
        if (String(row[field] ?? '') === String(newValue ?? '')) return;
        changes.push({ rowKey: row.__rowKey, field, oldValue: row[field], newValue });
        row = { ...row, [field]: newValue };
        nextRows[rowIndex] = row;
      });
    });
    if (changes.length === 0 && addedRows.length === 0) {
      setFeedback({ type: 'info', message: '粘贴内容没有产生变化' });
      return;
    }
    commitMutation({ changes, addedRows, deletedRows: [], committed: false });
    const parts = [`已粘贴 ${changes.length} 个单元格`];
    if (addedRows.length) parts.push(`新增 ${addedRows.length} 行`);
    if (skippedLocked) parts.push(`跳过 ${skippedLocked} 个锁定单元格`);
    if (droppedCols) parts.push(`丢弃 ${droppedCols} 个越界列`);
    if (droppedRows) parts.push(`丢弃 ${droppedRows} 个越界行`);
    setFeedback({ type: 'success', message: parts.join('；') });
  }, [activeSheet, activeSheetData, currentConfig, rows, commitMutation]);

  const runPasteText = useCallback((text: string, anchorRow: number, anchorCol: number) => {
    const matrix = parseClipboardTable(text);
    if (matrix.length === 0) {
      setFeedback({ type: 'info', message: '剪贴板没有可粘贴的数据' });
      return;
    }
    const maxCols = matrix.reduce((max, line) => Math.max(max, line.length), 0);
    const extraRows = Math.max(0, anchorRow + matrix.length - rows.length);
    const extraCols = Math.max(0, anchorCol + maxCols - (activeSheet?.headers.length || 0));
    if (extraRows > 0 || extraCols > 0) {
      setPasteOverflow({ matrix, anchorRow, anchorCol, extraRows, extraCols });
      return;
    }
    applyPasteMatrix(matrix, anchorRow, anchorCol, 'discard');
  }, [rows, activeSheet, applyPasteMatrix]);

  const startPaste = useCallback(async () => {
    const focused = safeGridApi()?.getFocusedCell();
    const selected = getSelectedRowsSnapshot();
    const anchorRow = focused?.rowIndex ?? selected[0]?.__rowIndex ?? 0;
    const focusedField = focused && focused.column.getColDef().field ? focused.column.getColDef().field : undefined;
    const anchorCol = focusedField && activeSheet ? Math.max(0, activeSheet.headers.indexOf(focusedField)) : 0;
    const text = await readClipboardText();
    if (text == null) {
      const textarea = pasteFallbackRef.current;
      if (textarea) {
        textarea.focus();
        setFeedback({ type: 'info', message: '无法直接读取剪贴板，请在弹出的输入框内按 Ctrl+V 粘贴' });
      } else {
        setFeedback({ type: 'error', message: '无法读取剪贴板，请手动编辑单元格' });
      }
      return;
    }
    runPasteText(text, anchorRow, anchorCol);
  }, [activeSheet, getSelectedRowsSnapshot, readClipboardText, runPasteText, safeGridApi]);

  const copySelection = useCallback(async () => {
    if (!activeSheet) return;
    if (dragRange && (dragRange.startRow !== dragRange.endRow || dragRange.startCol !== dragRange.endCol)) {
      copyRangeToClipboard();
      return;
    }
    const selected = getSelectedRowsSnapshot();
    const focused = safeGridApi()?.getFocusedCell();
    const focusedField = focused ? focused.column.getColDef().field : undefined;
    if (selected.length <= 1 && focused && focusedField && focusedField !== '__rowNumber') {
      const row = rows[focused.rowIndex];
      await navigator.clipboard.writeText(String(row?.[focusedField] ?? ''));
      setFeedback({ type: 'success', message: '已复制单元格内容' });
      return;
    }
    if (selected.length === 0) return;
    const lines = selected.map((row) => activeSheet.headers.map((header) => String(row[header] ?? '')).join('\t'));
    await navigator.clipboard.writeText(lines.join('\n'));
    setFeedback({ type: 'success', message: `已复制 ${selected.length} 行 × ${activeSheet.headers.length} 列` });
  }, [activeSheet, dragRange, copyRangeToClipboard, getSelectedRowsSnapshot, rows, safeGridApi]);

  const handleColumnMenuAction = useCallback((field: string, action: string) => {
    const index = activeSheet?.headers.indexOf(field) ?? -1;
    if (index < 0) return;
    switch (action) {
      case 'sortAsc':
      case 'sortDesc':
      case 'clearSort':
        safeGridApi()?.applyColumnState({ state: [{ colId: field, sort: action === 'sortAsc' ? 'asc' : action === 'sortDesc' ? 'desc' : null }] });
        break;
      case 'insertLeft':
      case 'insertRight':
        setInsertColumnName(`${field}_新列`);
        setInsertColumnType('string');
        setInsertColumnDefault('');
        setShowInsertColumn({ anchor: field, direction: action === 'insertLeft' ? 'left' : 'right' });
        break;
      case 'rename':
      case 'type':
      case 'settings':
        setSelectedColIdx(index);
        setInspectorOpen(true);
        break;
      case 'selectColumn':
        setSelectedColIdx(index);
        break;
      case 'delete':
        setSelectedColIdx(index);
        setShowDeleteColumnConfirm(true);
        break;
      case 'hide':
        void updateConfig({ hiddenColumns: [...(currentConfig?.hiddenColumns || []), field] });
        break;
      case 'show':
        void updateConfig({ hiddenColumns: (currentConfig?.hiddenColumns || []).filter((name) => name !== field) });
        break;
      case 'freeze':
        void updateConfig({ frozenColumns: index + 1 });
        break;
      case 'lock':
        void updateConfig({ lockedColumns: [...(currentConfig?.lockedColumns || []), field] });
        break;
      case 'unlock':
        void updateConfig({ lockedColumns: (currentConfig?.lockedColumns || []).filter((name) => name !== field) });
        break;
    }
  }, [activeSheet, currentConfig, updateConfig, safeGridApi]);

  const contextMenuItems = useMemo<DataPreviewMenuItem[]>(() => {
    if (!contextMenu) return [];
    const field = contextMenu.field;
    const rowKey = contextMenu.rowKey;
    const row = rowKey ? rows.find((item) => item.__rowKey === rowKey) : undefined;
    const rowIndex = row ? rows.indexOf(row) : -1;
    const fieldIndex = field && activeSheet ? activeSheet.headers.indexOf(field) : -1;
    const locked = !!field && (currentConfig?.lockedColumns.includes(field) || false);
    const lockedReason = locked ? '该列已锁定编辑，可在列头右键解锁' : '';
    const selectedRows = getSelectedRowsSnapshot();
    const selectedCount = selectedRows.length;
    const items: DataPreviewMenuItem[] = [];

    if (contextMenu.menu === 'row') {
      items.push({
        key: 'selectRow',
        label: '选择整行',
        onSelect: () => {
          if (!rowKey) return;
          const node = safeGridApi()?.getRowNode(rowKey);
          node?.setSelected(true, false);
        },
      });
    }

    if (contextMenu.menu === 'cell' && field) {
      items.push({
        key: 'edit',
        label: '编辑',
        disabled: locked,
        disabledReason: lockedReason,
        onSelect: () => {
          if (rowIndex >= 0) safeGridApi()?.startEditingCell({ rowIndex, colKey: field });
        },
      });
      items.push({ key: 'copy', label: '复制', onSelect: () => void copySelection() });
      items.push({ key: 'paste', label: '粘贴', onSelect: () => void startPaste() });
      items.push({
        key: 'clear',
        label: '清除内容',
        disabled: locked,
        disabledReason: lockedReason,
        onSelect: () => handleClearCells(field, rowKey),
      });
      const maxRows = rowIndex >= 0 ? Math.max(0, rows.length - rowIndex - 1) : 0;
      items.push({
        key: 'fill',
        label: '填充下方',
        disabled: locked || maxRows === 0,
        disabledReason: locked ? lockedReason : maxRows === 0 ? '下方没有可填充的行' : '',
        onSelect: () => {
          if (!rowKey) return;
          setFillCount(1);
          setShowFillDialog({ field, rowKey, maxRows });
        },
      });
    }

    if (rowKey) {
      items.push({
        key: 'insertAbove',
        label: '插入行（上方）',
        separatorBefore: true,
        onSelect: () => handleInsertRow(rowKey, true),
      });
      items.push({ key: 'insertBelow', label: '插入行（下方）', onSelect: () => handleInsertRow(rowKey, false) });
      items.push({ key: 'duplicate', label: '复制行', onSelect: () => handleDuplicateRow(rowKey) });
      items.push({
        key: 'delete',
        label: selectedCount > 1 ? `删除选中 ${selectedCount} 行` : '删除行',
        danger: true,
        onSelect: () => setShowDeleteRowConfirm(true),
      });
    }

    if (contextMenu.menu === 'cell' && field) {
      items.push({
        key: 'batchEdit',
        label: '批量修改列值',
        separatorBefore: true,
        disabled: locked || selectedCount === 0,
        disabledReason: locked ? lockedReason : selectedCount === 0 ? '请先选择要批量修改的行' : '',
        onSelect: () => {
          setBatchEditValue(String(row?.[field] ?? ''));
          setShowBatchEdit({ field });
        },
      });
      items.push({
        key: 'columnSettings',
        label: '列设置',
        disabled: fieldIndex < 0,
        onSelect: () => {
          if (fieldIndex >= 0) {
            setSelectedColIdx(fieldIndex);
            setInspectorOpen(true);
          }
        },
      });
    }

    if (contextMenu.menu === 'header' && field) {
      items.push(
        { key: 'sortAsc', label: '升序排列', onSelect: () => handleColumnMenuAction(field, 'sortAsc') },
        { key: 'sortDesc', label: '降序排列', onSelect: () => handleColumnMenuAction(field, 'sortDesc') },
        { key: 'clearSort', label: '清除排序', onSelect: () => handleColumnMenuAction(field, 'clearSort') },
        { key: 'insertLeft', label: '插入列（左侧）', separatorBefore: true, onSelect: () => handleColumnMenuAction(field, 'insertLeft') },
        { key: 'insertRight', label: '插入列（右侧）', onSelect: () => handleColumnMenuAction(field, 'insertRight') },
        { key: 'selectColumn', label: '选择整列', onSelect: () => handleColumnMenuAction(field, 'selectColumn') },
        { key: 'rename', label: '重命名列', onSelect: () => handleColumnMenuAction(field, 'rename') },
        { key: 'type', label: '修改列类型', onSelect: () => handleColumnMenuAction(field, 'type') },
        { key: 'delete', label: '删除列', danger: true, onSelect: () => handleColumnMenuAction(field, 'delete') },
        {
          key: 'visibility',
          label: currentConfig?.hiddenColumns.includes(field) ? '显示此列' : '隐藏此列',
          separatorBefore: true,
          onSelect: () => handleColumnMenuAction(field, currentConfig?.hiddenColumns.includes(field) ? 'show' : 'hide'),
        },
        { key: 'freeze', label: '冻结到该列', onSelect: () => handleColumnMenuAction(field, 'freeze') },
        {
          key: 'lock',
          label: locked ? '解锁编辑' : '锁定编辑',
          onSelect: () => handleColumnMenuAction(field, locked ? 'unlock' : 'lock'),
        },
        { key: 'settings', label: '列设置', separatorBefore: true, onSelect: () => handleColumnMenuAction(field, 'settings') },
      );
    }

    if (contextMenu.menu === 'empty') {
      items.push(
        { key: 'paste', label: '粘贴', onSelect: () => void startPaste() },
        { key: 'addRow', label: '新增行', onSelect: handleAddRow },
        { key: 'import', label: '导入数据', onSelect: () => fileRef.current?.click() },
      );
    }

    return items;
  }, [contextMenu, rows, activeSheet, currentConfig, getSelectedRowsSnapshot, copySelection, startPaste, handleClearCells, handleInsertRow, handleDuplicateRow, handleAddRow, handleColumnMenuAction, safeGridApi]);

  const handleGridContextMenu = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.ag-cell')) return;
    event.preventDefault();
    const headerCell = target.closest<HTMLElement>('.ag-header-cell');
    if (headerCell) {
      const colId = headerCell.getAttribute('col-id');
      if (colId && colId !== '__rowNumber') {
        setContextMenu({ x: event.clientX, y: event.clientY, menu: 'header', field: colId });
        return;
      }
      setContextMenu(null);
      return;
    }
    setContextMenu({ x: event.clientX, y: event.clientY, menu: 'empty' });
  }, []);

  const rangeCellFromPoint = useCallback((target: EventTarget | null): { row: number; col: number } | null => {
    if (!(target instanceof HTMLElement)) return null;
    const cell = target.closest<HTMLElement>('.ag-cell');
    if (!cell) return null;
    const colId = cell.getAttribute('col-id');
    if (!colId || colId === '__rowNumber' || colId === 'ag-Grid-SelectionColumn') return null;
    const rowEl = cell.closest<HTMLElement>('.ag-row');
    const row = rowEl ? Number(rowEl.getAttribute('row-index')) : NaN;
    const col = activeSheet ? activeSheet.headers.indexOf(colId) : -1;
    if (Number.isNaN(row) || col < 0) return null;
    return { row, col };
  }, [activeSheet]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('.ag-header') || target.closest('input, textarea, [contenteditable="true"]')) return;
      const cell = rangeCellFromPoint(target);
      if (!cell) return;
      setDragRange(null);
      rangeAnchorRef.current = { ...cell, x: event.clientX, y: event.clientY };
      rangeDraggingRef.current = false;
    };
    const onMouseMove = (event: MouseEvent) => {
      const anchor = rangeAnchorRef.current;
      if (!anchor) return;
      if (!rangeDraggingRef.current) {
        if (Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) < 5) return;
        rangeDraggingRef.current = true;
        setIsRangeDragging(true);
        setDragRange({ startRow: anchor.row, endRow: anchor.row, startCol: anchor.col, endCol: anchor.col });
      }
      event.preventDefault();
      const point = rangeCellFromPoint(document.elementFromPoint(event.clientX, event.clientY));
      if (!point) return;
      setDragRange({
        startRow: Math.min(anchor.row, point.row),
        endRow: Math.max(anchor.row, point.row),
        startCol: Math.min(anchor.col, point.col),
        endCol: Math.max(anchor.col, point.col),
      });
    };
    const onMouseUp = () => {
      if (!rangeAnchorRef.current) return;
      rangeAnchorRef.current = null;
      rangeDraggingRef.current = false;
      setIsRangeDragging(false);
    };
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [rangeCellFromPoint]);

  const discardChanges = useCallback(() => {
    workbenchResetPending();
    setReloadToken((value) => value + 1);
  }, [workbenchResetPending]);

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
      setDragRange(null);
      setSelectedTemplateFields([]);
      setShowTemplateRecommendations(false);
      setSelectedRowIdx(null);
      setSelectedRowKey(null);
      setActiveTab('table');
      discardChanges();
    });
  }, [guardAction, currentViewKey, query, project, projectId, discardChanges]);

  const syncLocalSheet = useCallback((table: SrcTableEntry, sheetName: string) => {
    const sheet = table.sheets.find((entry) => entry.name === sheetName);
    if (!sheet) return;
    setRows(withRowIds(sheet.preview || []));
    setTotalRows(sheet.rowCount || 0);
    workbenchResetPending();
  }, [workbenchResetPending]);

  const applyTableMutation = useCallback(async (
    mutate: (table: SrcTableEntry) => SrcTableEntry,
    after?: (updatedTable: SrcTableEntry) => void,
  ) => {
    if (!project || !selectedTable || !activeSheet) return;
    setSaving(true);
    try {
      if (changeCount > 0 && !(await workbenchCommit())) return;
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
  }, [project, selectedTable, activeSheet, changeCount, workbenchCommit, setProject, syncLocalSheet]);

  const handleInsertColumn = useCallback(async () => {
    if (!selectedTable || !activeSheet || !showInsertColumn || !insertColumnName.trim()) return;
    await applyTableMutation(
      (table) => insertColumnInSheet(table, activeSheet.name, showInsertColumn.anchor, showInsertColumn.direction, {
        name: insertColumnName,
        dataType: insertColumnType,
        defaultValue: insertColumnDefault,
      }),
      (updatedTable) => {
        const updatedSheet = updatedTable.sheets.find((sheet) => sheet.name === activeSheet.name);
        const nextIndex = updatedSheet?.headers.findIndex((header) => header === insertColumnName.trim()) ?? -1;
        if (nextIndex >= 0) {
          setSelectedColIdx(nextIndex);
          setInspectorOpen(true);
        }
        setShowInsertColumn(null);
        setInsertColumnName('');
        setInsertColumnType('string');
        setInsertColumnDefault('');
      },
    );
  }, [selectedTable, activeSheet, showInsertColumn, insertColumnName, insertColumnType, insertColumnDefault, applyTableMutation]);

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
    let cancelled = false;
    const loadRows = async () => {
      setLoading(true);
      try {
        const data = await workbenchLoadRows(projectId, selectedTable.id, activeSheet.name, query);
        if (cancelled) return;
        setTotalRows(data.total ?? data.rows?.length ?? 0);
        setQueryTotal(data.queryTotal ?? data.total ?? 0);
      } catch (error) {
        if (cancelled) return;
        setRows([]);
        setFeedback({
          type: 'error',
          message: formatDataPreviewError(error, '数据加载失败'),
          actionLabel: '重试',
          onAction: () => setReloadToken((value) => value + 1),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadRows();
    setSelectedRowIdx(null);
    setDragRange(null);
    setDescribeReport(null);
    return () => { cancelled = true; };
  }, [projectId, selectedTableId, activeSheetIdx, activeSheet?.name, query, reloadToken, workbenchLoadRows]);

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
      if (gridApiRef.current) gridApiRef.current.onFilterChanged();
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
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLocaleLowerCase();
      if (mod && key === 's') {
        event.preventDefault();
        void workbenchCommit();
      } else if (mod && key === 'z' && !editingText) {
        event.preventDefault();
        if (event.shiftKey) void performRedo();
        else void performUndo();
      } else if (mod && key === 'v' && !editingText) {
        event.preventDefault();
        void startPaste();
      } else if (mod && key === 'c' && !editingText) {
        event.preventDefault();
        void copySelection();
      } else if (event.key === 'Delete' && !editingText && (selectedRowKey || (safeGridApi()?.getSelectedRows().length ?? 0) > 0)) {
        event.preventDefault();
        setShowDeleteRowConfirm(true);
      } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !editingText && reorderEnabled) {
        event.preventDefault();
        moveSelectedRow(event.key === 'ArrowUp' ? 'up' : 'down');
      } else if (event.key === 'Escape') {
        setShowDeleteRowConfirm(false);
        setDragRange(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [workbenchCommit, performUndo, performRedo, startPaste, copySelection, selectedRowKey, reorderEnabled, moveSelectedRow]);

  useEffect(() => {
    if (changeCount === 0 && saveState === 'dirty') setSaveState('saved');
  }, [changeCount, saveState]);

  useEffect(() => {
    const api = gridApiRef.current;
    if (api && !api.isDestroyed()) api.refreshCells({ force: true });
  }, [selectedColIdx, dragRange]);

  useEffect(() => {
    if (!headerFilterField) {
      setHeaderFilterPos(null);
      return;
    }
    const safeId = headerFilterField.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const updatePosition = () => {
      const element = document.querySelector<HTMLElement>(`.ag-header-cell[col-id="${safeId}"]`);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setHeaderFilterPos((current) =>
        current && Math.abs(current.left - rect.left) < 1 && Math.abs(current.top - (rect.bottom + 4)) < 1
          ? current
          : { left: rect.left, top: rect.bottom + 4 },
      );
    };
    updatePosition();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeaderFilterField(null);
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (headerFilterPopupRef.current && target && headerFilterPopupRef.current.contains(target)) return;
      if (target instanceof Element && target.closest('input, textarea, select, option, [contenteditable="true"], .ant-select-dropdown')) return;
      setHeaderFilterField(null);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    let frame = 0;
    const tick = () => {
      updatePosition();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      cancelAnimationFrame(frame);
    };
  }, [headerFilterField]);

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
              <button id="data-preview-tab-json" type="button" role="tab" aria-selected={tableJson.mode === 'json'} aria-controls="data-preview-panel" className={tableJson.mode === 'json' ? 'sheet-tab active' : 'sheet-tab'} onClick={() => tableJson.enterJson()}>JSON</button>
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
                    {(query.search || query.keySearch || Object.keys(query.filterModel).length > 0) && <button type="button" className="ui-btn ui-btn-xs" onClick={() => { setSearchDraft(''); setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, search: '', keySearch: '', filterModel: {} })); if (gridApiRef.current) gridApiRef.current.setFilterModel(null); }}>清除筛选</button>}
                  </div>
                  <div className="data-preview-tool-group">
                    <span>编辑</span>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={handleAddRow} disabled={saving}>+ 新增行</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowDeleteRowConfirm(true)} disabled={!selectedRowKey || saving}>删除行</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => void performUndo()} disabled={saving}>撤销</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => void performRedo()} disabled={saving}>重做</button>
                    <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={() => void workbenchCommit()} disabled={changeCount === 0 || saving}>{saving ? '保存中…' : '保存'}</button>
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
                    {query.search && <button type="button" onClick={() => { setSearchDraft(''); setQuery((current) => ({ ...current, page: 1, search: '' })); }}>搜索：{query.search} ×</button>}
                    {query.keySearch && <button type="button" onClick={() => { setKeyJumpDraft(''); setQuery((current) => ({ ...current, page: 1, keySearch: '' })); }}>Key：{query.keySearch} ×</button>}
                  </div>}
            </div>
          )}
          {activeSheet && activeTab === 'table' && (
            <FilterBar
              filterModel={query.filterModel}
              columns={(activeSheet.columns || []).map((col) => ({ name: col.name, dataType: col.dataType, sampleValues: (col.sampleValues || []).map(String) }))}
              onFilterChange={setColumnFilter}
              onClearAll={() => {
                setSearchDraft('');
                setKeyJumpDraft('');
                setQuery((current) => ({ ...current, page: 1, search: '', keySearch: '', filterModel: {} }));
                if (gridApiRef.current) {
                  gridApiRef.current.setFilterModel(null);
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
          ) : tableJson.mode === 'json' ? (
            <div className="data-preview-json-pane">
              <JsonModeView
                kind="table-config"
                entityKey={currentViewKey || 'none'}
                title={`${selectedTable?.fileName || ''} / ${activeSheet?.name || ''} · 表配置 JSON`}
                text={tableJson.entry.text}
                parseError={tableJson.entry.parseError}
                structuralErrors={tableJson.entry.structuralErrors}
                semanticIssues={tableJson.entry.semanticIssues}
                semanticContext={tableJsonSemanticContext}
                onTextChange={tableJson.setDraftText}
                onValidate={tableJson.updateStructuralMarkers}
                onApply={tableJson.applyJson}
                onDiscard={tableJson.discardJson}
                onExitToVisual={() => { if (tableJson.exitToVisual()) setActiveTab('config'); }}
                height="100%"
              />
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
                      <span
                        className="sheet-tab-json"
                        role="button"
                        tabIndex={0}
                        title="JSON 编辑该表配置"
                        aria-label={`JSON 编辑 ${sheet.name}`}
                        onClick={(event) => { event.stopPropagation(); if (selectedTable) { switchDataContext(selectedTable.id, index); setJsonPendingSheetKey(`${selectedTable.id}:${index}`); } }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (selectedTable) { switchDataContext(selectedTable.id, index); setJsonPendingSheetKey(`${selectedTable.id}:${index}`); } } }}
                      >JSON</span>
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
                    isRangeDragging ? 'data-preview-range-dragging' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ width: '100%', height: '100%' }}
                  role="region"
                  aria-label={`${activeSheet.name} 数据表格`}
                  aria-busy={loading}
                  onContextMenu={handleGridContextMenu}
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
                    rowSelection={{ mode: 'multiRow', enableClickSelection: true, checkboxes: false, headerCheckbox: false }}
                    suppressContextMenu
                    preventDefaultOnContextMenu
                    getRowId={(params) => String(params.data.__rowKey)}
                    onGridReady={(event) => {
                      gridApiRef.current = event.api;
                      if (gridContainerRef.current?.clientWidth && currentConfig?.autoFitColumns && Object.keys(currentConfig.columnWidths).length === 0) event.api.sizeColumnsToFit();
                    }}
                    getRowClass={(params) => {
                      const classes: string[] = [];
                      if (params.data.__isNew) classes.push('ag-row-new');
                      if (pendingDeletes.has(params.data.__rowKey)) classes.push('ag-row-deleted');
                      if (draggingRowKey === params.data.__rowKey) classes.push('data-preview-row-dragging');
                      if (dragOverRowKey === params.data.__rowKey) classes.push('data-preview-row-drop-target');
                      return classes.join(' ');
                    }}
                    onCellContextMenu={(event) => {
                      const mouseEvent = event.event as MouseEvent | null;
                      mouseEvent?.preventDefault();
                      const field = event.colDef.field;
                      setContextMenu({
                        x: mouseEvent?.clientX ?? 0,
                        y: mouseEvent?.clientY ?? 0,
                        menu: !field || field === '__rowNumber' ? 'row' : 'cell',
                        rowKey: event.data?.__rowKey,
                        field: field && field !== '__rowNumber' ? field : undefined,
                      });
                    }}
                    onRowDragEnd={() => {
                      setDraggingRowKey(null);
                      setDragOverRowKey(null);
                    }}
                    onDragStopped={() => {
                      setDraggingRowKey(null);
                      setDragOverRowKey(null);
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
                      const selected = event.api.getSelectedRows() as PreviewRow[];
                      const last = selected[selected.length - 1];
                      setSelectedRowIdx(last?.__rowIndex ?? null);
                      setSelectedRowKey(last?.__rowKey || null);
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
                  {dragRange && (dragRange.startRow !== dragRange.endRow || dragRange.startCol !== dragRange.endCol) && (
                    <div className="data-preview-range-bar" role="toolbar" aria-label="选区操作">
                      <span className="data-preview-range-bar-info">
                        已选 {dragRange.endRow - dragRange.startRow + 1} 行 × {dragRange.endCol - dragRange.startCol + 1} 列
                      </span>
                      <button type="button" className="ui-btn ui-btn-xs" onClick={() => void copyRangeToClipboard()}>复制选区</button>
                      <button type="button" className="ui-btn ui-btn-xs" onClick={clearRange}>清除内容</button>
                      <button type="button" className="ui-btn ui-btn-xs" onClick={() => setDragRange(null)}>取消</button>
                    </div>
                  )}
                </div>
              )}
              <div className="data-preview-pager">
                <div className="data-preview-pager-group data-preview-pager-group-nav">
                  <button type="button" className="ui-btn ui-btn-xs" disabled={query.page <= 1 || loading} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>上一页</button>
                  <span className="data-preview-pager-status">第 {query.page} / {Math.max(1, Math.ceil(queryTotal / query.pageSize))} 页</span>
                  <button type="button" className="ui-btn ui-btn-xs" disabled={query.page >= Math.max(1, Math.ceil(queryTotal / query.pageSize)) || loading} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
                </div>
                <div className="data-preview-pager-group data-preview-pager-group-jump">
                  <AntdCompatSelect aria-label="每页行数" value={String(query.pageSize)} onChange={(event) => setQuery((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))}>{[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size} 行/页</option>)}</AntdCompatSelect>
                  <label><span>跳转</span><input aria-label="跳转页码" type="number" min={1} max={Math.max(1, Math.ceil(queryTotal / query.pageSize))} value={query.page} onChange={(event) => setQuery((current) => ({ ...current, page: Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, Math.ceil(queryTotal / current.pageSize)))) }))} /></label>
                </div>
                <div className="data-preview-pager-group data-preview-pager-group-key">
                  <label><span>Key</span><input aria-label="跳转到 Key" value={keyJumpDraft} onChange={(event) => setKeyJumpDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setQuery((current) => ({ ...current, page: 1, keySearch: keyJumpDraft.trim() })); }} /></label>
                  <button type="button" className="ui-btn ui-btn-xs" disabled={!keyJumpDraft.trim()} onClick={() => setQuery((current) => ({ ...current, page: 1, keySearch: keyJumpDraft.trim() }))}>定位</button>
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
                        <label className="settings-option-item"><input type="checkbox" checked={currentConfig.autoSave === true} onChange={(event) => void updateConfig({ autoSave: event.target.checked })} /><span>自动保存数据修改</span></label>
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

      <textarea
        ref={pasteFallbackRef}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: 1, opacity: 0 }}
        onPaste={(event) => {
          const text = event.clipboardData?.getData('text') || '';
          event.preventDefault();
          const focused = safeGridApi()?.getFocusedCell();
          const focusedField = focused && focused.column.getColDef().field ? focused.column.getColDef().field : undefined;
          const anchorRow = focused?.rowIndex ?? 0;
          const anchorCol = focusedField && activeSheet ? Math.max(0, activeSheet.headers.indexOf(focusedField)) : 0;
          pasteFallbackRef.current?.blur();
          runPasteText(text, anchorRow, anchorCol);
        }}
      />

      {contextMenu && (
        <DataPreviewContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {headerFilterField && headerFilterPos && (
        <div
          ref={headerFilterPopupRef}
          className="data-preview-header-filter-popup"
          role="dialog"
          aria-label={`筛选 ${headerFilterField}`}
          style={{ left: headerFilterPos.left, top: headerFilterPos.top }}
        >
          <FilterEditor
            field={headerFilterField}
            rule={(query.filterModel[headerFilterField] as FilterRule | undefined) || {
              type: getFilterTypesForDataType(activeSheetData?.columns.find((col) => col.name === headerFilterField)?.dataType)[0] || 'contains',
              filter: '',
            }}
            dataType={activeSheetData?.columns.find((col) => col.name === headerFilterField)?.dataType}
            options={activeSheetData?.columns.find((col) => col.name === headerFilterField)?.sampleValues?.map(String)}
            popupContainer={() => headerFilterPopupRef.current}
            onApply={(rule) => {
              setColumnFilter(headerFilterField, rule);
              setHeaderFilterField(null);
            }}
            onDelete={() => {
              setColumnFilter(headerFilterField, null);
              setHeaderFilterField(null);
            }}
            onCancel={() => setHeaderFilterField(null)}
          />
        </div>
      )}

      <Modal open={!!showBatchEdit} onClose={() => setShowBatchEdit(null)} maxWidth={420}>
        <ModalHeader title="批量修改列值" onClose={() => setShowBatchEdit(null)} />
        <div className="modal-body">
          <div className="data-preview-batch-edit-form">
            <p className="data-preview-batch-edit-hint">将「{showBatchEdit?.field}」设置为统一值，应用到当前选中的 {getSelectedRowsSnapshot().length} 行（锁定列会被跳过）。</p>
            <label><span>新值</span><input value={batchEditValue} onChange={(event) => setBatchEditValue(event.target.value)} autoFocus /></label>
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setShowBatchEdit(null)}>取消</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={handleBatchEdit}>应用</button>
        </ModalFooter>
      </Modal>

      <Modal open={!!showFillDialog} onClose={() => setShowFillDialog(null)} maxWidth={380}>
        <ModalHeader title="填充下方" onClose={() => setShowFillDialog(null)} />
        <div className="modal-body">
          <div className="data-preview-batch-edit-form">
            <p className="data-preview-batch-edit-hint">把「{showFillDialog?.field}」当前单元格的值向下填充（最多 {showFillDialog?.maxRows ?? 0} 行）。</p>
            <label><span>填充行数</span><input type="number" min={1} max={showFillDialog?.maxRows ?? 1} value={fillCount} onChange={(event) => setFillCount(Math.max(1, Math.min(Number(event.target.value) || 1, showFillDialog?.maxRows ?? 1)))} /></label>
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setShowFillDialog(null)}>取消</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={handleFillDown}>填充</button>
        </ModalFooter>
      </Modal>

      <Modal open={!!pasteOverflow} onClose={() => setPasteOverflow(null)} maxWidth={480}>
        <ModalHeader title="粘贴内容超出表格范围" onClose={() => setPasteOverflow(null)} />
        <div className="modal-body">
          <p>要粘贴的内容超出当前表格
            {pasteOverflow?.extraRows ? `，多出 ${pasteOverflow.extraRows} 行` : ''}
            {pasteOverflow?.extraCols ? `，多出 ${pasteOverflow.extraCols} 列` : ''}。请选择处理方式：</p>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setPasteOverflow(null)}>取消</button>
          <button type="button" className="ui-btn" onClick={() => {
            if (!pasteOverflow) return;
            const pending = pasteOverflow;
            setPasteOverflow(null);
            applyPasteMatrix(pending.matrix, pending.anchorRow, pending.anchorCol, 'discard');
          }}>丢弃越界内容</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => {
            if (!pasteOverflow) return;
            const pending = pasteOverflow;
            setPasteOverflow(null);
            applyPasteMatrix(pending.matrix, pending.anchorRow, pending.anchorCol, 'append');
          }}>追加为新行</button>
        </ModalFooter>
      </Modal>

      <Modal open={!!showInsertColumn} onClose={() => setShowInsertColumn(null)} maxWidth={420}>
        <ModalHeader title={`在「${showInsertColumn?.anchor}」${showInsertColumn?.direction === 'left' ? '左侧' : '右侧'}插入列`} onClose={() => setShowInsertColumn(null)} />
        <div className="modal-body">
          <div className="data-preview-column-form">
            <label><span>列名</span><input value={insertColumnName} onChange={(event) => setInsertColumnName(event.target.value)} autoFocus /></label>
            <label>
              <span>数据类型</span>
              <AntdCompatSelect value={insertColumnType} onChange={(event) => setInsertColumnType(event.target.value as ColumnType)}>
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
                <option value="enum">enum</option>
              </AntdCompatSelect>
            </label>
            <label><span>默认值</span><input value={insertColumnDefault} onChange={(event) => setInsertColumnDefault(event.target.value)} /></label>
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setShowInsertColumn(null)}>取消</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={handleInsertColumn} disabled={!insertColumnName.trim() || saving}>插入列</button>
        </ModalFooter>
      </Modal>

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
          <button type="button" className="ui-btn ui-btn-danger" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); discardChanges(); clearUndoForContext(); action?.(); }}>放弃修改</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={async () => { const action = pendingNavigation; if (await workbenchCommit()) { setPendingNavigation(null); action?.(); } }}>保存并继续</button>
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
            const saved = await workbenchCommit();
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
