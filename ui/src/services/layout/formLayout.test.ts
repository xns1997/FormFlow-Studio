import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import type { ControlDef } from '../../designer/types';
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
  ['textarea', { type: 'textarea', label: 'textarea', category: 'basic', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 280, h: 132 }, render: (() => null) as any }],
  ['button', { type: 'button', label: 'button', category: 'basic', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 120, h: 40 }, render: (() => null) as any }],
  ['card', { type: 'card', label: 'card', category: 'container', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 360, h: 220 }, render: (() => null) as any }],
  ['form', { type: 'form', label: 'form', category: 'container', icon: '', defaultProps: {}, propSchema: [], eventSchema: [], defaultSize: { w: 880, h: 560 }, render: (() => null) as any }],
]);

test('form layout aligns fields to a grid and avoids overlap', () => {
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
  assert.equal(byId.get('name')?.x, byId.get('desc')?.x);
  assert.ok((byId.get('submit')?.x || 0) > (byId.get('age')?.x || 0));
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
