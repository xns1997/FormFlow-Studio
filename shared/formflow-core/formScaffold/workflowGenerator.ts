/**
 * Workflow generation for form scaffold.
 *
 * Creates save workflows with import/submit/export nodes.
 */
import type { InferredFormField } from '../fieldInference';
import type { SrcSheetInfo, SrcTableEntry, WorkflowFile } from '../formScaffold';
import { inferLikelyKey } from '../fieldInference';

function workflowIoPorts(direction: 'output' | 'input') {
  const ports = direction === 'output'
    ? [
        { name: 'formData', type: 'object', label: '表单数据', description: '提交时写回的数据对象' },
        { name: 'originalData', type: 'object', label: '原始数据', description: '编辑前的原始数据对象' },
      ]
    : [
        { name: 'success', type: 'object', label: '成功事件' },
        { name: 'changeLog', type: 'object', label: '变更记录' },
        { name: 'writeBack', type: 'object', label: '写回动作' },
        { name: 'fileData', type: 'any', label: '文件数据' },
      ];
  return JSON.stringify({ [`${direction}Ports`]: JSON.stringify(ports) });
}

/** 生成保存工作流（导入/提交/导出节点）；无主键字段时返回 undefined。 */
export function createSaveWorkflow(
  table: SrcTableEntry,
  sheet: SrcSheetInfo,
  fields: InferredFormField[],
  options: { id: string; name: string; now: string },
): WorkflowFile | undefined {
  const keyField = inferLikelyKey(sheet);
  if (!keyField) return undefined;
  const fieldMap = Object.fromEntries(fields.map((field) => [field.name, field.name]));
  return {
    id: options.id,
    name: `保存${options.name}`,
    description: `自动生成：校验并写回 ${table.fileName} / ${sheet.name}`,
    createdAt: options.now,
    updatedAt: options.now,
    nodes: [
      { id: 'workflow_import', type: 'formflow', specId: 'workflow:import', position: { x: 40, y: 160 }, data: { propertiesJson: workflowIoPorts('output') } },
      {
        id: 'submit', type: 'formflow', specId: 'behavior:submit', position: { x: 320, y: 160 },
        data: { propertiesJson: JSON.stringify({
          validateFirst: true,
          target: 'changeLog',
          fileName: options.id,
          writeBackMode: 'upsert',
          writeBackTableId: table.id,
          writeBackSheetName: sheet.name,
          writeBackKeyField: keyField,
          writeBackKeyFormField: keyField,
          writeBackFieldMap: fieldMap,
        }) },
      },
      { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 640, y: 160 }, data: { propertiesJson: workflowIoPorts('input') } },
    ],
    edges: [
      { id: 'edge_import_formData', source: 'workflow_import', target: 'submit', sourceHandle: 'out:formData', targetHandle: 'in:formData' },
      { id: 'edge_import_originalData', source: 'workflow_import', target: 'submit', sourceHandle: 'out:originalData', targetHandle: 'in:originalData' },
      { id: 'edge_submit_success', source: 'submit', target: 'workflow_export', sourceHandle: 'out:success', targetHandle: 'in:success' },
      { id: 'edge_submit_changeLog', source: 'submit', target: 'workflow_export', sourceHandle: 'out:changeLog', targetHandle: 'in:changeLog' },
      { id: 'edge_submit_writeBack', source: 'submit', target: 'workflow_export', sourceHandle: 'out:writeBack', targetHandle: 'in:writeBack' },
      { id: 'edge_submit_fileData', source: 'submit', target: 'workflow_export', sourceHandle: 'out:fileData', targetHandle: 'in:fileData' },
    ],
  };
}
