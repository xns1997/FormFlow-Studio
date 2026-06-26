import type { RuntimeState } from '../models';
import type { SrcTableEntry } from '../project/types';
import { getFormValue, setFormValue, setComponentState, addBehaviorLog, setValidationError, clearValidationError } from './runtime';
import { validateField } from './validator';

export interface SandboxContext {
  getValue: (fieldId: string) => unknown;
  setValue: (fieldId: string, value: unknown) => void;
  setVisible: (componentId: string, visible: boolean) => void;
  setDisabled: (componentId: string, disabled: boolean) => void;
  setRequired: (fieldId: string, required: boolean) => void;
  showMessage: (message: string, type?: string) => void;
  validateField: (fieldId: string) => boolean;
  querySheet: (sheetId: string, filter?: Record<string, unknown>) => unknown[];
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
  return {
    getValue: (fieldId: string) => getFormValue(state, fieldId),
    setValue: (fieldId: string, value: unknown) => {
      setState((prev) => {
        const next = setFormValue(prev, fieldId, value);
        return addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'js', message: `setValue("${fieldId}", ${JSON.stringify(value)})` });
      });
    },
    setVisible: (componentId: string, visible: boolean) => {
      setState((prev) => setComponentState(prev, componentId, { visible }));
    },
    setDisabled: (componentId: string, disabled: boolean) => {
      setState((prev) => setComponentState(prev, componentId, { disabled }));
    },
    setRequired: (fieldId: string, required: boolean) => {
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
    showMessage: (message: string, type: string = 'info') => {
      setState((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: type as any, source: 'js', message }));
    },
    validateField: (fieldId: string) => {
      const value = getFormValue(state, fieldId);
      const error = validateField(value, [{ type: 'required', message: `${fieldId} 为必填项` }]);
      if (error) {
        setState((prev) => setValidationError(prev, fieldId, error));
        return false;
      }
      setState((prev) => clearValidationError(prev, fieldId));
      return true;
    },
    querySheet: (sheetId: string, filter?: Record<string, unknown>) => {
      for (const table of tables) {
        for (const sheet of table.sheets) {
          const fullId = `${table.id}:${sheet.name}`;
          if (fullId === sheetId || sheet.name === sheetId || table.id === sheetId) {
            let rows = sheet.preview;
            if (filter && typeof filter === 'object') {
              rows = rows.filter((row) =>
                Object.entries(filter).every(([k, v]) => row[k] === v)
              );
            }
            setState((prev) => addBehaviorLog(prev, {
              timestamp: Date.now(), level: 'info', source: 'js',
              message: `querySheet("${sheetId}") → ${rows.length} 行`,
            }));
            return rows;
          }
        }
      }
      setState((prev) => addBehaviorLog(prev, {
        timestamp: Date.now(), level: 'warn', source: 'js',
        message: `querySheet("${sheetId}") → 未找到`,
      }));
      return [];
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
    getState: () => state,
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
