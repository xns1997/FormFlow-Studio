/**
 * Runtime diagnostic service — categorizes and enriches runtime errors
 * with cause analysis, impact description, and fix suggestions.
 */

import type { DebugEntry, DebugEntryLevel } from '../../project/types';
import { groupBy } from './inspectorHelpers';

export interface RuntimeDiagnostic {
  id: string;
  severity: DebugEntryLevel;
  category: RuntimeDiagnosticCategory;
  title: string;
  detail: string;
  cause: string;
  impact: string;
  fixes: RuntimeFix[];
  source: string;
  timestamp: number;
  componentId?: string;
  field?: string;
  nodeId?: string;
  workflowId?: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
}

export type RuntimeDiagnosticCategory =
  | 'data-binding'
  | 'expression'
  | 'workflow'
  | 'validation'
  | 'runtime'
  | 'network'
  | 'permission'
  | 'unknown';

export interface RuntimeFix {
  label: string;
  description: string;
  action?: 'retry' | 'refresh' | 'reconfigure' | 'ignore';
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: RuntimeDiagnosticCategory;
  cause: string;
  impact: string;
  fixes: RuntimeFix[];
}> = [
  {
    pattern: /字段.*不存在|field.*not found|undefined.*field/i,
    category: 'data-binding',
    cause: '表达式或绑定引用了一个不存在的字段名。可能是字段名拼写错误，或字段已被删除。',
    impact: '该字段的值将为空或显示错误。',
    fixes: [
      { label: '检查字段名', description: '在属性面板中确认字段名是否正确' },
      { label: '重新绑定', description: '在数据绑定向导中重新选择字段' },
    ],
  },
  {
    pattern: /类型不匹配|type.*mismatch|cannot convert/i,
    category: 'data-binding',
    cause: '数据的类型与控件期望的类型不一致。例如将文本赋给数字字段。',
    impact: '值可能显示异常或校验失败。',
    fixes: [
      { label: '检查数据源', description: '确认数据表中该字段的数据类型' },
      { label: '添加类型转换', description: '在表达式中使用类型转换函数' },
    ],
  },
  {
    pattern: /表达式.*错误|expression.*error|syntax.*error/i,
    category: 'expression',
    cause: '表达式语法有误，可能是括号不匹配、函数名错误或参数不正确。',
    impact: '表达式无法执行，相关功能失效。',
    fixes: [
      { label: '检查语法', description: '打开表达式编辑器查看语法提示' },
      { label: '使用可视化模式', description: '切换到可视化编辑器避免语法错误' },
    ],
  },
  {
    pattern: /流程.*超时|workflow.*timeout|node.*timeout/i,
    category: 'workflow',
    cause: '流程节点执行时间超过限制。可能是查询数据量太大或外部服务响应慢。',
    impact: '操作未完成，用户看到超时错误。',
    fixes: [
      { label: '重试', description: '重新执行流程' },
      { label: '优化查询', description: '减少查询数据量或添加筛选条件' },
      { label: '增加超时时间', description: '在流程配置中增加节点超时时间' },
    ],
  },
  {
    pattern: /权限.*不足|permission.*denied|forbidden|403/i,
    category: 'permission',
    cause: '当前用户没有执行此操作的权限。',
    impact: '操作被拒绝。',
    fixes: [
      { label: '联系管理员', description: '请管理员授予相应权限' },
      { label: '检查登录状态', description: '确认是否已登录且会话未过期' },
    ],
  },
  {
    pattern: /网络.*错误|network.*error|fetch.*failed|连接.*失败/i,
    category: 'network',
    cause: '无法连接到服务器。可能是网络问题或服务器不可用。',
    impact: '数据无法保存或加载。',
    fixes: [
      { label: '重试', description: '重新执行操作' },
      { label: '检查网络', description: '确认网络连接正常' },
    ],
  },
  {
    pattern: /必填.*为空|required.*empty|validation.*fail/i,
    category: 'validation',
    cause: '用户提交时有必填字段未填写。',
    impact: '表单无法提交。',
    fixes: [
      { label: '查看未填字段', description: '高亮显示所有未填的必填字段' },
    ],
  },
  {
    pattern: /主键.*重复|duplicate.*key|already.*exists/i,
    category: 'data-binding',
    cause: '写入的数据与已有记录的主键重复。',
    impact: '数据写入失败。',
    fixes: [
      { label: '修改主键值', description: '使用唯一的主键值' },
      { label: '使用更新策略', description: '配置为更新已有记录而非新建' },
    ],
  },
];

function matchCategory(message: string): { category: RuntimeDiagnosticCategory; cause: string; impact: string; fixes: RuntimeFix[] } {
  for (const rule of ERROR_PATTERNS) {
    if (rule.pattern.test(message)) {
      return { category: rule.category, cause: rule.cause, impact: rule.impact, fixes: rule.fixes };
    }
  }
  return {
    category: 'unknown',
    cause: '发生了一个未分类的错误。',
    impact: '可能影响正常使用。',
    fixes: [
      { label: '查看详细日志', description: '展开查看完整错误信息' },
      { label: '重试', description: '重新执行操作', action: 'retry' },
    ],
  };
}

export function enrichDebugEntry(entry: DebugEntry): RuntimeDiagnostic {
  const message = String(entry.message || entry.title || '');
  const match = matchCategory(message);

  return {
    id: entry.id,
    severity: entry.level,
    category: match.category,
    title: String(entry.title || message.slice(0, 60)),
    detail: String(entry.message || ''),
    cause: match.cause,
    impact: match.impact,
    fixes: match.fixes,
    source: entry.source,
    timestamp: entry.timestamp,
    componentId: entry.componentId,
    field: entry.field,
    nodeId: entry.nodeId,
    workflowId: entry.workflowId,
    context: entry.context,
    stackTrace: entry.context?.stack as string | undefined,
  };
}

export function enrichDebugEntries(entries: DebugEntry[]): RuntimeDiagnostic[] {
  return entries.map(enrichDebugEntry);
}

export function groupByCategory(diagnostics: RuntimeDiagnostic[]): Map<string, RuntimeDiagnostic[]> {
  return groupBy(diagnostics, (d) => d.category);
}

export function groupBySeverity(diagnostics: RuntimeDiagnostic[]): Map<string, RuntimeDiagnostic[]> {
  return groupBy(diagnostics, (d) => d.severity);
}

export const CATEGORY_LABELS: Record<RuntimeDiagnosticCategory, { label: string; icon: string }> = {
  'data-binding': { label: '数据绑定', icon: '🔗' },
  'expression': { label: '表达式', icon: '📝' },
  'workflow': { label: '流程', icon: '⚙' },
  'validation': { label: '校验', icon: '✓' },
  'runtime': { label: '运行时', icon: '🔄' },
  'network': { label: '网络', icon: '🌐' },
  'permission': { label: '权限', icon: '🔒' },
  'unknown': { label: '其他', icon: '❓' },
};
