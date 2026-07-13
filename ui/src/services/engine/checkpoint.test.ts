import assert from 'node:assert/strict';
import test from 'node:test';
import { clearCheckpoint, listCheckpoints, loadCheckpoint, saveCheckpoint } from './checkpoint';
const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; } } });
test('checkpoint persists node outputs and clears after completion', () => {
  saveCheckpoint('test', 'workflow', ['a'], new Map([['a', { value: 1 }]]));
  assert.deepEqual(loadCheckpoint('test')?.outputs.a, { value: 1 }); assert.equal(listCheckpoints().length, 1);
  clearCheckpoint('test'); assert.equal(loadCheckpoint('test'), null);
});
