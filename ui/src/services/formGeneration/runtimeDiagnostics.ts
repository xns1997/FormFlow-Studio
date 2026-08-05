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
  {
    pattern: /defaultSearchParams|forEach is not a function/i,
    category: 'runtime',
    cause: '宿主环境（浏览器 / WebView / 扩展）提供的 URLSearchParams 实现不完整，缺少 forEach 等迭代能力，导致 React Router 合并 URL 参数时失败。应用已内置启动防护，刷新后通常不再出现。',
    impact: '仅该区域显示不完整，其余功能不受影响。',
    fixes: [
      { label: '刷新页面', description: '应用已内置 URLSearchParams 兼容修复，刷新后通常可恢复', action: 'refresh' },
      { label: '重试', description: '重新加载该区域', action: 'retry' },
      { label: '使用标准浏览器', description: '若在 WebView 或扩展环境运行，请改用 Chrome / Edge / Safari / Firefox 标准窗口', action: 'reconfigure' },
    ],
  },
  {
    pattern: /chunk.*load|Failed to fetch dynamically imported|importing module|loading chunk/i,
    category: 'network',
    cause: '应用发布了新版本或缓存过期，浏览器仍在使用旧代码块，动态加载新资源失败。',
    impact: '对应功能暂时无法打开。',
    fixes: [
      { label: '刷新页面', description: '获取最新版本资源', action: 'refresh' },
      { label: '重试', description: '重新加载该资源', action: 'retry' },
    ],
  },
  {
    pattern: /is not a function|is not defined/i,
    category: 'runtime',
    cause: '代码运行环境缺少某个 API 或函数实现，或页面代码与资源版本不一致。',
    impact: '对应功能无法执行。',
    fixes: [
      { label: '刷新页面', description: '重新加载完整资源', action: 'refresh' },
      { label: '使用标准浏览器', description: '若在 WebView 或扩展环境运行，请改用标准浏览器窗口', action: 'reconfigure' },
    ],
  },
  {
    pattern: /ResizeObserver loop/i,
    category: 'runtime',
    cause: '浏览器尺寸观察器反馈循环，通常由布局抖动引起，属于浏览器已知的无害告警。',
    impact: '一般无实际影响。',
    fixes: [
      { label: '忽略', description: '该告警通常不影响功能', action: 'ignore' },
      { label: '刷新页面', description: '刷新后告警通常消失', action: 'refresh' },
    ],
  },
  {
    pattern: /Unexpected token|Unexpected end of JSON input|JSON\.parse|invalid json/i,
    category: 'runtime',
    cause: '收到的数据不是有效的 JSON，可能是数据源返回了错误内容或网络传输被截断。',
    impact: '数据无法解析，相关功能可能显示为空。',
    fixes: [
      { label: '重试', description: '重新请求一次', action: 'retry' },
      { label: '检查数据源', description: '确认接口或数据文件返回的是合法 JSON' },
    ],
  },
  {
    pattern: /QuotaExceededError|quota|storage.*full|存储空间/i,
    category: 'runtime',
    cause: '浏览器本地存储空间已满，写入被拒绝。',
    impact: '本地缓存或草稿无法保存。',
    fixes: [
      { label: '清理浏览器存储', description: '清除该站点的缓存 / LocalStorage 后重试' },
      { label: '刷新页面', description: '清理后刷新页面' },
    ],
  },
  {
    pattern: /AbortError|user aborted/i,
    category: 'runtime',
    cause: '请求被用户或浏览器主动取消（如页面切换、重复提交）。',
    impact: '本次操作未完成，通常无需处理。',
    fixes: [
      { label: '忽略', description: '操作已取消，无需处理', action: 'ignore' },
      { label: '重试', description: '如需完成操作请重新执行', action: 'retry' },
    ],
  },
  {
    pattern: /out of memory|heap.*exhausted|内存不足/i,
    category: 'runtime',
    cause: '页面处理的数据量过大或存在内存泄漏，浏览器内存耗尽。',
    impact: '页面可能变慢或崩溃。',
    fixes: [
      { label: '刷新页面', description: '释放内存后重试', action: 'refresh' },
      { label: '减少数据量', description: '减少导入/加载的数据行数或分批处理' },
    ],
  },
  {
    pattern: /Script error/i,
    category: 'runtime',
    cause: '跨域脚本抛出的错误被浏览器安全策略隐藏了细节（显示为 Script error）。',
    impact: '无法获取具体错误位置，功能可能受影响。',
    fixes: [
      { label: '刷新页面', description: '重试一次', action: 'refresh' },
      { label: '使用标准浏览器', description: '跨域场景请使用标准浏览器窗口' },
    ],
  },
  {
    pattern: /NotAllowedError|SecurityError|not allowed to|安全策略拒绝/i,
    category: 'permission',
    cause: '浏览器安全策略或权限设置拒绝了该操作（如剪贴板、摄像头、存储权限）。',
    impact: '该操作被阻止。',
    fixes: [
      { label: '检查权限设置', description: '在浏览器站点设置中允许所需权限' },
      { label: '联系管理员', description: '若为公司策略导致，请联系管理员' },
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
      { label: '刷新页面', description: '刷新后通常可恢复', action: 'refresh' },
      { label: '重试', description: '重新执行操作', action: 'retry' },
    ],
  };
}

/** 调试条目 → 运行时诊断（分类/严重级/来源）。 */
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

/** 批量转换调试条目为诊断。 */
export function enrichDebugEntries(entries: DebugEntry[]): RuntimeDiagnostic[] {
  return entries.map(enrichDebugEntry);
}

/** 按分类分组诊断。 */
export function groupByCategory(diagnostics: RuntimeDiagnostic[]): Map<string, RuntimeDiagnostic[]> {
  return groupBy(diagnostics, (d) => d.category);
}

/** 按严重级分组诊断。 */
export function groupBySeverity(diagnostics: RuntimeDiagnostic[]): Map<string, RuntimeDiagnostic[]> {
  return groupBy(diagnostics, (d) => d.severity);
}

/** 分类 → 中文标签与图标。 */
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
