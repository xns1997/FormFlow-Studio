import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePropertyExpression, interpolatePropertyTemplate, resolveExpressionValues, resolveRuntimeProperties } from './propertyExpression';

test('受限 DSL 支持字段、算术、逻辑、空值和白名单函数', () => {
  const context = { form: { quantity: 3, price: 12.5, name: ' valve ' } };
  assert.deepEqual(evaluatePropertyExpression('form.quantity * form.price', context), { ok: true, value: 37.5 });
  assert.deepEqual(evaluatePropertyExpression('upper(trim(form.name))', context), { ok: true, value: 'VALVE' });
  assert.deepEqual(evaluatePropertyExpression('form.missing ?? 8', context), { ok: true, value: 8 });
});

test('受限 DSL 拒绝任意 JavaScript 和非白名单函数', () => {
  assert.equal(evaluatePropertyExpression('globalThis.alert(1)', {}).ok, false);
  assert.equal(evaluatePropertyExpression('constructor("return 1")()', {}).ok, false);
});

test('模板插值与运行时错误回退', () => {
  assert.deepEqual(interpolatePropertyTemplate('总价：{{form.quantity * form.price}}', { form: { quantity: 2, price: 9 } }), { ok: true, value: '总价：18' });
  const runtime = resolveRuntimeProperties({ valueExpression: 'form.count / 0', visibleExpression: 'form.show', requiredExpression: 'true' }, '原值', { form: { count: 2, show: false } });
  assert.equal(runtime.value, '原值');
  assert.equal(runtime.visible, false);
  assert.equal(runtime.required, true);
  assert.equal(runtime.diagnostics.length, 1);
});

test('计算字段链使用同一份派生表单值', () => {
  const result = resolveExpressionValues([
    { field: 'subtotal', props: { valueExpression: 'form.quantity * form.price' } },
    { field: 'total', props: { valueExpression: 'form.subtotal + form.shipping' } },
  ], { quantity: 2, price: 10, shipping: 3, subtotal: 0, total: 0 });
  assert.equal(result.values.subtotal, 20);
  assert.equal(result.values.total, 23);
});
