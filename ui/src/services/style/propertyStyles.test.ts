import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSpacing, spacingToCss } from './propertyStyles';

test('旧数字间距与四方向结构使用同一归一化结果', () => {
  assert.deepEqual(normalizeSpacing(12), { top: 12, right: 12, bottom: 12, left: 12 });
  assert.deepEqual(normalizeSpacing({ top: 4, right: 8, bottom: 12, left: 16 }), { top: 4, right: 8, bottom: 12, left: 16 });
  assert.equal(spacingToCss({ all: 6, left: 10 }), '6px 6px 6px 10px');
});
