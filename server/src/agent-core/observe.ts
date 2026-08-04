/**
 * Tool-result observation compression. Keeps the LLM context small while
 * retaining the evidence, changes and unresolved issues that drive the loop.
 */
import type { ToolResult } from '../services/tool-shared';
import type { LoopDecision, LoopObservation, ThreadEvent } from './types';

type ToolCallShape = Pick<LoopDecision, 'toolName' | 'scope' | 'taskId' | 'arguments'>;

function truncate(value: unknown, maxChars = 1200): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}…（已截断）` : text;
}

function readable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return truncate(value, 400);
}

function nameOf(item: any): string {
  return item?.name || item?.id || item?.title || '';
}

/** Concise business summary per tool so the model sees real content, not "ok". */
function toolSummary(toolName: string | undefined, data: any): string {
  if (!data) return '';
  const table = (value: any) => `找到 ${value?.length ?? 0} 张数据表：${(value || []).map((item: any) => `${item.id}(${item.name || ''})`).slice(0, 6).join('、')}`;
  const forms = (value: any) => `找到 ${value?.length ?? 0} 个表单：${(value || []).map((item: any) => `${item.id}(${item.name || ''})`).slice(0, 6).join('、')}`;
  const workflows = (value: any) => `找到 ${value?.length ?? 0} 条流程：${(value || []).map((item: any) => `${item.id}(${item.name || ''})`).slice(0, 6).join('、')}`;
  switch (toolName) {
    case 'project.get': {
      const project = data.project || data;
      const config = project.config || {};
      return `项目 ${config.id || config.name || ''}：${(project.srcTable || []).length} 张表、${(project.forms || []).length} 个表单、${(project.workflows || []).length} 条流程、${(project.outputs || []).length} 个输出；revision=${data.revision || config.revision || ''}`;
    }
    case 'project.inspect':
    case 'project.list':
      return Array.isArray(data) ? `找到 ${data.length} 个项目：${data.map((item) => nameOf(item)).slice(0, 6).join('、')}` : truncate(data, 300);
    case 'data_source.list': return table(data);
    case 'data_source.get': return `数据表 ${nameOf(data)}：${(data.sheets || []).length} 个 Sheet（${(data.sheets || []).map((sheet: any) => `${sheet.name}：${(sheet.headers || []).length} 列（${(sheet.headers || []).join('、')}），主键=${JSON.stringify(sheet.config?.keyFields || [])}，${sheet.config?.readOnly ? '只读' : '可编辑'}`).join('；')}）`;
    case 'data_sheet.get': return `Sheet ${data.name || ''}：${(data.columns || []).length} 列（${(data.columns || []).map((column: any) => column.name).join('、')}），主键=${JSON.stringify(data.config?.keyFields || [])}，${data.config?.readOnly ? '只读' : '可编辑'}`;
    case 'data_keys.validate': return `主键校验：${data.valid ? '通过' : `未通过（${(data.errors || []).length} 个问题）`} keyFields=${JSON.stringify(data.keyFields || [])}`;
    case 'data_rows.query': return `查询到 ${Array.isArray(data?.rows) ? data.rows.length : (Array.isArray(data) ? data.length : data?.total || 0)} 行`;
    case 'form.list': return forms(data);
    case 'form.get': return `表单 ${data.name || data.id || ''}：${(data.design?.components || []).length} 个控件、${(data.design?.bindings || []).length} 条绑定`;
    case 'workflow.list': return workflows(data);
    case 'workflow.get': return `流程 ${nameOf(data)}：${(data.nodes || []).length} 个节点、${(data.edges || []).length} 条连线`;
    case 'behavior.list': return `找到 ${(data || []).length} 条行为规则：${(data || []).map((item: any) => nameOf(item)).slice(0, 6).join('、')}`;
    case 'project.validate': {
      const errors = data?.errors || [];
      return `项目校验：${data?.valid === false || errors.length ? `未通过（${errors.length} 个问题）` : '通过'}` + (errors.length ? `，示例：${truncate(errors.slice(0, 3).map((item: any) => `${item.code || ''}@${item.path || ''}`).join('；'), 200)}` : '');
    }
    case 'project.quality.inspect': return `质量检查：ready=${data?.ready === true}, ${truncate(data?.summary || data?.quality || '', 200)}`;
    case 'release.preview': return `发布预检：ready=${data?.ready === true}, ${truncate(data?.validation || '', 200)}`;
    default: return truncate(data, 300);
  }
}

export function observeToolResult(decision: ToolCallShape, result: ToolResult): LoopObservation {
  if (result.ok) {
    const data = result.data as Record<string, any> | undefined;
    const changes = Array.isArray(data?.changes) ? data.changes.map(String) : [];
    const summary = data?.summary ? readable(data.summary) : toolSummary(decision.toolName, result.data);
    return {
      taskId: decision.taskId,
      toolName: decision.toolName,
      scope: decision.scope,
      status: 'succeeded',
      summary: truncate(summary, 400),
      changes,
      evidence: truncate(data && typeof data === 'object' ? data : result.data, 800).split('\n').slice(0, 6),
      unresolved: [],
    };
  }
  if ('status' in result && result.status === 'confirmation_required') {
    return {
      taskId: decision.taskId,
      toolName: decision.toolName,
      scope: decision.scope,
      status: 'waiting_confirmation',
      summary: result.confirmation.summary || '操作等待用户确认',
      changes: [],
      evidence: [],
      unresolved: ['等待用户对破坏性操作做出决定'],
    };
  }
  if (!('error' in result)) return {
    taskId: decision.taskId,
    toolName: decision.toolName,
    scope: decision.scope,
    status: 'failed',
    summary: '未知工具结果',
    changes: [],
    evidence: [],
    unresolved: ['工具返回了无法识别的结果'],
  };
  const error = result.error;
  return {
    taskId: decision.taskId,
    toolName: decision.toolName,
    scope: decision.scope,
    status: 'failed',
    summary: truncate(error.message, 400),
    changes: [],
    evidence: [],
    unresolved: [truncate(error.details || error.message, 600)],
    error: {
      category: error.code || 'tool_error',
      message: error.message,
      retryable: error.retryable !== false,
      suggestion: typeof error.details === 'object' && error.details ? truncate(error.details, 600) : undefined,
    },
  };
}

export function recentObservations(threadEvents: ThreadEvent[], limit = 12): string[] {
  const rows: string[] = [];
  for (const event of threadEvents) {
    if (event.type === 'tool_observation' && event.data?.summary) {
      const item = event.data as { summary: string; toolName?: string; status?: string; changes?: string[]; unresolved?: string[] };
      const parts = [
        `[${item.toolName || '工具'} ${item.status || ''}] ${item.summary}`,
        ...(item.changes || []).slice(0, 3).map((change) => `  变化：${change}`),
        ...(item.unresolved || []).slice(0, 3).map((issue) => `  未解决：${issue}`),
      ];
      rows.push(parts.join('\n'));
      if (rows.length >= limit) break;
    }
  }
  return rows;
}
