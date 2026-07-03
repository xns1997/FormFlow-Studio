import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FlowNodeSpec } from '../flowRegistry';
import { loadNodeRegistry } from '../flowRegistry';
import {
  MAX_RECENT_NODES,
  buildNodeSearchIndex,
  createQuickNodeConnection,
  findBestCompatiblePort,
  getNodeDiscoveryGroup,
  parseNodeDiscoveryPreferences,
  recordRecentNode,
  searchNodeDocuments,
  toggleFavoriteNode,
  type NodeConnectionContext,
} from './nodeDiscovery';

const port = (name: string, type: any, direction: 'input' | 'output', required = false) => ({
  name, label: name, type, direction, required, description: name,
});

const spec = (id: string, label: string, keywords: string[] = [], ports: any[] = []): FlowNodeSpec => ({
  id, label, keywords, ports, description: `${label} description`, category: '通用 · 清洗', kind: 'generic', properties: [],
});

test('search ranks labels, keywords, pinyin and initials deterministically', () => {
  const specs = [
    spec('generic:sort', '数据排序', ['sort', '排列']),
    spec('generic:filter', '数据筛选', ['filter', '过滤']),
    spec('generic:export', '数据导出', ['excel export', '导出 CSV']),
  ];
  const index = buildNodeSearchIndex(specs);
  assert.equal(searchNodeDocuments(index, '数据排序')[0].document.spec.id, 'generic:sort');
  assert.equal(searchNodeDocuments(index, 'filter')[0].document.spec.id, 'generic:filter');
  assert.equal(searchNodeDocuments(index, 'shujupaixu')[0].document.spec.id, 'generic:sort');
  assert.equal(searchNodeDocuments(index, 'sjpx')[0].document.spec.id, 'generic:sort');
  assert.equal(searchNodeDocuments(index, 'excel export')[0].document.spec.id, 'generic:export');
  assert.equal(searchNodeDocuments(index, 'filtet')[0].document.spec.id, 'generic:filter');
  assert.deepEqual(
    searchNodeDocuments(index, '数据').map((result) => result.document.spec.id),
    searchNodeDocuments(index, '数据').map((result) => result.document.spec.id),
  );
});

test('preferences recover from invalid data and keep favorites plus five recent nodes', () => {
  const valid = Array.from({ length: 10 }, (_, index) => `node:${index}`);
  assert.deepEqual(parseNodeDiscoveryPreferences('{broken', valid), { favorites: [], recent: [] });
  const parsed = parseNodeDiscoveryPreferences(JSON.stringify({ favorites: ['node:1', 'missing', 'node:1'], recent: [...valid, 'missing'] }), valid);
  assert.deepEqual(parsed.favorites, ['node:1']);
  assert.equal(MAX_RECENT_NODES, 5);
  assert.equal(parsed.recent.length, MAX_RECENT_NODES);
  const favorited = toggleFavoriteNode(parsed, 'node:2');
  assert.equal(favorited.favorites[0], 'node:2');
  assert.equal(toggleFavoriteNode(favorited, 'node:2').favorites.includes('node:2'), false);
  assert.equal(recordRecentNode(parsed, 'node:9').recent[0], 'node:9');
});

test('compatible port selection prefers same name, then exact type, required and declaration order', () => {
  const source = port('data', 'json-rows', 'output');
  const context: NodeConnectionContext = { direction: 'from-output', port: source };
  const sameName = spec('same', 'same', [], [port('data', 'any', 'input'), port('rows', 'json-rows', 'input', true)]);
  assert.equal(findBestCompatiblePort(sameName, context)?.name, 'data');

  const exact = spec('exact', 'exact', [], [port('value', 'any', 'input', true), port('rows', 'json-rows', 'input')]);
  assert.equal(findBestCompatiblePort(exact, context)?.name, 'rows');

  const required = spec('required', 'required', [], [port('first', 'json-rows', 'input'), port('second', 'json-rows', 'input', true)]);
  assert.equal(findBestCompatiblePort(required, context)?.name, 'second');

  const ranked = searchNodeDocuments(buildNodeSearchIndex([
    spec('any', 'Any', [], [port('value', 'any', 'input')]),
    spec('typed', 'Typed', [], [port('value', 'json-rows', 'input')]),
  ]), '', { connection: context });
  assert.equal(ranked[0].document.spec.id, 'typed');

  const reverse: NodeConnectionContext = { direction: 'to-input', port: port('worksheet', 'worksheet', 'input') };
  const producer = spec('producer', 'producer', [], [port('result', 'any', 'output'), port('worksheet', 'worksheet', 'output')]);
  assert.equal(findBestCompatiblePort(producer, reverse)?.name, 'worksheet');

  assert.deepEqual(createQuickNodeConnection(context, 'existing', 'out:rows', 'new', port('data', 'json-rows', 'input')), {
    source: 'existing', sourceHandle: 'out:rows', target: 'new', targetHandle: 'in:data',
  });
  assert.deepEqual(createQuickNodeConnection(reverse, 'existing', 'in:worksheet', 'new', port('worksheet', 'worksheet', 'output')), {
    source: 'new', sourceHandle: 'out:worksheet', target: 'existing', targetHandle: 'in:worksheet',
  });
});

test('all 133 registered nodes build searchable documents and map to eight discovery groups', async () => {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const packageDirs = readdirSync(join(root, 'nodes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(func-|behavior-|generic-|ml-)/.test(entry.name))
    .filter((entry) => existsSync(join(root, 'nodes', entry.name, 'schema.json')))
    .map((entry) => entry.name);
  const base = await loadNodeRegistry();
  const packageSpecs: FlowNodeSpec[] = packageDirs.map((dir) => {
    const schema = JSON.parse(readFileSync(join(root, 'nodes', dir, 'schema.json'), 'utf8'));
    const id = schema.id.startsWith('generic-') ? `generic:${schema.id.slice(8)}` : schema.id.startsWith('ml-') ? `ml:${schema.id.slice(3)}` : schema.id;
    return { ...schema, id, properties: schema.properties || [], ports: schema.ports || [], kind: id.startsWith('behavior-') || id.startsWith('behavior:') ? 'behavior' : schema.kind || 'generic' };
  });
  const specs = [...base.specs, ...packageSpecs]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const index = buildNodeSearchIndex(specs);
  assert.equal(index.length, 133);
  assert.equal(new Set(index.map((document) => document.spec.id)).size, 133);
  for (const document of index) {
    assert.ok(document.normalizedLabel.length > 0);
    assert.ok(searchNodeDocuments(index, document.spec.id).some((result) => result.document.spec.id === document.spec.id), `not searchable: ${document.spec.id}`);
  }
  assert.equal(new Set(specs.map(getNodeDiscoveryGroup)).size, 8);
});
