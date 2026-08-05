import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeEventJsCall, resolveEventJsCompletionContext } from './eventJsLanguageServices';

test('analyzeEventJsCall detects call name, argument index and string context', () => {
  const getValue = analyzeEventJsCall(`ctx.getValue('cust`);
  assert.ok(getValue && getValue.name === 'getValue' && getValue.argIndex === 0 && getValue.inStringOrArray === true);
  const setVisible = analyzeEventJsCall(`await ctx.setVisible('compId', tr`);
  assert.ok(setVisible && setVisible.name === 'setVisible' && setVisible.argIndex === 1 && setVisible.inStringOrArray === false);
  const getValues = analyzeEventJsCall(`ctx.getValues(['a', 'b`);
  assert.ok(getValues && getValues.name === 'getValues' && getValues.argIndex === 0 && getValues.inStringOrArray === true);
  const showMessage = analyzeEventJsCall(`showMessage('处理完成', 'succ`);
  assert.ok(showMessage && showMessage.name === 'showMessage' && showMessage.argIndex === 1 && showMessage.inStringOrArray === true);
  assert.equal(analyzeEventJsCall('const x = 1;'), null);
});

test('resolveEventJsCompletionContext maps argument positions to completion kinds', () => {
  const resolve = (linePrefix: string, completionPrefix = linePrefix) => resolveEventJsCompletionContext({ fullPrefix: linePrefix, linePrefix, completionPrefix });
  assert.equal(resolve(`ctx.getValue('`), 'field-name');
  assert.equal(resolve(`await ctx.setValues({`), 'json-object-key');
  assert.equal(resolve(`await ctx.setVisible('`), 'component-name');
  assert.equal(resolve(`ctx.querySheet('`), 'table-name');
  assert.equal(resolve(`await ctx.runWorkflow('`), 'workflow-name');
  assert.equal(resolve(`ctx.showMessage('处理完成', `), 'message-level');
  assert.equal(resolve(`ctx.controls.`), 'ctx-controls-member');
  assert.equal(resolve(`ctx.`), 'ctx-member');
  assert.equal(resolve(`ctx.values.`), 'ctx-values-member');
  assert.equal(resolve(`await ctx.setValues({ customerName: `), 'top-level');
});
