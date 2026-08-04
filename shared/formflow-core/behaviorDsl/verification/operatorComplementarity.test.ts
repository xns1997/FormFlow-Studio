import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyOperatorComplementarity } from './operatorComplementarity';

test('mechanized verification: all 14 inverse operator pairs are complementary on the full domain', () => {
  const report = verifyOperatorComplementarity();
  assert.equal(report.allComplementaryOnFullDomain, true);
  assert.equal(report.pairs.length, 14);
  for (const pair of report.pairs) {
    assert.equal(pair.complementary, true, `${pair.operator}↔${pair.inverse} 应严格互补`);
  }
});

test('verification snapshot matches current run (regression guard)', () => {
  const snapshot = JSON.parse(readFileSync(new URL('./operator-complementarity.snapshot.json', import.meta.url), 'utf8'));
  const report = verifyOperatorComplementarity();
  const current = {
    allComplementaryOnFullDomain: report.allComplementaryOnFullDomain,
    pairCount: report.pairs.length,
    pairs: report.pairs.map((pair) => ({ operator: pair.operator, inverse: pair.inverse, complementary: pair.complementary })),
    findings: report.findings,
  };
  assert.deepEqual(current, snapshot);
});
