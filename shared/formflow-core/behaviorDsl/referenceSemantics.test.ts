import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBehaviorDsl } from './parser';
import { runReferenceSemantics, evaluateConditionValue } from './referenceSemantics';
import { boundedModelCheck, verifyDeterminism } from './modelChecker';

test('reference semantics: when/else executes strict inverse branch (doc 12.1)', () => {
  const source = 'when $部门 == "技术部" -> show(@tech-stack); set($技术栈, "React")\nelse -> hide(@tech-stack); clear($技术栈)';
  const { rules } = compileBehaviorDsl(source);
  const matched = runReferenceSemantics(rules, { 部门: '技术部' }, [{ type: 'fieldChange', field: '部门', value: '技术部' }], { cascade: false });
  assert.equal(matched.state.componentStates['tech-stack']?.visible, true);
  assert.equal(matched.state.formValues['技术栈'], 'React');
  const notMatched = runReferenceSemantics(rules, { 部门: '产品部' }, [{ type: 'fieldChange', field: '部门', value: '产品部' }], { cascade: false });
  assert.equal(notMatched.state.componentStates['tech-stack']?.visible, false);
  assert.equal(notMatched.state.formValues['技术栈'], '');
});

test('reference semantics: when/else stay complementary on non-numeric inputs (doc 11.5)', () => {
  const { rules } = compileBehaviorDsl('when $x > 5 -> set($y, 1)\nelse -> set($y, 2)');
  for (const value of ['abc', null, undefined, '', []]) {
    const result = runReferenceSemantics(rules, {}, [{ type: 'fieldChange', field: 'x', value }], { cascade: false });
    // 精确取反语义：when 不命中时 else 必须命中，且 when 命中时 else 不命中
    assert.equal(result.state.formValues['y'], 2, `x=${JSON.stringify(value)} 时应执行 else`);
  }
  const whenHits = runReferenceSemantics(rules, {}, [{ type: 'fieldChange', field: 'x', value: 10 }], { cascade: false });
  assert.equal(whenHits.state.formValues['y'], 1);
});

test('reference semantics: compute trigger chain recomputes target (doc 12.2/11.6)', () => {
  const { rules } = compileBehaviorDsl('compute $合计 = $数量 * $单价 watch($数量, $单价)');
  const result = runReferenceSemantics(rules, { 数量: 2, 单价: 3 }, [{ type: 'fieldChange', field: '单价', value: 4 }], { cascade: true });
  assert.equal(result.state.formValues['合计'], 8);
  assert.ok(result.terminated);
});

test('reference semantics: guard actions block on failure and pass on success (doc 12.5)', () => {
  const { rules } = compileBehaviorDsl('before submit -> require($姓名, $手机号); message("请检查", warning)');
  const failed = runReferenceSemantics(rules, { 姓名: '张' }, [{ type: 'beforeSubmit' }], { cascade: false });
  assert.ok(failed.state.guardFailures.some((item) => item.includes('手机号')));
  const passed = runReferenceSemantics(rules, { 姓名: '张', 手机号: '13800138000' }, [{ type: 'beforeSubmit' }], { cascade: false });
  assert.deepEqual(passed.state.guardFailures, []);
});

test('reference semantics: isEmpty treats empty array as empty per docs (aligned with behaviorEngine)', () => {
  assert.equal(evaluateConditionValue([], { fieldName: 'x', operator: 'isEmpty', value: undefined, logic: 'AND' }), true);
  assert.equal(evaluateConditionValue([], { fieldName: 'x', operator: 'isEmpty', value: undefined, logic: 'AND' }, false), false);
});

test('reference semantics: button click guard blocks the click action when guard fails (doc 12.6)', () => {
  const { rules } = compileBehaviorDsl('before click("lookup") -> requireAny($教师ID, $姓名)');
  const failed = runReferenceSemantics(rules, {}, [{ type: 'buttonClick', buttonName: 'lookup' }], { cascade: false });
  assert.ok(failed.state.guardFailures.length > 0);
  const passed = runReferenceSemantics(rules, { 姓名: '王' }, [{ type: 'buttonClick', buttonName: 'lookup' }], { cascade: false });
  assert.deepEqual(passed.state.guardFailures, []);
});

test('reference semantics: on submit runs workflow and shows message (doc 12.8)', () => {
  const { rules } = compileBehaviorDsl('on submit -> run("save_employee"); message("提交完成", success)');
  const result = runReferenceSemantics(rules, {}, [{ type: 'submit' }], { cascade: false });
  assert.deepEqual(result.state.workflowRuns, [{ workflowId: 'save_employee' }]);
  assert.deepEqual(result.state.messages, [{ level: 'success', message: '提交完成' }]);
});

test('model checker: compute cycle yields a counterexample (termination violation)', () => {
  const { rules } = compileBehaviorDsl('compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)');
  const result = boundedModelCheck(rules, { maxDepth: 8, maxStates: 2000 });
  assert.equal(result.acyclic, false);
  assert.ok(result.counterexample && result.counterexample.length > 0);
  assert.ok(result.notes.some((note) => note.includes('状态重复') || note.includes('深度达到上限')));
});

test('model checker: acyclic compute chain terminates', () => {
  const { rules } = compileBehaviorDsl('compute $A = $B + 1 watch($B)\ncompute $C = $A + 1 watch($A)');
  const result = boundedModelCheck(rules, { maxDepth: 10, maxStates: 2000 });
  assert.equal(result.acyclic, true);
});

test('model checker: determinism of the transition function', () => {
  const { rules } = compileBehaviorDsl('when $A == 1 -> set($B, 2)\nwhen $B == 2 -> set($C, 3)');
  assert.equal(verifyDeterminism(rules, { A: 1 }, { type: 'fieldChange', field: 'A', value: 1 }), true);
});
