import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadableFieldName } from './useDesignerActions';

test('new input fields use readable labels and avoid collisions', () => {
  assert.equal(createReadableFieldName('联系电话', 'input', []), '联系电话');
  assert.equal(createReadableFieldName('联系电话', 'input', ['联系电话']), '联系电话_2');
  assert.equal(createReadableFieldName('金额（元）', 'number', []), '金额_元');
  assert.equal(createReadableFieldName('', 'input', []), 'input');
});
