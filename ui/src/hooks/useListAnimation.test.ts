import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRowsWithLeaving, staggerDelay } from './useListAnimation';

test('stagger delays increase while intervals shrink (accelerating) and stay capped', () => {
  const delays = Array.from({ length: 20 }, (_, index) => staggerDelay(index));
  // 延迟严格递增：后面的项出现得更晚。
  for (let index = 1; index < delays.length; index += 1) {
    assert.ok(delays[index] > delays[index - 1], `d[${index}](${delays[index]}) 应大于 d[${index - 1}](${delays[index - 1]})`);
  }
  // 间隔递减：越到后面出现得越快（速度越来越快）。
  for (let index = 2; index < 9; index += 1) {
    const gap = delays[index] - delays[index - 1];
    const prevGap = delays[index - 1] - delays[index - 2];
    assert.ok(gap < prevGap, `gap[${index}](${gap}) 应小于 gap[${index - 1}](${prevGap})`);
  }
  // 封顶：超长列表总等待有界。
  assert.ok(staggerDelay(999) <= 320);
  assert.equal(staggerDelay(999), staggerDelay(500));
  assert.equal(staggerDelay(999), 300);
});

test('mergeRowsWithLeaving keeps keys unique when items reappear mid-leave', () => {
  const items = [
    { key: 'a', item: { id: 1 } },
    { key: 'b', item: { id: 2 } },
  ];
  const leaving = [
    { key: 'a', item: { id: 1 } }, // 已重新出现在 items 中 → 丢弃
    { key: 'c', item: { id: 3 } },
    { key: 'c', item: { id: 3 } }, // leaving 内部重复 → 丢弃
  ];
  const rows = mergeRowsWithLeaving(items, leaving);
  assert.deepEqual(rows.map((row) => row.key), ['a', 'b', 'c']);
  assert.deepEqual(rows.map((row) => row.leaving), [false, false, true]);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length, '返回的 key 必须唯一');
});
