import assert from 'node:assert/strict';
import test from 'node:test';
import openapi from '../../../../../server/public/swagger.json';
import operationTemplates from '../../../../../server/public/operation-templates.json';
import { PROJECT_TEMPLATES } from '../../../../../shared/project-templates';
import '../../../designer/controls';
import { getAllControls } from '../../../designer/registry';
import { loadNodeRegistry } from '../../../../nodes/registry';
import { behaviorEventDocs, flowNodeDocs } from '../behaviorDocs';
import { buildSearchIndex, loadDocCatalog, searchDocs } from './catalog';

test('unified catalog covers every registered control, baseline node, event and OpenAPI operation', async () => {
  const entries = await loadDocCatalog();
  assert.equal(entries.filter((entry) => entry.kind === 'task').length, 8);
  assert.ok(entries.filter((entry) => entry.kind === 'troubleshooting').length >= 7);
  assert.ok(entries.filter((entry) => entry.kind === 'case').length >= 4);
  assert.equal(entries.filter((entry) => entry.domain === 'controls').length, getAllControls().length);
  assert.equal(entries.some((entry) => entry.id === 'control:animatedNumber'), true);
  assert.equal(entries.some((entry) => entry.id === 'control:form'), false);
  const nodeRegistry = await loadNodeRegistry();
  assert.equal(
    entries.filter((entry) => entry.domain === 'nodes').length,
    nodeRegistry.specs.length + flowNodeDocs.length,
  );
  assert.equal(entries.filter((entry) => entry.domain === 'events').length, behaviorEventDocs.length);
  const operationCount = Object.values((openapi as any).paths || {}).reduce((total: number, operations: any) =>
    total + Object.keys(operations).filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).length, 0);
  assert.equal(entries.filter((entry) => entry.source.kind === 'openapi').length, operationCount);
  assert.equal(entries.filter((entry) => entry.id.startsWith('template:project:')).length, PROJECT_TEMPLATES.length);
  assert.equal(entries.filter((entry) => entry.id.startsWith('template:operation:')).length, operationTemplates.length);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.canonicalPath)).size, entries.length);
  assert.equal(entries.some((entry) => entry.id === 'guide:behavior-rule-syntax'), false);
});

test('search handles Chinese tasks, pinyin, English identifiers and business-first ranking', async () => {
  const index = buildSearchIndex(await loadDocCatalog());
  for (const [query, expected] of [
    ['字段联动', 'task:behavior-workflow'],
    ['daoru excel', 'task:import-model'],
    ['主键冲突', 'task:import-model'],
    ['提交校验', 'troubleshooting:submit-validation'],
    ['流程调用', 'troubleshooting:workflow-call'],
    ['发布', 'task:package-release'],
    ['onSubmit', 'event:'],
    ['MCP', 'api'],
  ] as const) {
    const results = searchDocs(index, query).slice(0, 5);
    assert.ok(results.length > 0, `${query} should return results`);
    assert.ok(results.some((result) => result.entry.id.includes(expected) || result.entry.domain === expected), `${query} should surface ${expected}`);
  }
});

test('search filters by kind and domain without leaking unrelated entries', async () => {
  const index = buildSearchIndex(await loadDocCatalog());
  assert.ok(searchDocs(index, '输入', { domain: 'controls' }).every((result) => result.entry.domain === 'controls'));
  assert.ok(searchDocs(index, '发布', { kind: 'task' }).every((result) => result.entry.kind === 'task'));
});

test('search supports compact pinyin, initials, fuzzy spelling and multiple keywords', async () => {
  const index = buildSearchIndex(await loadDocCatalog());
  assert.ok(searchDocs(index, 'daoruexcel').slice(0, 5).some((result) => result.entry.id === 'task:import-model'));
  assert.ok(searchDocs(index, 'zjct').slice(0, 5).some((result) => result.entry.id.includes('primary-key-conflict') || result.entry.id === 'task:import-model'));
  assert.ok(searchDocs(index, 'onSubmt').slice(0, 5).some((result) => result.entry.id.startsWith('event:')));
  assert.ok(searchDocs(index, 'excel 主键').slice(0, 5).some((result) => result.entry.id === 'task:import-model'));
});

test('behavior rule syntax canonical page resolves to legacy topic content instead of generic guide placeholder', async () => {
  const entries = await loadDocCatalog();
  const entry = entries.find((item) => item.canonicalPath === '/docs/reference/behavior/behavior-rule-syntax');
  assert.ok(entry);
  assert.equal(entry.id, 'topic:behavior-rule-syntax');
  assert.ok(entry.blocks.some((block) => block.markdownBody === 'behavior-rule-syntax-overview.md'));
  assert.ok(entry.blocks.some((block) => (block.fields || []).some((field) => field.name === 'before click("按钮名") -> 守卫动作(...)')));
});
