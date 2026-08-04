import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBehaviorDsl } from './parser';
import { createRule } from './parserRegex';
import { findCrossRuleCycles, findUnsatConditions, checkExpressionTypes } from './staticAnalysis';

test('FFR304 detects cross-rule compute cycles but not acyclic compute chains', () => {
  const cyclic = compileBehaviorDsl('compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)');
  assert.ok(cyclic.diagnostics.some((item) => item.code === 'FFR304' && item.severity === 'error'));
  const acyclic = compileBehaviorDsl('compute $A = $B + 1 watch($B)\ncompute $C = $A + 1 watch($A)');
  assert.ok(!acyclic.diagnostics.some((item) => item.code === 'FFR304'));
});

test('FFR304 single-rule self write stays FFR302 warning (no FFR304 escalation)', () => {
  const result = compileBehaviorDsl('on change($数量) -> set($数量, $数量 + 1)', { fields: ['数量'] });
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR302' && item.severity === 'warning'));
  assert.ok(!result.diagnostics.some((item) => item.code === 'FFR304'));
});

test('FFR305 flags watch-missing expression dependencies', () => {
  const result = compileBehaviorDsl('compute $合计 = $数量 * $单价 watch($数量)', { fields: ['数量', '单价', '合计'] });
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR305' && item.severity === 'error' && item.message.includes('单价')));
  const ok = compileBehaviorDsl('compute $合计 = $数量 * $单价 watch($数量, $单价)', { fields: ['数量', '单价', '合计'] });
  assert.ok(!ok.diagnostics.some((item) => item.code === 'FFR305'));
});

test('FFR306 expression type checker catches numeric misuse without false positives', () => {
  const fieldTypes = { 数量: 'number' as const, 名称: 'string' as const };
  assert.deepEqual(checkExpressionTypes('$数量 * 2', fieldTypes), []);
  assert.deepEqual(checkExpressionTypes('$数量 + $数量', fieldTypes), []);
  assert.deepEqual(checkExpressionTypes('upper($名称)', fieldTypes), []);
  assert.ok(checkExpressionTypes('$名称 * 2', fieldTypes).length > 0, '字符串参与乘法应报错');
  assert.deepEqual(checkExpressionTypes('$数量 / 0', fieldTypes), [], '除零由运行时处理，静态不误报');
  assert.ok(checkExpressionTypes('unknownFn($数量)', fieldTypes).length > 0, '未知函数与运行时 evaluatePropertyExpression 一致拒绝');
  assert.deepEqual(checkExpressionTypes('$未知字段 + 1', fieldTypes), [], '未知字段类型不误报');
});

test('FFR306 fires on compute expressions when fieldTypes provided', () => {
  const result = compileBehaviorDsl('compute $合计 = $数量 * $单价 watch($数量, $单价)', { fieldTypes: { 数量: 'string', 单价: 'number' } });
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR306' && item.severity === 'error'));
});

test('FFR307 rejects wrong reference kinds', () => {
  assert.ok(compileBehaviorDsl('when $部门 == "技术部" -> show($技术栈)').diagnostics.some((item) => item.code === 'FFR307'));
  assert.ok(compileBehaviorDsl('on change($状态) -> run($流程ID)').diagnostics.some((item) => item.code === 'FFR307'));
  assert.ok(compileBehaviorDsl('before submit -> range($年龄, "abc", 5)').diagnostics.some((item) => item.code === 'FFR307'));
  assert.ok(compileBehaviorDsl('before submit -> compare($结束日期, ">>", $开始日期)').diagnostics.some((item) => item.code === 'FFR307'));
});

test('FFR308 rejects UI actions in guard context and allows preparation actions', () => {
  assert.ok(compileBehaviorDsl('before submit -> show(@tech-stack)').diagnostics.some((item) => item.code === 'FFR308'));
  assert.ok(compileBehaviorDsl('before submit -> set($状态, "草稿"); message("请检查", warning)').diagnostics.every((item) => item.code !== 'FFR308'));
});

test('FFR309 detects unsat numeric intervals and conflicting equalities', () => {
  const rule = createRule('dsl_1', 't', { type: 'fieldChange', fieldName: 'x' }, [
    { fieldName: 'x', operator: '>', value: 5, logic: 'AND' },
    { fieldName: 'x', operator: '<', value: 3, logic: 'AND' },
  ], []);
  const diagnostics = findUnsatConditions([rule]);
  assert.ok(diagnostics.some((item) => item.code === 'FFR309' && item.severity === 'warning'));

  const equalConflict = createRule('dsl_2', 't', { type: 'fieldChange', fieldName: 'x' }, [
    { fieldName: 'x', operator: '==', value: 1, logic: 'AND' },
    { fieldName: 'x', operator: '==', value: 2, logic: 'AND' },
  ], []);
  assert.ok(findUnsatConditions([equalConflict]).some((item) => item.code === 'FFR309'));

  const satisfiable = createRule('dsl_3', 't', { type: 'fieldChange', fieldName: 'x' }, [
    { fieldName: 'x', operator: '>', value: 1, logic: 'AND' },
    { fieldName: 'x', operator: '<', value: 5, logic: 'AND' },
  ], []);
  assert.ok(!findUnsatConditions([satisfiable]).some((item) => item.code === 'FFR309'));
});

test('cross-rule cycle detection attributes to the correct rule lines', () => {
  const result = compileBehaviorDsl('compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)');
  const ffr304 = result.diagnostics.find((item) => item.code === 'FFR304');
  assert.ok(ffr304);
  assert.equal(ffr304!.line, 1);
  assert.match(ffr304!.message, /A → B → A|B → A → B/);
});
