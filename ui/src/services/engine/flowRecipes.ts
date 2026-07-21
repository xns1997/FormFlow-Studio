import type { WorkflowEdge, WorkflowFile, WorkflowNode } from '../../project/types';

export type FlowRecipeId = 'lookup-fill' | 'validate-save' | 'import-clean-dedupe-write' | 'approval-notify-archive' | 'api-map-update';

export interface FlowRecipeDefinition {
  id: FlowRecipeId;
  name: string;
  description: string;
  required: Array<'tableId' | 'sheetName' | 'keyField'>;
}

export interface FlowRecipeParams {
  name?: string;
  tableId?: string;
  sheetName?: string;
  keyField?: string;
}

export const FLOW_RECIPES: FlowRecipeDefinition[] = [
  { id: 'lookup-fill', name: '查询并回填', description: '接收查询条件，查找唯一记录并回填表单。', required: ['tableId', 'sheetName'] },
  { id: 'validate-save', name: '校验、保存与提示', description: '校验表单后按主键写回，并返回保存结果。', required: ['tableId', 'sheetName', 'keyField'] },
  { id: 'import-clean-dedupe-write', name: '导入、清洗、去重与写入', description: '接收批量数据，清洗字段并去重后输出。', required: [] },
  { id: 'approval-notify-archive', name: '审批、通知与归档', description: '根据审批状态匹配结果、通知相关人并输出归档状态。', required: [] },
  { id: 'api-map-update', name: '调用 API、映射与更新', description: '请求外部 API，映射响应字段后输出更新记录。', required: [] },
];

const ports = (items: Array<{ name: string; type: string; label: string }>) => JSON.stringify(items);
const propertiesJson = (value: Record<string, unknown>) => JSON.stringify(value);

function flowNode(id: string, specId: string, x: number, properties: Record<string, unknown> = {}): WorkflowNode {
  return { id, type: 'formflow', specId, position: { x, y: 160 }, data: { propertiesJson: propertiesJson(properties), connectedPortsJson: '[]' } };
}

function flowEdge(id: string, source: string, sourcePort: string, target: string, targetPort: string): WorkflowEdge {
  return { id, source, target, sourceHandle: `out:${sourcePort}`, targetHandle: `in:${targetPort}` };
}

function io(input: Array<{ name: string; type: string; label: string }>, output: Array<{ name: string; type: string; label: string }>) {
  return {
    importNode: flowNode('workflow:import', 'workflow:import', 40, { outputPorts: ports(input) }),
    exportNode: flowNode('workflow:export', 'workflow:export', 920, { inputPorts: ports(output) }),
  };
}

export function validateFlowRecipeParams(recipeId: FlowRecipeId, params: FlowRecipeParams) {
  const recipe = FLOW_RECIPES.find((item) => item.id === recipeId);
  return (recipe?.required || []).filter((field) => !String(params[field] || '').trim());
}

export function createFlowRecipe(recipeId: FlowRecipeId, params: FlowRecipeParams = {}): WorkflowFile {
  const missing = validateFlowRecipeParams(recipeId, params);
  if (missing.length) throw new Error(`请先填写：${missing.join('、')}`);
  const now = new Date().toISOString();
  let nodes: WorkflowNode[] = [];
  let edges: WorkflowEdge[] = [];

  if (recipeId === 'lookup-fill') {
    const { importNode, exportNode } = io([{ name: 'criteria', type: 'object', label: '查询条件' }], [{ name: 'patch', type: 'object', label: '表单补丁' }]);
    nodes = [importNode, flowNode('lookup', 'form:lookup-fill', 380, { tableId: params.tableId, sheetName: params.sheetName, fieldMap: {} }), exportNode];
    edges = [flowEdge('criteria', importNode.id, 'criteria', 'lookup', 'criteria'), flowEdge('patch', 'lookup', 'patch', exportNode.id, 'patch')];
  } else if (recipeId === 'validate-save') {
    const { importNode, exportNode } = io([{ name: 'formData', type: 'object', label: '表单数据' }], [{ name: 'result', type: 'object', label: '保存结果' }]);
    nodes = [importNode, flowNode('validate', 'form:validate-all', 300), flowNode('save', 'form:save', 600, { tableId: params.tableId, sheetName: params.sheetName, keyField: params.keyField }), exportNode];
    edges = [flowEdge('validate-data', importNode.id, 'formData', 'validate', 'formData'), flowEdge('save-data', importNode.id, 'formData', 'save', 'formData'), flowEdge('save-result', 'save', 'row', exportNode.id, 'result')];
  } else if (recipeId === 'import-clean-dedupe-write') {
    const { importNode, exportNode } = io([{ name: 'worksheet', type: 'worksheet', label: '导入工作表' }], [{ name: 'worksheet', type: 'worksheet', label: '处理结果' }]);
    nodes = [importNode, flowNode('dedupe', 'func-remove-duplicates', 480, { hasHeader: true }), exportNode];
    edges = [flowEdge('dedupe', importNode.id, 'worksheet', 'dedupe', 'worksheet'), flowEdge('result', 'dedupe', 'worksheet', exportNode.id, 'worksheet')];
  } else if (recipeId === 'approval-notify-archive') {
    const { importNode, exportNode } = io([{ name: 'status', type: 'string', label: '审批状态' }], [{ name: 'archiveStatus', type: 'string', label: '归档状态' }]);
    nodes = [importNode, flowNode('approval', 'logic:match', 300, { cases: [{ value: 'approved', result: '已归档' }, { value: 'rejected', result: '已退回' }], defaultValue: '待审批' }), flowNode('notify', 'behavior-notify', 600), exportNode];
    edges = [flowEdge('status', importNode.id, 'status', 'approval', 'value'), flowEdge('notify', 'approval', 'result', 'notify', 'status'), flowEdge('archive', 'approval', 'result', exportNode.id, 'archiveStatus')];
  } else {
    const { importNode, exportNode } = io([{ name: 'request', type: 'object', label: '请求参数' }], [{ name: 'record', type: 'object', label: '更新记录' }]);
    nodes = [importNode, flowNode('api', 'behavior-api-request', 300), flowNode('map', 'data:map-fields', 600, { keepSource: false }), exportNode];
    edges = [flowEdge('request', importNode.id, 'request', 'api', 'body'), flowEdge('response', 'api', 'response', 'map', 'record'), flowEdge('record', 'map', 'result', exportNode.id, 'record')];
  }

  const definition = FLOW_RECIPES.find((item) => item.id === recipeId)!;
  return { id: `wf_${recipeId}_${Date.now()}`, name: params.name?.trim() || definition.name, description: definition.description, nodes, edges, versions: [], createdAt: now, updatedAt: now };
}
