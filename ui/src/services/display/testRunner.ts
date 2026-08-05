// 测试运行器 - 整合所有服务

import type { RuntimeState, BehaviorLog } from '../../models';
import { createRuntimeState, setFormValue, addBehaviorLog } from '../engine/runtime';
import { executeAllRules, type BehaviorRule } from '../engine/behaviorEngine';
import { type BindingError } from './errorChecker';

export interface TestRunnerState {
  runtime: RuntimeState;
  behaviorRules: BehaviorRule[];
  bindingErrors: BindingError[];
  isRunning: boolean;
}

/** 创建测试运行器状态。 */
export function createTestRunner(): TestRunnerState {
  return {
    runtime: createRuntimeState(),
    behaviorRules: [],
    bindingErrors: [],
    isRunning: false,
  };
}

/** 加载测试数据（表单/规则/表）。 */
export function loadTestData(
  state: TestRunnerState,
  sheetName: string,
  rowIndex: number,
  rowData: Record<string, unknown>,
): TestRunnerState {
  const runtime: RuntimeState = {
    ...state.runtime,
    currentSheet: sheetName,
    currentRow: rowIndex,
    formValues: { ...rowData },
    originalValues: { ...rowData },
    dirtyFields: new Set(),
    validationErrors: {},
    componentStates: {},
  };

  const logs: BehaviorLog[] = [
    ...runtime.behaviorLogs,
    { timestamp: Date.now(), level: 'info', source: 'test-runner', message: `加载数据: Sheet=${sheetName}, Row=${rowIndex + 1}` },
  ];

  return { ...state, runtime: { ...runtime, behaviorLogs: logs } };
}

/** 运行表单加载测试。 */
export async function runFormLoad(
  state: TestRunnerState,
  setState: (updater: (prev: TestRunnerState) => TestRunnerState) => void,
): Promise<void> {
  const result = await executeAllRules(state.behaviorRules, 'formLoad', state.runtime, (updater) => {
    setState((prev) => ({ ...prev, runtime: updater(prev.runtime) }));
  });
  if (result.logs.length > 0) {
    setState((prev) => ({
      ...prev,
      runtime: {
        ...prev.runtime,
        behaviorLogs: [...prev.runtime.behaviorLogs, ...result.logs],
      },
    }));
  }
}

/** 运行字段变化测试。 */
export async function runFieldChange(
  state: TestRunnerState,
  fieldName: string,
  newValue: unknown,
  setState: (updater: (prev: TestRunnerState) => TestRunnerState) => void,
): Promise<void> {
  let updated = setFormValue(state.runtime, fieldName, newValue);
  updated = addBehaviorLog(updated, { timestamp: Date.now(), level: 'info', source: 'test-runner', message: `字段变化: ${fieldName} → ${JSON.stringify(newValue)}` });
  setState((prev) => ({ ...prev, runtime: updated }));

  const result = await executeAllRules(state.behaviorRules, 'fieldChange', updated, (updater) => {
    setState((prev) => ({ ...prev, runtime: updater(prev.runtime) }));
  }, undefined, undefined, undefined, fieldName);
  if (result.logs.length > 0) {
    setState((prev) => ({
      ...prev,
      runtime: {
        ...prev.runtime,
        behaviorLogs: [...prev.runtime.behaviorLogs, ...result.logs],
      },
    }));
  }
}

/** 运行提交测试。 */
export async function runSubmit(
  state: TestRunnerState,
  setState: (updater: (prev: TestRunnerState) => TestRunnerState) => void,
): Promise<void> {
  const result = await executeAllRules(state.behaviorRules, 'submit', state.runtime, (updater) => {
    setState((prev) => ({ ...prev, runtime: updater(prev.runtime) }));
  });
  if (result.logs.length > 0) {
    setState((prev) => ({
      ...prev,
      runtime: {
        ...prev.runtime,
        behaviorLogs: [...prev.runtime.behaviorLogs, ...result.logs],
      },
    }));
  }
}
