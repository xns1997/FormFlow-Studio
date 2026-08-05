import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCustomJsPortMap,
  getNodeEffectivePorts,
  parseCustomJsPortDefinitions,
  resolveNodeProperties,
  toCustomJsPortMap,
} from './customJsNode';

test('动态端口解析保留全部运行时类型，未知类型降级为 any', () => {
  const defs = parseCustomJsPortDefinitions({
    workbook: 'workbook',
    rows: 'json-rows',
    data: 'file-data',
    area: 'range',
    rule: 'validation-rule',
    sort: 'sort-config',
    address: 'cell-ref',
    trigger: 'trigger',
    unknown: 'not-a-type',
  });
  const byName = new Map(defs.map((entry) => [entry.name, entry.type]));
  assert.equal(byName.get('workbook'), 'workbook');
  assert.equal(byName.get('rows'), 'json-rows');
  assert.equal(byName.get('data'), 'file-data');
  assert.equal(byName.get('area'), 'range');
  assert.equal(byName.get('rule'), 'validation-rule');
  assert.equal(byName.get('sort'), 'sort-config');
  assert.equal(byName.get('address'), 'cell-ref');
  assert.equal(byName.get('trigger'), 'trigger');
  assert.equal(byName.get('unknown'), 'any');
});

test('数组格式与 JSON 字符串格式等价解析', () => {
  const arrayForm = parseCustomJsPortDefinitions([
    { name: 'formData', type: 'object', label: '表单数据', required: true },
    { name: 'rows', type: 'json-rows' },
  ]);
  const stringForm = parseCustomJsPortDefinitions(JSON.stringify([
    { name: 'formData', type: 'object', label: '表单数据', required: true },
    { name: 'rows', type: 'json-rows' },
  ]));
  assert.deepEqual(arrayForm, stringForm);
  assert.equal(arrayForm[0].type, 'object');
  assert.equal(arrayForm[0].required, true);
  assert.equal(arrayForm[1].type, 'json-rows');
});

test('getNodeEffectivePorts 合并静态端口与动态端口，方向正确', () => {
  const spec = {
    id: 'generic:custom-js',
    label: 'custom-js',
    description: 'x',
    category: 'x',
    kind: 'generic' as const,
    properties: [],
    ports: [
      { name: 'trigger', label: '触发', type: 'trigger' as const, direction: 'input' as const, description: '触发' },
    ],
  };
  const properties = {
    inputPorts: { a: 'number', b: 'json-rows' },
    outputPorts: { out: 'workbook' },
  };
  const ports = getNodeEffectivePorts(spec, properties);
  const inputs = ports.filter((port) => port.direction === 'input').map((port) => `${port.name}:${port.type}`).sort();
  const outputs = ports.filter((port) => port.direction === 'output').map((port) => `${port.name}:${port.type}`).sort();
  assert.deepEqual(inputs, ['a:number', 'b:json-rows', 'trigger:trigger']);
  assert.deepEqual(outputs, ['out:workbook']);
});

test('resolveNodeProperties 合并默认值且容错非法 JSON', () => {
  const spec = {
    id: 'x',
    label: 'x',
    description: 'x',
    category: 'x',
    kind: 'generic' as const,
    properties: [
      { name: 'inputPorts', label: '输入', type: 'port-definition' as const, default: '{"a":"any"}', description: 'x' },
    ],
    ports: [],
  };
  const merged = resolveNodeProperties(spec, '{not json');
  assert.equal(merged.inputPorts, '{"a":"any"}');
  const withOverride = resolveNodeProperties(spec, JSON.stringify({ inputPorts: { a: 'number' } }));
  assert.deepEqual(withOverride.inputPorts, { a: 'number' });
});

test('toCustomJsPortMap / formatCustomJsPortMap 往返保留类型', () => {
  const map = toCustomJsPortMap({ rows: 'json-rows', file: 'file-data' });
  assert.deepEqual(map, { rows: 'json-rows', file: 'file-data' });
  const formatted = formatCustomJsPortMap({ rows: 'json-rows', file: 'file-data' });
  assert.deepEqual(JSON.parse(formatted), { rows: 'json-rows', file: 'file-data' });
});
