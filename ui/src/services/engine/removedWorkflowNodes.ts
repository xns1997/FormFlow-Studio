import type { FlowNodeSpec } from '../../flowRegistry';

/** 已移除的工作流节点 spec ID（兼容展示）。 */
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

/** 是否为已移除的节点 spec。 */
export function isRemovedWorkflowNode(specId: string | undefined) {
  return !!specId && REMOVED_WORKFLOW_NODE_IDS.has(specId);
}

/** 构造已移除节点的占位 spec。 */
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
