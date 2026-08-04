import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBehaviorDsl } from '../../../../shared/formflow-core/behaviorDsl';
import { runReferenceSemantics } from '../../../../shared/formflow-core/behaviorDsl/referenceSemantics';
import { executeAllRules } from './behaviorEngine';

test('reference semantics: differential against behaviorEngine on shared action subset', async () => {
  const scenarios: Array<{ source: string; values: Record<string, unknown>; events: Array<{ type: 'fieldChange'; field: string; value: unknown }> }> = [
    {
      source: 'when $部门 == "技术部" -> show(@tech-stack); set($技术栈, "React")\nelse -> hide(@tech-stack); clear($技术栈)',
      values: { 部门: '产品部' },
      events: [{ type: 'fieldChange', field: '部门', value: '技术部' }],
    },
    {
      source: 'compute $合计 = $数量 * 2 watch($数量)',
      values: { 数量: 2 },
      events: [{ type: 'fieldChange', field: '数量', value: 4 }],
    },
  ];
  for (const scenario of scenarios) {
    const { rules } = compileBehaviorDsl(scenario.source);
    const engineState = {
      currentSheet: '', currentRow: 0,
      formValues: { ...scenario.values },
      originalValues: {},
      dirtyFields: new Set<string>(),
      validationErrors: {},
      componentStates: {},
      behaviorLogs: [],
      submitResult: null,
    };
    const apply = (updater: (prev: typeof engineState) => typeof engineState) => { Object.assign(engineState, updater(engineState)); };
    for (const event of scenario.events) {
      engineState.formValues = { ...engineState.formValues, [event.field]: event.value };
      await executeAllRules(rules as never, 'fieldChange' as never, engineState as never, apply as never, undefined, undefined, undefined, event.field);
    }
    const reference = runReferenceSemantics(rules, scenario.values, scenario.events, { cascade: false });
    assert.deepEqual(reference.state.formValues, engineState.formValues, 'formValues 差分不一致');
  }
});

test('behaviorEngine: field change only fires rules for the changed field (regression)', async () => {
  const { rules } = compileBehaviorDsl('compute $合计 = $数量 * 2 watch($数量)');
  const engineState = {
    currentSheet: '', currentRow: 0, formValues: { 数量: 2 } as Record<string, unknown>, originalValues: {},
    dirtyFields: new Set<string>(), validationErrors: {}, componentStates: {}, behaviorLogs: [], submitResult: null,
  };
  const apply = (updater: (prev: typeof engineState) => typeof engineState) => { Object.assign(engineState, updater(engineState)); };
  engineState.formValues = { ...engineState.formValues, 部门: 'x' };
  await executeAllRules(rules as never, 'fieldChange' as never, engineState as never, apply as never, undefined, undefined, undefined, '部门');
  // 修复后：改 部门 不会触发 数量 的计算规则（文档 11.4）
  assert.equal(engineState.formValues['合计'], undefined);
  const reference = runReferenceSemantics(rules, { 数量: 2 }, [{ type: 'fieldChange', field: '部门', value: 'x' }], { cascade: false });
  assert.equal(reference.state.formValues['合计'], undefined);
});
