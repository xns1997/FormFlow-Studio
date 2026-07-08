import type { RuntimeState } from '../../models';
import type { SrcTableEntry } from '../../project/types';
import { setFormValue, setComponentState, addBehaviorLog, setValidationError, clearValidationError } from '../engine/runtime';
import { validateField } from '../engine/validator';
import {
  buildFillFormPatch,
  buildResetFormPatch,
  findRowInTables,
  findRowsInTables,
  nextSequenceInTables,
  querySheetRows,
  validateRequiredFields,
  type FillFormOptions,
  type FindRowOptions,
  type FindRowsOptions,
  type NextSequenceOptions,
  type RequireFieldsOptions,
  type ResetFormOptions,
} from '../engine/crudHelpers';

export interface SandboxContext {
  getValue: (fieldId: string) => unknown;
  getValues: (fieldIds: string[]) => Record<string, unknown>;
  setValue: (fieldId: string, value: unknown) => void;
  setValues: (patch: Record<string, unknown>) => Promise<void>;
  clearValue: (fieldId: string) => Promise<void>;
  clearValues: (fieldIds: string[]) => Promise<void>;
  setField: (fieldId: string, value: unknown) => void;
  formData: Record<string, unknown>;
  originalData: Record<string, unknown>;
  setVisible: (componentId: string, visible: boolean) => void;
  toggleVisible: (componentId: string) => Promise<boolean>;
  setDisabled: (componentId: string, disabled: boolean) => void;
  toggleDisabled: (componentId: string) => Promise<boolean>;
  setRequired: (fieldId: string, required: boolean) => void;
  toggleRequired: (fieldId: string) => Promise<boolean>;
  setFieldState: (fieldOrComponentId: string, patch: { value?: unknown; visible?: boolean; disabled?: boolean; required?: boolean }) => Promise<void>;
  focusField: (fieldId: string) => Promise<void>;
  focusControl: (componentId: string) => Promise<void>;
  scrollToField: (fieldId: string) => Promise<void>;
  scrollToControl: (componentId: string) => Promise<void>;
  switchTab: (tabIdOrIndex: string | number) => Promise<void>;
  openTab: (tabIdOrIndex: string | number) => Promise<void>;
  showMessage: (message: string, type?: string) => void;
  validateField: (fieldId: string) => boolean;
  querySheet: (sheetId: string, filter?: Record<string, unknown>) => unknown[];
  findRows: (sheetId: string, criteria?: Record<string, unknown>, options?: FindRowsOptions) => unknown[];
  findRow: (sheetId: string, criteria: Record<string, unknown>, options?: FindRowOptions) => unknown;
  nextSequence: (sheetId: string, column: string, options?: NextSequenceOptions) => number;
  fillForm: (record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FillFormOptions) => Promise<unknown>;
  requireFields: (fields: string[], options?: RequireFieldsOptions) => Promise<unknown>;
  resetForm: (options?: ResetFormOptions) => Promise<unknown>;
  updateRow: (rowId: string, patch: Record<string, unknown>) => void;
  submit: () => void;
  getState: () => RuntimeState;
}

export function createSandboxContext(
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
  tables: SrcTableEntry[] = [],
  onSubmit?: () => void,
): SandboxContext {
  const localValues: Record<string, unknown> = { ...state.formValues };
  const localVisible: Record<string, boolean> = {};
  const localDisabled: Record<string, boolean> = {};
  const localRequired: Record<string, boolean> = {};

  const appendLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => {
    setState((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level, source: 'js', message }));
  };

  const writeFieldValue = (fieldId: string, value: unknown, method: 'setValue' | 'setField' = 'setValue') => {
    localValues[fieldId] = value;
    setState((prev) => {
      const next = setFormValue(prev, fieldId, value);
      return addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'js', message: `${method}("${fieldId}", ${JSON.stringify(value)})` });
    });
  };

  return {
    getValue: (fieldId: string) => localValues[fieldId],
    getValues: (fieldIds: string[]) => Object.fromEntries(fieldIds.map((fieldId) => [fieldId, localValues[fieldId]])),
    setValue: (fieldId: string, value: unknown) => {
      writeFieldValue(fieldId, value, 'setValue');
    },
    setValues: async (patch: Record<string, unknown>) => {
      for (const [fieldId, value] of Object.entries(patch)) {
        writeFieldValue(fieldId, value, 'setValue');
      }
    },
    clearValue: async (fieldId: string) => {
      writeFieldValue(fieldId, '', 'setValue');
    },
    clearValues: async (fieldIds: string[]) => {
      for (const fieldId of fieldIds) {
        writeFieldValue(fieldId, '', 'setValue');
      }
    },
    setField: (fieldId: string, value: unknown) => {
      writeFieldValue(fieldId, value, 'setField');
    },
    get formData() { return localValues; },
    get originalData() { return state.originalValues; },
    setVisible: (componentId: string, visible: boolean) => {
      localVisible[componentId] = visible;
      setState((prev) => setComponentState(prev, componentId, { visible }));
      appendLog('info', `setVisible("${componentId}", ${visible})`);
    },
    toggleVisible: async (componentId: string) => {
      const next = !(localVisible[componentId] ?? true);
      localVisible[componentId] = next;
      setState((prev) => setComponentState(prev, componentId, { visible: next }));
      appendLog('info', `toggleVisible("${componentId}") → ${next}`);
      return next;
    },
    setDisabled: (componentId: string, disabled: boolean) => {
      localDisabled[componentId] = disabled;
      setState((prev) => setComponentState(prev, componentId, { disabled }));
      appendLog('info', `setDisabled("${componentId}", ${disabled})`);
    },
    toggleDisabled: async (componentId: string) => {
      const next = !(localDisabled[componentId] ?? false);
      localDisabled[componentId] = next;
      setState((prev) => setComponentState(prev, componentId, { disabled: next }));
      appendLog('info', `toggleDisabled("${componentId}") → ${next}`);
      return next;
    },
    setRequired: (fieldId: string, required: boolean) => {
      localRequired[fieldId] = required;
      setState((prev) => {
        const cs = { ...prev.componentStates };
        const current = cs[fieldId] || { visible: true, disabled: false, readonly: false, loading: false };
        cs[fieldId] = { ...current } as any;
        return addBehaviorLog(
          { ...prev, componentStates: cs },
          { timestamp: Date.now(), level: 'info', source: 'js', message: `setRequired("${fieldId}", ${required})` }
        );
      });
    },
    toggleRequired: async (fieldId: string) => {
      const next = !(localRequired[fieldId] ?? false);
      localRequired[fieldId] = next;
      setState((prev) => {
        const cs = { ...prev.componentStates };
        const current = cs[fieldId] || { visible: true, disabled: false, readonly: false, loading: false };
        cs[fieldId] = { ...current } as any;
        return addBehaviorLog(
          { ...prev, componentStates: cs },
          { timestamp: Date.now(), level: 'info', source: 'js', message: `toggleRequired("${fieldId}") → ${next}` },
        );
      });
      return next;
    },
    setFieldState: async (fieldOrComponentId: string, patch) => {
      if ('value' in patch) writeFieldValue(fieldOrComponentId, patch.value, 'setValue');
      if ('visible' in patch) {
        localVisible[fieldOrComponentId] = !!patch.visible;
        setState((prev) => setComponentState(prev, fieldOrComponentId, { visible: !!patch.visible }));
        appendLog('info', `setFieldState("${fieldOrComponentId}").visible → ${!!patch.visible}`);
      }
      if ('disabled' in patch) {
        localDisabled[fieldOrComponentId] = !!patch.disabled;
        setState((prev) => setComponentState(prev, fieldOrComponentId, { disabled: !!patch.disabled }));
        appendLog('info', `setFieldState("${fieldOrComponentId}").disabled → ${!!patch.disabled}`);
      }
      if ('required' in patch) {
        localRequired[fieldOrComponentId] = !!patch.required;
        setState((prev) => {
          const cs = { ...prev.componentStates };
          const current = cs[fieldOrComponentId] || { visible: true, disabled: false, readonly: false, loading: false };
          cs[fieldOrComponentId] = { ...current } as any;
          return addBehaviorLog(
            { ...prev, componentStates: cs },
            { timestamp: Date.now(), level: 'info', source: 'js', message: `setFieldState("${fieldOrComponentId}").required → ${!!patch.required}` },
          );
        });
      }
    },
    focusField: async (fieldId: string) => {
      appendLog('info', `focusField("${fieldId}") [沙箱模拟]`);
    },
    focusControl: async (componentId: string) => {
      appendLog('info', `focusControl("${componentId}") [沙箱模拟]`);
    },
    scrollToField: async (fieldId: string) => {
      appendLog('info', `scrollToField("${fieldId}") [沙箱模拟]`);
    },
    scrollToControl: async (componentId: string) => {
      appendLog('info', `scrollToControl("${componentId}") [沙箱模拟]`);
    },
    switchTab: async (tabIdOrIndex: string | number) => {
      appendLog('info', `switchTab(${JSON.stringify(tabIdOrIndex)}) [沙箱模拟]`);
    },
    openTab: async (tabIdOrIndex: string | number) => {
      appendLog('info', `openTab(${JSON.stringify(tabIdOrIndex)}) [沙箱模拟]`);
    },
    showMessage: (message: string, type: string = 'info') => {
      setState((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: type as any, source: 'js', message }));
    },
    validateField: (fieldId: string) => {
      const value = localValues[fieldId];
      const error = validateField(value, [{ type: 'required', message: `${fieldId} 为必填项` }]);
      if (error) {
        setState((prev) => setValidationError(prev, fieldId, error));
        return false;
      }
      setState((prev) => clearValidationError(prev, fieldId));
      return true;
    },
    querySheet: (sheetId: string, filter?: Record<string, unknown>) => {
      const rows = querySheetRows(tables, sheetId, filter) as unknown[];
      if (rows.length > 0 || tables.some((table) => table.id === sheetId || table.sheets.some((sheet) => sheet.name === sheetId || `${table.id}:${sheet.name}` === sheetId))) {
        setState((prev) => addBehaviorLog(prev, {
          timestamp: Date.now(), level: 'info', source: 'js',
          message: `querySheet("${sheetId}") → ${rows.length} 行`,
        }));
        return rows;
      }
      setState((prev) => addBehaviorLog(prev, {
        timestamp: Date.now(), level: 'warn', source: 'js',
        message: `querySheet("${sheetId}") → 未找到`,
      }));
      return [];
    },
    findRows: (sheetId: string, criteria: Record<string, unknown> = {}, options: FindRowsOptions = {}) => {
      const rows = findRowsInTables(tables, sheetId, criteria, options);
      appendLog('info', `findRows("${sheetId}") → ${rows.length} 行`);
      return rows;
    },
    findRow: (sheetId: string, criteria: Record<string, unknown>, options: FindRowOptions = {}) => {
      const row = findRowInTables(tables, sheetId, criteria, options);
      appendLog('info', `findRow("${sheetId}") → ${row ? '命中' : '未命中'}`);
      return row;
    },
    nextSequence: (sheetId: string, column: string, options: NextSequenceOptions = {}) => {
      const value = nextSequenceInTables(tables, sheetId, column, options);
      appendLog('info', `nextSequence("${sheetId}", "${column}") → ${value}`);
      return value;
    },
    fillForm: async (record, fieldMap, options = {}) => {
      const result = buildFillFormPatch(record, fieldMap, options);
      for (const [fieldId, value] of Object.entries(result.patch)) {
        writeFieldValue(fieldId, value, 'setValue');
      }
      for (const [fieldId, value] of Object.entries(result.originalPatch)) {
        writeFieldValue(fieldId, value, 'setValue');
      }
      for (const componentId of result.enableComponentIds) {
        localDisabled[componentId] = false;
        setState((prev) => setComponentState(prev, componentId, { disabled: false }));
      }
      appendLog('info', `fillForm() → ${result.appliedFields.join(', ') || '0 fields'}`);
      return result;
    },
    requireFields: async (fields, options = {}) => {
      const result = validateRequiredFields(localValues, fields, options);
      if (!result.valid && result.message) {
        setState((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: (options.level || 'error') as any, source: 'js', message: result.message }));
      }
      appendLog('info', `requireFields(${JSON.stringify(fields)}) → ${result.valid}`);
      return result;
    },
    resetForm: async (options = {}) => {
      const result = buildResetFormPatch(localValues, options);
      for (const [fieldId, value] of Object.entries(result.patch)) {
        writeFieldValue(fieldId, value, 'setValue');
      }
      if (result.message) appendLog('info', result.message);
      if (result.focusedField) appendLog('info', `focusField("${result.focusedField}") [沙箱模拟]`);
      return result;
    },
    updateRow: (rowId: string, patch: Record<string, unknown>) => {
      setState((prev) => {
        const newValues = { ...prev.formValues };
        for (const [key, val] of Object.entries(patch)) {
          if (String(rowId) === String(prev.currentRow) || rowId === '*') {
            newValues[key] = val;
          }
        }
        return addBehaviorLog(
          { ...prev, formValues: newValues },
          { timestamp: Date.now(), level: 'info', source: 'js', message: `updateRow(${rowId}, ${JSON.stringify(patch)})` }
        );
      });
    },
    submit: () => {
      if (onSubmit) onSubmit();
    },
    getState: () => ({
      ...state,
      formValues: { ...localValues },
    }),
  };
}

export function executeScript(
  code: string,
  context: SandboxContext,
  timeout: number = 5000,
): { success: boolean; result?: unknown; error?: string } {
  const sandbox = {
    ctx: context,
    console: { log: (...args: unknown[]) => context.showMessage(args.join(' '), 'info'), warn: (...args: unknown[]) => context.showMessage(args.join(' '), 'warn'), error: (...args: unknown[]) => context.showMessage(args.join(' '), 'error') },
  };

  try {
    const keys = Object.keys(sandbox);
    const values = Object.values(sandbox);
    const fn = new Function(...keys, `with(sandbox) { ${code} }`);
    let result: unknown = null;

    const timer = setTimeout(() => { throw new Error(`脚本执行超时 (${timeout}ms)`); }, timeout);
    try {
      result = fn(...values);
    } finally {
      clearTimeout(timer);
    }

    return { success: true, result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
