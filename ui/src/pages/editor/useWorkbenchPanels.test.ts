import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorkbenchLayout } from './useWorkbenchPanels';

test('workbench breakpoints preserve the canvas at desktop window sizes', () => {
  assert.equal(resolveWorkbenchLayout(1440), 'wide');
  assert.equal(resolveWorkbenchLayout(1200), 'wide');
  assert.equal(resolveWorkbenchLayout(1180), 'wide');
  assert.equal(resolveWorkbenchLayout(1179), 'medium');
  assert.equal(resolveWorkbenchLayout(1024), 'medium');
  assert.equal(resolveWorkbenchLayout(1023), 'compact');
  assert.equal(resolveWorkbenchLayout(900), 'compact');
});
