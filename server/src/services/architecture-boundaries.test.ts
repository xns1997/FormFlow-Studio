import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

test('server adapters do not import browser implementation modules', () => {
  const root = resolve('server/src');
  const violations = sourceFiles(root).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return /(?:from|import\()\s*['"][^'"]*ui\/src/g.test(source) ? [relative(process.cwd(), file)] : [];
  });
  assert.deepEqual(violations, []);
});

test('shared FormFlow core stays independent from React, DOM, and Express adapters', () => {
  const root = resolve('shared/formflow-core');
  const forbidden = /\b(?:react|react-dom|express)\b|ui\/src|server\/src/;
  const violations = sourceFiles(root).flatMap((file) => forbidden.test(readFileSync(file, 'utf8')) ? [relative(process.cwd(), file)] : []);
  assert.deepEqual(violations, []);
});
