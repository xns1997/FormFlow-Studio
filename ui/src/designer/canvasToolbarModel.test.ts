import assert from 'node:assert/strict';
import test from 'node:test';
import { getCanvasToolbarAvailability } from './canvasToolbarModel';

test('canvas commands expose only actions that can currently succeed', () => {
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: null, canUndo: false, canRedo: false, canPaste: false }), {
    undo: false, redo: false, copy: false, paste: false, duplicate: false, delete: false, layer: false,
  });
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: 'field-1', canUndo: true, canRedo: false, canPaste: true }), {
    undo: true, redo: false, copy: true, paste: true, duplicate: true, delete: true, layer: true,
  });
});
