import assert from 'node:assert/strict';
import test from 'node:test';
import { getDiagnosticExplanation, getDiagnosticCategory } from './diagnosticCategories';

test('getDiagnosticExplanation returns cause, impact, and fixes for known diagnostic IDs', () => {
  const exp = getDiagnosticExplanation('missing-name:abc');
  assert.ok(exp);
  assert.ok(exp.cause.includes('字段名称'));
  assert.ok(exp.impact.includes('保存'));
  assert.ok(exp.fixes.length >= 1);
});

test('getDiagnosticExplanation returns undefined for unknown IDs', () => {
  const exp = getDiagnosticExplanation('totally-unknown:xyz');
  assert.equal(exp, undefined);
});

test('getDiagnosticCategory returns correct category for known prefixes', () => {
  assert.equal(getDiagnosticCategory('missing-name:abc').id, 'field-binding');
  assert.equal(getDiagnosticCategory('duplicate:abc').id, 'field-binding');
  assert.equal(getDiagnosticCategory('unbound:abc').id, 'field-binding');
  assert.equal(getDiagnosticCategory('button-action:abc').id, 'button');
  assert.equal(getDiagnosticCategory('linkage-cycle:abc').id, 'linkage');
  assert.equal(getDiagnosticCategory('broken-edge:abc').id, 'workflow');
  assert.equal(getDiagnosticCategory('invalid-key:abc').id, 'data-source');
});

test('getDiagnosticCategory falls back to layout for unknown', () => {
  assert.equal(getDiagnosticCategory('something-random:abc').id, 'layout');
});
