import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORM_WINDOW_COORDINATE_SPACE,
  FORM_WINDOW_FOOTER_HEIGHT,
  FORM_WINDOW_HEADER_HEIGHT,
  canvasToLocalPoint,
  clampComponentToContent,
  getFormWindowLayout,
  growFormWindowToFit,
  localToCanvasPoint,
  migrateCanvasComponentsToWindowLocal,
} from '../../../../shared/form-window-layout';

const windowConfig = {
  x: 40,
  y: 30,
  width: 640,
  height: 480,
  props: { padding: { top: 20, right: 30, bottom: 40, left: 50 }, showFooter: true },
};

test('form-window coordinates round-trip through one canonical content origin', () => {
  const layout = getFormWindowLayout(windowConfig);
  assert.equal(layout.header.height, FORM_WINDOW_HEADER_HEIGHT);
  assert.equal(layout.footer?.height, FORM_WINDOW_FOOTER_HEIGHT);
  assert.deepEqual(layout.content, {
    x: 90,
    y: 30 + FORM_WINDOW_HEADER_HEIGHT + 20,
    width: 560,
    height: 480 - FORM_WINDOW_HEADER_HEIGHT - FORM_WINDOW_FOOTER_HEIGHT - 20 - 40,
  });
  const canvas = localToCanvasPoint(windowConfig, { x: 24, y: 36 });
  assert.deepEqual(canvasToLocalPoint(windowConfig, canvas), { x: 24, y: 36 });
});

test('form window grows to contain all controls and never shrinks', () => {
  const small = { ...windowConfig, width: 320, height: 240 };
  const grown = growFormWindowToFit(small, [{ x: 20, y: 30, width: 500, height: 300 }]);
  assert.equal(grown.width, 50 + 520 + 30);
  assert.equal(grown.height, FORM_WINDOW_HEADER_HEIGHT + 20 + 330 + 40 + FORM_WINDOW_FOOTER_HEIGHT);
  assert.deepEqual(growFormWindowToFit(grown, []), grown);
});

test('padding moves the canvas origin without changing persisted local coordinates', () => {
  const local = { x: 12, y: 18 };
  const before = localToCanvasPoint({ ...windowConfig, props: { padding: 8, showFooter: false } }, local);
  const after = localToCanvasPoint({ ...windowConfig, props: { padding: 32, showFooter: false } }, local);
  assert.deepEqual(local, { x: 12, y: 18 });
  assert.deepEqual({ x: after.x - before.x, y: after.y - before.y }, { x: 24, y: 24 });
});

test('negative component coordinates snap to the content origin and hidden controls still size the window', () => {
  assert.deepEqual(
    clampComponentToContent({ x: -19, y: -7, width: 120, height: 40 }),
    { x: 0, y: 0, width: 120, height: 40 },
  );
  const hidden = { x: 460, y: 300, width: 180, height: 90, visible: false };
  const grown = growFormWindowToFit({ ...windowConfig, width: 320, height: 240 }, [hidden]);
  assert.equal(grown.width, 50 + 640 + 30);
  assert.equal(grown.height, FORM_WINDOW_HEADER_HEIGHT + 20 + 390 + 40 + FORM_WINDOW_FOOTER_HEIGHT);
});

test('absolute migration preserves canvas positions, removes negatives and is markable as idempotent', () => {
  const absoluteWindow = { x: 40, y: 40, width: 500, height: 320, props: { padding: 24, showFooter: false } };
  const absolute = [
    { id: 'above', x: 50, y: 80, width: 120, height: 60 },
    { id: 'inside', x: 120, y: 160, width: 500, height: 240 },
  ];
  const migrated = migrateCanvasComponentsToWindowLocal(absoluteWindow, absolute);
  assert.ok(migrated.components.every((component) => component.x >= 0 && component.y >= 0));
  for (let index = 0; index < absolute.length; index += 1) {
    const canvas = localToCanvasPoint(migrated.formWindow, migrated.components[index]);
    assert.deepEqual(canvas, { x: absolute[index].x, y: absolute[index].y });
  }
  assert.ok(migrated.formWindow.width >= 500);
  assert.ok(migrated.formWindow.height >= 320);
  assert.equal(FORM_WINDOW_COORDINATE_SPACE, 'window-content-v1');
});
