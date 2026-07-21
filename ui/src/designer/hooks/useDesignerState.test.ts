import assert from 'node:assert/strict';
import test from 'node:test';
import { clampDesignerSize, DESIGNER_MIN_SIZES } from './useDesignerState';

test('table controls keep a readable minimum size', () => {
  assert.deepEqual(DESIGNER_MIN_SIZES.table, { w: 480, h: 200 });
  assert.deepEqual(clampDesignerSize('table', 120, 80), { width: 480, height: 200 });
  assert.deepEqual(clampDesignerSize('table', 640, 320), { width: 640, height: 320 });
});

test('unknown controls retain the generic minimum size', () => {
  assert.deepEqual(clampDesignerSize('unknown', 10, 10), { width: 96, height: 28 });
  assert.deepEqual(clampDesignerSize('unknown', Number.NaN, Number.NaN), { width: 96, height: 28 });
});

test('labelled single-line fields cannot be resized into a clipped state', () => {
  for (const type of ['input', 'number', 'datePicker', 'timePicker', 'dateRange', 'select', 'segmented']) {
    assert.equal(clampDesignerSize(type, 240, 68).height, 76, type);
  }
});
