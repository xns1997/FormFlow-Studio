import assert from 'node:assert/strict';
import test from 'node:test';
import { exportToComponentNodes } from './export';
import type { DesignComponent } from '../project/types';

function component(type: string, props: Record<string, unknown> = {}): DesignComponent {
  return {
    id: `comp_${type}`,
    type,
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    props,
  };
}

test('export adapter maps legacy and display controls to canonical runtime types', () => {
  const nodes = exportToComponentNodes([
    component('number', { name: 'score' }),
    component('image', { name: 'hero' }),
    component('card', { title: '卡片' }),
    component('chart', { title: '图表' }),
    component('divider'),
  ]);

  assert.equal(nodes[0].type, 'numberInput');
  assert.equal(nodes[1].type, 'image');
  assert.equal(nodes[2].type, 'container');
  assert.equal(nodes[3].type, 'custom');
  assert.equal(nodes[4].type, 'custom');
});

test('export adapter adds field events for newly introduced interactive controls', () => {
  const [segmented, timePicker, upload, steps] = exportToComponentNodes([
    component('segmented', { name: 'status' }),
    component('timePicker', { name: 'appointment' }),
    component('upload', { name: 'attachments' }),
    component('steps', { name: 'stage' }),
  ]);

  assert.deepEqual(segmented.events.map((item) => item.name), ['onChange', 'onBlur', 'onFocus']);
  assert.deepEqual(timePicker.events.map((item) => item.name), ['onChange', 'onBlur', 'onFocus']);
  assert.deepEqual(upload.events.map((item) => item.name), ['onChange', 'onBlur', 'onFocus']);
  assert.deepEqual(steps.events.map((item) => item.name), ['onChange']);
});
