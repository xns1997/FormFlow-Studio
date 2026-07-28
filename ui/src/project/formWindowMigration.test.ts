import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectTemplate } from '../../../shared/project-templates';
import '../designer/controls';
import { getAllControls } from '../designer/registry';
import { normalizeDesignFile, type DesignFile } from './types';
import { FORM_WINDOW_COORDINATE_SPACE, localToCanvasPoint } from '../../../shared/form-window-layout';

test('legacy form controls migrate into one intrinsic window and one idempotent local coordinate space', () => {
  const legacy = {
    id: 'legacy-design',
    name: '旧表单',
    viewport: { zoom: 1, panX: 0, panY: 0 },
    gridSize: 10,
    components: [
      { id: 'root', type: 'form', x: 36, y: 48, width: 860, height: 640, props: { title: '迁移标题', background: '#f8fafc' }, children: ['name'] },
      { id: 'name', type: 'input', x: 96, y: 140, width: 280, height: 76, parentId: 'root', props: { name: 'name' } },
    ],
    bindings: [{ id: 'root-binding', sourceId: 'root', targetId: 'name', type: 'field', config: {} }],
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  } as unknown as DesignFile;

  const migrated = normalizeDesignFile(legacy);
  assert.deepEqual({ x: migrated.formWindow.x, y: migrated.formWindow.y, width: migrated.formWindow.width, height: migrated.formWindow.height }, { x: 36, y: 48, width: 860, height: 640 });
  assert.equal(migrated.formWindow.props.title, '迁移标题');
  assert.equal(migrated.coordinateSpace, FORM_WINDOW_COORDINATE_SPACE);
  assert.equal(migrated.components.length, 1);
  assert.deepEqual({ x: migrated.components[0].x, y: migrated.components[0].y, parentId: migrated.components[0].parentId }, { x: 36, y: 16, parentId: undefined });
  assert.deepEqual(localToCanvasPoint(migrated.formWindow, migrated.components[0]), { x: 96, y: 140 });
  assert.deepEqual(normalizeDesignFile(migrated), migrated);
  assert.equal(migrated.bindings.length, 0);
});

test('toolbox and built-in project templates no longer expose a form control', () => {
  assert.equal(getAllControls().some((control) => control.type === 'form'), false);
  const project = buildProjectTemplate('game_analytics', { id: 'implicit-window-template', name: '游戏数据', now: '2026-07-23T00:00:00.000Z' });
  for (const form of project.forms) {
    assert.ok(form.design.formWindow);
    assert.equal(form.design.components.some((component: { type: string }) => component.type === 'form'), false);
  }
});
