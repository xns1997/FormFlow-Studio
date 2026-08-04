import assert from 'node:assert/strict';
import test from 'node:test';
import * as fc from 'fast-check';
import { compileBehaviorDsl } from './parser';
import { compileBehaviorDslRegex } from './parserRegex';

const SOURCE_ARBITRARY = fc.string({ minLength: 0, maxLength: 200 });

test('totality: compileBehaviorDsl never throws on arbitrary text', () => {
  fc.assert(
    fc.property(SOURCE_ARBITRARY, (source) => {
      assert.doesNotThrow(() => compileBehaviorDsl(source));
    }),
    { numRuns: 500 },
  );
});

test('totality: legacy parser also never throws on arbitrary text', () => {
  fc.assert(
    fc.property(SOURCE_ARBITRARY, (source) => {
      assert.doesNotThrow(() => compileBehaviorDslRegex(source));
    }),
    { numRuns: 500 },
  );
});

test('determinism: same input twice yields byte-identical compilation', () => {
  fc.assert(
    fc.property(SOURCE_ARBITRARY, (source) => {
      assert.equal(JSON.stringify(compileBehaviorDsl(source)), JSON.stringify(compileBehaviorDsl(source)));
    }),
    { numRuns: 300 },
  );
});

test('watch coverage property: FFR305 fires exactly when an expression ref is missing from watch', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 3 }),
      fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 3 }),
      (watched, expressed) => {
        const source = `compute $target = ${[...new Set(expressed)].map((field) => `$${field}`).join(' + ')} watch(${[...new Set(watched)].map((field) => `$${field}`).join(', ')})`;
        const result = compileBehaviorDsl(source);
        const missing = [...new Set(expressed)].filter((field) => !watched.includes(field));
        const hasFfr305 = result.diagnostics.some((item) => item.code === 'FFR305');
        assert.equal(hasFfr305, missing.length > 0);
      },
    ),
    { numRuns: 100 },
  );
});
