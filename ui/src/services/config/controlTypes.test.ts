import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultComponentValue, getRuntimeComponentType, isEditableComponentType, normalizeDateTimeValue } from './controlTypes';

test('control type adapter preserves legacy aliases and new control types', () => {
  assert.equal(getRuntimeComponentType('number'), 'numberInput');
  assert.equal(getRuntimeComponentType('image'), 'image');
  assert.equal(getRuntimeComponentType('card'), 'container');
  assert.equal(getRuntimeComponentType('segmented'), 'segmented');
  assert.equal(getRuntimeComponentType('timePicker'), 'timePicker');
});

test('default component values are structured for complex control types', () => {
  assert.deepEqual(getDefaultComponentValue({ type: 'checkbox', props: {} }), []);
  assert.deepEqual(getDefaultComponentValue({ type: 'tagInput', props: {} }), []);
  assert.deepEqual(getDefaultComponentValue({ type: 'upload', props: {} }), []);
  assert.deepEqual(getDefaultComponentValue({ type: 'dateRange', props: {} }), { start: '', end: '' });
  assert.equal(getDefaultComponentValue({ type: 'switch', props: {} }), true);
  assert.equal(getDefaultComponentValue({ type: 'text', props: { content: '默认内容' } }), '默认内容');
});

test('editable component detection includes the new business control set', () => {
  assert.equal(isEditableComponentType('timePicker'), true);
  assert.equal(isEditableComponentType('dateRange'), true);
  assert.equal(isEditableComponentType('segmented'), true);
  assert.equal(isEditableComponentType('tagInput'), true);
  assert.equal(isEditableComponentType('steps'), false);
});

test('date and time normalization keeps antd-compatible formats stable', () => {
  assert.equal(normalizeDateTimeValue('2026-07-06T10:28:53', 'datetime'), '2026-07-06 10:28:53');
  assert.equal(normalizeDateTimeValue('2026-07-06 10:28:53', 'datetime'), '2026-07-06 10:28:53');
  assert.equal(normalizeDateTimeValue('2026-07-06T10:28:53', 'date'), '2026-07-06');
  assert.equal(normalizeDateTimeValue('2026/07/06', 'date'), '2026-07-06');
  assert.equal(normalizeDateTimeValue('2026年07月06日', 'date'), '2026-07-06');
  assert.equal(normalizeDateTimeValue('10:28:53', 'time'), '10:28:53');
});
