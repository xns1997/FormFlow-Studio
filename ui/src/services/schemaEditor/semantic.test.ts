import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lintDesignFile,
  lintSettings,
  lintTableConfig,
  lintWorkflowFile,
  semanticCompletionsFor,
  shouldOfferSemanticCompletion,
} from './semantic';

test('lintDesignFile flags duplicate ids, unknown types and broken references', () => {
  const issues = lintDesignFile({
    components: [
      { id: 'a', type: 'input', parentId: 'missing', fieldBinding: '金额' },
      { id: 'a', type: 'unknown-control', children: ['nope'] },
    ],
    bindings: [{ id: 'b1', sourceId: 'a', targetId: 'gone', type: 'field', config: {} }],
  }, { componentTypes: ['input'], fieldNames: ['姓名'] });
  const messages = issues.map((issue) => issue.message).join('|');
  assert.match(messages, /"a" 重复/);
  assert.match(messages, /"unknown-control" 未注册/);
  assert.match(messages, /parentId 引用不存在的控件 "missing"/);
  assert.match(messages, /字段引用 "金额" 未在数据表中找到/);
  assert.match(messages, /children 引用了不存在的控件 "nope"/);
  assert.match(messages, /targetId 引用不存在的控件 "gone"/);
});

test('lintWorkflowFile flags duplicate nodes, unknown spec, missing props and broken edges', () => {
  const issues = lintWorkflowFile({
    nodes: [
      { id: 'n1', type: 'formflow', specId: 'behavior-api-request', position: { x: 0, y: 0 }, data: { propertiesJson: '{"url":""}' } },
      { id: 'n1', type: 'formflow', specId: 'missing-spec', position: { x: 0, y: 0 }, data: { propertiesJson: 'not json' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'nope', sourceHandle: 'out:x', targetHandle: 'in:y' },
      { id: 'e2', source: 'n1', target: 'n1' },
    ],
  }, {
    nodeSpecIds: ['behavior-api-request'],
    nodePropertiesBySpec: { 'behavior-api-request': [{ name: 'url', required: true, type: 'string' }] },
  });
  const messages = issues.map((issue) => issue.message).join('|');
  assert.match(messages, /"n1" 重复/);
  assert.match(messages, /"missing-spec" 未在节点库中注册/);
  assert.match(messages, /propertiesJson 不是合法 JSON/);
  assert.match(messages, /终点节点 "nope" 不存在/);
  assert.match(messages, /自环/);
  assert.match(messages, /缺少端口名/);
});

test('lintTableConfig flags unknown column references', () => {
  const issues = lintTableConfig({
    keyFields: ['金额'],
    defaultSort: { column: '日期', ascending: true },
    hiddenColumns: ['不存在列'],
    columnWidths: { 金额: 120, 不存在列: 100 },
    groupByColumn: 9,
    sequenceRules: { 序号: { start: 1, step: 1, formatter: '0' } },
  }, { headers: ['金额', '姓名'] });
  const messages = issues.map((issue) => issue.message).join('|');
  assert.doesNotMatch(messages, /主键字段 "金额" 不在/);
  assert.match(messages, /默认排序列 "日期" 不在/);
  assert.match(messages, /隐藏列 "不存在列" 不在/);
  assert.match(messages, /配置项 "不存在列" 不在/);
  assert.match(messages, /分组列索引 9 超出表头范围/);
  assert.match(messages, /序号规则列 "序号" 不在/);
});

test('lintTableConfig warns when no primary key is configured', () => {
  const issues = lintTableConfig({ keyFields: [] }, { headers: ['a'] });
  assert.equal(issues.some((issue) => issue.message.includes('未配置主键字段')), true);
});

test('lintSettings warns about out-of-range workflow values', () => {
  const issues = lintSettings({
    settings: {
      behavior: { scriptTimeout: -1, loopProtection: 0 },
      workflow: { maxConcurrency: 99, retryCount: 10, nodeTimeout: 50, overallTimeout: 100 },
    },
  });
  const messages = issues.map((issue) => issue.message).join('|');
  assert.match(messages, /脚本超时不能为负数/);
  assert.match(messages, /循环保护上限至少为 1/);
  assert.match(messages, /maxConcurrency 超出推荐范围/);
  assert.match(messages, /retryCount 超出推荐范围/);
  assert.match(messages, /nodeTimeout 超出推荐范围/);
  assert.match(messages, /overallTimeout 超出推荐范围/);
});

test('semantic completions are scoped by kind and offer context filtering', () => {
  const design = semanticCompletionsFor('design', { componentTypes: ['input'], fieldNames: ['金额'] });
  assert.deepEqual(design.map((item) => item.label).sort(), ['input', '金额']);
  const workflow = semanticCompletionsFor('workflow', { nodeSpecIds: ['behavior-api-request'] });
  assert.deepEqual(workflow.map((item) => item.label), ['behavior-api-request']);
  const table = semanticCompletionsFor('table-config', { headers: ['金额'] });
  assert.deepEqual(table.map((item) => item.label), ['金额']);
  assert.equal(shouldOfferSemanticCompletion('table-config', '  "keyFields": [', '金额'), true);
  assert.equal(shouldOfferSemanticCompletion('settings', '  "format": "', 'json'), false);
});
