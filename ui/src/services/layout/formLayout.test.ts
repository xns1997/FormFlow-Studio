import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import type { ControlDef } from '../../designer/types';
import { buildProjectTemplate } from '../../../../shared/project-templates';
import { layoutForm } from './formLayout';

function component(id: string, type: string, props: Record<string, unknown> = {}, parentId?: string): DesignComponent {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    parentId,
    props,
  };
}

const controlMap = new Map<string, ControlDef>([
  ['input', { type: 'input', label: 'input', category: 'basic', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 240, h: 72 }, render: (() => null) as any }],
  ['select', { type: 'select', label: 'select', category: 'select', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 240, h: 72 }, render: (() => null) as any }],
  ['textarea', { type: 'textarea', label: 'textarea', category: 'basic', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 280, h: 132 }, render: (() => null) as any }],
  ['button', { type: 'button', label: 'button', category: 'basic', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 120, h: 40 }, render: (() => null) as any }],
  ['card', { type: 'card', label: 'card', category: 'container', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 360, h: 220 }, render: (() => null) as any }],
  ['form', { type: 'form', label: 'form', category: 'container', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 880, h: 560 }, render: (() => null) as any }],
]);

function geometry(components: DesignComponent[]) {
  return components.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
}

function nonGeometry(components: DesignComponent[]) {
  return components.map(({ x: _x, y: _y, width: _width, height: _height, ...component }) => structuredClone(component));
}

function assertNoSiblingOverlaps(components: DesignComponent[]) {
  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      const left = components[i];
      const right = components[j];
      if ((left.parentId || '') !== (right.parentId || '')) continue;
      assert.ok(
        left.x + left.width <= right.x
        || right.x + right.width <= left.x
        || left.y + left.height <= right.y
        || right.y + right.height <= left.y,
        `${left.id} overlaps ${right.id}`,
      );
    }
  }
}

test('form layout selects a valid candidate and keeps actions at the bottom', () => {
  const result = layoutForm([
    component('name', 'input'),
    component('age', 'input'),
    component('desc', 'textarea'),
    component('submit', 'button'),
  ], {
    getControl: (type) => controlMap.get(type),
  });

  const byId = new Map(result.components.map((item) => [item.id, item] as const));
  assert.equal(result.diagnostics.overlapCountAfter, 0);
  assert.ok(['single-column', 'strict-two-column', 'traditional-two-column'].includes(result.diagnostics.strategy));
  assert.ok((byId.get('submit')?.y || 0) > (byId.get('desc')?.y || 0));
});

test('form layout keeps children inside card container and resizes container', () => {
  const result = layoutForm([
    component('card1', 'card', { title: '基础信息' }),
    component('field1', 'input', {}, 'card1'),
    component('field2', 'textarea', {}, 'card1'),
  ], {
    getControl: (type) => controlMap.get(type),
  });

  const byId = new Map(result.components.map((item) => [item.id, item] as const));
  const card = byId.get('card1')!;
  const field1 = byId.get('field1')!;
  assert.ok(field1.x >= card.x);
  assert.ok(field1.y >= card.y);
  assert.ok(card.height > 220);
});

test('form layout grows undersized controls and follows visual reading order', () => {
  const result = layoutForm([
    { ...component('third', 'input'), x: 20, y: 100, width: 80, height: 20 },
    { ...component('second', 'input'), x: 300, y: 10, width: 80, height: 20 },
    { ...component('first', 'input'), x: 10, y: 10, width: 80, height: 20 },
  ], {
    getControl: (type) => controlMap.get(type),
  }, { contentWidth: 520 });

  const byId = new Map(result.components.map((item) => [item.id, item] as const));
  assert.deepEqual(result.placements.map((placement) => placement.id), ['first', 'second', 'third']);
  assert.equal(byId.get('first')?.width, 520);
  assert.equal(byId.get('first')?.height, 72);
  assert.ok((byId.get('second')?.y || 0) > (byId.get('first')?.y || 0));
  assert.ok((byId.get('third')?.y || 0) > (byId.get('first')?.y || 0));
  assert.equal(result.diagnostics.resizedCount, 3);
  assert.equal(result.diagnostics.overlapCountAfter, 0);
});

test('form layout preserves controls that are already larger than their recommended size', () => {
  const result = layoutForm([
    { ...component('wide', 'input'), width: 520, height: 96 },
  ], {
    getControl: (type) => controlMap.get(type),
  }, { contentWidth: 520 });

  assert.equal(result.components[0].width, 520);
  assert.equal(result.components[0].height, 96);
  assert.equal(result.diagnostics.resizedCount, 0);
});

test('form layout uses two field columns, expands compact selects and moves actions to the bottom', () => {
  const result = layoutForm([
    { ...component('first', 'input'), x: 0, y: 0, width: 300, height: 68 },
    { ...component('medium', 'select', { optionSource: { mode: 'static' }, options: ['清水', '蒸汽', '油品', '腐蚀液'] }), x: 320, y: 0, width: 300, height: 188 },
    { ...component('third', 'input'), x: 640, y: 0, width: 300, height: 68 },
    { ...component('save', 'button'), x: 0, y: 100, width: 190, height: 48 },
  ], {
    getControl: (type) => controlMap.get(type),
  }, { contentWidth: 940 });

  const byId = new Map(result.components.map((item) => [item.id, item] as const));
  assert.equal(result.diagnostics.strategy, 'single-column');
  assert.equal(byId.get('first')?.width, 560);
  assert.equal(byId.get('medium')?.x, 190);
  assert.equal(byId.get('medium')?.height, 188);
  assert.ok((byId.get('third')?.y || 0) >= 188 + 24);
  assert.ok((byId.get('save')?.y || 0) > (byId.get('third')?.y || 0));
  assert.equal(byId.get('save')?.x, 560);
  assert.equal(result.diagnostics.overlapCountAfter, 0);
});

test('equal measured heights choose strict two-column while narrow forms stay single-column', () => {
  const controls = [
    { ...component('first', 'input'), x: 0, width: 280, height: 72 },
    { ...component('second', 'input'), x: 320, width: 280, height: 72 },
  ];
  const measuredControls = controls.map((item) => ({ id: item.id, width: 280, height: 72 }));
  const wide = layoutForm(controls, { getControl: (type) => controlMap.get(type) }, { contentWidth: 940, measuredControls });
  const narrow = layoutForm(controls, { getControl: (type) => controlMap.get(type) }, { contentWidth: 600, measuredControls });

  assert.equal(wide.diagnostics.strategy, 'strict-two-column');
  assert.equal(wide.components[0].y, wide.components[1].y);
  assert.equal(narrow.diagnostics.strategy, 'single-column');
  assert.ok(narrow.components[1].y > narrow.components[0].y);
});

test('measured content height wins over registry fallback without changing component data', () => {
  const controls = [
    { ...component('choice', 'select', { options: ['一', '二', '三'] }), width: 280, height: 72, fieldBinding: 'choice' },
  ];
  const before = nonGeometry(controls);
  const measured = layoutForm(controls, { getControl: (type) => controlMap.get(type) }, {
    contentWidth: 940,
    measuredControls: [{ id: 'choice', width: 280, height: 212 }],
  });
  const fallback = layoutForm(controls, { getControl: (type) => controlMap.get(type) }, { contentWidth: 940 });

  assert.equal(measured.components[0].height, 212);
  assert.ok(fallback.components[0].height >= 72);
  assert.deepEqual(nonGeometry(measured.components), before);
});

test('check-valve template keeps identity and non-geometry data, preserves reading order, and is idempotent', () => {
  const project = buildProjectTemplate('check_valve_selection', {
    id: 'check-valve-layout-test',
    name: '止回阀测试',
    description: '',
    author: 'test',
    now: '2026-07-28T00:00:00.000Z',
  }) as unknown as { forms: Array<{ design: { components: DesignComponent[] } }> };
  const controls = project.forms[0].design.components;
  const beforeIds = controls.map((component) => component.id);
  const beforeNonGeometry = nonGeometry(controls);
  const measuredControls = controls.map((component) => ({
    id: component.id,
    width: component.width,
    height: component.type === 'select' && Array.isArray(component.props.options) && component.props.options.length <= 5
      ? 60 + component.props.options.length * 32
      : component.height,
  }));

  const first = layoutForm(controls, { getControl: (type) => controlMap.get(type) }, { contentWidth: 940, measuredControls });
  const second = layoutForm(first.components, { getControl: (type) => controlMap.get(type) }, { contentWidth: 940, measuredControls });
  const save = first.components.find((component) => component.type === 'button')!;
  const fields = first.components.filter((component) => component.type !== 'button');

  assert.deepEqual(first.components.map((component) => component.id), beforeIds);
  assert.deepEqual(nonGeometry(first.components), beforeNonGeometry);
  assert.deepEqual(geometry(second.components), geometry(first.components));
  assert.equal(first.diagnostics.strategy, 'single-column');
  assert.equal(first.diagnostics.overlapCountAfter, 0);
  assert.ok(save.y > Math.max(...fields.map((component) => component.y)));
  assertNoSiblingOverlaps(first.components);
  for (const measurement of measuredControls) {
    const component = first.components.find((item) => item.id === measurement.id)!;
    assert.ok(component.height >= measurement.height, `${component.id} clips measured height`);
  }
});
