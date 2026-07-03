import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoverNodePackages,
  nodePackageToSpec,
  normalizeNodePackageId,
} from './node-packages';

test('node package discovery derives package names and pairs lazy executors', () => {
  const load = async () => () => ({ result: true });
  const packages = discoverNodePackages({
    './func-example/schema.json': { id: 'func-example', label: 'Example', description: '', category: 'test' },
    './xlsx-read/schema.json': { id: 'xlsx-read', label: 'Read', description: '', category: 'test' },
  }, { './func-example/index.ts': load });

  assert.equal(packages.length, 1);
  assert.equal(packages[0].name, 'func-example');
  assert.equal(packages[0].loadExecutor, load);
  assert.equal(nodePackageToSpec(packages[0]).id, 'func-example');
});

test('package ids use the canonical registry namespace', () => {
  assert.equal(normalizeNodePackageId('generic-merge'), 'generic:merge');
  assert.equal(normalizeNodePackageId('ml-kmeans'), 'ml:kmeans');
  assert.equal(normalizeNodePackageId('behavior-log'), 'behavior-log');
});
