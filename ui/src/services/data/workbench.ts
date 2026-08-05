import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  countCellChanges,
  dataPreviewApi,
  defaultPreviewQuery,
  invertUndoEntry,
  serializeUpdates,
  undoEntryToBatchPayload,
  validateChanges,
  type PreviewPageResult,
  type PreviewQuery,
  type PreviewRow,
  type RowChanges,
  type UndoEntry,
} from './dataPreviewClient';

/**
 * Data workbench core: query, selection, and pending-change state behind one
 * module. The page consumes `useDataWorkbench`; the pure reducer below is the
 * test surface for every local mutation (edits, adds, deletes, row order).
 */

/** Order rows by a stable row-key sequence; unknown keys keep original relative order at the end. */
export function orderRowsBy(rows: PreviewRow[], order: string[]): PreviewRow[] {
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

export interface WorkbenchPendingState {
  rows: PreviewRow[];
  pendingChanges: Map<string, RowChanges>;
  pendingAdds: PreviewRow[];
  pendingDeletes: Set<string>;
  validationErrors: Map<string, string>;
}

export const initialWorkbenchState: WorkbenchPendingState = {
  rows: [],
  pendingChanges: new Map(),
  pendingAdds: [],
  pendingDeletes: new Set(),
  validationErrors: new Map(),
};

function resolve<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
}

/** Apply one undo entry (edit/add/delete/row-order) to the workbench state. Pure and deterministic. */
export function applyEntryToWorkbench(state: WorkbenchPendingState, entry: UndoEntry): WorkbenchPendingState {
  const pendingAddKeys = new Set(state.pendingAdds.map((row) => row.__rowKey));
  const newRowKeys = new Set(entry.addedRows.map((row) => row.__rowKey));

  let rows = [...state.rows];
  const removedKeys = new Set(entry.deletedRows.filter((row) => row.__isNew).map((row) => row.__rowKey));
  rows = rows.filter((row) => !removedKeys.has(row.__rowKey));
  for (const change of entry.changes) {
    const index = rows.findIndex((row) => row.__rowKey === change.rowKey);
    if (index >= 0) rows[index] = { ...rows[index], [change.field]: change.newValue };
  }
  for (const add of entry.addedRows) {
    if (!rows.some((row) => row.__rowKey === add.__rowKey)) {
      const insertAt = Math.min(Math.max(0, add.__rowIndex ?? rows.length), rows.length);
      rows.splice(insertAt, 0, add);
    }
  }
  if (entry.rowOrderAfter) rows = orderRowsBy(rows, entry.rowOrderAfter);

  const pendingChanges = new Map(state.pendingChanges);
  for (const change of entry.changes) {
    if (pendingAddKeys.has(change.rowKey) || newRowKeys.has(change.rowKey)) continue;
    const rowChanges = { ...(pendingChanges.get(change.rowKey) || {}) };
    const existing = rowChanges[change.field];
    rowChanges[change.field] = existing
      ? { ...existing, newValue: change.newValue }
      : { oldValue: change.oldValue, newValue: change.newValue };
    if (rowChanges[change.field].oldValue === rowChanges[change.field].newValue) delete rowChanges[change.field];
    if (Object.keys(rowChanges).length > 0) pendingChanges.set(change.rowKey, rowChanges);
    else pendingChanges.delete(change.rowKey);
  }

  let pendingAdds = state.pendingAdds.filter((row) => !removedKeys.has(row.__rowKey));
  for (const change of entry.changes) {
    if (!pendingAdds.some((row) => row.__rowKey === change.rowKey)) continue;
    pendingAdds = pendingAdds.map((row) => row.__rowKey === change.rowKey ? { ...row, [change.field]: change.newValue } : row);
  }
  for (const add of entry.addedRows) {
    if (add.__isNew && !pendingAdds.some((row) => row.__rowKey === add.__rowKey)) pendingAdds.push(add);
  }

  const pendingDeletes = new Set(state.pendingDeletes);
  for (const row of entry.deletedRows) if (!row.__isNew) pendingDeletes.add(row.__rowKey);
  for (const row of entry.addedRows) pendingDeletes.delete(row.__rowKey);

  const validationErrors = new Map(state.validationErrors);
  for (const change of entry.changes) validationErrors.delete(`${change.rowKey}:${change.field}`);
  for (const row of entry.deletedRows) {
    for (const key of validationErrors.keys()) {
      if (key.startsWith(`${row.__rowKey}:`)) validationErrors.delete(key);
    }
  }

  return { rows, pendingChanges, pendingAdds, pendingDeletes, validationErrors };
}

export type WorkbenchAction =
  | { kind: 'apply-entry'; entry: UndoEntry }
  | { kind: 'set-rows'; value: SetStateAction<PreviewRow[]> }
  | { kind: 'set-pending-changes'; value: SetStateAction<Map<string, RowChanges>> }
  | { kind: 'set-pending-adds'; value: SetStateAction<PreviewRow[]> }
  | { kind: 'set-pending-deletes'; value: SetStateAction<Set<string>> }
  | { kind: 'set-validation-errors'; value: SetStateAction<Map<string, string>> }
  | { kind: 'reset'; rows?: PreviewRow[] };

export function workbenchReducer(state: WorkbenchPendingState, action: WorkbenchAction): WorkbenchPendingState {
  switch (action.kind) {
    case 'apply-entry': return applyEntryToWorkbench(state, action.entry);
    case 'set-rows': return { ...state, rows: resolve(action.value, state.rows) };
    case 'set-pending-changes': return { ...state, pendingChanges: resolve(action.value, state.pendingChanges) };
    case 'set-pending-adds': return { ...state, pendingAdds: resolve(action.value, state.pendingAdds) };
    case 'set-pending-deletes': return { ...state, pendingDeletes: resolve(action.value, state.pendingDeletes) };
    case 'set-validation-errors': return { ...state, validationErrors: resolve(action.value, state.validationErrors) };
    case 'reset': return { ...initialWorkbenchState, rows: action.rows ?? [] };
    default: return state;
  }
}

/** Merge server-loaded rows with local pending state: patch edits and append pending adds on page 1. */
export function mergeLoadedRows(loadedRows: PreviewRow[], pendingAdds: PreviewRow[], pendingChanges: Map<string, RowChanges>, page: number): PreviewRow[] {
  const patched = loadedRows.map((row) => {
    const changes = pendingChanges.get(row.__rowKey);
    return changes
      ? { ...row, ...Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.newValue])) }
      : row;
  });
  return page === 1 ? [...patched, ...pendingAdds] : patched;
}

/** Strip internal workbench fields before sending a pending add to the server. */
export function cleanPendingRow(row: PreviewRow): Record<string, unknown> {
  const { __rowKey: _rowKey, __rowIndex: _rowIndex, __isNew: _isNew, ...clean } = row;
  return clean;
}

export interface DataWorkbenchOptions {
  viewKey: string;
  autoSave: boolean;
  keyFields: string[];
  projectId?: string;
  tableId?: string;
  sheetName?: string;
  /** Fresh column metadata at commit time; the caller keeps this updated each render. */
  getColumns: () => Array<{ name: string; dataType: string }>;
  onCommitted?: () => void | Promise<void>;
  /** Runs after committed undo/redo batches (project refresh); the page distinguishes it from a user commit. */
  onRefreshed?: () => void | Promise<void>;
  onError?: (message: string) => void;
  /** Persist a pure row-order change (called by undo/redo). */
  onApplyRowOrder?: (order: string[]) => void;
}

export type UndoOutcome = { ok: boolean; error?: string; unresolved?: number };

export interface DataWorkbench {
  query: PreviewQuery;
  setQuery: Dispatch<SetStateAction<PreviewQuery>>;
  rows: PreviewRow[];
  setRows: Dispatch<SetStateAction<PreviewRow[]>>;
  selectedColIdx: number | null;
  setSelectedColIdx: Dispatch<SetStateAction<number | null>>;
  selectedRowIdx: number | null;
  setSelectedRowIdx: Dispatch<SetStateAction<number | null>>;
  selectedRowKey: string | null;
  setSelectedRowKey: Dispatch<SetStateAction<string | null>>;
  pendingChanges: Map<string, RowChanges>;
  setPendingChanges: Dispatch<SetStateAction<Map<string, RowChanges>>>;
  pendingAdds: PreviewRow[];
  setPendingAdds: Dispatch<SetStateAction<PreviewRow[]>>;
  pendingDeletes: Set<string>;
  setPendingDeletes: Dispatch<SetStateAction<Set<string>>>;
  validationErrors: Map<string, string>;
  setValidationErrors: Dispatch<SetStateAction<Map<string, string>>>;
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  setSaveState: Dispatch<SetStateAction<'saved' | 'dirty' | 'saving' | 'error'>>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  dataVersion: string;
  setDataVersion: Dispatch<SetStateAction<string>>;
  changedCellCount: number;
  changeCount: number;
  commitMutation: (entry: UndoEntry, recordUndo?: boolean) => void;
  pushUndo: (entry: UndoEntry) => void;
  clearUndoForContext: () => void;
  scheduleAutoSave: () => void;
  performUndo: () => Promise<UndoOutcome>;
  performRedo: () => Promise<UndoOutcome>;
  commit: () => Promise<boolean>;
  resetPending: () => void;
  loadRows: (projectId: string, tableId: string, sheetName: string, q: PreviewQuery) => Promise<PreviewPageResult>;
}

/**
 * One module owning query, selection, and pending changes behind a small
 * interface. The page wires AG Grid and dialogs to it; commit and undo/redo
 * cross the HTTP seam through `dataPreviewApi` (the transport adapter).
 */
export function useDataWorkbench(options: DataWorkbenchOptions): DataWorkbench {
  const { viewKey, autoSave, keyFields, projectId, tableId, sheetName } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, dispatch] = useReducer(workbenchReducer, initialWorkbenchState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [query, setQuery] = useState<PreviewQuery>(defaultPreviewQuery);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [saving, setSaving] = useState(false);
  const [dataVersion, setDataVersion] = useState('');

  const undoStacksRef = useRef<Map<string, { undo: UndoEntry[]; redo: UndoEntry[] }>>(new Map());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef<() => Promise<boolean>>(async () => true);

  const setRows: DataWorkbench['setRows'] = useCallback((value) => dispatch({ kind: 'set-rows', value }), []);
  const setPendingChanges: DataWorkbench['setPendingChanges'] = useCallback((value) => dispatch({ kind: 'set-pending-changes', value }), []);
  const setPendingAdds: DataWorkbench['setPendingAdds'] = useCallback((value) => dispatch({ kind: 'set-pending-adds', value }), []);
  const setPendingDeletes: DataWorkbench['setPendingDeletes'] = useCallback((value) => dispatch({ kind: 'set-pending-deletes', value }), []);
  const setValidationErrors: DataWorkbench['setValidationErrors'] = useCallback((value) => dispatch({ kind: 'set-validation-errors', value }), []);

  const changedCellCount = countCellChanges(state.pendingChanges);
  const changeCount = changedCellCount + state.pendingAdds.length + state.pendingDeletes.size;

  const pushUndo = useCallback((entry: UndoEntry) => {
    if (!viewKey) return;
    let stacks = undoStacksRef.current.get(viewKey);
    if (!stacks) {
      stacks = { undo: [], redo: [] };
      undoStacksRef.current.set(viewKey, stacks);
    }
    stacks.undo.push(entry);
    stacks.redo = [];
  }, [viewKey]);

  const clearUndoForContext = useCallback(() => {
    if (viewKey) undoStacksRef.current.delete(viewKey);
  }, [viewKey]);

  const scheduleAutoSave = useCallback(() => {
    if (!autoSave) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void commitRef.current();
    }, 600);
  }, [autoSave]);

  /** Apply one mutation to rows + pending state and record it for undo. */
  const commitMutation = useCallback((entry: UndoEntry, recordUndo = true) => {
    dispatch({ kind: 'apply-entry', entry });
    const hasDataEffect = entry.changes.length > 0 || entry.addedRows.length > 0 || entry.deletedRows.length > 0;
    const hasEffect = hasDataEffect || !!entry.rowOrderAfter;
    if (hasEffect) {
      if (hasDataEffect) setSaveState('dirty');
      if (recordUndo) pushUndo(entry);
      scheduleAutoSave();
    }
  }, [pushUndo, scheduleAutoSave]);

  const isPureRowOrderEntry = useCallback((entry: UndoEntry) => {
    return entry.changes.length === 0 && entry.addedRows.length === 0 && entry.deletedRows.length === 0
      && (!!entry.rowOrderBefore || !!entry.rowOrderAfter);
  }, []);

  const runCommittedBatch = useCallback(async (
    payload: { adds: Record<string, unknown>[]; updates: Array<{ rowKey: string; changes: Record<string, unknown> }>; deletes: string[]; unresolved?: string[] },
  ): Promise<{ unresolved: number }> => {
    const o = optionsRef.current;
    if (!o.projectId || !o.tableId || !o.sheetName) throw new Error('缺少当前数据表上下文');
    setSaving(true);
    try {
      await dataPreviewApi.batch({
        projectId: o.projectId,
        tableId: o.tableId,
        sheetName: o.sheetName,
        baseVersion: dataVersion,
        adds: payload.adds,
        updates: payload.updates,
        deletes: payload.deletes,
      });
      await o.onRefreshed?.();
      return { unresolved: payload.unresolved?.length ?? 0 };
    } finally {
      setSaving(false);
    }
  }, [dataVersion]);

  const performUndo = useCallback(async (): Promise<UndoOutcome> => {
    const o = optionsRef.current;
    const stacks = viewKey ? undoStacksRef.current.get(viewKey) : undefined;
    const entry = stacks?.undo.pop();
    if (!stacks || !entry) return { ok: false };
    if (isPureRowOrderEntry(entry)) {
      if (entry.rowOrderBefore) {
        setRows(orderRowsBy(stateRef.current.rows, entry.rowOrderBefore));
        o.onApplyRowOrder?.(entry.rowOrderBefore);
      }
      stacks.redo.push(entry);
      return { ok: true };
    }
    if (entry.committed) {
      if (!o.projectId || !o.tableId || !o.sheetName) {
        stacks.undo.push(entry);
        return { ok: true };
      }
      const payload = undoEntryToBatchPayload(invertUndoEntry(entry), keyFields);
      try {
        const outcome = await runCommittedBatch(payload);
        stacks.redo.push({ ...invertUndoEntry(entry), committed: true });
        setSaveState(changeCount > 0 ? 'dirty' : 'saved');
        return { ok: true, unresolved: outcome.unresolved || undefined };
      } catch (error) {
        stacks.undo.push(entry);
        return { ok: false, error: error instanceof Error ? error.message : '撤销失败，请重试' };
      }
    }
    commitMutation(invertUndoEntry(entry), false);
    stacks.redo.push(entry);
    return { ok: true };
  }, [viewKey, isPureRowOrderEntry, keyFields, runCommittedBatch, commitMutation, changeCount]);

  const performRedo = useCallback(async (): Promise<UndoOutcome> => {
    const o = optionsRef.current;
    const stacks = viewKey ? undoStacksRef.current.get(viewKey) : undefined;
    const entry = stacks?.redo.pop();
    if (!stacks || !entry) return { ok: false };
    if (isPureRowOrderEntry(entry)) {
      if (entry.rowOrderAfter) {
        setRows(orderRowsBy(stateRef.current.rows, entry.rowOrderAfter));
        o.onApplyRowOrder?.(entry.rowOrderAfter);
      }
      stacks.undo.push(entry);
      return { ok: true };
    }
    if (entry.committed) {
      if (!o.projectId || !o.tableId || !o.sheetName) {
        stacks.redo.push(entry);
        return { ok: true };
      }
      const payload = undoEntryToBatchPayload(entry, keyFields);
      try {
        const outcome = await runCommittedBatch(payload);
        stacks.undo.push({ ...invertUndoEntry(entry), committed: true });
        setSaveState(changeCount > 0 ? 'dirty' : 'saved');
        return { ok: true, unresolved: outcome.unresolved || undefined };
      } catch (error) {
        stacks.redo.push(entry);
        return { ok: false, error: error instanceof Error ? error.message : '重做失败，请重试' };
      }
    }
    commitMutation(entry, false);
    stacks.undo.push(entry);
    return { ok: true };
  }, [viewKey, isPureRowOrderEntry, keyFields, runCommittedBatch, commitMutation, changeCount]);

  const commit = useCallback(async (): Promise<boolean> => {
    const o = optionsRef.current;
    const { pendingChanges, pendingAdds, pendingDeletes } = stateRef.current;
    const currentChangeCount = countCellChanges(pendingChanges) + pendingAdds.length + pendingDeletes.size;
    if (!o.projectId || !o.tableId || !o.sheetName || currentChangeCount === 0) return true;
    const errors = validateChanges(pendingChanges, pendingAdds, o.getColumns());
    setValidationErrors(errors);
    if (errors.size > 0) {
      setSaveState('error');
      o.onError?.(`发现 ${errors.size} 个类型错误，已在表格中标记`);
      return false;
    }
    const additions = pendingAdds.map((row) => cleanPendingRow(row));
    const invalidKey = additions.find((row) => o.keyFields.some((field) => row[field] == null || row[field] === ''));
    if (invalidKey) {
      setSaveState('error');
      o.onError?.(`新增记录必须填写 Key 字段：${o.keyFields.join('、')}`);
      return false;
    }
    setSaving(true);
    setSaveState('saving');
    try {
      await dataPreviewApi.batch({
        projectId: o.projectId,
        tableId: o.tableId,
        sheetName: o.sheetName,
        baseVersion: dataVersion,
        adds: additions,
        updates: serializeUpdates(pendingChanges),
        deletes: [...pendingDeletes],
      });
      dispatch({ kind: 'reset', rows: stateRef.current.rows });
      setSaveState('saved');
      const stacks = viewKey ? undoStacksRef.current.get(viewKey) : undefined;
      stacks?.undo.forEach((entry) => { entry.committed = true; });
      stacks?.redo.forEach((entry) => { entry.committed = true; });
      await o.onCommitted?.();
      return true;
    } catch (error) {
      setSaveState('error');
      o.onError?.(error instanceof Error ? error.message : '保存失败，请重试');
      return false;
    } finally {
      setSaving(false);
    }
  }, [dataVersion, viewKey, setValidationErrors]);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const resetPending = useCallback(() => {
    dispatch({ kind: 'reset', rows: stateRef.current.rows });
    setSelectedRowIdx(null);
    setSelectedRowKey(null);
    setSaveState('saved');
  }, []);

  const loadRows = useCallback(async (loadProjectId: string, loadTableId: string, loadSheetName: string, q: PreviewQuery): Promise<PreviewPageResult> => {
    const data = await dataPreviewApi.page({ projectId: loadProjectId, tableId: loadTableId, sheetName: loadSheetName, ...q });
    setDataVersion(data.dataVersion || '');
    const latest = stateRef.current;
    dispatch({ kind: 'set-rows', value: mergeLoadedRows(data.rows || [], latest.pendingAdds, latest.pendingChanges, q.page) });
    return data;
  }, []);

  return {
    query,
    setQuery,
    rows: state.rows,
    setRows,
    selectedColIdx,
    setSelectedColIdx,
    selectedRowIdx,
    setSelectedRowIdx,
    selectedRowKey,
    setSelectedRowKey,
    pendingChanges: state.pendingChanges,
    setPendingChanges,
    pendingAdds: state.pendingAdds,
    setPendingAdds,
    pendingDeletes: state.pendingDeletes,
    setPendingDeletes,
    validationErrors: state.validationErrors,
    setValidationErrors,
    saveState,
    setSaveState,
    saving,
    setSaving,
    dataVersion,
    setDataVersion,
    changedCellCount,
    changeCount,
    commitMutation,
    pushUndo,
    clearUndoForContext,
    scheduleAutoSave,
    performUndo,
    performRedo,
    commit,
    resetPending,
    loadRows,
  };
}
