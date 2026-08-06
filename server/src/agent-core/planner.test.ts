import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDynamicPlan } from './planner';

test('dynamic plan validation accepts a valid plan', () => {
  assert.deepEqual(validateDynamicPlan({ goal: 'g', successCriteria: ['x'], summary: '', steps: ['s'], assumptions: [], risks: [] }), []);
});

test('dynamic plan validation rejects missing goal and empty criteria', () => {
  assert.ok(validateDynamicPlan({ successCriteria: [] }).some((item) => /goal/.test(item)));
  assert.ok(validateDynamicPlan({ goal: 'g', successCriteria: [] }).some((item) => /successCriteria/.test(item)));
  assert.ok(validateDynamicPlan({ goal: 'g', successCriteria: ['x'], steps: 'not-an-array' as unknown as string[] }).some((item) => /steps/.test(item)));
});
