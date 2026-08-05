import type { RuntimeState, ComponentState, BehaviorLog, SubmitResult, ChangeLogEntry } from '../../models';
export type { RuntimeState, ComponentState, BehaviorLog, SubmitResult, ChangeLogEntry };

/** 创建初始运行时状态（空值、无日志）。 */
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

/** 用初始值填充表单并记录原始值基线。 */
export function initFormValues(state: RuntimeState, values: Record<string, unknown>): RuntimeState {
  return {
    ...state,
    formValues: { ...values },
    originalValues: { ...values },
    dirtyFields: new Set(),
    validationErrors: {},
  };
}

/** 设置字段值（同步记录 dirty 与变更历史）。 */
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

/** 读取字段值。 */
export function getFormValue(state: RuntimeState, field: string): unknown {
  return state.formValues[field];
}

/** 相对初始值发生变化的字段列表。 */
export function getDirtyFields(state: RuntimeState): string[] {
  return [...state.dirtyFields];
}

/** 全部字段的新旧值对照。 */
export function getChanges(state: RuntimeState): Record<string, { oldValue: unknown; newValue: unknown }> {
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
  for (const field of state.dirtyFields) {
    changes[field] = { oldValue: state.originalValues[field], newValue: state.formValues[field] };
  }
  return changes;
}

/** 更新控件运行时状态。 */
export function setComponentState(state: RuntimeState, componentId: string, patch: Partial<ComponentState>): RuntimeState {
  const current = state.componentStates[componentId] || { visible: true, disabled: false, readonly: false, loading: false };
  return {
    ...state,
    componentStates: { ...state.componentStates, [componentId]: { ...current, ...patch } },
  };
}

/** 读取控件运行时状态。 */
export function getComponentState(state: RuntimeState, componentId: string): ComponentState {
  return state.componentStates[componentId] || { visible: true, disabled: false, readonly: false, loading: false };
}

/** 记录字段校验错误。 */
export function setValidationError(state: RuntimeState, field: string, error: string): RuntimeState {
  return { ...state, validationErrors: { ...state.validationErrors, [field]: error } };
}

/** 清除字段校验错误。 */
export function clearValidationError(state: RuntimeState, field: string): RuntimeState {
  const errors = { ...state.validationErrors };
  delete errors[field];
  return { ...state, validationErrors: errors };
}

/** 全部校验错误（字段 → 消息）。 */
export function getValidationErrors(state: RuntimeState): Record<string, string> {
  return { ...state.validationErrors };
}

/** 是否存在校验错误。 */
export function hasValidationErrors(state: RuntimeState): boolean {
  return Object.keys(state.validationErrors).length > 0;
}

/** 追加一条行为执行日志。 */
export function addBehaviorLog(state: RuntimeState, log: BehaviorLog): RuntimeState {
  return { ...state, behaviorLogs: [...state.behaviorLogs, log] };
}

/** 清空行为日志。 */
export function clearBehaviorLogs(state: RuntimeState): RuntimeState {
  return { ...state, behaviorLogs: [] };
}

/** 切换到指定数据行（重置 dirty 与校验）。 */
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

/** 标记表单已提交（触发提交后状态）。 */
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
