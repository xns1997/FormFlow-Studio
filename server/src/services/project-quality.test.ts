import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectButtonAction } from './project-quality';

test('button action inspection only accepts executable handlers or enabled existing workflows', () => {
  const workflowIds = new Set(['query-workflow']);
  assert.equal(inspectButtonAction({ props: {} }, workflowIds).hasAction, false);
  assert.equal(inspectButtonAction({ props: { events: {} } }, workflowIds).hasAction, false);
  assert.equal(inspectButtonAction({ props: { events: { onClick: '   ' } } }, workflowIds).hasAction, false);
  assert.equal(inspectButtonAction({ props: { events: { onClick: 'return true;' } } }, workflowIds).hasAction, true);

  const disabled = inspectButtonAction({ props: { flowTriggers: { onClick: { enabled: false, workflowId: 'query-workflow' } } } }, workflowIds);
  assert.equal(disabled.hasAction, false);
  const incomplete = inspectButtonAction({ props: { flowTriggers: { onClick: { enabled: true } } } }, workflowIds);
  assert.equal(incomplete.hasAction, false);
  assert.equal(incomplete.incompleteTriggers, 1);
  const missing = inspectButtonAction({ props: { flowTriggers: { onClick: { enabled: true, workflowId: 'missing' } } } }, workflowIds);
  assert.equal(missing.hasAction, false);
  assert.deepEqual(missing.invalidWorkflowIds, ['missing']);
  assert.equal(inspectButtonAction({ props: { flowTriggers: { onClick: { enabled: true, workflowId: 'query-workflow' } } } }, workflowIds).hasAction, true);
});
