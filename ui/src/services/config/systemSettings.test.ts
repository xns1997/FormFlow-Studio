import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultSystemSettings, normalizeSystemSettings } from './systemSettings';

test('system settings defaults are stable and router split is enabled by default', () => {
  const settings = createDefaultSystemSettings();
  assert.equal(settings.general.language, 'zh-CN');
  assert.equal(settings.general.showClock, true);
  assert.equal(settings.experiments.enableNewRouter, true);
  assert.equal(settings.experiments.enablePlaygroundDocs, true);
});

test('system settings normalization preserves nested defaults', () => {
  const settings = normalizeSystemSettings({ editor: { fontSize: 16 } as any, storage: { apiBase: '/api' } as any });
  assert.equal(settings.editor.fontSize, 16);
  assert.equal(settings.editor.lineNumbers, true);
  assert.equal(settings.editor.wordWrap, true);
  assert.equal(settings.storage.apiBase, '/api');
  assert.equal(settings.storage.preferOfflineSave, true);
  assert.equal(settings.storage.requestTimeoutMs, 15000);
});
