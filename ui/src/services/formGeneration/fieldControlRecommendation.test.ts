import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendControls } from './fieldControlRecommendation';

test('field recommendations explain the default while preserving meaningful alternatives', () => {
  assert.deepEqual(recommendControls({ name: '金额', dataType: 'number', nullable: false, sampleValues: [1, 2], uniqueCount: 2 }).map((item) => item.type), ['number', 'input', 'select']);
  assert.equal(recommendControls({ name: '状态', dataType: 'enum', nullable: false, sampleValues: ['草稿', '完成'], uniqueCount: 2 })[0].type, 'select');
  assert.equal(recommendControls({ name: '备注说明', dataType: 'string', nullable: true, sampleValues: ['长文本'], uniqueCount: 1 })[0].type, 'textarea');
});
