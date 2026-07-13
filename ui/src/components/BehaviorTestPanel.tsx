// 行为测试面板 — 在编辑器中验证行为逻辑

import React, { useState, useCallback, useRef } from 'react';
import type { EventFieldDescriptor } from './codeEditorSuggestions';
import type { DebugEntry } from '../project/types';
import DebugDrawer from './DebugDrawer';

interface TestLog {
  timestamp: number;
  type: 'call' | 'result' | 'error' | 'info';
  method?: string;
  args?: unknown[];
  result?: unknown;
  message: string;
}

interface BehaviorTestPanelProps {
  code: string;
  eventName: string;
  fields: EventFieldDescriptor[];
}

export default function BehaviorTestPanel({ code, eventName, fields }: BehaviorTestPanelProps) {
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = useCallback((log: Omit<TestLog, 'timestamp'>) => {
    setLogs((prev) => [...prev, { ...log, timestamp: Date.now() }]);
    const level = log.type === 'error' ? 'error' : log.type === 'info' ? 'info' : 'debug';
    setDebugEntries((prev) => [...prev, {
      id: `behavior-test:${Date.now()}:${prev.length}`,
      timestamp: Date.now(),
      level,
      source: 'script',
      channel: 'behavior-test',
      title: log.method || 'behavior-test',
      message: log.message,
      context: log.args ? { args: log.args, result: log.result } : undefined,
      eventName,
    }]);
    if (log.type === 'error') setDebugOpen(true);
  }, []);

  const runTest = useCallback(() => {
    setIsRunning(true);
    setLogs([]);
    setDebugEntries([]);
    addLog({ type: 'info', message: `开始执行 [${eventName}] 脚本...` });

    // Parse test values into formValues
    const formValues: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(testValues)) {
      if (val === '') continue;
      const field = fields.find((f) => f.name === key);
      if (field?.type === 'number') {
        formValues[key] = Number(val) || 0;
      } else if (field?.type === 'boolean') {
        formValues[key] = val === 'true';
      } else {
        formValues[key] = val;
      }
    }

    // Create mock ctx
    const visibleState: Record<string, boolean> = {};
    const disabledState: Record<string, boolean> = {};
    const requiredState: Record<string, boolean> = {};
    const mockCtx = {
      getValue: (fieldId: string) => {
        const val = formValues[fieldId];
        addLog({ type: 'call', method: 'getValue', args: [fieldId], result: val, message: `ctx.getValue("${fieldId}") → ${JSON.stringify(val)}` });
        return val;
      },
      getValues: (fieldIds: string[]) => {
        const result = Object.fromEntries(fieldIds.map((fieldId) => [fieldId, formValues[fieldId]]));
        addLog({ type: 'call', method: 'getValues', args: [fieldIds], result, message: `ctx.getValues(${JSON.stringify(fieldIds)}) → ${JSON.stringify(result)}` });
        return result;
      },
      setValue: (fieldId: string, value: unknown) => {
        formValues[fieldId] = value;
        addLog({ type: 'call', method: 'setValue', args: [fieldId, value], message: `ctx.setValue("${fieldId}", ${JSON.stringify(value)})` });
      },
      setValues: async (patch: Record<string, unknown>) => {
        for (const [fieldId, value] of Object.entries(patch)) {
          formValues[fieldId] = value;
          addLog({ type: 'call', method: 'setValues', args: [fieldId, value], message: `ctx.setValues → ${fieldId}=${JSON.stringify(value)}` });
        }
      },
      clearValue: async (fieldId: string) => {
        formValues[fieldId] = '';
        addLog({ type: 'call', method: 'clearValue', args: [fieldId], message: `ctx.clearValue("${fieldId}")` });
      },
      clearValues: async (fieldIds: string[]) => {
        for (const fieldId of fieldIds) {
          formValues[fieldId] = '';
          addLog({ type: 'call', method: 'clearValues', args: [fieldId], message: `ctx.clearValues → ${fieldId}` });
        }
      },
      setField: (fieldId: string, value: unknown) => {
        formValues[fieldId] = value;
        addLog({ type: 'call', method: 'setField', args: [fieldId, value], message: `ctx.setField("${fieldId}", ${JSON.stringify(value)})` });
      },
      get formData() { return formValues; },
      get originalData() { return formValues; },
      setVisible: (componentId: string, visible: boolean) => {
        visibleState[componentId] = visible;
        addLog({ type: 'call', method: 'setVisible', args: [componentId, visible], message: `ctx.setVisible("${componentId}", ${visible})` });
      },
      toggleVisible: async (componentId: string) => {
        const next = !(visibleState[componentId] ?? true);
        visibleState[componentId] = next;
        addLog({ type: 'call', method: 'toggleVisible', args: [componentId], result: next, message: `ctx.toggleVisible("${componentId}") → ${next}` });
        return next;
      },
      setDisabled: (componentId: string, disabled: boolean) => {
        disabledState[componentId] = disabled;
        addLog({ type: 'call', method: 'setDisabled', args: [componentId, disabled], message: `ctx.setDisabled("${componentId}", ${disabled})` });
      },
      toggleDisabled: async (componentId: string) => {
        const next = !(disabledState[componentId] ?? false);
        disabledState[componentId] = next;
        addLog({ type: 'call', method: 'toggleDisabled', args: [componentId], result: next, message: `ctx.toggleDisabled("${componentId}") → ${next}` });
        return next;
      },
      setRequired: (fieldId: string, required: boolean) => {
        requiredState[fieldId] = required;
        addLog({ type: 'call', method: 'setRequired', args: [fieldId, required], message: `ctx.setRequired("${fieldId}", ${required})` });
      },
      toggleRequired: async (fieldId: string) => {
        const next = !(requiredState[fieldId] ?? false);
        requiredState[fieldId] = next;
        addLog({ type: 'call', method: 'toggleRequired', args: [fieldId], result: next, message: `ctx.toggleRequired("${fieldId}") → ${next}` });
        return next;
      },
      setFieldState: async (fieldOrComponentId: string, patch: { value?: unknown; visible?: boolean; disabled?: boolean; required?: boolean }) => {
        if ('value' in patch) formValues[fieldOrComponentId] = patch.value;
        if ('visible' in patch) visibleState[fieldOrComponentId] = !!patch.visible;
        if ('disabled' in patch) disabledState[fieldOrComponentId] = !!patch.disabled;
        if ('required' in patch) requiredState[fieldOrComponentId] = !!patch.required;
        addLog({ type: 'call', method: 'setFieldState', args: [fieldOrComponentId, patch], message: `ctx.setFieldState("${fieldOrComponentId}", ${JSON.stringify(patch)})` });
      },
      focusField: async (fieldId: string) => {
        addLog({ type: 'call', method: 'focusField', args: [fieldId], message: `ctx.focusField("${fieldId}") [模拟定位]` });
      },
      focusControl: async (componentId: string) => {
        addLog({ type: 'call', method: 'focusControl', args: [componentId], message: `ctx.focusControl("${componentId}") [模拟定位]` });
      },
      scrollToField: async (fieldId: string) => {
        addLog({ type: 'call', method: 'scrollToField', args: [fieldId], message: `ctx.scrollToField("${fieldId}") [模拟滚动]` });
      },
      scrollToControl: async (componentId: string) => {
        addLog({ type: 'call', method: 'scrollToControl', args: [componentId], message: `ctx.scrollToControl("${componentId}") [模拟滚动]` });
      },
      switchTab: async (tabIdOrIndex: string | number) => {
        addLog({ type: 'call', method: 'switchTab', args: [tabIdOrIndex], message: `ctx.switchTab(${JSON.stringify(tabIdOrIndex)}) [模拟切换页签]` });
      },
      openTab: async (tabIdOrIndex: string | number) => {
        addLog({ type: 'call', method: 'openTab', args: [tabIdOrIndex], message: `ctx.openTab(${JSON.stringify(tabIdOrIndex)}) [模拟切换页签]` });
      },
      showMessage: (message: string, type: string = 'info') => {
        addLog({ type: 'call', method: 'showMessage', args: [message, type], message: `ctx.showMessage("${message}", "${type}")` });
      },
      validateField: (fieldId: string) => {
        const val = formValues[fieldId];
        const valid = val != null && val !== '';
        addLog({ type: 'call', method: 'validateField', args: [fieldId], result: valid, message: `ctx.validateField("${fieldId}") → ${valid}` });
        return valid;
      },
      querySheet: (sheetId: string, filter?: Record<string, unknown>) => {
        addLog({ type: 'call', method: 'querySheet', args: [sheetId, filter], result: [], message: `ctx.querySheet("${sheetId}") → [模拟返回空数组]` });
        return [];
      },
      updateRow: (rowId: string, patch: Record<string, unknown>) => {
        addLog({ type: 'call', method: 'updateRow', args: [rowId, patch], message: `ctx.updateRow(${rowId}, ${JSON.stringify(patch)})` });
      },
      submit: () => {
        addLog({ type: 'call', method: 'submit', message: 'ctx.submit() [模拟提交]' });
      },
      getState: () => ({ formValues, originalValues: formValues } as any),
    };

    // Execute script
    try {
      const fn = new Function('ctx', code);
      const result = fn(mockCtx);
      if (result instanceof Promise) {
        result
          .then(() => {
            addLog({ type: 'result', message: '执行完成' });
            printFinalState(formValues);
          })
          .catch((e) => {
            addLog({ type: 'error', message: `执行错误: ${e.message}` });
          })
          .finally(() => setIsRunning(false));
      } else {
        addLog({ type: 'result', message: '执行完成' });
        printFinalState(formValues);
        setIsRunning(false);
      }
    } catch (e) {
      addLog({ type: 'error', message: `语法错误: ${e instanceof Error ? e.message : String(e)}` });
      setIsRunning(false);
    }
  }, [code, eventName, testValues, fields, addLog]);

  const printFinalState = (formValues: Record<string, unknown>) => {
    const entries = Object.entries(formValues).filter(([k]) => testValues[k] !== undefined);
    if (entries.length > 0) {
      addLog({
        type: 'info',
        message: `最终状态: ${entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`,
      });
    }
  };

  const clearLogs = useCallback(() => setLogs([]), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 测试数据输入 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>模拟数据</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflow: 'auto' }}>
          {fields.slice(0, 8).map((field) => (
            <div key={field.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', width: 70, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</label>
              <input
                type="text"
                value={testValues[field.name] || ''}
                onChange={(e) => setTestValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                placeholder={field.type}
                style={{ flex: 1, padding: '3px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            type="button"
            onClick={runTest}
            disabled={isRunning}
            className="ui-btn ui-btn-primary ui-btn-xs"
          >
            {isRunning ? '执行中...' : '▶ 运行测试'}
          </button>
          <button type="button" onClick={clearLogs} className="ui-btn ui-btn-subtle ui-btn-xs">清空日志</button>
        </div>
      </div>

      {/* 执行日志 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>执行日志 ({logs.length})</div>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 11 }}>
            点击「运行测试」执行脚本
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                display: 'flex', gap: 6, fontSize: 10, padding: '3px 6px',
                borderRadius: 4,
                background: log.type === 'error' ? '#fef2f2' : log.type === 'result' ? '#f0fdf4' : 'transparent',
                color: log.type === 'error' ? 'var(--danger)' : log.type === 'result' ? '#16a34a' : 'var(--text)',
              }}>
                <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 9, flexShrink: 0 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {log.method && (
                  <span style={{ fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{log.method}</span>
                )}
                <span style={{ flex: 1, wordBreak: 'break-all' }}>{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <DebugDrawer
        entries={debugEntries}
        open={debugOpen}
        onToggle={setDebugOpen}
        title="行为测试调试"
      />
    </div>
  );
}
