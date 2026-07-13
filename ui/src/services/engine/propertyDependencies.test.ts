import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPropertyReferences, findPropertyDependencyCycles } from './propertyDependencies';
import { resolveExpressionValues } from './propertyExpression';

test('依赖分析支持点路径与方括号路径', () => {
  assert.deepEqual(extractPropertyReferences('form.quantity * form.price + form["shipping"]'), ['quantity', 'price', 'shipping']);
});

test('循环依赖被报告且保留原有值', () => {
  const graph = new Map([['a', ['b']], ['b', ['a']]]);
  assert.deepEqual(findPropertyDependencyCycles(graph), [['a', 'b', 'a']]);
  const result = resolveExpressionValues([
    { field: 'a', props: { valueExpression: 'form.b + 1' } },
    { field: 'b', props: { valueExpression: 'form.a + 1' } },
  ], { a: 2, b: 3 });
  assert.equal(result.values.a, 2);
  assert.equal(result.values.b, 3);
  assert.match(result.diagnostics.a[0], /循环依赖/);
});
