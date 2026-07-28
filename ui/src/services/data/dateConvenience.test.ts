import assert from 'node:assert/strict';
import test from 'node:test';
import { describeDateDefaultSource } from './dateConvenience';

test('date defaults are summarized in user-facing Chinese', () => {
  assert.equal(describeDateDefaultSource({ mode: 'none' }), '不预填');
  assert.equal(describeDateDefaultSource({ mode: 'today' }), '今天');
  assert.equal(describeDateDefaultSource({ mode: 'offsetFromNow', offset: -2, unit: 'day' }), '当前时间前 2天');
  assert.equal(describeDateDefaultSource({ mode: 'fromField', field: '开始日期', offset: 0, unit: 'day' }), '跟随字段 开始日期');
});
