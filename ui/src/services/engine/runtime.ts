import type { RuntimeState, ComponentState, BehaviorLog, SubmitResult, ChangeLogEntry } from '../../models';
export type { RuntimeState, ComponentState, BehaviorLog, SubmitResult, ChangeLogEntry };

export function createRuntimeState(): RuntimeState {
  return {
    currentSheet: '',
    currentRow: 0,
    formValues: {},
    originalValues: {},
    dirtyFields: new Set(),
    validationErrors: {},
    componentStates: {},
    behaviorLogs: [],
    submitResult: null,
  };
}

export function initFormValues(state: RuntimeState, values: Record<string, unknown>): RuntimeState {
  return {
    ...state,
    formValues: { ...values },
    originalValues: { ...values },
    dirtyFields: new Set(),
    validationErrors: {},
  };
}

export function setFormValue(state: RuntimeState, field: string, value: unknown): RuntimeState {
  const isDirty = JSON.stringify(value) !== JSON.stringify(state.originalValues[field]);
  const newDirty = new Set(state.dirtyFields);
  if (isDirty) newDirty.add(field); else newDirty.delete(field);
  return {
    ...state,
    formValues: { ...state.formValues, [field]: value },
    dirtyFields: newDirty,
  };
}

export function getFormValue(state: RuntimeState, field: string): unknown {
  return state.formValues[field];
}

export function getDirtyFields(state: RuntimeState): string[] {
  return [...state.dirtyFields];
}

export function getChanges(state: RuntimeState): Record<string, { oldValue: unknown; newValue: unknown }> {
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
  for (const field of state.dirtyFields) {
    changes[field] = { oldValue: state.originalValues[field], newValue: state.formValues[field] };
  }
  return changes;
}

export function setComponentState(state: RuntimeState, componentId: string, patch: Partial<ComponentState>): RuntimeState {
  const current = state.componentStates[componentId] || { visible: true, disabled: false, readonly: false, loading: false };
  return {
    ...state,
    componentStates: { ...state.componentStates, [componentId]: { ...current, ...patch } },
  };
}

export function getComponentState(state: RuntimeState, componentId: string): ComponentState {
  return state.componentStates[componentId] || { visible: true, disabled: false, readonly: false, loading: false };
}

export function setValidationError(state: RuntimeState, field: string, error: string): RuntimeState {
  return { ...state, validationErrors: { ...state.validationErrors, [field]: error } };
}

export function clearValidationError(state: RuntimeState, field: string): RuntimeState {
  const errors = { ...state.validationErrors };
  delete errors[field];
  return { ...state, validationErrors: errors };
}

export function getValidationErrors(state: RuntimeState): Record<string, string> {
  return { ...state.validationErrors };
}

export function hasValidationErrors(state: RuntimeState): boolean {
  return Object.keys(state.validationErrors).length > 0;
}

export function addBehaviorLog(state: RuntimeState, log: BehaviorLog): RuntimeState {
  return { ...state, behaviorLogs: [...state.behaviorLogs, log] };
}

export function clearBehaviorLogs(state: RuntimeState): RuntimeState {
  return { ...state, behaviorLogs: [] };
}

export function switchRow(state: RuntimeState, rowIndex: number, rowData: Record<string, unknown>): RuntimeState {
  return {
    ...state,
    currentRow: rowIndex,
    formValues: { ...rowData },
    originalValues: { ...rowData },
    dirtyFields: new Set(),
    validationErrors: {},
    componentStates: {},
  };
}

export function submitForm(state: RuntimeState): RuntimeState {
  const changes = getChanges(state);
  const changeLog: ChangeLogEntry[] = Object.entries(changes).map(([field, change]) => ({
    sheet: state.currentSheet,
    rowIndex: state.currentRow,
    field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    timestamp: Date.now(),
  }));

  const result: SubmitResult = {
    success: !hasValidationErrors(state),
    changes,
    changeLog,
  };

  return {
    ...state,
    originalValues: { ...state.formValues },
    dirtyFields: new Set(),
    submitResult: result,
    behaviorLogs: [
      ...state.behaviorLogs,
      { timestamp: Date.now(), level: result.success ? 'info' : 'error', source: 'submit', message: result.success ? `提交成功，${changeLog.length} 项变更` : '提交失败，存在校验错误' },
    ],
  };
}
