import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultProjectSettings, normalizeProjectSettings } from './types';

test('project settings defaults include behavior and publish strategies', () => {
  const settings = createDefaultProjectSettings();
  assert.equal(settings.behavior.enableJsScripts, true);
  assert.equal(settings.publish.outputFileName, 'formflow-export');
});

test('project settings normalization fills missing nested values', () => {
  const settings = normalizeProjectSettings({
    behavior: { enableJsScripts: false } as any,
    publish: { format: 'csv' } as any,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(settings.behavior.enableJsScripts, false);
  assert.equal(settings.behavior.enableNodeBehavior, true);
  assert.equal(settings.publish.format, 'csv');
  assert.equal(settings.publish.generateChangeLog, true);
});
