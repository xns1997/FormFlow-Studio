import assert from 'node:assert/strict';
import test from 'node:test';
import { createBehaviorRuleModelPath } from './BehaviorDslEditor';

test('each form rule editor receives an isolated Monaco model path', () => {
  const intake = createBehaviorRuleModelPath('form-intake');
  const edit = createBehaviorRuleModelPath('form-edit');
  assert.notEqual(intake, edit);
  assert.equal(intake, 'inmemory://formflow/forms/form-intake/behavior-rules.ffrule');
});

test('form ids are safely encoded in Monaco model paths', () => {
  assert.equal(
    createBehaviorRuleModelPath('表单 / A'),
    'inmemory://formflow/forms/%E8%A1%A8%E5%8D%95%20%2F%20A/behavior-rules.ffrule',
  );
});
