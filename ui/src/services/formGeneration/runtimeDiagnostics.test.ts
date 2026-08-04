import assert from 'node:assert/strict';
import test from 'node:test';
import type { DebugEntry } from '../../project/types';
import { enrichDebugEntry, enrichDebugEntries, groupByCategory, CATEGORY_LABELS } from './runtimeDiagnostics';

const baseEntry: DebugEntry = {
  id: 'test-1',
  timestamp: Date.now(),
  level: 'error',
  source: 'flow',
  channel: 'preview',
  title: 'Test Error',
  message: '字段"员工姓名"不存在',
};

test('enrichDebugEntry categorizes data-binding errors correctly', () => {
  const diag = enrichDebugEntry(baseEntry);
  assert.equal(diag.category, 'data-binding');
  assert.ok(diag.cause.includes('字段'));
  assert.ok(diag.impact.length > 0);
  assert.ok(diag.fixes.length >= 1);
});

test('enrichDebugEntry categorizes expression errors correctly', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-2', message: '表达式语法错误 near position 5' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'expression');
});

test('enrichDebugEntry categorizes workflow timeout correctly', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-3', message: '流程执行超时 30000ms' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'workflow');
});

test('enrichDebugEntry categorizes permission errors correctly', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-4', message: '权限不足 forbidden 403' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'permission');
});

test('enrichDebugEntry categorizes network errors correctly', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-5', message: '网络连接失败 fetch failed' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'network');
});

test('enrichDebugEntry handles unknown errors gracefully', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6', message: 'something completely unexpected' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'unknown');
  assert.ok(diag.fixes.length >= 1);
});

test('enrichDebugEntry categorizes URLSearchParams runtime errors', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6b', message: 'defaultSearchParams.forEach is not a function' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'runtime');
  assert.ok(diag.cause.includes('URLSearchParams'));
  assert.ok(diag.fixes.some((fix) => fix.label === '刷新页面'));
});

test('enrichDebugEntry categorizes chunk load failures as network', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6c', message: 'Failed to fetch dynamically imported module' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'network');
  assert.ok(diag.fixes.some((fix) => fix.label === '刷新页面'));
});

test('enrichDebugEntry categorizes missing functions as runtime', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6d', message: 'something is not a function' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'runtime');
});

test('enrichDebugEntry categorizes ResizeObserver loop with an ignore action', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6e', message: 'ResizeObserver loop limit exceeded' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'runtime');
  assert.ok(diag.fixes.some((fix) => fix.action === 'ignore'));
});

test('enrichDebugEntry unknown fallback includes refresh and retry', () => {
  const entry: DebugEntry = { ...baseEntry, id: 'test-6f', message: 'a brand-new failure mode' };
  const diag = enrichDebugEntry(entry);
  assert.equal(diag.category, 'unknown');
  assert.ok(diag.fixes.some((fix) => fix.label === '刷新页面'));
  assert.ok(diag.fixes.some((fix) => fix.label === '重试'));
});

test('enrichDebugEntries processes multiple entries', () => {
  const entries: DebugEntry[] = [
    baseEntry,
    { ...baseEntry, id: 'test-7', message: '网络错误' },
  ];
  const diags = enrichDebugEntries(entries);
  assert.equal(diags.length, 2);
});

test('groupByCategory groups diagnostics correctly', () => {
  const entries: DebugEntry[] = [
    baseEntry,
    { ...baseEntry, id: 'test-8', message: '表达式错误' },
    { ...baseEntry, id: 'test-9', message: '字段缺失' },
  ];
  const diags = enrichDebugEntries(entries);
  const groups = groupByCategory(diags);
  assert.ok(groups.has('data-binding'));
  assert.ok(groups.has('expression'));
});

test('CATEGORY_LABELS has entries for all categories', () => {
  const categories = ['data-binding', 'expression', 'workflow', 'validation', 'runtime', 'network', 'permission', 'unknown'];
  for (const cat of categories) {
    assert.ok(CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS], `Missing label for ${cat}`);
    assert.ok(CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS].label);
    assert.ok(CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS].icon);
  }
});
