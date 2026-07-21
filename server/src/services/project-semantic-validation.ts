import type { JsonObject, ValidationIssue } from './project-authoring';

const textField = /(描述|说明|备注|意见|结果|原因|地址|名称|姓名|责任人|处理人)$/;
const dateField = /(日期|时间)$/;
const photoField = /(照片|图片|附件|文件)$/;
const enumeratedField = /(状态|类型|等级|结论|是否|外观)$/;
const actionableScript = /(query|fetch|request|submit|navigate|runWorkflow|data_rows|setValue|refreshData)\s*\(/i;
const unsupportedLookup = /[A-Za-z0-9_-]+\s*\[[^\]]+=.*\]\s*\./;

function issue(code: string, path: string, message: string): ValidationIssue { return { code, path, message }; }
function properties(node: any) { try { return JSON.parse(String(node?.data?.propertiesJson || '{}')); } catch { return {}; } }
function fieldName(component: any) { return String(component?.fieldBinding || component?.props?.name || component?.props?.label || ''); }

export function inspectProjectSemantics(project: JsonObject): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const workflows = new Map((project.workflows || []).map((item: any) => [String(item.id), item]));
  const tables = new Map((project.srcTable || []).map((item: any) => [String(item.id), item]));

  for (const form of project.forms || []) {
    const bindings = form.design?.bindings || [];
    const tableBinding = bindings.find((item: any) => item.type === 'table');
    const table = tables.get(String(tableBinding?.config?.tableId || tableBinding?.sourceId || '')) as any;
    const sheet = table?.sheets?.find((item: any) => item.name === (tableBinding?.config?.sheetName || 'Sheet1'));
    for (const component of form.design?.components || []) {
      const field = fieldName(component); const path = `forms.${form.id}.${component.id}`;
      const column = sheet?.columns?.find((item: any) => item.name === field);
      if (photoField.test(field) && !['upload', 'fileUpload', 'imageUpload'].includes(component.type)) errors.push(issue('CONTROL_TYPE_MISMATCH', path, `字段 ${field} 应使用文件或图片上传控件`));
      else if (dateField.test(field) && !['datePicker', 'dateRange', 'timePicker'].includes(component.type)) errors.push(issue('CONTROL_TYPE_MISMATCH', path, `字段 ${field} 应使用日期时间控件`));
      else if (textField.test(field) && !enumeratedField.test(field) && component.type === 'select') errors.push(issue('CONTROL_TYPE_MISMATCH', path, `文本字段 ${field} 不应使用无来源的选择控件`));
      else if (column?.dataType === 'number' && component.type !== 'number') errors.push(issue('CONTROL_TYPE_MISMATCH', path, `数值字段 ${field} 应使用 number 控件`));
      if (component.type === 'select' && !(component.props?.options || []).length && !component.props?.optionsConfig && !component.props?.dataSource) errors.push(issue('SELECT_WITHOUT_OPTIONS', path, `选择字段 ${field || component.id} 没有静态选项或可验证的动态来源`));
      if (component.type === 'button') {
        const label = String(component.props?.label || component.props?.name || '');
        const scripts = Object.values(component.props?.events || {}).filter((value) => typeof value === 'string').join('\n');
        const triggers = Object.values(component.props?.flowTriggers || {}).filter((value: any) => value?.enabled);
        const hasBusinessEffect = actionableScript.test(scripts) || triggers.length > 0;
        if (!hasBusinessEffect) errors.push(issue('BUTTON_WITHOUT_BUSINESS_EFFECT', path, '按钮只有日志/提示或没有可验证的业务副作用'));
        if (/(查询|搜索|筛选)/.test(label)) {
          const queryTrigger = triggers.some((trigger: any) => { const workflow: any = workflows.get(String(trigger.workflowId || '')); return /(查询|搜索|query|search)/i.test(`${workflow?.id || ''} ${workflow?.name || ''} ${workflow?.description || ''}`); });
          if (!actionableScript.test(scripts) && !queryTrigger) errors.push(issue('QUERY_BUTTON_WITHOUT_QUERY', path, '查询按钮未绑定查询脚本或查询工作流'));
        }
      }
      if (component.type === 'table' && !(component.props?.rows || []).length && !component.props?.dataSource && !bindings.some((item: any) => item.targetId === component.id)) errors.push(issue('RESULT_TABLE_UNBOUND', path, '结果表没有数据绑定、动态来源或可验证结果'));
    }

    const writes = new Map<string, string>();
    for (const behavior of form.behaviors || []) if (behavior.enabled !== false) {
      const trigger = `${behavior.trigger?.type || behavior.event || ''}:${behavior.trigger?.fieldName || ''}`;
      for (const action of behavior.actions || []) {
        const target = String(action.targetField || ''); const actionPath = `forms.${form.id}.behaviors.${behavior.id || '?'}`;
        if (typeof action.expression === 'string' && unsupportedLookup.test(action.expression)) errors.push(issue('UNSUPPORTED_BEHAVIOR_EXPRESSION', actionPath, '跨表查询表达式未经运行时能力验证，必须改用 lookup/query 流程'));
        if (typeof action.expression === 'string' && /["']未知/.test(action.expression)) errors.push(issue('PLACEHOLDER_BEHAVIOR_VALUE', actionPath, '行为使用“未知”常量冒充真实数据带出'));
        if (!target || !['setValue', 'clearValue'].includes(action.type)) continue;
        const key = `${trigger}:${target}`; const previous = writes.get(key);
        if (previous) errors.push(issue('BEHAVIOR_WRITE_CONFLICT', actionPath, `行为 ${behavior.id} 与 ${previous} 在同一触发器中写入同一字段 ${target}`)); else writes.set(key, String(behavior.id));
      }
    }
    const ruleCode = String(form.ruleCode || '');
    if (/(只有.{0,12}(负责人|处理人)|权限控制)/.test(ruleCode) && !/(\$user|currentUser|user\.|identity|当前用户|用户身份)/i.test(ruleCode)) errors.push(issue('RULE_PERMISSION_NOT_ENFORCED', `forms.${form.id}.ruleCode`, '规则声称实现用户权限，但没有将当前用户身份与负责人比较'));
  }

  for (const workflow of project.workflows || []) {
    const stateNodes = (workflow.nodes || []).filter((node: any) => node.specId === 'state');
    const hasWriteNode = (workflow.nodes || []).some((node: any) => /(save|write|update|insert|upsert|create|data-row)/i.test(String(node.specId || '')));
    if (stateNodes.length >= 2 && !hasWriteNode) errors.push(issue('WORKFLOW_NO_SIDE_EFFECT', `workflows.${workflow.id}`, '状态流程没有数据写回或可验证副作用节点'));
    const labels = new Set(stateNodes.map((node: any) => String(properties(node).label || '')).filter(Boolean));
    if (labels.size) for (const table of project.srcTable || []) for (const sheet of table.sheets || []) {
      const status = (sheet.columns || []).find((column: any) => /(状态|阶段)$/.test(String(column.name || '')));
      const mismatches = (status?.sampleValues || []).map(String).filter((value: string) => value && !labels.has(value));
      if (mismatches.length) errors.push(issue('WORKFLOW_STATE_DATA_MISMATCH', `workflows.${workflow.id}`, `数据状态 ${mismatches.join('、')} 不在流程状态集合中`));
    }
  }
  return errors;
}
