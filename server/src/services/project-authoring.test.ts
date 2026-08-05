import assert from 'node:assert/strict';
import test from 'node:test';
import { serverPortTypesCompatible, validateProjectModel } from './project-authoring';

function workflowProject(workflow: any) {
  return {
    config: { id: 'edge_type_probe', name: 'Edge Type Probe', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    srcTable: [],
    forms: [],
    workflows: [workflow],
    globalBehaviors: [],
    sheetBehaviors: [],
    outputs: [],
  };
}

const node = (id: string, specId: string, propertiesJson = '{}') => ({
  id,
  type: 'flow-node',
  specId,
  position: { x: 0, y: 0 },
  data: { propertiesJson, connectedPortsJson: '[]' },
});

test('server port type compatibility follows the shared families rule', () => {
  assert.equal(serverPortTypesCompatible('any', 'worksheet'), true);
  assert.equal(serverPortTypesCompatible('workbook', 'workbook'), true);
  assert.equal(serverPortTypesCompatible('worksheet', 'object'), true, 'worksheet/object 同族');
  assert.equal(serverPortTypesCompatible('json-rows', 'array'), true, 'json-rows/array 同族');
  assert.equal(serverPortTypesCompatible('string', 'csv-string'), true, 'string/csv-string 同族');
  assert.equal(serverPortTypesCompatible('number', 'string'), false);
  assert.equal(serverPortTypesCompatible('workbook', 'json-rows'), false);
});

test('edge validation rejects incompatible port types', () => {
  const project = workflowProject({
    id: 'wf',
    name: '类型不兼容',
    nodes: [node('n1', 'func-rating-input'), node('n2', 'behavior-log')],
    edges: [{ id: 'e1', source: 'n1', sourceHandle: 'out:value', target: 'n2', targetHandle: 'in:message' }],
  });
  const report = validateProjectModel(project as any);
  const edgeTypeError = report.errors.find((item) => item.code === 'INVALID_EDGE_TYPE' && item.path.includes('e1'));
  assert.ok(edgeTypeError, `应检测到类型不兼容连线，实际: ${report.errors.map((e) => e.code).join(',')}`);
  assert.match(edgeTypeError!.message, /number.*string|value\(number\) → message\(string\)/);
});

test('edge validation accepts workflow:import dynamic output ports defined as JSON string', () => {
  const project = workflowProject({
    id: 'wf',
    name: '动态端口',
    nodes: [
      node('import', 'workflow:import', JSON.stringify({ outputPorts: JSON.stringify([{ name: 'formData', type: 'object', label: '表单数据' }]) })),
      node('save', 'form:save', JSON.stringify({ tableId: 't', sheetName: 's', keyField: 'id' })),
    ],
    edges: [{ id: 'e1', source: 'import', sourceHandle: 'out:formData', target: 'save', targetHandle: 'in:formData' }],
  });
  const report = validateProjectModel(project as any);
  const portError = report.errors.find((item) => item.code === 'INVALID_PORT' || item.code === 'INVALID_EDGE_TYPE');
  assert.equal(portError, undefined, `动态端口不应被误判，实际: ${report.errors.map((e) => `${e.code}:${e.message}`).join('; ')}`);
});

test('edge validation keeps full dynamic port types and normalizes unknown to any', () => {
  const project = workflowProject({
    id: 'wf',
    name: '动态端口类型',
    nodes: [
      node('import', 'workflow:import', JSON.stringify({
        outputPorts: JSON.stringify([
          { name: 'wb', type: 'workbook', label: '工作簿' },
          { name: 'rows', type: 'json-rows', label: '行集' },
          { name: 'odd', type: 'not-a-type', label: '未知' },
        ]),
      })),
      node('commit', 'generic:worksheet-commit', '{}'),
      node('joiner', 'generic:merge', '{}'),
      node('log', 'behavior-log', '{}'),
    ],
    edges: [
      // workbook 类型动态输出端口接 workbook 输入
      { id: 'e1', source: 'import', sourceHandle: 'out:wb', target: 'commit', targetHandle: 'in:workbook' },
      // json-rows 类型动态输出端口接 json-rows 输入
      { id: 'e2', source: 'import', sourceHandle: 'out:rows', target: 'joiner', targetHandle: 'in:leftData' },
      // 未知类型归一化为 any，可与任意端口相连
      { id: 'e3', source: 'import', sourceHandle: 'out:odd', target: 'log', targetHandle: 'in:message' },
    ],
  });
  const report = validateProjectModel(project as any);
  const portErrors = report.errors.filter((item) => item.code === 'INVALID_PORT' || item.code === 'INVALID_EDGE_TYPE');
  assert.equal(portErrors.length, 0, `动态端口应保留类型并归一化未知类型，实际: ${portErrors.map((e) => `${e.code}:${e.message}`).join('; ')}`);
});

test('edge validation rejects unknown static ports', () => {
  const project = workflowProject({
    id: 'wf',
    name: '未知端口',
    nodes: [node('n1', 'behavior-log'), node('n2', 'behavior-condition')],
    edges: [{ id: 'e1', source: 'n1', sourceHandle: 'out:doesNotExist', target: 'n2', targetHandle: 'in:trigger' }],
  });
  const report = validateProjectModel(project as any);
  assert.ok(report.errors.some((item) => item.code === 'INVALID_PORT' && item.path.includes('e1.sourceHandle')));
});
