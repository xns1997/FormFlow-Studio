import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDateTimeForDisplay, encodeDateTimeForStorage } from './controlTypes.ts';

test('date time storage round-trips through an explicit timezone', () => {
  const stored = encodeDateTimeForStorage('2026-07-28 12:00:00', 'Asia/Shanghai', 'datetime');
  assert.equal(stored, '2026-07-28T04:00:00Z');
  assert.equal(decodeDateTimeForDisplay(stored, 'Asia/Shanghai', 'datetime'), '2026-07-28 12:00:00');
});
