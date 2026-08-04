import assert from 'node:assert/strict';
import test from 'node:test';
import { differentialCheck, generateProgram, mutateProgram, resetFuzzSeed, runFuzz } from './fuzzer';

test('differential: GAST-generated programs produce zero divergence', () => {
  resetFuzzSeed(20260803);
  for (let index = 0; index < 300; index += 1) {
    const divergence = differentialCheck(generateProgram(1 + (index % 3)));
    assert.equal(divergence, null, divergence || '');
  }
});

test('differential: token-level mutations never crash and never regress accepted inputs', () => {
  resetFuzzSeed(20260804);
  const base = Array.from({ length: 60 }, (_, index) => generateProgram(1 + (index % 3)));
  for (let index = 0; index < 200; index += 1) {
    const mutated = mutateProgram(base[index % base.length]!, 1 + (index % 3));
    const divergence = differentialCheck(mutated, { strict: false });
    assert.equal(divergence, null, divergence || '');
  }
});

test('fuzz smoke: bounded run reports zero divergence and zero crash', () => {
  const summary = runFuzz(120, 60, 20260805);
  assert.deepEqual(summary.divergences, []);
  assert.deepEqual(summary.crashes, []);
  assert.ok(summary.generated > 0);
  assert.ok(summary.mutated > 0);
});
