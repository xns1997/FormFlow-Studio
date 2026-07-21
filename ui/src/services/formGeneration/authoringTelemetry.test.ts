import assert from 'node:assert/strict';
import test from 'node:test';
import { recordAuthoringEvent, summarizeAuthoringEvents } from './authoringTelemetry';

test('authoring metrics capture the plan success indicators without requiring storage', () => {
  const events = [recordAuthoringEvent('form_generated', { durationMs: 1200 }), recordAuthoringEvent('manual_control_added'), recordAuthoringEvent('manual_edge_added'), recordAuthoringEvent('first_run', { errorCount: 2 })];
  assert.deepEqual(summarizeAuthoringEvents(events), { generatedForms: 1, manualControls: 1, manualEdges: 1, undoCount: 0, firstRunErrors: 2 });
});
