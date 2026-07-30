import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { executeLlmTool, listFormFlowTools } from '../services/llm-tools';
import { getFormFlowTool, type McpRole } from '../services/formflow-tool-registry';
import { llmManagement } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient } from '../services/llm-provider-client';
import { evaluateToolPolicy, shouldAutoApproveOperation } from '../services/project-agent-v2-policy';
import { compactAgentToolResult, compactToolObservation, toolFailureGuidance } from '../services/project-agent-v2-context';
import {
  applyRuntimeRevision,
  requiresProjectStateRead,
  projectChangedToolObservation,
  revisionReadRequiredObservation,
  nextRevisionConflictCount,
} from '../services/project-agent-revision';
import { compileDataToolArguments, dataFailureFingerprint, hasRepeatedDataFailure } from '../services/data-tool-preflight';
import { compileBehaviorToolArguments } from '../services/behavior-tool-preflight';
import { compileToolArguments, parameterFailureFingerprint, toolContractSummary } from '../services/tool-argument-contract';
import { buildSpecialistSystemPrompt } from '../services/project-agent-expert-registry';
import {
  addAgentArtifact,
  appendAgentEvent,
  getCapabilityBundle,
  saveAgentSessionV2,
  sessionProjectIds,
  setAgentPhase,
  setSessionProjectScope,
  type AgentSessionV2,
  type AgentTaskNode,
} from '../services/project-agent-v2-store';
import type { RunContext } from './types';

// ─── Local helpers (avoid circular dependency with orchestrator-helpers) ───────

function activePlan(session: AgentSessionV2) {
  return session.plans.find((plan) => plan.id === session.activePlanId);
}

function questionMetadata(session: AgentSessionV2) {
  return { turnId: session.turnId, createdAt: new Date().toISOString() };
}

// ─── Error classes ────────────────────────────────────────────────────────────

export class RevisionRecomputeBlocked extends Error {
  constructor() {
    super('项目持续被修改，已安全暂停当前操作');
    this.name = 'RevisionRecomputeBlocked';
  }
}

export class ExpertAssistanceRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpertAssistanceRequired';
  }
}

// ─── Extracted specialist functions ───────────────────────────────────────────

export function allowedTools(session: AgentSessionV2, task: AgentTaskNode) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const agent = bundle.agents.find((item) => item.role === task.role);
  const configured = agent?.tools || [];
  const toolMode = agent?.toolMode || (configured.length ? 'selected' : 'all');
  return listFormFlowTools(task.role).filter(
    (tool) =>
      tool.name !== 'release.apply' &&
      (task.access === 'write' || tool.risk === 'read') &&
      (toolMode === 'all' || configured.includes(tool.name)),
  );
}

export function stableOperationKey(
  session: AgentSessionV2,
  task: AgentTaskNode,
  name: string,
  args: Record<string, any>,
) {
  const normalized = Object.fromEntries(
    Object.entries(args)
      .filter(([key]) => !['baseRevision', 'confirmationToken', 'idempotencyKey'].includes(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return `pa2_${createHash('sha256')
    .update(`${session.id}:${task.id}:${name}:${JSON.stringify(normalized)}`)
    .digest('hex')
    .slice(0, 32)}`;
}

export function taskProjectRevision(session: AgentSessionV2, projectId?: string) {
  if (!projectId) return undefined;
  return (
    session.projectRevisions?.[projectId] ||
    (projectId === session.projectId ? session.checkpointRevision : undefined)
  );
}

export function prepareToolArguments(
  session: AgentSessionV2,
  task: AgentTaskNode,
  name: string,
  original: Record<string, any>,
) {
  const definition = getFormFlowTool(name);
  const schema = (definition?.inputSchema || { type: 'object' }) as Record<string, any>;
  const properties = schema.properties || {};
  const args = { ...original };
  const allowedProjectIds = sessionProjectIds(session);
  const targetProjectId = String(args.projectId || task.projectId || session.projectId || '');
  if (properties.projectId) {
    if (!targetProjectId && allowedProjectIds.length > 1)
      throw new Error('任务必须明确指定限定范围内的 projectId');
    if (targetProjectId && allowedProjectIds.length && !allowedProjectIds.includes(targetProjectId))
      throw new Error(`项目 ${targetProjectId} 不在当前会话限定范围内`);
    if (targetProjectId) args.projectId = targetProjectId;
  }
  const revision = properties.baseRevision
    ? applyRuntimeRevision(args, taskProjectRevision(session, targetProjectId))
    : { arguments: args, replaced: false, previousRevision: undefined };
  Object.assign(args, revision.arguments);
  if (properties.idempotencyKey) args.idempotencyKey = 'runtime-managed';
  const generic = compileToolArguments(name, args, schema);
  if (!generic.ok)
    return {
      args: generic.arguments,
      preflight: generic,
      revision: {
        replaced: revision.replaced,
        previousRevision: revision.previousRevision,
        currentRevision: revision.arguments.baseRevision,
      },
    };
  const dataPreflight = compileDataToolArguments(name, generic.arguments);
  const domainPreflight = dataPreflight.ok
    ? compileBehaviorToolArguments(name, dataPreflight.arguments)
    : dataPreflight;
  if (!domainPreflight.ok)
    return {
      args: domainPreflight.arguments,
      preflight: {
        ...domainPreflight,
        normalizations: [...generic.normalizations, ...domainPreflight.normalizations],
      },
      revision: {
        replaced: revision.replaced,
        previousRevision: revision.previousRevision,
        currentRevision: revision.arguments.baseRevision,
      },
    };
  if (properties.idempotencyKey)
    domainPreflight.arguments.idempotencyKey = stableOperationKey(
      session,
      task,
      name,
      domainPreflight.arguments,
    );
  const finalContract = compileToolArguments(name, domainPreflight.arguments, schema);
  const preflight = {
    ...finalContract,
    normalizations: [
      ...generic.normalizations,
      ...domainPreflight.normalizations,
      ...finalContract.normalizations,
    ],
  };
  return {
    args: finalContract.arguments,
    preflight,
    revision: {
      replaced: revision.replaced,
      previousRevision: revision.previousRevision,
      currentRevision: revision.arguments.baseRevision,
    },
  };
}

export function specialistContext(session: AgentSessionV2, task: AgentTaskNode) {
  const plan = activePlan(session)!;
  const dependencies = plan.tasks
    .filter((item) => task.dependsOn.includes(item.id))
    .map((item) => ({
      title: item.title,
      result: item.output,
      evidence: item.evidenceArtifactIds
        .map((id) => session.artifacts.find((artifact) => artifact.id === id)?.title)
        .filter(Boolean),
    }));
  const projectId = task.projectId || session.projectId;
  return `能力包版本：${session.capabilityBundleVersionId}\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n当前任务：${task.instruction}\n验收标准：${task.acceptance.join('；')}\n上次失败：${task.error || '无'}\n任务项目：${projectId || '尚未创建'}\n限定项目：${sessionProjectIds(session).join('、') || '无'}\n当前 revision：${projectId ? session.projectRevisions?.[projectId] || session.checkpointRevision || '无' : '无'}\n依赖产物：${JSON.stringify(dependencies)}\n对话摘要：${session.conversationSummary || '无'}`;
}

export async function refreshRevision(
  session: AgentSessionV2,
  run: RunContext,
  role: McpRole,
  projectId = session.projectId,
) {
  if (!projectId) return undefined;
  const loaded: any = await executeLlmTool(
    'project.get',
    { projectId },
    { ...run, projectId, mcpRole: role },
  );
  if (loaded.ok) {
    (session.projectRevisions ||= {})[projectId] = loaded.data.revision;
    if (projectId === session.projectId) session.checkpointRevision = loaded.data.revision;
    saveAgentSessionV2(session);
  }
  return loaded;
}

// ─── Internal helpers used by runSpecialist ───────────────────────────────────

function blockTaskForRevisionChanges(session: AgentSessionV2, task: AgentTaskNode) {
  task.status = 'blocked';
  task.failureClass = 'revision_conflict';
  task.error = '项目持续被修改，已安全暂停。请停止其他编辑后再继续。';
  session.questions = [
    {
      id: `paq_${randomUUID()}`,
      ...questionMetadata(session),
      header: '项目正在变化',
      question:
        '项目在自动重新计算两次后仍被其他操作修改。请停止其他编辑后，再选择继续当前任务。',
      kind: 'text',
    },
  ];
  appendAgentEvent(session, 'revision_recompute_blocked', {
    taskId: task.id,
    role: task.role,
    action: task.title,
    message: task.error,
  });
  appendAgentEvent(session, 'question_requested', {
    questions: session.questions,
    reason: 'revision_changes_repeated',
  });
  if (session.orchestration) session.orchestration.status = 'waiting';
  setAgentPhase(session, 'clarifying', { reason: 'revision_changes_repeated' });
  saveAgentSessionV2(session);
}

// ─── Main specialist execution loop ──────────────────────────────────────────

export async function runSpecialist(
  session: AgentSessionV2,
  task: AgentTaskNode,
  run: RunContext,
  resume?: {
    runValue?: any;
    routeIndex?: number;
    revisionReadRequiredProjectId?: string;
    repairContext?: string;
  },
) {
  const tools = allowedTools(session, task);
  const modelTools = tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: `${tool.description}\n${toolContractSummary(tool.inputSchema as Record<string, any>)}`,
      parameters: tool.inputSchema,
    },
  }));
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const definition = {
    entrypoint: task.role,
    max_steps: bundle.budget.maxToolSteps,
    max_tool_failures: bundle.budget.maxToolSteps,
    tools: tools.map((tool) => tool.name),
    nodes: [
      {
        id: task.role,
        type: 'model',
        config: { tool_mode: 'auto', tools: modelTools },
      },
      { id: 'end', type: 'end' },
    ],
    edges: [{ source: task.role, target: 'end' }],
  };
  const profile = llmManagement.resolveProfile(
    bundle.agents.find((agent) => agent.role === task.role)?.profileId || session.profileId,
    { tenantId: run.tenantId, projectId: session.projectId },
  );
  let runValue = resume?.runValue;
  let routeIndex = resume?.routeIndex ?? 0;
  let connection: any;
  if (!runValue) {
    let lastError: unknown;
    const systemPrompt = buildSpecialistSystemPrompt({
      bundle,
      role: task.role,
      runtimeContext: specialistContext(session, task),
      repairContext: resume?.repairContext,
    });
    for (const [index, route] of profile.routes.entries()) {
      try {
        connection = llmManagement.resolveConnection(route, {
          tenantId: run.tenantId,
          projectId: session.projectId,
        });
        runValue = await llmProviderClient.startAgent(
          definition,
          { messages: [{ role: 'system', content: systemPrompt }] },
          connection,
          run.requestId,
          run.tenantId,
          session.projectId,
        );
        routeIndex = index;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error;
      }
    }
    if (!runValue) throw lastError || new Error('专家没有可用模型路由');
  } else {
    connection = llmManagement.resolveConnection(profile.routes[routeIndex], {
      tenantId: run.tenantId,
      projectId: session.projectId,
    });
  }
  let processed = 0;
  let steps = 0;
  let referenceSearches = 0;
  let revisionReadRequiredProjectId = resume?.revisionReadRequiredProjectId;
  const parameterFailures = new Map<string, number>();
  const parameterCorrectionPending = new Set<string>();
  while (runValue.status === 'waiting_tool' && steps < bundle.budget.maxToolSteps) {
    const fresh = (runValue.events || []).slice(processed);
    processed = runValue.events?.length || 0;
    for (const event of fresh)
      appendAgentEvent(session, event.type, {
        ...(event.data || {}),
        taskId: task.id,
        role: task.role,
      });
    const call = [...(runValue.events || [])]
      .reverse()
      .find((event: any) => event.type === 'tool_call')?.data;
    if (!call) break;
    if (!tools.some((tool) => tool.name === call.name))
      throw new Error(`工具 ${call.name} 不在任务能力范围内`);
    const prepared = prepareToolArguments(session, task, call.name, call.arguments || {});
    const args = prepared.args;
    const definitionForCall = getFormFlowTool(call.name);
    const originalArguments = compactAgentToolResult(call.arguments || {}, 12_000);
    const normalizedArguments = compactAgentToolResult(args, 12_000);
    if (prepared.revision.replaced)
      appendAgentEvent(session, 'tool_arguments_normalized', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        reason: 'runtime_revision',
        message: '已使用运行时管理的最新项目状态',
      });
    if (prepared.preflight.normalizations.length)
      appendAgentEvent(session, 'tool_arguments_normalized', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        originalArguments,
        normalizedArguments,
        normalizations: prepared.preflight.normalizations,
      });
    let result: any;
    let automaticallyApproved = false;
    const preflightFailed = !prepared.preflight.ok;
    const referenceBudgetExceeded =
      task.role === 'behavior' && call.name === 'rule_reference.search' && referenceSearches >= 1;
    const targetProjectId = String(
      args.projectId || task.projectId || session.projectId || '',
    );
    const revisionReadMissing = requiresProjectStateRead(
      revisionReadRequiredProjectId,
      targetProjectId,
      definitionForCall?.risk,
    );
    if (revisionReadMissing) {
      result = revisionReadRequiredObservation();
      appendAgentEvent(session, 'tool_rejected', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        reason: 'revision_read_required',
        message: '项目状态变化后需要先重新读取目标资源',
      });
    } else if (referenceBudgetExceeded) {
      result = {
        ok: false,
        error: {
          code: 'RULE_REFERENCE_BUDGET_EXHAUSTED',
          message:
            '本任务已读取过权威规则参考，请使用已有参考和 lint 诊断继续，不要换关键词重复搜索',
          retryable: false,
        },
        meta: { requestId: run.requestId },
      };
      appendAgentEvent(session, 'tool_rejected', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        error: result.error,
        reason: 'reference_search_budget',
      });
    } else if (preflightFailed) {
      const preflightError = prepared.preflight.error || {
        code: 'TOOL_PREFLIGHT_FAILED',
        message: '工具参数预检失败',
        path: undefined,
        suggestedArguments: undefined,
      };
      result = {
        ok: false,
        error: {
          code: preflightError.code,
          message: preflightError.message,
          path: preflightError.path,
          details: preflightError,
          retryable: false,
        },
        meta: { requestId: run.requestId },
      };
      appendAgentEvent(session, 'tool_preflight_failed', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        originalArguments,
        normalizedArguments,
        error: preflightError,
        suggestedArguments: preflightError.suggestedArguments,
        normalizations: prepared.preflight.normalizations,
      });
    } else {
      if (task.role === 'behavior' && call.name === 'rule_reference.search') referenceSearches += 1;
      appendAgentEvent(session, 'tool_started', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        projectId: args.projectId || task.projectId || session.projectId,
      });
      result = await executeLlmTool(call.name, args, {
        ...run,
        projectId: args.projectId || task.projectId || session.projectId,
        mcpRole: task.role,
      });
    }
    if (result.status === 'confirmation_required') {
      const policy = evaluateToolPolicy(call.name, activePlan(session)?.request || '', task);
      if (policy.level === 'forbidden' || policy.level === 'correctable') {
        const fingerprint = `${call.name}:${String(args.id || args.formId || args.tableId || args.workflowId || '')}:${policy.reason}`;
        task.policyCorrectionCount =
          task.policyCorrectionFingerprint === fingerprint
            ? (task.policyCorrectionCount || 0) + 1
            : 1;
        task.policyCorrectionFingerprint = fingerprint;
        appendAgentEvent(session, 'task_investigating', {
          taskId: task.id,
          role: task.role,
          action: task.title,
          summary: '当前操作不符合已确认边界，专家正在调整处理方式',
        });
        appendAgentEvent(session, 'task_correction_requested', {
          taskId: task.id,
          role: task.role,
          action: task.title,
          toolName: call.name,
          reason: policy.reason,
          alternatives: policy.alternatives,
          repeated: task.policyCorrectionCount >= 2,
          summary: policy.userMessage,
        });
        if (task.policyCorrectionCount >= 2)
          throw new ExpertAssistanceRequired(
            `${policy.userMessage} 当前专家连续两次选择了同一受限操作，需要其他专家协助更换实现方式。`,
          );
        result = {
          ok: false,
          error: {
            code:
              policy.level === 'forbidden'
                ? 'TOOL_POLICY_FORBIDDEN'
                : 'TOOL_POLICY_CORRECTION_REQUIRED',
            message: policy.userMessage,
            retryable: true,
            details: { alternatives: policy.alternatives },
          },
          meta: { requestId: run.requestId },
        };
      } else if (policy.level === 'allowed' && shouldAutoApproveOperation(env.mode)) {
        automaticallyApproved = true;
        appendAgentEvent(session, 'approval_decided', {
          taskId: task.id,
          toolName: call.name,
          approved: true,
          automatic: true,
          mode: 'local',
          impact: result.confirmation?.impact,
        });
        result = await executeLlmTool(
          call.name,
          { ...args, confirmationToken: result.confirmation.token },
          {
            ...run,
            projectId: args.projectId || task.projectId || session.projectId,
            mcpRole: task.role,
          },
        );
      }
    }
    const contextResult = compactAgentToolResult(result);
    const revisionRecoveryError = ['PROJECT_REVISION_CONFLICT', 'PROJECT_STATE_READ_REQUIRED'].includes(
      String(result.error?.code || ''),
    );
    const parameterFailure =
      !result.ok &&
      result.status !== 'confirmation_required' &&
      /ARGUMENT|SCHEMA|VALIDATION|REQUIRED|UNKNOWN/.test(
        String(result.error?.code || '').toUpperCase(),
      );
    const parameterFingerprint = parameterFailure
      ? parameterFailureFingerprint(call.name, result.error, args)
      : undefined;
    const parameterFailureCount = parameterFingerprint
      ? (parameterFailures.get(parameterFingerprint) || 0) + 1
      : 0;
    if (parameterFingerprint) {
      parameterFailures.set(parameterFingerprint, parameterFailureCount);
      parameterCorrectionPending.add(call.name);
    }
    const repeatedParameterFailure = parameterFailureCount > 1;
    const failureFingerprint =
      task.role === 'data' &&
      !result.ok &&
      result.status !== 'confirmation_required' &&
      !revisionRecoveryError
        ? dataFailureFingerprint(call.name, result.error || {}, args)
        : undefined;
    const repeatedFailure = failureFingerprint
      ? hasRepeatedDataFailure(session.events, task.id, failureFingerprint.value)
      : false;
    const resource =
      task.role === 'data' &&
      ['data_source.create', 'data_source.import'].includes(call.name)
        ? {
            tableId: String(args.id || ''),
            sheetName: String(args.sheetName || 'Sheet1'),
            keyFields: Array.isArray(args.config?.keyFields)
              ? args.config.keyFields.map(String)
              : [],
          }
        : task.role === 'behavior' && call.name === 'rule_code.update'
          ? { kind: 'rule_code', formId: String(args.formId || ''), code: String(args.code || '') }
          : task.role === 'behavior' &&
              ['behavior.upsert', 'behavior.delete'].includes(call.name)
            ? {
                kind: 'behavior',
                scope: args.scope,
                id: String(args.behavior?.id || args.id || ''),
                formId: args.formId,
                tableId: args.tableId,
                sheetName: args.sheetName,
                deleted: call.name === 'behavior.delete',
              }
            : undefined;
    const revisionConflict = !result.ok && result.error?.code === 'PROJECT_REVISION_CONFLICT';
    const expertInvestigating =
      !result.ok && result.status !== 'confirmation_required' && !revisionRecoveryError;
    appendAgentEvent(session, 'tool_completed', {
      taskId: task.id,
      role: task.role,
      toolName: call.name,
      toolCallId: call.tool_call_id,
      result: contextResult,
      automaticallyApproved,
      preflightFailed,
      recoveringRevision: revisionConflict,
      expertInvestigating,
      failureFingerprint: failureFingerprint?.value,
      resource,
    });
    if (result.ok && parameterCorrectionPending.delete(call.name))
      appendAgentEvent(session, 'tool_parameter_correction_completed', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        summary: '参数已纠正，工具执行成功',
      });
    if (parameterFailure)
      appendAgentEvent(session, 'tool_parameter_correction_requested', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        path: result.error?.path,
        issues: result.error?.details?.issues,
        suggestedArguments: result.error?.details?.suggestedArguments,
        repeated: repeatedParameterFailure,
        summary: repeatedParameterFailure
          ? '相同参数结构再次失败，必须重新读取契约并更换参数结构'
          : '参数未通过校验，已生成精确纠正建议',
      });
    if (expertInvestigating)
      appendAgentEvent(session, 'expert_diagnosis_started', {
        taskId: task.id,
        role: task.role,
        action: task.title,
        toolName: call.name,
        summary:
          repeatedFailure || repeatedParameterFailure
            ? '相同方法再次失败，专家正在更换处理策略'
            : '当前操作未完成，专家正在分析原因和调整方案',
      });
    if (repeatedFailure && failureFingerprint)
      appendAgentEvent(session, 'tool_failure_repeated', {
        taskId: task.id,
        role: task.role,
        toolName: call.name,
        failureFingerprint,
        error: result.error,
        reason: 'same_tool_error_and_argument_shape',
        handledBy: 'current_expert',
      });
    const resultProjectId = String(
      args.projectId || result.meta?.projectId || task.projectId || session.projectId || '',
    );
    if (result.meta?.revision && resultProjectId) {
      (session.projectRevisions ||= {})[resultProjectId] = result.meta.revision;
      if (resultProjectId === session.projectId)
        session.checkpointRevision = result.meta.revision;
    }
    const projectStateRead =
      result.ok &&
      definitionForCall?.risk === 'read' &&
      Boolean((definitionForCall.inputSchema as any)?.properties?.projectId) &&
      resultProjectId === revisionReadRequiredProjectId;
    if (projectStateRead) {
      revisionReadRequiredProjectId = undefined;
      appendAgentEvent(session, 'revision_recompute_completed', {
        taskId: task.id,
        role: task.role,
        action: task.title,
        message: '已读取最新状态，继续执行',
      });
    }
    if (
      result.ok &&
      ['project.create', 'project.initialize', 'project.build_from_data'].includes(call.name)
    ) {
      const createdProjectId = String(
        args.id || result.data?.project?.config?.id || result.meta?.projectId || '',
      );
      if (createdProjectId) {
        const previousProjectIds = sessionProjectIds(session);
        setSessionProjectScope(
          session,
          [...previousProjectIds, createdProjectId],
          createdProjectId,
        );
        task.projectId = createdProjectId;
        await refreshRevision(session, run, task.role, createdProjectId);
        appendAgentEvent(session, 'session_project_scope_changed', {
          projectIds: sessionProjectIds(session),
          currentProjectId: createdProjectId,
          addedProjectId: createdProjectId,
          reason: 'project_created',
        });
      }
    }
    if (result.ok && call.name === 'project.delete' && resultProjectId) {
      const remaining = sessionProjectIds(session).filter((id) => id !== resultProjectId);
      setSessionProjectScope(session, remaining, remaining[0]);
      appendAgentEvent(session, 'session_project_scope_changed', {
        projectIds: remaining,
        currentProjectId: session.projectId,
        removedProjectId: resultProjectId,
        reason: 'project_deleted',
      });
    }
    if (result.status === 'confirmation_required') {
      session.pendingApproval = {
        id: `pao_${randomUUID()}`,
        runId: runValue.runId,
        toolCallId: call.tool_call_id,
        toolName: call.name,
        taskId: task.id,
        role: task.role,
        routeIndex,
        arguments: args,
        projectRevision: taskProjectRevision(session, resultProjectId),
        confirmation: result.confirmation,
      };
      session.activeRunId = runValue.runId;
      setAgentPhase(session, 'awaiting_operation_approval');
      appendAgentEvent(session, 'approval_required', { approval: session.pendingApproval });
      return { waiting: true, interrupted: false, runValue };
    }
    if (revisionConflict) {
      const recovery = nextRevisionConflictCount(task.revisionConflictCount);
      task.revisionConflictCount = recovery.count;
      if (recovery.blocked) {
        blockTaskForRevisionChanges(session, task);
        throw new RevisionRecomputeBlocked();
      }
      appendAgentEvent(session, 'revision_recompute_started', {
        taskId: task.id,
        role: task.role,
        action: task.title,
        attempt: recovery.count,
        message: '检测到项目刚刚更新，正在重新核对当前操作',
      });
      await refreshRevision(
        session,
        run,
        task.role,
        resultProjectId || session.projectId,
      );
      revisionReadRequiredProjectId = resultProjectId || session.projectId;
      runValue = await llmProviderClient.resumeAgent(
        runValue.runId,
        [{ tool_call_id: call.tool_call_id, result: projectChangedToolObservation() }],
        run.requestId,
        connection,
      );
      steps += 1;
      saveAgentSessionV2(session);
      continue;
    }
    const nextObservation: any = compactToolObservation(call.name, result);
    if ((repeatedFailure || repeatedParameterFailure) && nextObservation?.error)
      nextObservation.error.nextStep = repeatedParameterFailure
        ? '相同参数结构已经失败。不要重启任务，也不要再次提交同一字段结构；重新读取工具参数契约和目标资源，只重算失败调用的参数。'
        : toolFailureGuidance(result.error, true);
    if (parameterFailure)
      nextObservation.parameterCorrection = {
        required: true,
        attempt: parameterFailureCount,
        instruction:
          result.error?.details?.correctionInstruction ||
          '只修正本次工具参数后重试，不要重启任务。',
      };
    runValue = await llmProviderClient.resumeAgent(
      runValue.runId,
      [{ tool_call_id: call.tool_call_id, result: nextObservation }],
      run.requestId,
      connection,
    );
    steps += 1;
    if (session.controlSignal) break;
  }
  for (const event of (runValue.events || []).slice(processed))
    appendAgentEvent(session, event.type, {
      ...(event.data || {}),
      taskId: task.id,
      role: task.role,
    });
  if (session.controlSignal)
    return { waiting: false, interrupted: true, output: '', runValue };
  if (runValue.status !== 'completed') {
    const providerError = [...(runValue.events || [])]
      .reverse()
      .find((event: any) => event.type === 'error')?.data;
    const toolErrorResult = [...(runValue.events || [])]
      .reverse()
      .find(
        (event: any) => event.type === 'tool_result' && event.data?.result?.ok === false,
      )?.data?.result?.error;
    const detail = toolErrorResult
      ? `${toolErrorResult.code || 'TOOL_FAILED'}：${toolErrorResult.message || '工具调用失败'}${toolErrorResult.path ? `（${toolErrorResult.path}）` : ''}`
      : '';
    throw new Error(
      [providerError?.code, detail, `专家运行状态：${runValue.status}`]
        .filter(Boolean)
        .join('：'),
    );
  }
  const output = (runValue.events || [])
    .filter((event: any) => event.type === 'message_delta')
    .map((event: any) => event.data?.content || '')
    .join('')
    .trim();
  return { waiting: false, interrupted: false, output, runValue };
}
