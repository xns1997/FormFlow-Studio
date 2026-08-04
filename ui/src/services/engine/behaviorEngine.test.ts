import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeState } from '../../models';
import { compileBehaviorDsl } from '../../../../shared/formflow-core/behaviorDsl';
import { evaluateCondition, executeAllRules, type BehaviorRule } from './behaviorEngine';

function rule(overrides: Partial<BehaviorRule> = {}): BehaviorRule {
  return {
    id: 'test-rule',
    name: 'test',
    enabled: true,
    priority: 20,
    trigger: { type: 'fieldChange', fieldName: '数量' },
    conditions: [],
    actions: [{ type: 'setValue', targetField: '合计', expression: '$数量 * 2' }],
    sideEffects: [],
    ...overrides,
  } as BehaviorRule;
}

function runtimeState(formValues: Record<string, unknown>): RuntimeState {
  return {
    currentSheet: '', currentRow: 0, formValues: { ...formValues }, originalValues: {},
    dirtyFields: new Set<string>(), validationErrors: {}, componentStates: {}, behaviorLogs: [], submitResult: null,
  };
}

test('evaluateCondition: isEmpty/isNotEmpty treat null, undefined, empty string and empty array as empty (docs 8)', () => {
  for (const empty of [null, undefined, '', []]) {
    assert.equal(evaluateCondition(empty, { fieldName: 'x', operator: 'isEmpty', value: undefined } as never), true, `isEmpty(${JSON.stringify(empty)})`);
    assert.equal(evaluateCondition(empty, { fieldName: 'x', operator: 'isNotEmpty', value: undefined } as never), false, `isNotEmpty(${JSON.stringify(empty)})`);
  }
  for (const nonEmpty of [0, 'a', [1], { k: 1 }, false]) {
    assert.equal(evaluateCondition(nonEmpty, { fieldName: 'x', operator: 'isEmpty', value: undefined } as never), false);
    assert.equal(evaluateCondition(nonEmpty, { fieldName: 'x', operator: 'isNotEmpty', value: undefined } as never), true);
  }
});

test('evaluateCondition: ordering operators are exact negations on non-numeric inputs (docs 8/11.5)', () => {
  for (const value of ['abc', null, undefined, '', []]) {
    const gt = evaluateCondition(value, { fieldName: 'x', operator: '>', value: 5 } as never);
    const le = evaluateCondition(value, { fieldName: 'x', operator: '<=', value: 5 } as never);
    const lt = evaluateCondition(value, { fieldName: 'x', operator: '<', value: 5 } as never);
    const ge = evaluateCondition(value, { fieldName: 'x', operator: '>=', value: 5 } as never);
    assert.notEqual(gt, le, `> 与 <= 对 ${JSON.stringify(value)} 应恰有一个成立`);
    assert.notEqual(lt, ge, `< 与 >= 对 ${JSON.stringify(value)} 应恰有一个成立`);
  }
  // 数值域行为不变
  assert.equal(evaluateCondition(10, { fieldName: 'x', operator: '>', value: 5 } as never), true);
  assert.equal(evaluateCondition(10, { fieldName: 'x', operator: '<=', value: 5 } as never), false);
});

test('executeAllRules: fieldChange only fires rules whose trigger field matches the changed field', async () => {
  const rules = [
    rule(),
    rule({ id: 'other', trigger: { type: 'fieldChange', fieldName: '单价' }, actions: [{ type: 'setValue', targetField: '小计', expression: '1' }] }),
  ];
  const apply = (updater: (prev: ReturnType<typeof runtimeState>) => ReturnType<typeof runtimeState>) => { Object.assign(state, updater(state)); };
  const state = runtimeState({ 数量: 2, 单价: 3 });

  // 修改 部门（无关字段）→ 两条规则都不应触发
  state.formValues = { ...state.formValues, 部门: 'x' };
  const unrelated = await executeAllRules(rules, 'fieldChange', state, apply, undefined, undefined, undefined, '部门');
  assert.equal(unrelated.actionsExecuted, 0);
  assert.equal(state.formValues['合计'], undefined);
  assert.equal(state.formValues['小计'], undefined);

  // 修改 数量 → 只触发 数量 的规则
  state.formValues = { ...state.formValues, 数量: 4 };
  const onQuantity = await executeAllRules(rules, 'fieldChange', state, apply, undefined, undefined, undefined, '数量');
  assert.equal(onQuantity.actionsExecuted, 1);
  assert.equal(state.formValues['合计'], 8);
  assert.equal(state.formValues['小计'], undefined);
});

test('executeAllRules: rules without a fieldName still fire on any field change (backward compatible)', async () => {
  const rules = [rule({ trigger: { type: 'fieldChange' } as BehaviorRule['trigger'], actions: [{ type: 'setValue', targetField: '总标记', expression: '1' }] })];
  const apply = (updater: (prev: ReturnType<typeof runtimeState>) => ReturnType<typeof runtimeState>) => { Object.assign(state, updater(state)); };
  const state = runtimeState({ 数量: 1 });
  state.formValues = { ...state.formValues, 部门: 'x' };
  const result = await executeAllRules(rules, 'fieldChange', state, apply, undefined, undefined, undefined, '部门');
  assert.equal(result.actionsExecuted, 1);
  assert.equal(state.formValues['总标记'], 1);
});

test('behaviorEngine: guard actions validate and block on failure (before submit)', async () => {
  const { rules } = compileBehaviorDsl('before submit -> require($姓名, $手机号); message("请检查", warning)');
  const state = runtimeState({});
  const apply = (updater: (prev: typeof state) => typeof state) => { Object.assign(state, updater(state)); };

  // 姓名/手机号缺失 → 守卫失败，阻断后续动作（message 不执行），validationErrors 有记录
  const failed = await executeAllRules(rules as never, 'beforeSubmit' as never, state, apply);
  assert.equal(failed.success, false);
  assert.ok(failed.errors.length > 0 && failed.errors[0]!.includes('手机号'));
  assert.equal(failed.actionsExecuted, 0); // 守卫失败即抛出，当前规则后续动作（message）被跳过
  assert.ok(Object.values(state.validationErrors).some((message) => message.includes('姓名')));
  assert.ok(!state.behaviorLogs.some((log) => log.message.includes('请检查')));

  // 补全后通过
  const okState = runtimeState({ 姓名: '张', 手机号: '13800138000' });
  const applyOk = (updater: (prev: typeof okState) => typeof okState) => { Object.assign(okState, updater(okState)); };
  const passed = await executeAllRules(rules as never, 'beforeSubmit' as never, okState, applyOk);
  assert.equal(passed.success, true);
  assert.deepEqual(okState.validationErrors, {});
});

test('behaviorEngine: assertValidator / assertRange / assertLength / assertCompare guards', async () => {
  const { rules } = compileBehaviorDsl('before submit -> validate($邮箱, email); range($年龄, 18, 60); length($姓名, 2, 20); compare($结束日期, ">=", $开始日期)');
  const state = runtimeState({ 邮箱: 'not-an-email', 年龄: 17, 姓名: '张', 结束日期: '2026-01-01', 开始日期: '2026-06-01' });
  const apply = (updater: (prev: typeof state) => typeof state) => { Object.assign(state, updater(state)); };
  const failed = await executeAllRules(rules as never, 'beforeSubmit' as never, state, apply);
  assert.equal(failed.success, false);
  assert.equal(failed.actionsExecuted, 0); // 第一个 validate 就失败，后续守卫全部跳过
  assert.ok(failed.errors[0]!.includes('邮箱'));

  const okState = runtimeState({ 邮箱: 'a@b.com', 年龄: 30, 姓名: '张三丰', 结束日期: '2026-06-01', 开始日期: '2026-01-01' });
  const applyOk = (updater: (prev: typeof okState) => typeof okState) => { Object.assign(okState, updater(okState)); };
  const passed = await executeAllRules(rules as never, 'beforeSubmit' as never, okState, applyOk);
  assert.equal(passed.success, true);
});

test('behaviorEngine: assertCompare follows exact-negation ordering semantics (docs 8/11.5)', async () => {
  const { rules } = compileBehaviorDsl('before submit -> compare($结束日期, ">=", $开始日期)');
  // 开始日期为 NaN 文本：>= 是 < 的取反 → 守卫通过（与条件求值一致）
  const state = runtimeState({ 结束日期: '2026-01-01', 开始日期: 'abc' });
  const apply = (updater: (prev: typeof state) => typeof state) => { Object.assign(state, updater(state)); };
  const result = await executeAllRules(rules as never, 'beforeSubmit' as never, state, apply);
  assert.equal(result.success, true);
});
