import assert from 'node:assert/strict';
import test from 'node:test';
import { reportError, getErrors, getErrorCounts, onError, clearErrors, fromDebugEntry, dismissError } from './errorManager';
import type { DebugEntry } from '../../project/types';

test('reportError creates error with categorization', () => {
  clearErrors();
  const error = reportError({ title: 'Test', message: '字段"姓名"不存在' });
  assert.equal(error.category, 'data-binding');
  assert.ok(error.cause.includes('字段'));
  assert.ok(error.fixes.length >= 1);
});

test('reportError categorizes expression errors', () => {
  clearErrors();
  const error = reportError({ title: 'Test', message: '表达式语法错误' });
  assert.equal(error.category, 'expression');
});

test('reportError categorizes network errors', () => {
  clearErrors();
  const error = reportError({ title: 'Test', message: '网络连接失败 fetch failed' });
  assert.equal(error.category, 'network');
});

test('reportError categorizes URLSearchParams runtime errors with fixes', () => {
  clearErrors();
  const error = reportError({ title: '当前工作区 区域崩溃', message: 'defaultSearchParams.forEach is not a function' });
  assert.equal(error.category, 'runtime');
  assert.ok(error.cause.includes('URLSearchParams'));
  assert.ok(error.fixes.some((fix) => fix.label === '刷新页面' && fix.action === 'refresh'));
  assert.ok(error.fixes.some((fix) => fix.label === '使用标准浏览器'));
});

test('reportError categorizes chunk load failures as network', () => {
  clearErrors();
  const error = reportError({ title: '加载失败', message: 'Failed to fetch dynamically imported module: /assets/foo.js' });
  assert.equal(error.category, 'network');
  assert.ok(error.fixes.some((fix) => fix.label === '刷新页面'));
});

test('reportError categorizes missing functions as runtime', () => {
  clearErrors();
  const error = reportError({ title: '运行错误', message: 'xxx.yyy is not a function' });
  assert.equal(error.category, 'runtime');
  assert.ok(error.fixes.some((fix) => fix.label === '刷新页面'));
});

test('reportError categorizes ResizeObserver loop with an ignore action', () => {
  clearErrors();
  const error = reportError({ title: '告警', message: 'ResizeObserver loop completed with undelivered notifications.' });
  assert.equal(error.category, 'runtime');
  assert.ok(error.fixes.some((fix) => fix.action === 'ignore'));
});

test('reportError categorizes invalid JSON responses', () => {
  clearErrors();
  const error = reportError({ title: '数据错误', message: 'Unexpected token < in JSON at position 0' });
  assert.equal(error.category, 'runtime');
  assert.ok(error.fixes.some((fix) => fix.label === '重试'));
});

test('reportError categorizes storage quota errors', () => {
  clearErrors();
  const error = reportError({ title: '存储失败', message: 'QuotaExceededError: local storage is full' });
  assert.equal(error.category, 'runtime');
  assert.ok(error.fixes.some((fix) => fix.label === '清理浏览器存储'));
});

test('reportError categorizes cross-origin Script error', () => {
  clearErrors();
  const error = reportError({ title: '未捕获的错误', message: 'Script error.' });
  assert.equal(error.category, 'runtime');
});

test('reportError categorizes security policy rejections as permission', () => {
  clearErrors();
  const error = reportError({ title: '被拒绝', message: 'SecurityError: The operation is not allowed.' });
  assert.equal(error.category, 'permission');
});

test('unknown errors now carry refresh and retry actions', () => {
  clearErrors();
  const error = reportError({ title: '未知', message: 'a totally brand-new failure mode' });
  assert.equal(error.category, 'unknown');
  assert.ok(error.fixes.some((fix) => fix.label === '刷新页面' && fix.action === 'refresh'));
  assert.ok(error.fixes.some((fix) => fix.label === '重试' && fix.action === 'retry'));
});

test('dismissError removes a single error and notifies listeners', () => {
  clearErrors();
  const error = reportError({ title: 'A', message: 'first' });
  reportError({ title: 'B', message: 'second' });
  assert.equal(getErrors().length, 2);

  let notifiedCount = 0;
  const unsub = onError(() => { notifiedCount += 1; });
  assert.equal(dismissError(error.id), true);
  assert.equal(getErrors().length, 1);
  assert.equal(getErrors()[0].title, 'B');
  assert.equal(dismissError('missing-id'), false);
  assert.ok(notifiedCount >= 1);
  unsub();
});

test('getErrors returns all errors when no filter', () => {
  clearErrors();
  reportError({ title: 'A', message: 'error 1' });
  reportError({ title: 'B', message: 'error 2' });
  const errors = getErrors();
  assert.equal(errors.length, 2);
});

test('getErrors filters by severity', () => {
  clearErrors();
  reportError({ title: 'A', message: 'error', severity: 'error' });
  reportError({ title: 'B', message: 'warn', severity: 'warn' });
  const errors = getErrors({ severity: 'error' });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].severity, 'error');
});

test('getErrorCounts returns correct counts', () => {
  clearErrors();
  reportError({ title: 'A', message: 'error', severity: 'error' });
  reportError({ title: 'B', message: 'warn', severity: 'warn' });
  reportError({ title: 'C', message: 'info', severity: 'info' });
  const counts = getErrorCounts();
  assert.equal(counts.error, 1);
  assert.equal(counts.warning, 1);
  assert.equal(counts.info, 1);
  assert.equal(counts.total, 3);
});

test('onError notifies listener on new error', () => {
  clearErrors();
  let notified = false;
  const unsub = onError(() => { notified = true; });
  reportError({ title: 'Test', message: 'test' });
  assert.ok(notified);
  unsub();
});

test('fromDebugEntry enriches with categorization', () => {
  const entry: DebugEntry = {
    id: 'test-1',
    timestamp: Date.now(),
    level: 'error',
    source: 'flow',
    channel: 'preview',
    title: 'Test',
    message: '流程执行超时',
  };
  const error = fromDebugEntry(entry);
  assert.equal(error.category, 'workflow');
  assert.ok(error.cause.length > 0);
});

test('clearErrors empties the error list', () => {
  reportError({ title: 'A', message: 'test' });
  clearErrors();
  assert.equal(getErrors().length, 0);
});
