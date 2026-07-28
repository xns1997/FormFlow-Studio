import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSequenceValue, getNextSequenceNumber, parseSequenceValue, resolveSequenceDateTokens } from './sequenceRules.ts';

test('sequence formatter supports zero-padded placeholders', () => {
  assert.equal(formatSequenceValue(12, 'P-{n:4}'), 'P-0012');
  assert.equal(parseSequenceValue('P-0012', 'P-{n:4}'), 12);
});

test('next sequence scans existing formatted values', () => {
  const rows = [{ code: 'P-0007' }, { code: 'P-0009' }, { code: '' }];
  assert.equal(getNextSequenceNumber(rows, 'code', { start: 1, step: 1, formatter: 'P-{n:4}' }), 10);
});

test('sequence formatter supports date tokens', () => {
  const now = new Date('2026-07-22T08:00:00.000Z');
  assert.equal(resolveSequenceDateTokens('BX-{yyyyMM}-{dd}', now), 'BX-202607-22');
  assert.equal(formatSequenceValue(12, 'BX-{yyyy}{MM}-{n:4}', now), 'BX-202607-0012');
  assert.equal(parseSequenceValue('BX-202607-0012', 'BX-{yyyy}{MM}-{n:4}', now), 12);
  assert.equal(formatSequenceValue(12, 'BX-{yyyyMM}-{n:4}', now), 'BX-202607-0012');
  assert.equal(parseSequenceValue('BX-202607-0012', 'BX-{yyyyMM}-{n:4}', now), 12);
});

test('date-prefixed sequence resets for a new period', () => {
  const now = new Date('2026-07-22T08:00:00.000Z');
  const rows = [{ code: 'BX-202606-0007' }, { code: 'BX-202607-0009' }];
  assert.equal(getNextSequenceNumber(rows, 'code', { start: 1, step: 1, formatter: 'BX-{yyyy}{MM}-{n:4}' }, now), 10);
  const nextMonth = new Date('2026-08-01T08:00:00.000Z');
  assert.equal(getNextSequenceNumber(rows, 'code', { start: 1, step: 1, formatter: 'BX-{yyyy}{MM}-{n:4}' }, nextMonth), 1);
});
