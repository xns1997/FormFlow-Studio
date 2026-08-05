import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultProjectSettings, createDefaultTableConfig, normalizeProjectSettings } from './types';

test('project settings defaults include behavior and publish strategies', () => {
  const settings = createDefaultProjectSettings();
  assert.equal(settings.behavior.enableJsScripts, true);
  assert.equal(settings.publish.outputFileName, 'formflow-export');
});

test('project settings normalization fills missing nested values', () => {
  const settings = normalizeProjectSettings({
    behavior: { enableJsScripts: false } as any,
    publish: { format: 'csv' } as any,
    workflow: { maxConcurrency: 8 } as any,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(settings.behavior.enableJsScripts, false);
  assert.equal(settings.behavior.enableNodeBehavior, true);
  assert.equal(settings.publish.format, 'csv');
  assert.equal(settings.publish.generateChangeLog, true);
  assert.equal(settings.workflow.maxConcurrency, 8);
  assert.equal(settings.workflow.retryCount, 2);
});

test('table config defaults keep manual save and natural row order', () => {
  const config = createDefaultTableConfig('table:sheet', '表 / Sheet1');
  assert.equal(config.autoSave, false, '自动保存默认关闭（手动保存）');
  assert.equal(config.rowOrder, undefined, '未配置自定义行序时按数据原始顺序展示');
});
