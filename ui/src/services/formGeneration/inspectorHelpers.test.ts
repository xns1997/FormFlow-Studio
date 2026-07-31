import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import { getField, groupBy } from './inspectorHelpers';

test('getField extracts field from fieldBinding', () => {
  const comp: DesignComponent = { id: '1', type: 'input', x: 0, y: 0, width: 100, height: 40, fieldBinding: '姓名', props: {} };
  assert.equal(getField(comp), '姓名');
});

test('getField falls back to props.name', () => {
  const comp: DesignComponent = { id: '1', type: 'input', x: 0, y: 0, width: 100, height: 40, props: { name: 'age' } };
  assert.equal(getField(comp), 'age');
});

test('getField returns empty string when neither set', () => {
  const comp: DesignComponent = { id: '1', type: 'button', x: 0, y: 0, width: 100, height: 40, props: {} };
  assert.equal(getField(comp), '');
});

test('groupBy groups items by key function', () => {
  const items = [
    { name: 'a', type: 'x' },
    { name: 'b', type: 'y' },
    { name: 'c', type: 'x' },
  ];
  const groups = groupBy(items, (item) => item.type);
  assert.equal(groups.size, 2);
  assert.equal(groups.get('x')?.length, 2);
  assert.equal(groups.get('y')?.length, 1);
});

test('groupBy returns empty map for empty input', () => {
  const groups = groupBy([], () => 'key');
  assert.equal(groups.size, 0);
});
