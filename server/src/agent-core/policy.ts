/**
 * Deterministic tool policy: scope whitelist, risk classification,
 * destructive-operation confirmation rules and stable idempotency keys.
 */
import { createHash } from 'node:crypto';
import { getFormFlowTool, listFormFlowTools } from '../services/formflow-tool-registry';
import type { McpRole } from '../services/tool-shared';
import { effectiveScopeTools } from './skills';
import type { AgentTask, CapabilityBundleVersion, LoopDecision } from './types';

export type PolicyOutcome = {
  level: 'allowed' | 'forbidden' | 'confirmation_required';
  reason: string;
  userMessage: string;
};

/** 本地模式自动确认、云端模式需要用户确认。 */
export function shouldAutoApproveOperation(mode: 'local' | 'cloud') {
  return mode === 'local';
}

/** 工具风险级别：read / write / destructive。 */
export function toolRisk(toolName: string) {
  return getFormFlowTool(toolName)?.risk || 'read';
}

/** 是否为写工具（需要 revision 与幂等键）。 */
export function isWriteTool(toolName: string) {
  return toolRisk(toolName) !== 'read';
}

/** Returns the resolved scope for a decision, validating whitelist membership. */
/** 解析决策应使用的 MCP 角色作用域（project/data/form/workflow/...）。 */
export function resolveScope(decision: LoopDecision, bundle: CapabilityBundleVersion): McpRole {
  const tool = decision.toolName;
  if (!tool) throw new Error('决策缺少 toolName');
  const owner = getFormFlowTool(tool)?.ownerRole;
  const scope = decision.scope || owner;
  if (!scope) throw new Error(`未知工具 ${tool}`);
  const scopeConfig = bundle.scopes.find((item) => item.role === scope);
  if (!scopeConfig) throw new Error(`能力包未注册作用域 ${scope}`);
  const allowed = effectiveScopeTools(scopeConfig);
  if (!allowed.some((item) => item.name === tool)) {
    throw new Error(`工具 ${tool} 不在 ${scope} 作用域的能力包白名单内`);
  }
  if (owner && owner !== scope) {
    const shared = getFormFlowTool(tool)?.sharedReadRoles?.includes(scope);
    if (!shared) throw new Error(`工具 ${tool} 归属 ${owner}，不能通过 ${scope} 调用`);
  }
  return scope;
}

/** 工具策略评估：确认必要性、风险级别与是否自动放行。 */
export function evaluateToolPolicy(toolName: string, request: string, task?: AgentTask): PolicyOutcome {
  const risk = toolRisk(toolName);
  if (risk === 'read') return { level: 'allowed', reason: 'read_only', userMessage: '只读操作，不会修改项目。' };
  const destructive = risk === 'destructive' || /\.delete$/.test(toolName) || toolName === 'release.apply';
  if (destructive) {
    if (/(?:不|不要|不得|禁止|不允许)(?:删除|覆盖)|不删除/.test(request)) {
      return { level: 'forbidden', reason: 'explicit_user_constraint', userMessage: '用户已明确要求保留现有内容，不能执行删除。' };
    }
    const taskMentionsDelete = /删除|移除|清理|废弃/.test(`${task?.title || ''}\n${task?.instruction || ''}\n${(task?.acceptance || []).join('\n')}`);
    return {
      level: 'confirmation_required',
      reason: taskMentionsDelete ? 'destructive_action_in_task' : 'destructive_action_requested',
      userMessage: '删除或覆盖操作需要确认影响后才能执行。',
    };
  }
  return { level: 'allowed', reason: 'write', userMessage: '写操作，将在成功提交后更新项目。' };
}

/** Stable, retry-safe idempotency key derived from thread/task/tool/args. */
/** 生成稳定幂等键：同一线程/任务/尝试/工具/参数重试保持一致。 */
export function stableIdempotencyKey(threadId: string, taskId: string | undefined, attempt: number, toolName: string, argumentsValue: Record<string, any>) {
  const sanitized = { ...argumentsValue, idempotencyKey: undefined, confirmationToken: undefined };
  const digest = createHash('sha256').update(JSON.stringify({ threadId, taskId: taskId || '', attempt, toolName, args: sanitized })).digest('hex').slice(0, 24);
  return `idp_${digest}`;
}

/** 写工具参数规范化：注入 baseRevision / idempotencyKey / confirmationToken。 */
export function normalizeWriteArguments(threadId: string, task: AgentTask | undefined, toolName: string, argumentsValue: Record<string, any>) {
  const next = { ...argumentsValue };
  // 始终注入系统计算的稳定幂等键：同参数重试保持同键（可重放），参数变化自动换键；
  // 忽略模型手写的 idempotencyKey，避免重试时参数变化导致幂等键冲突。
  next.idempotencyKey = stableIdempotencyKey(threadId, task?.id, task?.attempt || 1, toolName, argumentsValue);
  return next;
}

/** 该工具是否会创建新项目（影响 projectId 解析与作用域）。 */
export function projectToolCreatesProject(toolName: string) {
  return ['project.create', 'project.initialize', 'project.build_from_data', 'project.import'].includes(toolName);
}

/** 从工具参数中提取 projectId（缺失返回 undefined）。 */
export function toolProjectId(argumentsValue: Record<string, any>) {
  return String(argumentsValue.projectId || '').trim() || undefined;
}

/** release.apply 永远不可调用（硬门禁）。 */
export function isReleaseApply(toolName: string) {
  return toolName === 'release.apply';
}

/** 指定角色可调用的工具名列表（排除 release.apply）。 */
export function scopeToolNames(scope: McpRole) {
  return listFormFlowTools(scope).filter((tool) => tool.name !== 'release.apply').map((tool) => tool.name);
}
