import assert from 'node:assert/strict';
import test from 'node:test';
import { getCanvasToolbarAvailability } from './canvasToolbarModel';
import { FORM_WINDOW_CELL_ID } from './formWindowModel';

test('canvas commands expose only actions that can currently succeed', () => {
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: null, canUndo: false, canRedo: false, canPaste: false }), {
    undo: false, redo: false, copy: false, paste: false, duplicate: false, delete: false, layer: false,
  });
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: 'field-1', canUndo: true, canRedo: false, canPaste: true }), {
    undo: true, redo: false, copy: true, paste: true, duplicate: true, delete: true, layer: true,
  });
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: FORM_WINDOW_CELL_ID, canUndo: true, canRedo: false, canPaste: true }), {
    undo: true, redo: false, copy: false, paste: true, duplicate: false, delete: false, layer: false,
  });
  assert.deepEqual(getCanvasToolbarAvailability({ selectedId: null, selectedIds: ['field-1', 'field-2'], canUndo: true, canRedo: false, canPaste: true }), {
    undo: true, redo: false, copy: true, paste: true, duplicate: true, delete: true, layer: true,
  });
});
