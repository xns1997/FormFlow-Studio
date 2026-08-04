import assert from 'node:assert/strict';
import test from 'node:test';
import { getSectionNameFromError } from './SectionErrorBoundary';

test('getSectionNameFromError reads the section from context', () => {
  assert.equal(getSectionNameFromError({ title: '其他 区域崩溃', context: { section: '当前工作区' } }), '当前工作区');
});

test('getSectionNameFromError falls back to parsing the title', () => {
  assert.equal(getSectionNameFromError({ title: '表单设计区 区域崩溃' }), '表单设计区');
  assert.equal(getSectionNameFromError({ title: '诊断面板 区域崩溃', context: { componentStack: 'x' } }), '诊断面板');
});

test('getSectionNameFromError returns undefined when unknown', () => {
  assert.equal(getSectionNameFromError({ title: '未捕获的错误' }), undefined);
  assert.equal(getSectionNameFromError(undefined), undefined);
});
