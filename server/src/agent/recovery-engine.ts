import { randomUUID } from 'node:crypto';
import { getFormFlowTool, type McpRole } from '../services/formflow-tool-registry';
import { isStructuredPlanningError, validatePlannerTaskRoleBoundaries } from '../services/project-agent-v2-planning';
import { compactAgentToolResult } from '../services/project-agent-v2-context';
import { insertQualityRemediationTasks, qualityDiagnosticFingerprint, replaceInvalidRemediationTask, supersedeInvalidCrossRoleRepairs, type QualityDiagnostic } from '../services/project-agent-v2-remediation';
import {
  applyRecoveryPatch, classifyAgentFailure, ensureRecoveryState, isRecoverableFailure, recoveryPatchExpandsRisk, strategyKey,
  normalizeRecoveryPatch, resetRecoveryBudget, type AgentRecoveryPatch, type AgentFailureClass,
} from '../services/project-agent-v3-recovery';
import {
  addAgentArtifact, appendAgentEvent, getCapabilityBundle, saveAgentSessionV2, sessionProjectIds, setAgentPhase, validateTaskGraph,
  type AgentSessionV2, type AgentPlanRevision, type AgentTaskNode,
} from '../services/project-agent-v2-store';
import { compactProjectStateCheck, type ProjectStateCheckSummary } from '../services/project-agent-state-check';
import { chat } from './llm-client';
import { checkCurrentProjectState } from './state-checker';
import type { RunContext } from './types';
import { PROJECT_AGENT_ROLES } from './types';

function activePlan(session: AgentSessionV2) { return session.plans.find((plan) => plan.id === session.activePlanId); }

const planningErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function questionMetadata(session: AgentSessionV2) { return { turnId: session.turnId, createdAt: new Date().toISOString() }; }

function recoverySchema() {
  return { type: 'object', required: ['action', 'diagnosis', 'strategy'], properties: {
    action: { enum: ['retry', 'append_tasks', 'replace_pending', 'ask_user', 'abort'] }, diagnosis: { type: 'string' }, strategy: { type: 'string' }, reason: { type: 'string' }, cancelTaskIds: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    tasks: { type: 'array', maxItems: 24, items: { type: 'object', required: ['role', 'title', 'instruction', 'access', 'acceptance'], properties: { id: { type: 'string' }, role: { enum: PROJECT_AGENT_ROLES }, title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, dependsOn: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } }, strategyKey: { type: 'string' }, requirementIds: { type: 'array', items: { type: 'string' } }, evidenceKinds: { type: 'array', items: { type: 'string' } }, verificationScenarioIds: { type: 'array', items: { type: 'string' } } } } },
  } };
}

export async function requestRecoveryPatch(session: AgentSessionV2, task: AgentTaskNode, failureClass: AgentFailureClass, run: RunContext, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }): Promise<AgentRecoveryPatch> {
  const state = ensureRecoveryState(session); const plan = activePlan(session)!;
  const evidence = session.events.filter((event) => event.data?.taskId === task.id).slice(-30).map((event) => ({ seq: event.seq, type: event.type, data: event.data }));
  const requestedTools = [...new Set(evidence.map((event) => event.data?.tool_name || event.data?.toolName || event.data?.name).filter(Boolean).map(String))];
  const toolOwnership = requestedTools.map((name) => { const definition = getFormFlowTool(name); return { name, ownerRole: definition?.ownerRole, risk: definition?.risk, available: Boolean(definition) }; });
  const tried = Object.entries(state.strategies).filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }));
  const prompt = `你是 FormFlow 根智能体的 recovery planner。目标不是解释失败，而是在已确认目标内生成能继续推进的最小任务图补丁。新任务必须继承失败任务的 requirementIds 和场景验收，修复后验证原需求而不是只验证诊断消失。不得修改或取消 passed 任务。retry 仅用于同策略尚未达到 ${task.maxAttempts} 次的情况；达到上限必须 append_tasks 或 replace_pending 并更换角色、工具顺序、前置读取或任务拆分。工具越权必须改由工具所属角色执行。质量诊断必须拆成"领域专家 write 修复 → quality 独立复检"：表单/按钮/控件由 form，数据由 data，流程由 workflow，规则由 behavior，发布预检由 delivery。ask_user 是最后手段，能通过项目读取或其他专家解决时必须继续恢复；只有用户必须作出业务取舍、提供外部秘密或扩大范围时才提问。权限不足或用户拒绝时 abort。不得规划 release.apply。本轮新任务最多 ${state.maxDynamicTasks} 个。\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n失败任务：${JSON.stringify({ role: task.role, title: task.title, instruction: task.instruction, access: task.access, acceptance: task.acceptance, attempt: task.attempt, maxAttempts: task.maxAttempts, error: task.error })}\n失败分类：${failureClass}\n相关工具归属：${JSON.stringify(toolOwnership)}\n已尝试策略：${JSON.stringify(tried)}\n相关事件摘要：${JSON.stringify(compactAgentToolResult(evidence, 8_000))}\n当前项目：${session.projectId || '无'}${questionReview ? `\n提问复核：运行时已重新检查项目。先用摘要解决候选问题；仍需用户作出业务决定时才再次 ask_user。\n候选问题：${JSON.stringify(questionReview.candidateQuestions)}\n最新项目检查摘要：${JSON.stringify(compactProjectStateCheck(questionReview.state))}` : ''}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await chat(session, run, [{ role: 'system', content: prompt }, ...(attempt > 1 ? [{ role: 'user' as const, content: '上一次恢复补丁无效。只输出符合 Schema 的完整 JSON，并确保任务角色边界、依赖和策略均可执行。' }] : [])], recoverySchema(), 8192);
      const value: any = response.structured || (() => { try { return JSON.parse(response.content || ''); } catch { return undefined; } })();
      if (!value || !['retry', 'append_tasks', 'replace_pending', 'ask_user', 'abort'].includes(value.action)) throw new Error('恢复规划模型未返回有效补丁');
      if (['append_tasks', 'replace_pending'].includes(value.action) && !Array.isArray(value.tasks)) throw new Error('恢复补丁缺少动态任务');
      if (Array.isArray(value.tasks)) validatePlannerTaskRoleBoundaries(value.tasks);
      return value as AgentRecoveryPatch;
    } catch (error) { lastError = error; appendAgentEvent(session, 'recovery_planning_attempt_failed', { taskId: task.id, attempt, error: planningErrorMessage(error) }); }
  }
  throw lastError || new Error('恢复规划失败');
}

export function recoveryRevision(session: AgentSessionV2, source: AgentPlanRevision, reason: string) {
  const next = structuredClone(source); source.status = 'superseded';
  next.id = `pap2_${randomUUID()}`; next.turnId = session.turnId || source.turnId; next.revision = Math.max(...session.plans.map((plan) => plan.revision), 0) + 1; next.parentPlanId = source.id; next.revisionReason = reason;
  next.automaticRevision = true; next.approvalRequired = false; next.status = 'confirmed'; next.createdAt = new Date().toISOString(); next.confirmedAt = next.createdAt;
  session.plans.push(next); session.activePlanId = next.id; return next;
}

export function exhaustRecovery(session: AgentSessionV2, task: AgentTaskNode, reason: string) {
  const state = ensureRecoveryState(session); const plan = activePlan(session)!;
  const blocked = plan.tasks.filter((item) => ['failed', 'blocked'].includes(item.status)).map((item) => ({ id: item.id, title: item.title, status: item.status, failureClass: item.failureClass, error: item.error, blockedBy: item.blockedBy }));
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'summary', title: '自动恢复阻断报告', data: { reason, recovery: state, blocked, strategies: state.strategies } });
  appendAgentEvent(session, 'recovery_exhausted', { taskId: task.id, reason, artifactId: artifact.id, cycles: state.cycles, maxCycles: state.maxCycles, dynamicTasks: state.dynamicTasks, maxDynamicTasks: state.maxDynamicTasks });
  setAgentPhase(session, 'failed', { reason: 'recovery_exhausted', artifactId: artifact.id });
}

export function pauseRecoveryForUser(session: AgentSessionV2, task: AgentTaskNode, reason: string) {
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'summary', title: '自动恢复需要用户处理', data: { reason, taskId: task.id, failureClass: task.failureClass, error: task.error } });
  appendAgentEvent(session, 'recovery_blocked', { taskId: task.id, reason, failureClass: task.failureClass, artifactId: artifact.id }); setAgentPhase(session, 'paused', { reason: 'recovery_requires_user', artifactId: artifact.id });
}

export async function recoverFailedTask(session: AgentSessionV2, failedTaskId: string, run: RunContext): Promise<'continued' | 'waiting' | 'terminal'> {
  const source = activePlan(session); const failed = source?.tasks.find((task) => task.id === failedTaskId); if (!source || !failed) return 'terminal';
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const state = ensureRecoveryState(session, bundle.budget.maxRecoveryCycles ?? 6, bundle.budget.maxDynamicTasks ?? 24);
  const failureClass = failed.failureClass || classifyAgentFailure(failed.error || '专家任务失败'); failed.failureClass = failureClass; state.lastFailureTaskId = failed.id; state.lastFailureClass = failureClass;
  appendAgentEvent(session, 'failure_classified', { taskId: failed.id, failureClass, error: failed.error, attempt: failed.attempt });
  if (!isRecoverableFailure(failureClass)) { pauseRecoveryForUser(session, failed, failureClass === 'permission' ? '权限不足，需要用户授权后重试' : '用户拒绝了必要操作，请修改目标或明确新的处理方式'); return 'waiting'; }
  if (state.cycles >= state.maxCycles) { exhaustRecovery(session, failed, '已达到自动恢复周期上限'); return 'terminal'; }
  state.cycles += 1; setAgentPhase(session, 'recovering', { taskId: failed.id, failureClass, cycle: state.cycles }); appendAgentEvent(session, 'recovery_started', { taskId: failed.id, failureClass, cycle: state.cycles, maxCycles: state.maxCycles });

  const qualityFailure = [...session.events].reverse().find((event) => event.type === 'quality_gate_failed' && event.data?.taskId === failed.id && Array.isArray(event.data?.diagnostics) && event.data.diagnostics.length);
  const diagnosticStrategyKey = qualityFailure ? strategyKey(`diagnostic:${qualityFailure.data.diagnostics.map((item: QualityDiagnostic) => qualityDiagnosticFingerprint(item)).sort().join('|')}`) : undefined;
  if (qualityFailure && diagnosticStrategyKey && !state.strategies[diagnosticStrategyKey]) {
    state.strategies[diagnosticStrategyKey] = 1;
    const next = recoveryRevision(session, source, `质量诊断自动修复：${failed.id}`); const gate = next.tasks.find((task) => task.id === failed.id)!;
    appendAgentEvent(session, 'task_graph_patch_proposed', { action: 'append_tasks', taskId: failed.id, diagnosis: '质量门禁诊断', cycle: state.cycles });
    const repairs = insertQualityRemediationTasks(next, gate, qualityFailure.data.diagnostics, bundle.budget.maxAttempts, state.cycles);
    if (!repairs.length || repairs.length > state.maxDynamicTasks) { exhaustRecovery(session, failed, '质量诊断无法映射或本轮动态任务预算不足'); return 'terminal'; }
    for (const repair of repairs) { repair.origin = 'diagnostic'; repair.generation = (failed.generation || 0) + 1; repair.strategyKey ||= strategyKey(repair.instruction); }
    state.dynamicTasks += repairs.length; validateTaskGraph(next.tasks); appendAgentEvent(session, 'quality_remediation_scheduled', { gateTaskId: failed.id, round: state.cycles, artifactId: qualityFailure.data.artifactId, repairTasks: repairs.map((item) => ({ id: item.id, role: item.role, title: item.title })) }); appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: repairs.map((task) => task.id) });
    appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session); return 'continued';
  }
  if (qualityFailure && diagnosticStrategyKey) appendAgentEvent(session, 'strategy_rejected', { taskId: failed.id, cycle: state.cycles, strategyKey: diagnosticStrategyKey, reason: 'duplicate_quality_diagnostic_strategy', diagnostics: qualityFailure.data.diagnostics });

  if (failureClass === 'tool_scope' && failed.remediation) {
    const next = recoveryRevision(session, source, `纠正诊断修复任务角色边界：${failed.id}`);
    const replacement = replaceInvalidRemediationTask(next, failed.id, bundle.budget.maxAttempts, state.cycles);
    if (!replacement) { exhaustRecovery(session, failed, '无法重建诊断修复任务'); return 'terminal'; }
    const supersededLegacyTaskIds = supersedeInvalidCrossRoleRepairs(next, replacement.id);
    validatePlannerTaskRoleBoundaries([replacement]); validateTaskGraph(next.tasks); state.dynamicTasks += 1;
    appendAgentEvent(session, 'task_superseded', { taskId: failed.id, replacementTaskId: replacement.id, supersededLegacyTaskIds, reason: 'invalid_remediation_role_boundary' });
    appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: [replacement.id], supersededTaskId: failed.id });
    appendAgentEvent(session, 'strategy_changed', { taskId: failed.id, strategy: 'rebuild_domain_repair_without_quality_work', strategyKey: replacement.strategyKey, action: 'replace_pending' });
    appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session); return 'continued';
  }

  let patch: AgentRecoveryPatch;
  if (['transient', 'revision_conflict'].includes(failureClass) && failed.attempt < failed.maxAttempts) patch = { action: 'retry', diagnosis: failed.error || failureClass, strategy: failureClass === 'revision_conflict' ? 'refresh_revision_and_recompute' : 'retry_after_transient_failure' };
  else {
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run); }
    catch (error) { exhaustRecovery(session, failed, `恢复规划失败：${planningErrorMessage(error)}`); return 'terminal'; }
  }
  if (patch.action === 'ask_user') {
    const projectState = await checkCurrentProjectState(session, run, 'recovery_question');
    appendAgentEvent(session, 'question_reconsideration_started', { candidateQuestions: patch.questions, stateFingerprint: projectState.fingerprint, reason: 'recovery', message: '已读取最新项目状态，正在重新判断是否需要询问' });
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run, { candidateQuestions: patch.questions, state: projectState }); }
    catch (error) { exhaustRecovery(session, failed, `恢复提问复核失败：${planningErrorMessage(error)}`); return 'terminal'; }
    appendAgentEvent(session, 'question_reconsideration_completed', { action: patch.action, avoidedQuestion: patch.action !== 'ask_user', reason: 'recovery', message: patch.action === 'ask_user' ? '项目状态无法回答该问题，需要用户决定' : '已从项目状态获得所需信息，继续恢复' });
  }
  patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch });
  if (patch.action === 'ask_user') {
    session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}`, ...questionMetadata(session) })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
  }
  if (patch.action === 'abort') { exhaustRecovery(session, failed, patch.reason || patch.diagnosis || '恢复规划判定不可继续'); return 'terminal'; }
  if (patch.action === 'retry' && failed.attempt >= failed.maxAttempts) { exhaustRecovery(session, failed, '同一任务策略已达到尝试上限，恢复规划未提供替代策略'); return 'terminal'; }
  let dynamicCount = patch.tasks?.length || 0; if (dynamicCount > state.maxDynamicTasks) { exhaustRecovery(session, failed, '已达到本轮动态任务上限'); return 'terminal'; }
  let key = strategyKey(patch.strategy || patch.diagnosis); let used = state.strategies[key] || 0;
  if (used >= 1 && patch.action !== 'retry') {
    appendAgentEvent(session, 'strategy_rejected', { taskId: failed.id, cycle: state.cycles, strategy: patch.strategy, strategyKey: key, reason: 'duplicate_failed_strategy' });
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run); }
    catch (error) { exhaustRecovery(session, failed, `更换重复策略失败：${planningErrorMessage(error)}`); return 'terminal'; }
    if (patch.action === 'ask_user') {
      const projectState = await checkCurrentProjectState(session, run, 'recovery_question');
      patch = await requestRecoveryPatch(session, failed, failureClass, run, { candidateQuestions: patch.questions, state: projectState });
      appendAgentEvent(session, 'question_reconsideration_completed', { action: patch.action, avoidedQuestion: patch.action !== 'ask_user', reason: 'recovery' });
    }
    patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch, replacesRejectedStrategyKey: key });
    if (patch.action === 'ask_user') {
      session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}`, ...questionMetadata(session) })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
    }
    if (patch.action === 'abort') { exhaustRecovery(session, failed, patch.reason || patch.diagnosis || '恢复规划判定不可继续'); return 'terminal'; }
    if (patch.action === 'retry' && failed.attempt >= failed.maxAttempts) { exhaustRecovery(session, failed, '同一任务策略已达到尝试上限，恢复规划未提供替代策略'); return 'terminal'; }
    dynamicCount = patch.tasks?.length || 0; if (dynamicCount > state.maxDynamicTasks) { exhaustRecovery(session, failed, '已达到本轮动态任务上限'); return 'terminal'; }
    key = strategyKey(patch.strategy || patch.diagnosis); used = state.strategies[key] || 0;
    if (used >= 1 && patch.action !== 'retry') { exhaustRecovery(session, failed, '恢复规划在明确要求换策略后仍重复已失败方案'); return 'terminal'; }
  }
  state.strategies[key] = used + 1;
  const next = recoveryRevision(session, source, patch.diagnosis || `恢复任务 ${failed.id}`); const result = applyRecoveryPatch(next, failed.id, patch, state.cycles, bundle.budget.maxAttempts); state.dynamicTasks += result.created.length;
  validateTaskGraph(next.tasks); const expandsRisk = recoveryPatchExpandsRisk(source, patch);
  if (expandsRisk) { next.status = 'pending'; next.approvalRequired = true; next.automaticRevision = false; next.confirmedAt = undefined; setAgentPhase(session, 'awaiting_plan_approval', { reason: 'recovery_risk_expansion', planId: next.id }); }
  else { appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: result.created.map((task) => task.id), supersededTaskId: patch.action === 'replace_pending' ? failed.id : undefined }); }
  appendAgentEvent(session, 'strategy_changed', { taskId: failed.id, strategy: patch.strategy, strategyKey: key, action: patch.action }); appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session);
  return expandsRisk ? 'waiting' : 'continued';
}

// Re-export for barrel
export { resetRecoveryBudget };
export type { AgentRecoveryPatch };
