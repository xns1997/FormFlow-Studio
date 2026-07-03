export type FlowSideEffect =
  | UpsertTableRowSideEffect
  | UpdateTableRowSideEffect
  | InsertTableRowSideEffect
  | DeleteTableRowSideEffect
  | SetFormValueSideEffect
  | SetComponentVisibleSideEffect
  | SetComponentDisabledSideEffect
  | SetFieldRequiredSideEffect
  | ShowMessageSideEffect;

export interface TableRowMutationBase {
  tableId: string;
  sheetName: string;
  keyField: string;
  keyValue: unknown;
}

export interface UpsertTableRowSideEffect extends TableRowMutationBase {
  kind: 'upsert-table-row';
  row: Record<string, unknown>;
}

export interface UpdateTableRowSideEffect extends TableRowMutationBase {
  kind: 'update-table-row';
  row: Record<string, unknown>;
}

export interface InsertTableRowSideEffect extends TableRowMutationBase {
  kind: 'insert-table-row';
  row: Record<string, unknown>;
}

export interface DeleteTableRowSideEffect extends TableRowMutationBase {
  kind: 'delete-table-row';
}

export interface SetFormValueSideEffect {
  kind: 'set-form-value';
  field: string;
  value: unknown;
}

export interface SetComponentVisibleSideEffect {
  kind: 'set-component-visible';
  componentId: string;
  visible: boolean;
}

export interface SetComponentDisabledSideEffect {
  kind: 'set-component-disabled';
  componentId: string;
  disabled: boolean;
}

export interface SetFieldRequiredSideEffect {
  kind: 'set-field-required';
  field: string;
  required: boolean;
}

export interface ShowMessageSideEffect {
  kind: 'show-message';
  message: string;
  level?: 'info' | 'warn' | 'error' | string;
}

type FlowResultLike = {
  sideEffects?: unknown;
  nodeResults?: Map<string, { outputs?: Record<string, unknown>; sideEffects?: unknown }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTableRowEffect(kind: FlowSideEffect['kind'], value: Record<string, unknown>): FlowSideEffect | null {
  const tableId = String(value.tableId || '');
  const sheetName = String(value.sheetName || '');
  const keyField = String(value.keyField || '');
  if (!tableId || !sheetName || !keyField) return null;
  const keyValue = value.keyValue;
  if (kind === 'delete-table-row') {
    if (keyValue == null) return null;
    return { kind, tableId, sheetName, keyField, keyValue };
  }
  const row = isRecord(value.row) ? value.row : null;
  if (!row) return null;
  const nextKeyValue = keyValue ?? row[keyField];
  if (nextKeyValue == null) return null;
  return { kind, tableId, sheetName, keyField, keyValue: nextKeyValue, row } as FlowSideEffect;
}

export function normalizeFlowSideEffect(value: unknown): FlowSideEffect | null {
  if (!isRecord(value)) return null;
  const kind = String(value.kind || '');
  if (kind === 'set-form-value') {
    const field = String(value.field || '');
    if (!field) return null;
    return { kind, field, value: value.value };
  }
  if (kind === 'set-component-visible') {
    const componentId = String(value.componentId || '');
    if (!componentId) return null;
    return { kind, componentId, visible: value.visible !== false };
  }
  if (kind === 'set-component-disabled') {
    const componentId = String(value.componentId || '');
    if (!componentId) return null;
    return { kind, componentId, disabled: !!value.disabled };
  }
  if (kind === 'set-field-required') {
    const field = String(value.field || '');
    if (!field) return null;
    return { kind, field, required: value.required !== false };
  }
  if (kind === 'show-message') {
    const message = String(value.message || '');
    if (!message) return null;
    return { kind, message, level: value.level ? String(value.level) : 'info' };
  }
  if (
    kind === 'upsert-table-row'
    || kind === 'update-table-row'
    || kind === 'insert-table-row'
    || kind === 'delete-table-row'
  ) {
    return normalizeTableRowEffect(kind, value);
  }
  return null;
}

export function extractNodeSideEffects(outputs: Record<string, unknown> | undefined): FlowSideEffect[] {
  if (!outputs) return [];
  const explicit = Array.isArray(outputs.sideEffects)
    ? outputs.sideEffects.map(normalizeFlowSideEffect).filter(Boolean) as FlowSideEffect[]
    : [];
  if (explicit.length > 0) return explicit;
  const legacyWriteBack = normalizeFlowSideEffect(outputs.writeBack);
  return legacyWriteBack ? [legacyWriteBack] : [];
}

export function collectFlowSideEffects(result: FlowResultLike): FlowSideEffect[] {
  const direct = Array.isArray(result.sideEffects)
    ? result.sideEffects.map(normalizeFlowSideEffect).filter(Boolean) as FlowSideEffect[]
    : [];
  if (direct.length > 0) return direct;
  const collected: FlowSideEffect[] = [];
  for (const nodeResult of result.nodeResults?.values?.() || []) {
    if (Array.isArray(nodeResult.sideEffects) && nodeResult.sideEffects.length > 0) {
      collected.push(...nodeResult.sideEffects.map(normalizeFlowSideEffect).filter(Boolean) as FlowSideEffect[]);
      continue;
    }
    collected.push(...extractNodeSideEffects(nodeResult.outputs));
  }
  return collected;
}
