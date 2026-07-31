/**
 * Frontend ErrorManager — centralized error collection, enrichment, and reporting.
 * All errors flow through here before being displayed or sent to the backend.
 */

import type { DebugEntry, DebugEntryLevel, DebugEntrySource } from '../../project/types';

export interface ManagedError {
  id: string;
  timestamp: number;
  severity: DebugEntryLevel;
  source: DebugEntrySource;
  category: ErrorCategory;
  title: string;
  message: string;
  cause: string;
  impact: string;
  fixes: ErrorFix[];
  componentId?: string;
  field?: string;
  nodeId?: string;
  workflowId?: string;
  context?: Record<string, unknown>;
  stack?: string;
  reported: boolean;
}

export type ErrorCategory =
  | 'data-binding'
  | 'expression'
  | 'workflow'
  | 'validation'
  | 'runtime'
  | 'network'
  | 'permission'
  | 'render'
  | 'unknown';

export interface ErrorFix {
  label: string;
  description: string;
  action?: 'retry' | 'refresh' | 'reconfigure' | 'ignore';
  auto?: boolean;
}

type ErrorListener = (error: ManagedError) => void;

const MAX_ERRORS = 500;
const errors: ManagedError[] = [];
const listeners = new Set<ErrorListener>();
let reportTimer: number | null = null;
const pendingReports: ManagedError[] = [];

// Error pattern matching for automatic categorization
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory; cause: string; impact: string; fixes: ErrorFix[] }> = [
  {
    pattern: /字段.*不存在|field.*not found|undefined.*field/i,
    category: 'data-binding',
    cause: '表达式或绑定引用了一个不存在的字段名。可能是字段名拼写错误，或字段已被删除。',
    impact: '该字段的值将为空或显示错误。',
    fixes: [{ label: '检查字段名', description: '在属性面板中确认字段名是否正确' }],
  },
  {
    pattern: /类型不匹配|type.*mismatch|cannot convert/i,
    category: 'data-binding',
    cause: '数据的类型与控件期望的类型不一致。',
    impact: '值可能显示异常或校验失败。',
    fixes: [{ label: '检查数据源', description: '确认数据表中该字段的数据类型' }],
  },
  {
    pattern: /表达式.*错误|expression.*error|syntax.*error/i,
    category: 'expression',
    cause: '表达式语法有误，可能是括号不匹配、函数名错误或参数不正确。',
    impact: '表达式无法执行，相关功能失效。',
    fixes: [{ label: '检查语法', description: '打开表达式编辑器查看语法提示' }],
  },
  {
    pattern: /流程.*超时|workflow.*timeout|node.*timeout/i,
    category: 'workflow',
    cause: '流程节点执行时间超过限制。可能是查询数据量太大或外部服务响应慢。',
    impact: '操作未完成，用户看到超时错误。',
    fixes: [{ label: '重试', description: '重新执行流程', action: 'retry' }],
  },
  {
    pattern: /权限.*不足|permission.*denied|forbidden|403/i,
    category: 'permission',
    cause: '当前用户没有执行此操作的权限。',
    impact: '操作被拒绝。',
    fixes: [{ label: '联系管理员', description: '请管理员授予相应权限' }],
  },
  {
    pattern: /网络.*错误|network.*error|fetch.*failed|连接.*失败/i,
    category: 'network',
    cause: '无法连接到服务器。可能是网络问题或服务器不可用。',
    impact: '数据无法保存或加载。',
    fixes: [{ label: '重试', description: '重新执行操作', action: 'retry' }],
  },
  {
    pattern: /必填.*为空|required.*empty|validation.*fail/i,
    category: 'validation',
    cause: '用户提交时有必填字段未填写。',
    impact: '表单无法提交。',
    fixes: [{ label: '查看未填字段', description: '高亮显示所有未填的必填字段' }],
  },
  {
    pattern: /render.*error|渲染.*失败|cannot read prop/i,
    category: 'render',
    cause: '组件渲染时发生错误，可能是数据格式异常或组件配置有误。',
    impact: '界面可能显示不完整。',
    fixes: [{ label: '检查数据', description: '确认绑定的数据格式正确' }],
  },
];

function categorize(message: string): { category: ErrorCategory; cause: string; impact: string; fixes: ErrorFix[] } {
  for (const rule of CATEGORY_PATTERNS) {
    if (rule.pattern.test(message)) {
      return { category: rule.category, cause: rule.cause, impact: rule.impact, fixes: rule.fixes };
    }
  }
  return {
    category: 'unknown',
    cause: '发生了一个未分类的错误。',
    impact: '可能影响正常使用。',
    fixes: [{ label: '查看详细日志', description: '展开查看完整错误信息' }],
  };
}

let idCounter = 0;

/**
 * Report an error to the ErrorManager.
 * This is the primary entry point for all error reporting.
 */
export function reportError(params: {
  severity?: DebugEntryLevel;
  source?: DebugEntrySource;
  title: string;
  message: string;
  componentId?: string;
  field?: string;
  nodeId?: string;
  workflowId?: string;
  context?: Record<string, unknown>;
  stack?: string;
}): ManagedError {
  const cat = categorize(params.message);
  const error: ManagedError = {
    id: `err_${Date.now()}_${++idCounter}`,
    timestamp: Date.now(),
    severity: params.severity || 'error',
    source: params.source || 'ui',
    category: cat.category,
    title: params.title,
    message: params.message,
    cause: cat.cause,
    impact: cat.impact,
    fixes: cat.fixes,
    componentId: params.componentId,
    field: params.field,
    nodeId: params.nodeId,
    workflowId: params.workflowId,
    context: params.context,
    stack: params.stack,
    reported: false,
  };

  errors.push(error);
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);

  // Notify listeners
  for (const listener of listeners) {
    try { listener(error); } catch { /* listener error should not break reporting */ }
  }

  // Queue for backend reporting
  pendingReports.push(error);
  scheduleReport();

  return error;
}

/**
 * Convert a DebugEntry to a ManagedError (enriches with categorization).
 */
export function fromDebugEntry(entry: DebugEntry): ManagedError {
  const cat = categorize(String(entry.message || entry.title || ''));
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    severity: entry.level,
    source: entry.source,
    category: cat.category,
    title: String(entry.title || ''),
    message: String(entry.message || ''),
    cause: cat.cause,
    impact: cat.impact,
    fixes: cat.fixes,
    componentId: entry.componentId,
    field: entry.field,
    nodeId: entry.nodeId,
    workflowId: entry.workflowId,
    context: entry.context,
    stack: entry.context?.stack as string | undefined,
    reported: false,
  };
}

/**
 * Get all managed errors, optionally filtered.
 */
export function getErrors(filters?: {
  severity?: DebugEntryLevel;
  category?: ErrorCategory;
  source?: DebugEntrySource;
  limit?: number;
}): ManagedError[] {
  let result = [...errors];
  if (filters?.severity) result = result.filter((e) => e.severity === filters.severity);
  if (filters?.category) result = result.filter((e) => e.category === filters.category);
  if (filters?.source) result = result.filter((e) => e.source === filters.source);
  const limit = Math.max(1, Math.min(MAX_ERRORS, filters?.limit || 100));
  return result.slice(-limit).reverse();
}

/**
 * Get error counts by severity.
 */
export function getErrorCounts(): { error: number; warning: number; info: number; debug: number; total: number } {
  let error = 0, warning = 0, info = 0, debug = 0;
  for (const e of errors) {
    if (e.severity === 'error') error++;
    else if (e.severity === 'warn') warning++;
    else if (e.severity === 'info') info++;
    else if (e.severity === 'debug') debug++;
  }
  return { error, warning, info, debug, total: errors.length };
}

/**
 * Subscribe to new errors. Returns unsubscribe function.
 */
export function onError(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Clear all errors.
 */
export function clearErrors(): void {
  errors.splice(0, errors.length);
}

/**
 * Install global error handlers to catch unhandled errors.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportError({
      severity: 'error',
      source: 'ui',
      title: '未捕获的错误',
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError({
      severity: 'error',
      source: 'ui',
      title: '未处理的 Promise 拒绝',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

// Batched backend reporting
function scheduleReport() {
  if (reportTimer !== null) return;
  if (typeof window === 'undefined') return; // Skip in non-browser environments
  reportTimer = window.setTimeout(async () => {
    reportTimer = null;
    const batch = pendingReports.splice(0, pendingReports.length);
    if (batch.length === 0) return;
    try {
      const apiBase = getApiBase();
      await fetch(`${apiBase}/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors: batch.map((e) => ({ id: e.id, timestamp: e.timestamp, severity: e.severity, source: e.source, category: e.category, title: e.title, message: e.message, componentId: e.componentId, field: e.field, nodeId: e.nodeId, workflowId: e.workflowId, context: e.context, stack: e.stack })) }),
      });
      for (const e of batch) e.reported = true;
    } catch {
      // Reporting failure should not break the app
    }
  }, 2000);
}

function getApiBase(): string {
  try {
    const saved = JSON.parse(localStorage.getItem('formflow:system-settings') || '{}');
    return (saved?.storage?.apiBase || 'http://localhost:3900/api').replace(/\/$/, '');
  } catch {
    return 'http://localhost:3900/api';
  }
}
