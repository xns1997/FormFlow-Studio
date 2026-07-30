import type { AgentSessionV2, AgentPlanRevision, AgentTaskNode } from '../services/project-agent-v2-store';
import type { Reflection } from './types';

/**
 * Analyze failure patterns across the session history.
 */
function detectFailurePatterns(plan: AgentPlanRevision): Map<string, number> {
  const patterns = new Map<string, number>();
  for (const task of plan.tasks) {
    if (task.status !== 'failed') continue;
    const key = `${task.role}:${task.failureClass || 'unknown'}`;
    patterns.set(key, (patterns.get(key) || 0) + 1);
  }
  return patterns;
}

/**
 * Detect if the same tool keeps failing across tasks.
 */
function detectRepeatedToolFailures(session: AgentSessionV2): Array<{ toolName: string; count: number }> {
  const toolFailures = new Map<string, number>();
  for (const event of session.events) {
    if (event.type !== 'tool_completed') continue;
    if (event.data?.result?.ok !== false) continue;
    const name = String(event.data?.toolName || '');
    if (name) toolFailures.set(name, (toolFailures.get(name) || 0) + 1);
  }
  return [...toolFailures.entries()]
    .filter(([, count]) => count >= 3)
    .map(([toolName, count]) => ({ toolName, count }));
}

/**
 * Detect if the orchestrator is stuck making no progress.
 */
function detectStalledExecution(session: AgentSessionV2): boolean {
  const recent = (session.observations || []).slice(-4);
  if (recent.length < 3) return false;
  return recent.every(o => o.status === 'failed' || o.unresolved.length > 0);
}

/**
 * Generate a reflection based on current session state.
 */
export function generateReflection(
  session: AgentSessionV2,
  plan: AgentPlanRevision,
): Reflection {
  // Check for repeated failure patterns
  const patterns = detectFailurePatterns(plan);
  const repeatedPatterns = [...patterns.entries()].filter(([, count]) => count >= 2);

  if (repeatedPatterns.length > 0) {
    const [pattern, count] = repeatedPatterns.sort((a, b) => b[1] - a[1])[0];
    const [role, failureClass] = pattern.split(':');
    return {
      needAdjustment: true,
      reason: 'repeated_failures',
      suggestion: `${role} 专家的 ${failureClass} 类失败已出现 ${count} 次。建议：1) 检查前置条件是否满足 2) 尝试不同的工具组合 3) 请求其他专家协助`,
      pattern,
    };
  }

  // Check for repeated tool failures
  const toolFailures = detectRepeatedToolFailures(session);
  if (toolFailures.length > 0) {
    const { toolName, count } = toolFailures[0];
    return {
      needAdjustment: true,
      reason: 'repeated_tool_failures',
      suggestion: `工具 ${toolName} 已失败 ${count} 次。建议先检查参数是否正确，或尝试使用替代工具`,
      pattern: `tool:${toolName}`,
    };
  }

  // Check for stalled execution
  if (detectStalledExecution(session)) {
    return {
      needAdjustment: true,
      reason: 'stalled_execution',
      suggestion: '执行停滞：连续多次行动未产生有效结果。建议检查需求是否可实现，或缩小目标范围',
      pattern: 'stalled',
    };
  }

  return { needAdjustment: false };
}

/**
 * Generate strategy adjustment recommendations based on reflection.
 */
export function generateStrategyAdjustments(
  reflection: Reflection,
  session: AgentSessionV2,
): string[] {
  if (!reflection.needAdjustment) return [];

  const adjustments: string[] = [];

  if (reflection.reason === 'repeated_failures') {
    adjustments.push('考虑将复杂任务拆分为更小的子任务');
    adjustments.push('检查是否有未满足的前置依赖');
    adjustments.push('尝试请求其他领域的专家协助');
  }

  if (reflection.reason === 'repeated_tool_failures') {
    adjustments.push('重新读取目标资源的最新状态');
    adjustments.push('检查工具参数是否符合 Schema');
    adjustments.push('考虑使用功能类似的替代工具');
  }

  if (reflection.reason === 'stalled_execution') {
    adjustments.push('向用户确认当前目标是否仍然有效');
    adjustments.push('尝试只读操作来重新评估项目状态');
    adjustments.push('考虑缩小当前任务的范围');
  }

  return adjustments;
}
