import { createHash } from 'node:crypto';
import type { AgentPlanRevision, AgentQuestion, AgentSessionV2, AgentTaskNode, AgentTaskStatus } from './project-agent-v2-store';

export type AgentFailureClass = 'transient' | 'revision_conflict' | 'tool_scope' | 'invalid_arguments' | 'validation' | 'permission' | 'user_rejected' | 'specialist_failure';
export type RecoveryAction = 'retry' | 'append_tasks' | 'replace_pending' | 'ask_user' | 'abort';
export interface RecoveryTaskInput { id?: string; role: AgentTaskNode['role']; title: string; instruction: string; access: AgentTaskNode['access']; dependsOn?: string[]; acceptance?: string[]; strategyKey?: string; requirementIds?: string[]; evidenceKinds?: AgentTaskNode['evidenceKinds']; verificationScenarioIds?: string[]; }
export interface AgentRecoveryPatch { action: RecoveryAction; diagnosis: string; strategy: string; tasks?: RecoveryTaskInput[]; cancelTaskIds?: string[]; questions?: Array<Omit<AgentQuestion, 'id'>>; reason?: string; }

export const DEFAULT_MAX_RECOVERY_CYCLES = 6;
export const DEFAULT_MAX_DYNAMIC_TASKS = 24;

export function classifyAgentFailure(message: string): AgentFailureClass {
  if (/用户拒绝|拒绝破坏性操作/i.test(message)) return 'user_rejected';
  if (/无权|权限|forbidden|unauthorized(?!.*tool)|认证失败/i.test(message)) return 'permission';
  if (/未授权工具|不在任务能力范围|不在当前会话限定范围|未限定项目|unauthorized_tool|tool_not_authorized|BEHAVIOR_DELETE_OUT_OF_SCOPE|与已确认计划中的用户约束冲突/i.test(message)) return 'tool_scope';
  if (/PROJECT_REVISION_CONFLICT|revision.{0,8}conflict/i.test(message)) return 'revision_conflict';
  if (/UNAVAILABLE|DEADLINE|temporar|timeout|连接|fetch|ECONN|服务不可用/i.test(message)) return 'transient';
  if (/DATA_ROWS_LOOK_LIKE_SCHEMA|DATA_SOURCE_INPUT_REQUIRED|DATA_COLUMNS_REQUIRED|DATA_BATCH_EMPTY|DATA_BATCH_LIMIT_EXCEEDED|BEHAVIOR_(SCOPE|FORM|SHEET|ID|IDENTITY|TRIGGER|ARRAYS|ACTIONS|ACTION|SET_VALUE|OPTIONS|WORKFLOW)|RULE_REFERENCE_BUDGET_EXHAUSTED|INVALID_ARGUMENT|REQUIRED_ARGUMENT|参数|Schema|schema|合法 JSON|结构化/i.test(message)) return 'invalid_arguments';
  if (/DATA_KEY_REQUIRED|DATA_KEY_FIELD_MISSING|DATA_KEY_VALUE_EMPTY|DATA_KEY_VALUE_DUPLICATE|RULE_SYNTAX_INVALID|RULE_APPLY_FAILED|规则写入后|结构化行为复检|校验|验证失败|门禁|quality|validation/i.test(message)) return 'validation';
  return 'specialist_failure';
}

export function isRecoverableFailure(value: AgentFailureClass) { return !['permission', 'user_rejected'].includes(value); }

export function ensureRecoveryState(session: AgentSessionV2, maxCycles = DEFAULT_MAX_RECOVERY_CYCLES, maxDynamicTasks = DEFAULT_MAX_DYNAMIC_TASKS) {
  session.recovery ||= { cycles: 0, maxCycles, dynamicTasks: 0, maxDynamicTasks, strategies: {} };
  session.recovery.maxCycles ||= maxCycles; session.recovery.maxDynamicTasks ||= maxDynamicTasks; session.recovery.strategies ||= {};
  return session.recovery;
}

export function resetRecoveryBudget(session: AgentSessionV2, maxCycles = DEFAULT_MAX_RECOVERY_CYCLES, maxDynamicTasks = DEFAULT_MAX_DYNAMIC_TASKS) {
  const state = ensureRecoveryState(session, maxCycles, maxDynamicTasks);
  state.cycles = 0;
  state.dynamicTasks = 0;
  state.strategies = {};
  return state;
}

export function strategyKey(value: string) { return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16); }

export function normalizeRecoveryPatch(patch: AgentRecoveryPatch, failedTaskId: string): AgentRecoveryPatch {
  if (patch.action === 'append_tasks' && patch.cancelTaskIds?.includes(failedTaskId)) return { ...patch, action: 'replace_pending' };
  return patch;
}

export function syncBlockedTasks(tasks: AgentTaskNode[]) {
  const changes: Array<{ task: AgentTaskNode; from: AgentTaskStatus; to: AgentTaskStatus }> = [];
  for (const task of tasks) {
    if (!['pending', 'blocked'].includes(task.status)) continue;
    const blocking = task.dependsOn.filter((id) => {
      const dependency = tasks.find((item) => item.id === id);
      return dependency && ['failed', 'blocked', 'superseded', 'cancelled'].includes(dependency.status);
    });
    const next: AgentTaskStatus = blocking.length ? 'blocked' : 'pending';
    if (task.status !== next) { const from = task.status; task.status = next; task.blockedBy = blocking; changes.push({ task, from, to: next }); }
    else task.blockedBy = blocking;
  }
  return changes;
}

function uniqueTaskId(plan: AgentPlanRevision, cycle: number, requested: string | undefined, index: number) {
  const base = String(requested || `task_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || `task_${index + 1}`;
  let id = `recovery_${cycle}_${base}`; let suffix = 1;
  while (plan.tasks.some((task) => task.id === id)) id = `recovery_${cycle}_${base}_${suffix++}`;
  return id;
}

export function serializeProjectWrites(tasks: AgentTaskNode[]) {
  let previous: AgentTaskNode | undefined;
  for (const task of tasks.filter((item) => !['superseded', 'cancelled'].includes(item.status))) {
    if (task.access !== 'write') continue;
    if (previous && !task.dependsOn.includes(previous.id) && previous.status !== 'passed') task.dependsOn.push(previous.id);
    previous = task;
  }
}

export function applyRecoveryPatch(plan: AgentPlanRevision, failedTaskId: string, patch: AgentRecoveryPatch, cycle: number, maxAttempts: number) {
  const failed = plan.tasks.find((task) => task.id === failedTaskId); if (!failed) throw new Error('恢复目标任务不存在');
  const created = (patch.tasks || []).map((input, index): AgentTaskNode => ({
    id: uniqueTaskId(plan, cycle, input.id, index), role: input.role, title: input.title, instruction: input.instruction, access: input.access,
    projectId: failed.projectId,
    dependsOn: [...(input.dependsOn || failed.dependsOn)], acceptance: [...(input.acceptance || [])], status: 'pending', attempt: 0, maxAttempts,
    evidenceArtifactIds: [], requirementIds: [...(input.requirementIds || failed.requirementIds || [])], evidenceKinds: [...(input.evidenceKinds || failed.evidenceKinds || [])], verificationScenarioIds: [...(input.verificationScenarioIds || failed.verificationScenarioIds || [])], origin: 'recovery', generation: (failed.generation || 0) + 1, supersedesTaskId: patch.action === 'replace_pending' ? failed.id : undefined,
    strategyKey: input.strategyKey || strategyKey(`${input.role}:${input.title}:${input.instruction}`),
  }));
  const idMap = new Map((patch.tasks || []).map((input, index) => [input.id, created[index].id]));
  for (const task of created) task.dependsOn = [...new Set(task.dependsOn.flatMap((id) => idMap.get(id) ? [idMap.get(id)!] : patch.action === 'replace_pending' && id === failed.id ? failed.dependsOn : [id]))];
  if (patch.action === 'retry') {
    failed.status = 'pending'; failed.error = undefined; failed.failureClass = undefined; failed.blockedBy = [];
  } else if (patch.action === 'append_tasks') {
    const insertion = plan.tasks.indexOf(failed); plan.tasks.splice(insertion, 0, ...created);
    failed.dependsOn = [...new Set([...failed.dependsOn, ...created.map((task) => task.id)])]; failed.status = 'pending'; failed.error = undefined; failed.blockedBy = [];
    for (const id of patch.cancelTaskIds || []) { const task = plan.tasks.find((item) => item.id === id); if (task && task.id !== failed.id && !['passed', 'running'].includes(task.status)) task.status = 'superseded'; }
  } else if (patch.action === 'replace_pending') {
    failed.status = 'superseded'; failed.blockedBy = [];
    for (const id of patch.cancelTaskIds || []) { const task = plan.tasks.find((item) => item.id === id); if (task && !['passed', 'running'].includes(task.status)) task.status = 'superseded'; }
    const insertion = plan.tasks.indexOf(failed) + 1; plan.tasks.splice(insertion, 0, ...created);
    const replacementIds = created.map((task) => task.id); const terminal = replacementIds.at(-1);
    for (const task of plan.tasks) if (task.id !== failed.id && task.dependsOn.includes(failed.id)) task.dependsOn = [...new Set(task.dependsOn.flatMap((id) => id === failed.id ? terminal ? [terminal] : [] : [id]))];
  }
  serializeProjectWrites(plan.tasks); syncBlockedTasks(plan.tasks); return { created, failed };
}

export function recoveryPatchExpandsRisk(plan: AgentPlanRevision, patch: AgentRecoveryPatch) {
  const request = plan.request.toLowerCase();
  const introducesWrite = (patch.tasks || []).some((task) => task.access === 'write') && !plan.tasks.some((task) => task.access === 'write');
  if (introducesWrite) return true;
  return (patch.tasks || []).some((task) => {
    const text = `${task.title}\n${task.instruction}`.toLowerCase();
    const destructive = /delete|remove|cascade|overwrite|删除|移除|级联|覆盖/.test(text);
    return destructive && !/delete|remove|cascade|overwrite|删除|移除|级联|覆盖/.test(request);
  });
}
