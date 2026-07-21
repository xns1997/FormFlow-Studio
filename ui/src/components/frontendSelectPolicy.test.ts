import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

function collectTsx(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectTsx(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

test('frontend dropdowns use Ant Design instead of native select elements', () => {
  const nativeSelect = new RegExp(`<${'select'}\\b`);
  const files = [...collectTsx(resolve('ui/src')), ...collectTsx(resolve('ui/nodes'))];
  const violations = files.filter((file) => nativeSelect.test(readFileSync(file, 'utf8')));
  assert.deepEqual(violations, []);
});
