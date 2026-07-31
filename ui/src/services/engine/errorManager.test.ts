import assert from 'node:assert/strict';
import test from 'node:test';
import { reportError, getErrors, getErrorCounts, onError, clearErrors, fromDebugEntry } from './errorManager';
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
