import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../project/types';
import { measureRenderedControls } from './formLayoutMeasurement';

const components = [
  { id: 'visible', type: 'input', x: 0, y: 0, width: 100, height: 40, props: {} },
  { id: 'hidden', type: 'input', x: 0, y: 0, width: 100, height: 40, props: {} },
] satisfies DesignComponent[];

test('rendered control measurement uses scroll dimensions and skips unavailable nodes', () => {
  const content = { scrollWidth: 278.2, scrollHeight: 143.1 };
  const designNode = {
    scrollWidth: 240,
    scrollHeight: 72,
    firstElementChild: content,
  };
  const cell = {
    dataset: { cellId: 'visible' },
    querySelector: (selector: string) => selector === '.ios-design-node' ? designNode : null,
  };
  const root = {
    querySelectorAll: () => [cell],
  } as unknown as ParentNode;

  assert.deepEqual(measureRenderedControls(root, components), [
    { id: 'visible', width: 279, height: 144 },
  ]);
  assert.deepEqual(measureRenderedControls(null, components), []);
});
