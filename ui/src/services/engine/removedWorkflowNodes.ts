import type { FlowNodeSpec } from '../../flowRegistry';

export const REMOVED_WORKFLOW_NODE_IDS = new Set([
  'generic:variable-input',
  'generic:text-input',
  'generic:number-input',
  'generic:boolean-input',
  'generic:boolean-switch',
  'generic:file-picker',
  'generic:worksheet-select',
  'generic:range-select',
  'func-select-input',
  'func-radio-input',
  'func-checkbox-input',
]);

export function isRemovedWorkflowNode(specId: string | undefined) {
  return !!specId && REMOVED_WORKFLOW_NODE_IDS.has(specId);
}

export function createRemovedWorkflowNodeSpec(specId: string): FlowNodeSpec {
  return {
    id: specId,
    label: '已移除节点',
    description: `该节点已被新版输入/选择节点体系移除，请手动替换。原节点：${specId}`,
    category: '已移除 · 待替换',
    kind: 'generic',
    properties: [],
    ports: [],
    keywords: [],
  };
}
