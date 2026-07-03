import assert from 'node:assert/strict';
import test from 'node:test';
import { codeEditorSuggestionInternals, type CodeEditorSuggestion } from './CodeEditor';

const {
  inferJsonCompletionMode,
  resolveCompletionMode,
  resolveCompletionInsertText,
  resolveCompletionContext,
  resolveCompletionQuery,
} = codeEditorSuggestionInternals;

test('ctx values member mode is resolved precisely', () => {
  assert.equal(resolveCompletionMode('javascript', 'ctx.values.na', 'ctx.values.'), 'ctx-values-member');
  assert.equal(resolveCompletionMode('javascript', 'ctx.getValue(\'姓', 'ctx.getValue(\''), 'field-name');
  assert.equal(resolveCompletionMode('javascript', 'ctx.na', 'ctx.'), 'ctx-member');
});

test('json completion mode differentiates key, value and array contexts', () => {
  assert.equal(inferJsonCompletionMode('{\n  "na'), 'json-object-key');
  assert.equal(inferJsonCompletionMode('{\n  "name": '), 'json-object-value');
  assert.equal(inferJsonCompletionMode('{\n  "name": "$va'), 'json-string-value');
  assert.equal(inferJsonCompletionMode('[\n  '), 'json-array-value');
});

test('quoted insert text is trimmed only for key and string contexts', () => {
  const item: CodeEditorSuggestion = { label: '$value', insertText: '"$value"', scope: 'json-string-value' };
  assert.equal(resolveCompletionInsertText(item, '', 'json-string-value'), '$value');
  assert.equal(resolveCompletionInsertText(item, '', 'json-object-key'), '$value');
  assert.equal(resolveCompletionInsertText(item, '', 'json-object-value'), '"$value"');
});

test('completion context fallback keeps scoped candidates instead of collapsing to empty', () => {
  const fieldName: CodeEditorSuggestion = { label: 'employeeId', scope: 'field-name' };
  const template: CodeEditorSuggestion = { label: 'typed async callback', scope: 'top-level' };
  assert.equal(resolveCompletionContext(fieldName, 'field-name'), true);
  assert.equal(resolveCompletionContext(template, 'field-name'), false);
});

test('completion query reads quoted fragments for field names and json strings', () => {
  assert.equal(
    resolveCompletionQuery('javascript', 'field-name', 'ctx.getValue("职', { word: '', startColumn: 1, endColumn: 1 }),
    '职',
  );
  assert.equal(
    resolveCompletionQuery('json', 'json-string-value', '{ "name": "$fo', { word: '', startColumn: 1, endColumn: 1 }),
    '$fo',
  );
  assert.equal(
    resolveCompletionQuery('javascript', 'ctx-member', 'ctx.val', { word: 'val', startColumn: 1, endColumn: 4 }),
    'val',
  );
});
