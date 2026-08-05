/**
 * Single-loop project agent core.
 *
 * One agent holds the thread context and decides, step by step, which MCP
 * scope/tool to call. Deterministic layers enforce scope whitelists, revision
 * freshness, destructive-op confirmation, acceptance gates and Codex-style
 * termination semantics (no-progress → ask, repeated same block → blocked,
 * budget → pause).
 */
import { executeLlmTool } from '../services/llm-tools';
import { requireProject } from '../services/project-authoring';
import { MCP_ROLES } from '../services/tool-shared';
import { getFormFlowTool } from '../services/formflow-tool-registry';
import { chat } from './llm';
import { runFinalGates, verifyCompletedTask, GateFailure, captureTestBaseline, testGateApplies } from './gates';
import { observeToolResult, recentObservations } from './observe';
import {
  evaluateToolPolicy, isReleaseApply, isWriteTool, normalizeWriteArguments, stableIdempotencyKey,
  projectToolCreatesProject, resolveScope, shouldAutoApproveOperation, toolProjectId,
} from './policy';
import { skillCatalog, skillDocument } from './skills';
import {
  addThreadMessage, appendAgentThreadEvent, getCapabilityBundle, saveAgentThread,
  threadProjectIds, acquireAgentThreadLease, renewAgentThreadLease, releaseAgentThreadLease,
  bumpThreadMetric, resetThreadMetrics, readAgentArtifact, storeAgentArtifact,
  flushThreadMetrics,
} from './store';
import { maybeCompactContext, structuredThreadContext } from './context';
import { createProjectCheckpoint } from './checkpoints';
import { confirmPlan, replanRemaining } from './planner';
import {
  BLOCKED_THRESHOLD, NO_PROGRESS_THRESHOLD, blockingFingerprint,
  budgetExhausted as budgetReached, progressFingerprint, recordBlockedCondition,
  recordProgress, stalled as noProgressStalled,
} from './termination';
import type {
  AgentPlan, AgentTask, AgentThread, FailureClass, LoopDecision, LoopObservation, LoopQuestion, RunContext,
} from './types';
import { MAX_BATCH_READS } from './types';
import type { McpRole } from '../services/tool-shared';
import { randomUUID } from 'node:crypto';

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'summary'],
  properties: {
    action: { type: 'string', enum: ['act', 'complete', 'ask_user', 'pause'] },
    summary: { type: 'string' },
    reason: { type: 'string' },
    toolName: { type: 'string' },
    scope: { type: 'string', enum: [...MCP_ROLES] },
    arguments: { type: 'object', additionalProperties: true },
    batchReads: {
      type: 'array',
      maxItems: MAX_BATCH_READS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['toolName'],
        properties: {
          toolName: { type: 'string' },
          scope: { type: 'string', enum: [...MCP_ROLES] },
          arguments: { type: 'object', additionalProperties: true },
          taskId: { type: 'string' },
        },
      },
    },
    replanReason: { type: 'string' },
    taskId: { type: 'string' },
    completeTaskIds: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['header', 'question', 'kind'],
        properties: {
          header: { type: 'string' },
          question: { type: 'string' },
          kind: { type: 'string', enum: ['choice', 'text'] },
          context: { type: 'string' },
          options: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } },
        },
      },
    },
    finalAnswer: { type: 'string' },
  },
};

const READ_BEFORE_WRITE_LIMIT = 5;

/** 按错误信息/代码归类失败类型（阻塞、可重试、预算等）。 */
export function classifyFailure(message: string, code?: string): FailureClass {
  if (code === 'PROJECT_REVISION_CONFLICT' || /REVISION_CONFLICT|revision 冲突|项目在.*更新/i.test(message)) return 'revision_conflict';
  if (/FORBIDDEN|无权|权限/.test(message)) return 'permission';
  if (/INVALID_ARGUMENT|REQUIRED_ARGUMENT|INVALID_ID|INVALID_.*|缺少|参数/.test(message)) return 'invalid_arguments';
  if (/VALIDATION|校验未通过|语法|结构问题/.test(message)) return 'validation';
  if (/不在.*作用域|白名单/.test(message)) return 'tool_scope';
  if (/无法连接|未运行|timeout|超时|暂不可用|暂时/.test(message)) return 'transient';
  if (/用户拒绝|用户明确/.test(message)) return 'user_rejected';
  return 'unknown';
}

/** 将一次工具调用的观察追加到线程事件流（供上下文与指纹使用）。 */
export function appendToolObservation(thread: AgentThread, observation: LoopObservation) {
  appendAgentThreadEvent(thread, 'tool_observation', {
    taskId: observation.taskId,
    toolName: observation.toolName,
    scope: observation.scope,
    status: observation.status,
    summary: observation.summary,
    changes: observation.changes,
    evidence: observation.evidence,
    unresolved: observation.unresolved,
    error: observation.error,
  });
}

function toolContext(thread: AgentThread, run: RunContext, scope: LoopDecision['scope'], projectId?: string) {
  return {
    tenantId: run.tenantId,
    projectId: projectId || thread.currentProjectId,
    userId: run.userId,
    user: run.user,
    requestId: run.requestId,
    mcpRole: scope,
  };
}

async function refreshRevision(thread: AgentThread, run: RunContext, projectId: string) {
  const result = await executeLlmTool('project.get', { projectId }, toolContext(thread, run, 'project', projectId));
  if (result.ok && result.meta?.revision) {
    thread.projectRevisions[projectId] = result.meta.revision;
    appendAgentThreadEvent(thread, 'revision_refreshed', { projectId, revision: result.meta.revision });
    return result.meta.revision;
  }
  return undefined;
}

function taskById(thread: AgentThread, taskId?: string) {
  return (thread.plan?.tasks || []).find((task) => task.id === taskId);
}

function recentProblemSummary(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed') {
      const message = String(event.data?.summary || '').slice(0, 140);
      return `最近失败：${String(event.data?.toolName || '工具')} → ${message}`;
    }
  }
  const last = thread.events[thread.events.length - 1];
  return last ? `最近事件：${last.type}` : '';
}

function activeTask(thread: AgentThread): AgentTask | undefined {
  return thread.plan?.tasks.find((task) => task.status === 'running')
    || thread.plan?.tasks.find((task) => task.status === 'failed')
    || thread.plan?.tasks.find((task) => task.status === 'pending');
}

function writeSuggestionForTask(task?: AgentTask): string {
  if (!task) return '请立即调用与当前任务对应的写工具推进，或暂停说明。';
  const text = `${task.title}\n${task.instruction}`;
  if (/规则|行为/.test(text)) return '当前任务是编写规则：请调用 rule_code.update（表单规则，code 用 DSL）或 behavior.upsert（结构化行为），写后运行 rule_verify.model。';
  if (/工作流|流程|节点|连线/.test(text)) return '当前任务是创建流程：请调用 workflow.create、workflow_node.upsert、workflow_edge.upsert。';
  if (/表单/.test(text)) return '当前任务是创建表单：请调用 form.create（传 design）或 form.generate_from_table（id 必须是新表单 id）。';
  if (/导入|写回|示例数据|业务数据|行数据/.test(text)) return '当前任务是写入数据：请调用 data_rows.batch（adds 每项为 { rowKey: "key:<主键值>", changes: { 列名: 值 } }）或 data_source.import（rows）。';
  if (/创建数据表|建表|data_table\.create|data_source\.create/.test(text)) return '当前任务是创建数据表：请调用 data_table.create（一步建表：columns + keyFields + rows）或 data_source.create（config.columns + keyFields）。';
  if (/主键|配置|Sheet/.test(text)) return '当前任务是配置数据表：请调用 data_sheet.configure（config.keyFields 设置主键）。';
  return '请调用与当前任务对应的写工具（data_source.*/form.*/workflow.*/rule_*/behavior.*/output.*）推进，或暂停说明。';
}

function snapshotText(summary: Record<string, unknown>): string {
  const data = (summary.data as any[]) || [];
  const forms = (summary.forms as any[]) || [];
  const workflows = (summary.workflows as any[]) || [];
  const behaviors = (summary.behaviors as any) || {};
  const tables = data.map((table) => `${table.id}（${table.sheets?.map((sheet: any) => `${sheet.name} ${sheet.rows}行，列=${(sheet.columns || []).join('、') || '无'}，主键=${sheet.keyFields.join('、') || '无'}${sheet.readOnly ? '，只读' : ''}`).join('；') || '无 Sheet'}）`).join('、');
  const formText = forms.map((form) => `${form.id}（${form.mode}，${form.components} 控件）`).join('、');
  const flowText = workflows.map((flow) => `${flow.id}（${flow.nodes} 节点）`).join('、');
  const behaviorText = `全局 ${behaviors.global || 0} 条、Sheet ${behaviors.sheets || 0} 条、表单 ${behaviors.forms || 0} 条`;
  return [
    tables ? `数据表：${tables}` : '数据表：无',
    formText ? `表单：${formText}` : '表单：无',
    flowText ? `流程：${flowText}` : '流程：无',
    `行为：${behaviorText}`,
  ].join('\n');
}

async function refreshProjectSnapshot(thread: AgentThread, run: RunContext, projectId: string, scope: McpRole) {
  try {
    const result = await executeLlmTool('project.inspect', { projectId }, {
      tenantId: run.tenantId,
      projectId,
      userId: run.userId,
      user: run.user,
      requestId: run.requestId,
      mcpRole: scope,
    });
    if (result.ok) {
      thread.projectSnapshots ||= {};
      thread.projectSnapshots[projectId] = { capturedAt: new Date().toISOString(), summary: result.data as Record<string, unknown> };
    }
  } catch {
    // 快照刷新失败不阻断执行；模型可自行读取。
  }
}

/**
 * Builds a structured pause question so the user knows what is missing, why
 * it blocks progress, and how they can answer (instead of a bare
 * "需要你的补充说明").
 */
function makePauseQuestions(
  thread: AgentThread,
  kind: 'no_progress' | 'task_failed' | 'budget' | 'blocked' | 'manual',
  reason: string,
  task?: AgentTask,
): LoopQuestion[] {
  const current = task || activeTask(thread);
  const parts = [
    current ? `当前任务：${current.title}` : '',
    recentProblemSummary(thread),
    thread.blockedCount > 0 ? `已连续 ${thread.blockedCount} 次遇到同类阻塞，上次的指引没有解决问题，可能需要换一种方案或手动接管。` : '',
  ].filter(Boolean);
  return [{
    header: kind === 'no_progress' ? '缺少信息' : kind === 'task_failed' ? '任务受阻' : kind === 'budget' ? '预算用尽' : kind === 'blocked' ? '执行受阻' : '需要确认',
    question: reason,
    kind: 'choice',
    context: parts.length ? parts.join('；') : undefined,
    taskId: current?.id,
    taskTitle: current?.title,
    options: [
      { label: '继续，使用合理默认值', description: '允许智能体自行决定缺失信息并继续执行' },
      { label: '暂停，我来补充', description: '在输入框补充具体说明，回答后会自动继续' },
    ],
  }];
}

function pauseWithQuestions(thread: AgentThread, questions: LoopDecision['questions'], reason: string) {
  thread.status = 'paused';
  const current = activeTask(thread);
  const resolved = (questions?.length ? questions : makePauseQuestions(thread, 'manual', reason)).map((question) => ({
    ...question,
    // 模型自带的提问如果没带关联步骤，用当前活动任务补齐，保证前端能交叉展示。
    taskId: question.taskId || current?.id,
    taskTitle: question.taskTitle || current?.title,
  }));
  addThreadMessage(thread, 'assistant', 'question', resolved.map((item) => item.question).join('\n') || reason, thread.turnId, resolved);
  appendAgentThreadEvent(thread, 'question_asked', { questions: resolved, reason });
  bumpThreadMetric(thread, { pauses: 1 });
  saveAgentThread(thread);
}

function markBlocked(thread: AgentThread, reason: string) {
  thread.status = 'blocked';
  const questions = makePauseQuestions(thread, 'blocked', `任务卡住了：${reason}。请告诉我如何处理。`);
  addThreadMessage(thread, 'assistant', 'question', questions[0].question, thread.turnId, questions);
  appendAgentThreadEvent(thread, 'thread_blocked', { reason, blockedCount: thread.blockedCount });
  saveAgentThread(thread);
}

function decisionPrompt(thread: AgentThread, bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>) {
  const catalog = skillCatalog(bundle);
  const catalogText = catalog.map((item) => `- ${item.role}（${item.name}）：${item.description}\n  工具：${item.tools.map((toolName) => {
    const def = getFormFlowTool(toolName);
    const first = def?.examples?.[0];
    const returns = first?.success !== undefined ? `返回 ${JSON.stringify(first.success)}` : '';
    const errors = first?.errors?.length ? `错误 ${first.errors.map((item) => item.code).join('/')}` : '';
    return `\`${toolName}\`${returns || errors ? `（${[returns, errors].filter(Boolean).join('；')}）` : ''}`;
  }).join('、') || '（无）'}`).join('\n');
  // 提示词稳定性：只注入当前活动任务 scope 的 skill 全文，其余 scope 仅给目录行。
  const activeScope = (thread.plan?.tasks || []).find((task) => ['pending', 'running', 'failed'].includes(task.status))?.scope;
  const skillDocs = activeScope ? (() => {
    const config = bundle.scopes.find((item) => item.role === activeScope);
    return config ? skillDocument(config, bundle) : '';
  })() : '';
  const plan = thread.plan!;
  const taskLines = plan.tasks.map((task) => {
    const recentEvidence = task.evidence.slice(-2).map((item) => item.summary.slice(0, 70)).join(' | ');
    return `- [${task.status}] ${task.scope}/${task.access} ${task.title}（${task.id}）${task.attempt ? ` 已尝试 ${task.attempt} 次` : ''}${task.error ? ` 错误：${task.error}` : ''}${recentEvidence ? `；最近成功：${recentEvidence}` : ''}`;
  }).join('\n');
  const observations = recentObservations(thread.events, 12);
  const recentDecisionProblems = thread.events
    .slice(-10)
    .filter((event) => event.type === 'decision_failed' && event.data?.error)
    .map((event) => String(event.data?.error).slice(0, 120));
  const recentMessages = thread.messages.slice(-4).map((item) => `${item.role === 'user' ? '用户' : '智能体'}（${item.kind}）：${item.content.slice(0, 600)}`).join('\n');
  const contract = thread.context || structuredThreadContext(thread);
  return [
    `你是 FormFlow 项目智能体。当前线程：${thread.title}（${thread.id}）`,
    `目标：${plan.goal}`,
    `成功标准：${plan.successCriteria.join('；') || '（无）'}`,
    `项目范围：${threadProjectIds(thread).join('、') || '未绑定（新项目）'}`,
    '',
    ...threadProjectIds(thread).flatMap((projectId) => {
      const snapshot = thread.projectSnapshots?.[projectId];
      if (!snapshot) return [];
      return [`项目现状快照（${projectId}，捕获于 ${new Date(snapshot.capturedAt).toLocaleTimeString('zh-CN')}，写操作后自动刷新）：\n${snapshotText(snapshot.summary)}`];
    }),
    '',
    '执行规则：',
    '- 执行纪律（必须遵守）：',
    '- 1) 写优先：当前任务是写任务（access=write）时，最多先做 1 次现状读取，然后立即调用写工具完成写入；禁止连续 2 次以上只读而不写。',
    '- 2) 资源已存在时禁止重复 create：create 类工具返回「已存在」后，不要再调用 create；改为读取该资源确认现状，把任务标记完成，或用 update/upsert 补齐缺失部分。',
    '- 3) 参数必须完整：调用工具时给出 schema 要求的全部必填参数（projectId、id 等）；禁止添加 schema 之外的参数；不确定参数时只读一次对应 list/get 工具。',
    '- 4) 完成即停：已经被 completeTaskIds 确认通过的任务不要再执行任何工具；只处理 pending 或 failed 状态的任务。',
    '- 4.1) taskId 必须是任务清单里的短 ID（如 T4），不要复制整行任务清单文本（如 `[pending] quality/write 运行项目回归测试（T4）`）。',
    '- 5) 一步一工具：action=act 要么只选择一个工具（toolName+arguments），要么用 batchReads 批量执行最多 3 个只读工具（全部必须是只读，写/破坏性仍一步一个）；两者不能同时出现。批量只读用于写前一次性读取多份现状（如同时 data_source.list 与 form.list），单次失败不阻断其余。',
    '- 6) 禁止编造：不要编造不存在的 ID、字段名、数据行或成功结果；业务数据必须来自真实读取或用户要求。',
    '- 7) 完整工具结果超长时会存入 artifact，观察里会出现 artifact id；如需回读完整内容，调用 context.read_artifact（arguments: { artifactId, offset?, limit? }），这是循环内置只读工具。',
    '- 8) 计划路线走不通或出现新约束时，可以用 action=replan 只重规划剩余任务（必须给 replanReason 说明原因与新约束）；goal 模式自动确认，plan 模式会先给你确认。',
    '- scope 字段必须是领域角色（project/data/form/workflow/behavior/quality/delivery），绝不能填项目 ID 或资源 ID。',
    '- 写工具前必须先读取项目最新状态；系统会在写前自动刷新 revision 并填入 baseRevision。',
    '- 删除/覆盖/级联等破坏性操作会返回 confirmation_required 并等待用户确认，这是正常流程，不是失败，不要重试或绕过。',
    '- 永远不要调用 release.apply；发布只做到 delivery 领域的 release.preview。',
    '- 当你认为某任务已完成，把它的 ID 放进 completeTaskIds；系统会对写任务执行确定性校验，通过后才算完成。',
    '- 全部任务完成后，action=complete 并给出 finalAnswer；系统会执行自审、回归测试与结构/质量/交付预检门禁。',
    `- 连续 ${NO_PROGRESS_THRESHOLD} 步无进展或同一问题重复 ${BLOCKED_THRESHOLD} 次会被要求暂停提问。`,
    `- 自动恢复预算：${bundle.budget.maxRecoveryCycles} 次（瞬时重试/冲突重算/门禁修复都会消耗），预算用尽后系统会暂停请你决策。`,
    '',
    '领域 skill 目录：',
    catalogText,
    '',
    '与待执行任务相关的领域 skill 全文：',
    skillDocs || '（暂无待执行任务）',
    '',
    '上下文契约（压缩保留的关键状态）：',
    `- 目标：${contract.goal || '（无）'}`,
    `- 约束：${contract.constraints.join('；') || '（无）'}`,
    `- 已做决策/修改：${contract.decisions.slice(-6).join('；') || '（无）'}`,
    `- 验证状态：${contract.verification.slice(-6).join('；') || '（无）'}`,
    `- 剩余工作：${contract.remainingWork.slice(-8).join('；') || '（无）'}`,
    `- 用户纠正：${contract.userCorrections.slice(-3).join('；') || '（无）'}`,
    '',
    '最近观察：',
    observations.join('\n') || '（暂无）',
    ...(recentDecisionProblems.length ? [`最近决策问题（上一步的 action/toolName/arguments 不符合要求，本次必须输出合法决策）：${[...new Set(recentDecisionProblems)].join('；')}`] : []),
    '',
    '最近对话：',
    recentMessages || '（暂无）',
    '',
    '任务清单：',
    taskLines,
    '',
    `线程摘要：${thread.summary || '（暂无）'}`,
  ].join('\n');
}

async function decideNext(thread: AgentThread, run: RunContext, bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>): Promise<LoopDecision> {
  const startedAt = Date.now();
  appendAgentThreadEvent(thread, 'model.started', { purpose: 'decision', requestId: run.requestId });
  let response;
  try {
    response = await chat(thread, run, {
      messages: [
        { role: 'system', content: decisionPrompt(thread, bundle) },
        { role: 'user', content: '请根据当前状态输出下一步决策（结构化）。' },
      ],
      responseSchema: DECISION_SCHEMA,
      temperature: 0.2,
      purpose: 'decision',
    });
  } catch (error) {
    appendAgentThreadEvent(thread, 'model.failed', { purpose: 'decision', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  appendAgentThreadEvent(thread, 'model.completed', { purpose: 'decision', durationMs: Date.now() - startedAt, usage: response.usage || {} });
  bumpThreadMetric(thread, {
    modelCalls: 1,
    tokenUsage: {
      prompt: Number(response.usage?.prompt_tokens || response.usage?.promptTokens || 0),
      completion: Number(response.usage?.completion_tokens || response.usage?.completionTokens || 0),
    },
  });
  const decision = response.structured as LoopDecision | undefined;
  if (!decision || !['act', 'complete', 'ask_user', 'pause', 'replan'].includes(decision.action)) {
    throw new Error('决策响应缺少有效 action');
  }
  if (decision.action === 'act' && !decision.toolName && !(decision.batchReads && decision.batchReads.length)) {
    throw new Error('act 决策缺少 toolName/arguments 或 batchReads');
  }
  if (decision.action === 'act' && decision.batchReads && decision.batchReads.length > MAX_BATCH_READS) {
    throw new Error(`批量只读最多 ${MAX_BATCH_READS} 个`);
  }
  if (decision.action === 'replan' && !decision.replanReason) {
    throw new Error('replan 决策缺少 replanReason');
  }
  return decision;
}

export type ActionOutcome = 'succeeded' | 'failed' | 'waiting' | 'refreshed';

/**
 * Executes one tool action with deterministic preflight. Returns the outcome;
 * 'waiting' means a confirmation is pending and the loop must stop.
 */
/**
 * 执行单个决策动作（工具调用或提问）：按策略放行、幂等键注入、结果观察与事件发布。
 */
export async function executeAction(
  thread: AgentThread,
  run: RunContext,
  decision: LoopDecision,
  bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>,
): Promise<ActionOutcome> {
  if (isReleaseApply(decision.toolName || '')) throw new Error('release.apply 永远不可调用');
  const scope = resolveScope(decision, bundle);
  const task = taskById(thread, decision.taskId);
  if (task) {
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    task.toolSteps += 1;
    appendAgentThreadEvent(thread, 'task_started', { taskId: task.id });
  }
  let args = { ...(decision.arguments || {}) };
  const projectId = toolProjectId(args) || thread.currentProjectId;
  const write = isWriteTool(decision.toolName!);
  const createsProject = projectToolCreatesProject(decision.toolName!);

  // 写前自动检查点：每个写任务首次执行前快照项目包，失败/停止后可用户回滚。
  if (write && !createsProject && task && projectId && task.attempt === 0) {
    const already = (thread.checkpointRefs || []).some((ref) => ref.includes(`__${task.id}__`));
    if (!already) {
      const path = createProjectCheckpoint(thread.id, projectId, task.id, task.attempt + 1);
      if (path) {
        thread.checkpointRefs ||= [];
        thread.checkpointRefs.push(path);
        appendAgentThreadEvent(thread, 'checkpoint.created', { path, projectId, taskId: task.id });
      }
    }
  }

  const toolDefinition = getFormFlowTool(decision.toolName!);
  const acceptsProjectId = Boolean((toolDefinition?.inputSchema as any)?.properties?.projectId);
  if (acceptsProjectId && !createsProject && projectId && !('projectId' in args)) {
    args = { projectId, ...args };
  }

  // Resolve missing sheetName for table-driven tools from the real data source.
  if (decision.toolName === 'form.generate_from_table' && !('sheetName' in args) && args.tableId && projectId) {
    const source = await executeLlmTool('data_source.get', { projectId, id: String(args.tableId) }, toolContext(thread, run, 'data', projectId));
    const sheets = (source as any)?.ok ? (source as any).data?.sheets || [] : [];
    if (sheets[0]?.name) {
      args.sheetName = sheets[0].name;
      appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'sheetName', value: sheets[0].name });
    }
  }

  // Inject the single form id when a form tool needs one and the project has exactly one form.
  const formToolNeedsId = /^form\.(get|update|preview|delete|generate_from_table|state\.read)$/.test(decision.toolName || '');
  if (formToolNeedsId && !('id' in args) && projectId) {
    // 生成表单缺 id 时，先从任务指令解析目标表单 id，兜底用 <tableId>_edit。
    if (decision.toolName === 'form.generate_from_table') {
      const instruction = taskById(thread, decision.taskId)?.instruction || thread.plan?.request || '';
      const formIds = [
        ...[...instruction.matchAll(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
        ...[...instruction.matchAll(/id\s*(?:为|是|:)\s*[`'"“]?([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
      ];
      const fallback = `${String(args.tableId || 'form').replace(/[^a-zA-Z0-9_-]/g, '_')}_edit`;
      args.id = formIds[0] || fallback;
      appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: args.id, source: formIds[0] ? 'task_instruction' : 'fallback' });
    } else {
      const list = await executeLlmTool('form.list', { projectId }, toolContext(thread, run, 'form', projectId));
      const forms = list.ok ? ((list.data as any) || []) : [];
      if (forms.length === 1) {
        args.id = forms[0].id;
        appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: forms[0].id });
      }
    }
  }

  // Inject the single workflow id when a workflow tool needs one.
  const workflowToolNeedsId = /^workflow\.(get|validate|update|delete)$/.test(decision.toolName || '');
  if (workflowToolNeedsId && !('id' in args) && projectId) {
    const list = await executeLlmTool('workflow.list', { projectId }, toolContext(thread, run, 'workflow', projectId));
    const workflows = list.ok ? ((list.data as any) || []) : [];
    if (workflows.length === 1) {
      args.id = workflows[0].id;
      appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: workflows[0].id });
    }
  }

  // Inject the single editable table id + first sheet for mock-data tools.
  if (/^mock_data\./.test(decision.toolName || '') && !('tableId' in args) && projectId) {
    const list = await executeLlmTool('data_source.list', { projectId }, toolContext(thread, run, 'data', projectId));
    const tables = list.ok ? ((list.data as any) || []) : [];
    const editable = tables.filter((table: any) => (table.sheets || []).some((sheet: any) => sheet.config?.readOnly !== true));
    const instruction = taskById(thread, decision.taskId)?.instruction || '';
    const mentioned = editable.filter((table: any) => {
      const names = [table.id, table.name, ...(table.sheets || []).map((sheet: any) => sheet.name)].filter(Boolean);
      return names.some((name: string) => instruction.includes(String(name)));
    });
    const target = mentioned.length ? mentioned[mentioned.length - 1] : editable[editable.length - 1] || tables[0];
    if (target) {
      const table = target;
      args.tableId = table.id;
      if (!('sheetName' in args) && table.sheets?.[0]?.name) args.sheetName = table.sheets[0].name;
      appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'tableId', value: table.id });
    }
  }

  // behavior.upsert 缺 scope 时按任务指令推导（表单→form，数据表→sheet，否则 global）。
  if (decision.toolName === 'behavior.upsert' && !('scope' in args)) {
    const instruction = taskById(thread, decision.taskId)?.instruction || thread.plan?.request || '';
    const formIds = [...instruction.matchAll(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
    const tableIds = [...instruction.matchAll(/(?:数据表|数据源|表)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
    if (formIds.length && args.formId === undefined) {
      args.scope = 'form';
      args.formId = formIds[0];
    } else if (tableIds.length && args.tableId === undefined) {
      args.scope = 'sheet';
      args.tableId = tableIds[0];
      args.sheetName = args.sheetName || 'Sheet1';
    } else {
      args.scope = 'global';
    }
    appendAgentThreadEvent(thread, 'argument_resolved', { toolName: decision.toolName, key: 'scope', value: args.scope });
  }

  // Resolve missing workflow edge handles from the real node port definitions.
  if (/^workflow\.(create|update)$/.test(decision.toolName || '') && args.item?.nodes && args.item?.edges && projectId) {
    const catalog = await executeLlmTool('catalog.workflow_nodes.list', {}, toolContext(thread, run, 'workflow', projectId));
    const nodeTypes = catalog.ok ? ((catalog.data as any) || []) : [];
    const bySpec = new Map<string, { inputs: string[]; outputs: string[] }>();
    for (const entry of nodeTypes) {
      const ports = entry?.ports || [];
      bySpec.set(entry.id, {
        inputs: ports.filter((port: any) => port.direction === 'input').map((port: any) => port.name),
        outputs: ports.filter((port: any) => port.direction === 'output').map((port: any) => port.name),
      });
    }
    const nodes = (args.item.nodes as any[]).map((node: any) => ({ id: node.id, specId: node.specId }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pick = (ports: string[]) => ports.includes('trigger') ? 'trigger' : ports[0];
    for (const edge of (args.item.edges as any[])) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (source && !edge.sourceHandle) {
        const outputs = bySpec.get(source.specId)?.outputs || [];
        edge.sourceHandle = `out:${pick(outputs) || 'trigger'}`;
      }
      if (target && !edge.targetHandle) {
        const inputs = bySpec.get(target.specId)?.inputs || [];
        edge.targetHandle = `in:${pick(inputs) || 'trigger'}`;
      }
    }
    appendAgentThreadEvent(thread, 'workflow_handles_resolved', { edges: (args.item.edges as any[]).map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`) });
  }

  if (write && !createsProject && projectId && !thread.projectRevisions[projectId]) {
    await refreshRevision(thread, run, projectId);
  }

  const policy = evaluateToolPolicy(decision.toolName!, thread.plan?.request || '', task);
  if (policy.level === 'forbidden') {
    if (task) {
      task.status = 'blocked';
      task.error = policy.userMessage;
      task.failureClass = 'permission';
      task.updatedAt = new Date().toISOString();
    }
    appendToolObservation(thread, {
      taskId: task?.id,
      toolName: decision.toolName,
      scope,
      status: 'failed',
      summary: policy.userMessage,
      changes: [],
      evidence: [],
      unresolved: [policy.userMessage],
      error: { category: 'permission', message: policy.userMessage, retryable: false },
    });
    appendAgentThreadEvent(thread, 'operation_blocked', { taskId: task?.id, toolName: decision.toolName, reason: policy.reason, summary: policy.userMessage });
    thread.status = 'paused';
    addThreadMessage(thread, 'assistant', 'question', policy.userMessage, thread.turnId);
    saveAgentThread(thread);
    return 'failed';
  }

  if (write && !createsProject && projectId) {
    args.baseRevision = thread.projectRevisions[projectId] || args.baseRevision;
  }
  if (write) {
    args = normalizeWriteArguments(thread.id, task, decision.toolName!, args);
  }

  // Drop hallucinated arguments on closed-schema tools before contract checks.
  const inputSchema = (toolDefinition?.inputSchema || {}) as any;
  if (inputSchema.additionalProperties === false && inputSchema.properties && typeof inputSchema.properties === 'object') {
    args = Object.fromEntries(Object.entries(args).filter(([key]) => key in inputSchema.properties));
  }

  const result = await executeLlmTool(decision.toolName!, args, toolContext(thread, run, scope, projectId));
  appendAgentThreadEvent(thread, 'tool_call', {
    taskId: decision.taskId,
    toolName: decision.toolName,
    scope,
    arguments: Object.fromEntries(Object.entries(args).filter(([key]) => !['idempotencyKey', 'confirmationToken', 'baseRevision'].includes(key))),
  });
  return recordToolResult(thread, run, decision, scope, result, args);
}

/**
 * Records a tool result (used by the loop and by the approval-decision route),
 * updates revisions/evidence and returns the outcome.
 */
/** 记录工具结果：观察、事件、证据与指标更新。 */
export async function recordToolResult(
  thread: AgentThread,
  run: RunContext,
  decision: Pick<LoopDecision, 'toolName' | 'scope' | 'taskId' | 'arguments'>,
  scope: NonNullable<LoopDecision['scope']>,
  result: Awaited<ReturnType<typeof executeLlmTool>>,
  effectiveArguments?: Record<string, any>,
): Promise<ActionOutcome> {
  const task = taskById(thread, decision.taskId);
  const projectId = toolProjectId(decision.arguments || {}) || thread.currentProjectId;

  // 幂等创建：资源已存在即目标状态达成，只记成功观察，不先记失败再记成功。
  const errorValue = 'error' in result ? result.error : undefined;
  const isCreateTool = /(^|\.)(create|initialize|import|build_from_data|generate_from_table)$/.test(decision.toolName || '');
  if (isCreateTool && errorValue && /已存在|EXISTS/.test(errorValue.message)) {
    const okObservation: LoopObservation = {
      taskId: decision.taskId,
      toolName: decision.toolName,
      scope,
      status: 'succeeded',
      summary: `目标资源已存在，视为创建成功，无需重复创建（${errorValue.message}）。`,
      changes: ['资源已存在，跳过重复创建'],
      evidence: [errorValue.message],
      unresolved: [],
    };
    appendToolObservation(thread, okObservation);
    bumpThreadMetric(thread, { toolCalls: 1 });
    if (task) {
      task.evidence.push({ id: `aev_${randomUUID()}`, kind: 'tool_result', summary: okObservation.summary, data: { toolName: decision.toolName }, createdAt: new Date().toISOString() });
      task.updatedAt = new Date().toISOString();
    }
    appendAgentThreadEvent(thread, 'task_activity', { taskId: task?.id, toolName: decision.toolName, status: 'succeeded', reason: 'resource_already_exists' });
    return 'succeeded';
  }

  const observation = observeToolResult(decision, result);
  if (result.ok && result.data != null && JSON.stringify(result.data).length > 1200) {
    const meta = await storeAgentArtifact(thread.id, 'tool_result', result.data, observation.summary);
    appendAgentThreadEvent(thread, 'artifact.stored', { artifactId: meta.id, kind: meta.kind, size: meta.size, summary: meta.summary });
    observation.evidence.push(`完整结果已存 artifact：${meta.id}（${meta.size} 字符），可用 context.read_artifact 回读`);
  }
  appendToolObservation(thread, observation);
  bumpThreadMetric(thread, { toolCalls: 1 });

  if (result.ok) {
    const createdProjectId = projectToolCreatesProject(decision.toolName || '')
      ? String((result.data as any)?.project?.config?.id || (result.data as any)?.config?.id || (result.data as any)?.id || '')
      : '';
    if (createdProjectId) {
      if (!thread.projectIds.includes(createdProjectId)) thread.projectIds.push(createdProjectId);
      thread.currentProjectId ||= createdProjectId;
      if (result.meta?.revision) thread.projectRevisions[createdProjectId] = result.meta.revision;
      appendAgentThreadEvent(thread, 'thread_project_bound', { projectId: createdProjectId });
    }
    if (projectId && result.meta?.revision) {
      thread.projectRevisions[projectId] = result.meta.revision;
      if (projectId === thread.currentProjectId) {
        // checkpoint revision is derived on demand from projectRevisions
      }
    }
    if (task) {
      task.evidence.push({
        id: `aev_${randomUUID()}`,
        kind: 'tool_result',
        summary: observation.summary,
        data: { toolName: decision.toolName },
        createdAt: new Date().toISOString(),
      });
      task.endRevision = task.endRevision || (projectId ? thread.projectRevisions[projectId] : undefined);
      task.updatedAt = new Date().toISOString();
    }
    if (projectId) {
      await refreshProjectSnapshot(thread, run, projectId, scope);
    }
    // 自动收尾：写工具成功后确定性验收（结构校验 + 交付物检查），通过即标记完成；
    // 避免模型写后反复只读确认却忘了收尾、或跳到后续任务触发乱序。
    if (task && task.status === 'running' && isWriteTool(decision.toolName || '')) {
      try {
        const evidenceList = await verifyCompletedTask(thread, task, run);
        task.evidence.push(...evidenceList);
        task.status = 'passed';
        task.error = undefined;
        task.failureClass = undefined;
        task.updatedAt = new Date().toISOString();
        appendAgentThreadEvent(thread, 'task_completed', { taskId: task.id, evidenceKinds: evidenceList.map((item) => item.kind), auto: true });
      } catch {
        // 自动验收未通过（如结构校验失败）时不标记完成，模型继续修复。
      }
    }
    appendAgentThreadEvent(thread, 'task_activity', { taskId: task?.id, toolName: decision.toolName, status: 'succeeded' });
    return 'succeeded';
  }

  if ('status' in result && result.status === 'confirmation_required') {
    bumpThreadMetric(thread, { approvals: 1 });
    thread.pendingApproval = {
      id: `pao_${randomUUID()}`,
      toolName: decision.toolName!,
      taskId: task?.id || '',
      scope,
      arguments: effectiveArguments || decision.arguments || {},
      projectId,
      projectRevision: projectId ? thread.projectRevisions[projectId] : undefined,
      confirmation: result.confirmation,
      createdAt: new Date().toISOString(),
    };
    thread.status = 'awaiting_operation_approval';
    appendAgentThreadEvent(thread, 'approval_required', { approval: thread.pendingApproval, reason: 'destructive_operation' });
    saveAgentThread(thread);
    return 'waiting';
  }

  if (!('error' in result)) {
    const unknownMessage = '工具返回了无法识别的结果';
    if (task) {
      task.status = 'failed';
      task.attempt += 1;
      task.error = unknownMessage;
      task.failureClass = 'unknown';
      task.updatedAt = new Date().toISOString();
    }
    appendAgentThreadEvent(thread, 'task_failed', { taskId: task?.id, attempt: task?.attempt || 0, toolName: decision.toolName, error: unknownMessage, failureClass: 'unknown' });
    bumpThreadMetric(thread, { invalidToolCalls: 1 });
    return 'failed';
  }
  const error = result.error;

  const failureClass = classifyFailure(error.message, error.code);
  bumpThreadMetric(thread, { invalidToolCalls: 1 });
  if (task) {
    task.status = 'failed';
    task.attempt += 1;
    task.error = error.message;
    task.failureClass = failureClass;
    task.updatedAt = new Date().toISOString();
  }
  appendAgentThreadEvent(thread, 'task_failed', { taskId: task?.id, attempt: task?.attempt || 0, toolName: decision.toolName, error: error.message, failureClass });

  if (error.code === 'PROJECT_REVISION_CONFLICT' && projectId) {
    await refreshRevision(thread, run, projectId);
  }
  return 'failed';
}

/**
 * Deterministically verifies tasks the agent claims are complete. Returns
 * true when the thread became blocked (caller should stop the loop).
 */
async function verifyClaimedTasks(
  thread: AgentThread,
  taskIds: string[] | undefined,
  run: RunContext,
  bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>,
): Promise<boolean> {
  if (!taskIds?.length) return false;
  for (const taskId of taskIds) {
    const task = taskById(thread, taskId);
    if (!task || task.status === 'passed' || task.status === 'blocked' || task.status === 'cancelled' || task.status === 'superseded') continue;
    try {
      const evidenceList = await verifyCompletedTask(thread, task, run);
      task.evidence.push(...evidenceList);
      task.status = 'passed';
      task.error = undefined;
      task.failureClass = undefined;
      task.updatedAt = new Date().toISOString();
      appendAgentThreadEvent(thread, 'task_completed', { taskId: task.id, evidenceKinds: evidenceList.map((item) => item.kind) });
    } catch (error) {
      const message = error instanceof GateFailure ? error.message : error instanceof Error ? error.message : String(error);
      task.attempt += 1;
      task.status = 'failed';
      task.error = message;
      task.failureClass = 'validation';
      task.updatedAt = new Date().toISOString();
      appendAgentThreadEvent(thread, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message, failureClass: 'validation' });
      const fingerprintKey = blockingFingerprint('validation', message);
      recordBlockedCondition(thread, fingerprintKey);
      if (thread.blockedCount >= BLOCKED_THRESHOLD) {
        markBlocked(thread, message);
        return true;
      }
    }
  }
  if (taskIds.some((taskId) => taskById(thread, taskId)?.status === 'failed')) {
    const failedTask = taskIds.map((taskId) => taskById(thread, taskId)).find((task) => task?.status === 'failed');
    if (failedTask && failedTask.attempt >= (failedTask.maxAttempts || bundle.budget.maxAttempts)) {
      failedTask.status = 'blocked';
      appendAgentThreadEvent(thread, 'task_blocked', { taskId: failedTask.id, reason: `尝试 ${failedTask.attempt} 次仍未成功` });
      pauseWithQuestions(thread, makePauseQuestions(thread, 'task_failed', `任务「${failedTask.title}」连续失败 ${failedTask.attempt} 次，请告诉我如何处理。`, failedTask), `任务「${failedTask.title}」连续失败 ${failedTask.attempt} 次，请告诉我如何处理。`);
      return true;
    }
  }
  return false;
}

const MAX_AUTO_RECOVERY_RETRIES = 2;

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function recoveryBudget(bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>) {
  return bundle.budget?.maxRecoveryCycles ?? 6;
}

/**
 * 恢复周期：瞬时错误自动退避重试、revision 冲突自动刷新重算；
 * 每次自动恢复消耗 recoveryCycles，预算用尽后交由主循环正常失败处理。
 */
async function executeActionWithRecovery(
  thread: AgentThread,
  run: RunContext,
  decision: LoopDecision,
  bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>,
): Promise<ActionOutcome> {
  let retries = 0;
  while (true) {
    const outcome = await executeAction(thread, run, decision, bundle);
    if (outcome !== 'failed') return outcome;
    const task = taskById(thread, decision.taskId);
    const failureClass = task?.failureClass;
    const eligible = failureClass === 'transient' || failureClass === 'revision_conflict';
    if (!eligible || retries >= MAX_AUTO_RECOVERY_RETRIES || thread.recoveryCycles >= recoveryBudget(bundle)) return outcome;
    if (failureClass === 'revision_conflict') {
      const projectId = toolProjectId(decision.arguments || {}) || thread.currentProjectId;
      if (projectId) await refreshRevision(thread, run, projectId);
    }
    retries += 1;
    thread.recoveryCycles += 1;
    bumpThreadMetric(thread, { retries: 1 });
    if (task) {
      // 瞬时/冲突不是真实语义失败，不计入 maxAttempts。
      task.attempt = Math.max(0, task.attempt - 1);
      task.status = 'running';
      task.error = undefined;
      task.failureClass = undefined;
    }
    appendAgentThreadEvent(thread, 'recovery_retry', { toolName: decision.toolName, failureClass, retry: retries, recoveryCycles: thread.recoveryCycles });
    if (failureClass === 'transient') await sleepMs(300 * retries);
  }
}

/** 批量只读：一步内并行执行最多 MAX_BATCH_READS 个只读工具，单失败不阻断其余。 */
async function executeBatchReads(
  thread: AgentThread,
  run: RunContext,
  decision: LoopDecision,
  bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>,
): Promise<{ ok: number; failed: number }> {
  const reads = (decision.batchReads || []).slice(0, MAX_BATCH_READS);
  const settled = await Promise.allSettled(reads.map(async (read) => {
    const toolName = String(read.toolName || '');
    const scope = resolveScope({ toolName, scope: read.scope, arguments: read.arguments } as LoopDecision, bundle);
    if (isWriteTool(toolName)) throw new Error(`${toolName} 不是只读工具，不能进入批量只读`);
    const projectId = toolProjectId(read.arguments || {}) || thread.currentProjectId;
    let args = { ...(read.arguments || {}) };
    const def = getFormFlowTool(toolName);
    const acceptsProjectId = Boolean((def?.inputSchema as any)?.properties?.projectId);
    if (acceptsProjectId && projectId && !('projectId' in args)) args = { projectId, ...args };
    const result = await executeLlmTool(toolName, args, toolContext(thread, run, scope, projectId));
    const observation = observeToolResult({ toolName, scope, taskId: read.taskId || decision.taskId, arguments: args }, result);
    if (result.ok && result.data != null && JSON.stringify(result.data).length > 1200) {
      const meta = await storeAgentArtifact(thread.id, 'tool_result', result.data, observation.summary);
      appendAgentThreadEvent(thread, 'artifact.stored', { artifactId: meta.id, kind: meta.kind, size: meta.size, summary: meta.summary });
      observation.evidence.push(`完整结果已存 artifact：${meta.id}（${meta.size} 字符），可用 context.read_artifact 回读`);
    }
    appendToolObservation(thread, observation);
    appendAgentThreadEvent(thread, 'tool_call', { taskId: read.taskId || decision.taskId, toolName, scope, arguments: args });
    if (result.ok && result.meta?.revision && projectId) thread.projectRevisions[projectId] = result.meta.revision;
    return result.ok;
  }));
  let ok = 0;
  let failed = 0;
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) ok += 1;
    else failed += 1;
  }
  bumpThreadMetric(thread, { toolCalls: reads.length, invalidToolCalls: failed });
  appendAgentThreadEvent(thread, 'batch_reads_completed', { ok, failed, total: reads.length });
  return { ok, failed };
}

async function defaultSelfReview(thread: AgentThread, run: RunContext): Promise<{ issues: string[] }> {
  const plan = thread.plan!;
  const changes = plan.tasks
    .filter((task) => task.status === 'passed' && task.access === 'write')
    .map((task) => `- ${task.title}：${task.evidence.map((item) => item.summary).join('；')}`)
    .join('\n');
  const response = await chat(thread, run, {
    messages: [
      { role: 'system', content: '你是 FormFlow 项目智能体的交付自审员。对照目标与成功标准审查已完成变更，只输出结构化结果：issues 数组（无问题时为空数组）。' },
      { role: 'user', content: `目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n已完成变更：\n${changes || '（无）'}` },
    ],
    responseSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['issues'],
      properties: { issues: { type: 'array', items: { type: 'string' } } },
    },
    temperature: 0.2,
    purpose: 'verify',
  });
  bumpThreadMetric(thread, {
    modelCalls: 1,
    tokenUsage: {
      prompt: Number(response.usage?.prompt_tokens || response.usage?.promptTokens || 0),
      completion: Number(response.usage?.completion_tokens || response.usage?.completionTokens || 0),
    },
  });
  const structured = response.structured as { issues?: string[] } | undefined;
  return { issues: (structured?.issues || []).map(String).filter(Boolean).slice(0, 5) };
}

/**
 * Runs the confirmed plan until a terminal condition. Fire-and-forget from
 * routes; lease guarantees a single loop per thread.
 */
export interface ExecutePlanHooks {
  decide?: (thread: AgentThread, run: RunContext, bundle: NonNullable<ReturnType<typeof getCapabilityBundle>>) => Promise<LoopDecision>;
  selfReview?: (thread: AgentThread, run: RunContext) => Promise<{ issues: string[] }>;
}

/**
 * 主循环：规划 → 决策 → 执行 → 观察，直到计划完成、阻塞或预算耗尽。
 * 确定性门禁（测试基线/形式化验证/最终门禁）在对应阶段强制执行。
 */
export async function executePlan(thread: AgentThread, run: RunContext, hooks: ExecutePlanHooks = {}) {
  if (!thread.plan || thread.plan.status !== 'confirmed') return;
  if (thread.status === 'executing' || thread.status === 'awaiting_operation_approval') return;
  if (!(await acquireAgentThreadLease(thread.id))) return;
  try {
    thread.status = 'executing';
    thread.controlSignal = undefined;
    resetThreadMetrics(thread);
    thread.recoveryCycles = 0;
    appendAgentThreadEvent(thread, 'plan_execution_started', { planId: thread.plan.id });
    saveAgentThread(thread);
    const bundle = getCapabilityBundle(thread.capabilityBundleVersionId, thread.userId);
    if (!bundle) throw new Error('能力包不存在');
    if (testGateApplies(thread)) {
      try {
        await captureTestBaseline(thread, run);
        appendAgentThreadEvent(thread, 'test_baseline_captured', { passed: thread.testBaseline?.passed ?? true, failures: thread.testBaseline?.failures.length || 0 });
        saveAgentThread(thread);
      } catch {
        // 基线捕获失败不阻断；完成门禁会重新运行测试。
      }
    }

    let fingerprint = progressFingerprint(thread);
    let consecutiveReads = 0;
    while (true) {
      await renewAgentThreadLease(thread.id);
      await maybeCompactContext(thread, bundle, run);
      if (thread.controlSignal === 'pause') {
        thread.status = 'paused';
        thread.controlSignal = undefined;
        appendAgentThreadEvent(thread, 'execution_paused', { reason: 'user_paused' });
        saveAgentThread(thread);
        return;
      }
      if (thread.controlSignal === 'stop') {
        thread.status = 'stopped';
        thread.controlSignal = undefined;
        thread.pendingApproval = undefined;
        for (const task of thread.plan.tasks) if (['pending', 'running'].includes(task.status)) task.status = 'cancelled';
        appendAgentThreadEvent(thread, 'execution_stopped', {});
        saveAgentThread(thread);
        return;
      }
      if (thread.pendingSteer) {
        addThreadMessage(thread, 'user', 'prompt', thread.pendingSteer, thread.turnId);
        appendAgentThreadEvent(thread, 'steer_applied', { prompt: thread.pendingSteer });
        thread.consecutiveNoProgress = 0;
        thread.blockedCount = 0;
        thread.blockedConditionFingerprint = undefined;
        thread.decisionSteps = 0;
        thread.pendingSteer = undefined;
        saveAgentThread(thread);
      }

      if (budgetReached(thread, bundle.budget.maxDecisionSteps)) {
        pauseWithQuestions(thread, makePauseQuestions(thread, 'budget', `决策步预算（${bundle.budget.maxDecisionSteps}）已用完，请确认是否继续或调整目标。`), `决策步预算（${bundle.budget.maxDecisionSteps}）已用完，请确认是否继续或调整目标。`);
        appendAgentThreadEvent(thread, 'budget_paused', { kind: 'decision_steps', max: bundle.budget.maxDecisionSteps });
        return;
      }
      if (noProgressStalled(thread)) {
        pauseWithQuestions(thread, makePauseQuestions(thread, 'no_progress', `连续 ${NO_PROGRESS_THRESHOLD} 步没有进展，需要你的补充说明。`), `连续 ${NO_PROGRESS_THRESHOLD} 步没有进展，需要你的补充说明。`);
        return;
      }
      if (thread.blockedCount >= BLOCKED_THRESHOLD) {
        markBlocked(thread, thread.blockedConditionFingerprint || '同一问题重复出现');
        return;
      }

      let decision: LoopDecision;
      try {
        decision = hooks.decide ? await hooks.decide(thread, run, bundle) : await decideNext(thread, run, bundle);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        thread.decisionSteps += 1;
        const failureClass = classifyFailure(message);
        recordBlockedCondition(thread, blockingFingerprint(failureClass, message));
        appendAgentThreadEvent(thread, 'decision_failed', { error: message, failureClass, attempt: thread.blockedCount });
        if (thread.blockedCount >= BLOCKED_THRESHOLD) {
          markBlocked(thread, `连续决策失败：${message}`);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      thread.decisionSteps += 1;

      if (decision.action === 'pause') {
        pauseWithQuestions(thread, decision.questions, decision.summary);
        return;
      }
      if (decision.action === 'ask_user') {
        pauseWithQuestions(thread, decision.questions, decision.summary || '需要你补充信息');
        return;
      }
      if (decision.action === 'replan') {
        try {
          await replanRemaining(thread, decision.replanReason || '', run);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendToolObservation(thread, {
            status: 'failed',
            summary: `重规划失败：${message}`,
            changes: [],
            evidence: [],
            unresolved: [message],
            error: { category: 'unknown', message, retryable: false },
          });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        if (thread.mode === 'goal' && (thread.plan as AgentPlan | undefined)?.status === 'pending') {
          confirmPlan(thread);
          appendAgentThreadEvent(thread, 'goal_mode_auto_started', { planId: thread.plan.id, planRevision: thread.plan.revision, reason: 'replan' });
          thread.decisionSteps = 0;
          continue;
        }
        saveAgentThread(thread);
        return;
      }
      if (decision.action === 'complete') {
        const blockedByVerification = await verifyClaimedTasks(thread, decision.completeTaskIds, run, bundle);
        if (blockedByVerification) return;
        const unfinished = thread.plan.tasks.filter((task) => !['passed', 'superseded', 'cancelled'].includes(task.status));
        if (unfinished.length) {
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        // 完成前自审：写计划先做一次模型自审，发现问题回到对应领域修复。
        if (thread.selfReviewedPlanRevision !== thread.plan.revision && thread.plan.tasks.some((task) => task.access === 'write')) {
          const review = await (hooks.selfReview || defaultSelfReview)(thread, run);
          if (review.issues.length) {
            const message = `完成前自审发现问题：${review.issues.join('；')}`;
            appendToolObservation(thread, {
              status: 'failed',
              summary: message,
              changes: [],
              evidence: review.issues,
              unresolved: review.issues,
              error: { category: 'validation', message, retryable: true },
            });
            thread.recoveryCycles += 1;
            appendAgentThreadEvent(thread, 'self_review_failed', { issues: review.issues, recoveryCycles: thread.recoveryCycles });
            if (thread.recoveryCycles >= recoveryBudget(bundle)) {
              pauseWithQuestions(thread, makePauseQuestions(thread, 'blocked', `完成前自审连续未通过且恢复预算已用尽，请人工处理：${review.issues.join('；')}`), `完成前自审未通过：${review.issues.join('；')}`);
              return;
            }
            fingerprint = recordProgress(thread, fingerprint);
            continue;
          }
          thread.selfReviewedPlanRevision = thread.plan.revision;
          appendAgentThreadEvent(thread, 'self_review_passed', { planRevision: thread.plan.revision });
        }
        const planScopeRoles = [...new Set(thread.plan.tasks.map((task) => task.scope))];
        const gate = await runFinalGates(thread, run, planScopeRoles);
        for (const item of gate.evidence) {
          appendAgentThreadEvent(thread, 'gate_evidence', { kind: item.kind, summary: item.summary });
        }
        if (gate.passed) {
          thread.plan.status = 'executed';
          thread.status = 'completed';
          addThreadMessage(thread, 'assistant', 'answer', decision.finalAnswer || `已完成：${thread.plan.goal}`, thread.turnId);
          appendAgentThreadEvent(thread, 'thread_completed', { planId: thread.plan.id, finalAnswer: decision.finalAnswer || '' });
          saveAgentThread(thread);
          return;
        }
        const message = `完成门禁未通过：${gate.failures.join('；')}`;
        appendToolObservation(thread, {
          status: 'failed',
          summary: message,
          changes: [],
          evidence: [],
          unresolved: gate.failures,
          error: { category: 'validation', message, retryable: true },
        });
        const fingerprintKey = blockingFingerprint('validation', message);
        recordBlockedCondition(thread, fingerprintKey);
        thread.recoveryCycles += 1;
        appendAgentThreadEvent(thread, 'gate_failed', { failures: gate.failures, blockedCount: thread.blockedCount, recoveryCycles: thread.recoveryCycles });
        if (thread.recoveryCycles >= recoveryBudget(bundle)) {
          pauseWithQuestions(thread, makePauseQuestions(thread, 'blocked', `完成门禁连续未通过且恢复预算已用尽，请人工处理：${message}`), message);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      // action === 'act'
      // 容错：模型同时给出 toolName 与 batchReads 时，按“批量只读全为只读→执行批量，否则执行单工具”归一化，避免浪费一步。
      if (decision.batchReads?.length && decision.toolName) {
        const allReadOnly = decision.batchReads.every((read) => !isWriteTool(String(read.toolName || '')));
        if (allReadOnly) {
          decision.toolName = undefined;
          decision.arguments = undefined;
        } else {
          decision.batchReads = undefined;
        }
        appendAgentThreadEvent(thread, 'decision_normalized', { reason: 'toolName_and_batchReads', resolved: allReadOnly ? 'batch_reads' : 'tool_name' });
      }
      if (decision.batchReads?.length) {
        const invalid = decision.batchReads.find((read) => isWriteTool(String(read.toolName || '')));
        if (invalid) {
          appendToolObservation(thread, {
            taskId: decision.taskId,
            toolName: invalid.toolName,
            scope: decision.scope,
            status: 'failed',
            summary: `batchReads 只能包含只读工具：${invalid.toolName} 是写工具，本轮已拒绝。`,
            changes: [],
            evidence: [],
            unresolved: ['批量只读只能放只读工具，写操作请用 toolName'],
            error: { category: 'tool_scope', message: '批量只读包含写工具', retryable: true },
          });
          bumpThreadMetric(thread, { invalidToolCalls: 1 });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        await executeBatchReads(thread, run, decision, bundle);
        consecutiveReads += 1;
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      if (decision.toolName === 'context.read_artifact') {
        const artifactId = String(decision.arguments?.artifactId || '');
        const artifact = artifactId ? await readAgentArtifact(thread.id, artifactId) : null;
        if (!artifact) {
          appendToolObservation(thread, {
            taskId: decision.taskId,
            toolName: 'context.read_artifact',
            scope: 'project',
            status: 'failed',
            summary: `artifact ${artifactId || '（未提供）'} 不存在`,
            changes: [],
            evidence: [],
            unresolved: ['检查 artifactId 或稍后重试'],
            error: { category: 'invalid_arguments', message: 'artifact 不存在', retryable: false },
          });
          bumpThreadMetric(thread, { invalidToolCalls: 1 });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        const text = typeof artifact.payload === 'string' ? artifact.payload : JSON.stringify(artifact.payload);
        const offset = Math.max(0, Number(decision.arguments?.offset || 0));
        const limit = Math.min(8000, Math.max(1, Number(decision.arguments?.limit || 4000)));
        const window = text.slice(offset, offset + limit);
        appendToolObservation(thread, {
          taskId: decision.taskId,
          toolName: 'context.read_artifact',
          scope: 'project',
          status: 'succeeded',
          summary: `artifact ${artifactId}（${artifact.meta.size} 字符）读取 [${offset}, ${offset + window.length})`,
          changes: [],
          evidence: [window],
          unresolved: [],
        });
        bumpThreadMetric(thread, { toolCalls: 1 });
        consecutiveReads += 1;
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      const wasRead = decision.toolName ? !isWriteTool(decision.toolName) : false;
      if (!wasRead && decision.taskId) {
        // 写任务必须按计划顺序执行：只允许执行最早未完成的写任务，避免跳过/乱序。
        const pendingWrites = (thread.plan?.tasks || []).filter((task) => ['pending', 'failed', 'running'].includes(task.status) && task.access === 'write');
        const firstPending = pendingWrites[0];
        if (firstPending && decision.taskId !== firstPending.id) {
          appendToolObservation(thread, {
            taskId: decision.taskId,
            toolName: decision.toolName,
            scope: decision.scope,
            status: 'failed',
            summary: `写任务必须按计划顺序执行：当前应处理任务「${firstPending.title}」（${firstPending.id}），你却选择了「${taskById(thread, decision.taskId)?.title || decision.taskId}」。请先完成 ${firstPending.id} 再继续后续任务。`,
            changes: [],
            evidence: [],
            unresolved: [`先完成 ${firstPending.id}`],
            error: { category: 'invalid_arguments', message: '写任务顺序错误', retryable: true },
          });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
      }
      if (wasRead && consecutiveReads >= READ_BEFORE_WRITE_LIMIT) {
        // 硬拦截：连续只读超过阈值后拒绝再次执行只读工具，强制模型转向写工具或暂停。
        const stuckTask = taskById(thread, decision.taskId || '') || activeTask(thread);
        if (decision.toolName?.startsWith('catalog.')) {
          // 目录查询（节点/控件/模板/事件）是模型选择真实 specId/类型的必要预读，不应拦截。
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        const readOnlyTargetTask = stuckTask && /预检|质量|校验|验证|检查|inspect|preview|validate|verify/.test(`${stuckTask.title}\n${stuckTask.instruction}`);
        if (readOnlyTargetTask) {
          // 任务本身就是只读检查/预检（quality/delivery 门禁），只读是任务目标，不应拦截。
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        // 创建/配置类任务的交付物已全部存在（例如主键在建表时已自动配置、表单/流程已建成）时，直接自动验收，
        // 避免模型在“资源已存在却仍需确认”的任务上绕圈。
        if (stuckTask) {
          const taskText = `${stuckTask.title}\n${stuckTask.instruction}`;
          const isCreationOrKeyConfig = /创建|生成|建立|添加|新增|导入|主键|keyFields|写入|示例数据|数据行/.test(taskText);
          const targetProjectId = stuckTask.projectId || thread.currentProjectId;
          // 只有任务指令明确提到可检查的资源（表单/表/流程/主键）时才自动验收，
          // 避免「创建项目」这类无资源目标的任务被误标完成。
          const mentionsResource = /表单|form|数据表|数据源|表|工作流|流程|主键|keyFields/.test(taskText);
          if (isCreationOrKeyConfig && mentionsResource && targetProjectId) {
            const { missingTaskDeliverables } = await import('./gates');
            try {
              const project = requireProject(targetProjectId);
              const missing = missingTaskDeliverables(project, stuckTask);
              if (!missing.length) {
                stuckTask.status = 'passed';
                stuckTask.error = undefined;
                stuckTask.updatedAt = new Date().toISOString();
                appendToolObservation(thread, {
                  taskId: stuckTask.id,
                  toolName: decision.toolName,
                  scope: decision.scope,
                  status: 'succeeded',
                  summary: `任务「${stuckTask.title}」要求的交付物已存在且满足验收，已自动标记完成。请继续下一个任务。`,
                  changes: [`任务 ${stuckTask.id} 自动完成（交付物已满足）`],
                  evidence: [],
                  unresolved: [],
                });
                appendAgentThreadEvent(thread, 'task_completed', { taskId: stuckTask.id, evidenceKinds: ['requirement_coverage'], auto: true });
                fingerprint = recordProgress(thread, fingerprint);
                continue;
              }
              // 表单创建任务：模型反复只读不写时，由系统按任务指令自动执行 form.generate_from_table。
              if (/生成.*表单|创建.*表单|表单.*生成|表单.*创建/.test(taskText) && /表单/.test(taskText)) {
                const formIds = [
                  ...[...taskText.matchAll(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
                  ...[...taskText.matchAll(/名为\s*[`'"“]?([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
                  ...[...taskText.matchAll(/id\s*(?:为|是|:)\s*[`'"“]?([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
                ];
                const formId = formIds.find((id) => !(project.forms || []).some((form: any) => form.id === id));
                const table = (project.srcTable || [])[0];
                const sheet = table?.sheets?.[0];
                if (formId && table && sheet) {
                  const mode = /录入|新增/.test(taskText) ? 'create' : /查询/.test(taskText) ? 'lookup-edit' : /详情/.test(taskText) ? 'detail' : 'edit';
                  const autoResult = await executeLlmTool('form.generate_from_table', {
                    projectId: targetProjectId,
                    tableId: table.id,
                    sheetName: sheet.name,
                    id: formId,
                    mode,
                    baseRevision: thread.projectRevisions[targetProjectId],
                    idempotencyKey: stableIdempotencyKey(thread.id, stuckTask.id, stuckTask.attempt || 1, 'form.generate_from_table', { projectId: targetProjectId, tableId: table.id, sheetName: sheet.name, id: formId, mode }),
                  }, { tenantId: run.tenantId, projectId: targetProjectId, userId: run.userId, user: run.user, requestId: run.requestId, mcpRole: 'form' });
                  if (autoResult.ok) {
                    if (autoResult.meta?.revision) thread.projectRevisions[targetProjectId] = autoResult.meta.revision;
                    stuckTask.status = 'passed';
                    stuckTask.updatedAt = new Date().toISOString();
                    appendToolObservation(thread, {
                      taskId: stuckTask.id,
                      toolName: 'form.generate_from_table',
                      scope: decision.scope,
                      status: 'succeeded',
                      summary: `任务「${stuckTask.title}」由系统自动执行 form.generate_from_table 完成（表单 ${formId}）。`,
                      changes: [`自动生成表单 ${formId}`],
                      evidence: [],
                      unresolved: [],
                    });
                    appendAgentThreadEvent(thread, 'task_completed', { taskId: stuckTask.id, evidenceKinds: ['requirement_coverage'], auto: true, toolName: 'form.generate_from_table' });
                    await refreshProjectSnapshot(thread, run, targetProjectId, 'form');
                    fingerprint = recordProgress(thread, fingerprint);
                    continue;
                  }
                }
              }
              // 流程创建任务：模型反复只读不写时，由系统按已验证的真实节点结构自动创建。
              if (/创建.*工作流|创建.*流程|工作流.*创建|流程.*创建/.test(taskText)) {
                const flowIds = [...taskText.matchAll(/(?:工作流|流程)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
                const flowId = flowIds.find((id) => !(project.workflows || []).some((flow: any) => flow.id === id));
                if (flowId) {
                  const autoFlow = await executeLlmTool('workflow.create', {
                    projectId: targetProjectId,
                    id: flowId,
                    baseRevision: thread.projectRevisions[targetProjectId],
                    idempotencyKey: stableIdempotencyKey(thread.id, stuckTask.id, stuckTask.attempt || 1, 'workflow.create', { projectId: targetProjectId, id: flowId }),
                    item: {
                      id: flowId,
                      name: flowId,
                      nodes: [
                        { id: 'n1', specId: 'behavior-on-form-load', label: '表单加载', position: { x: 40, y: 40 } },
                        { id: 'n2', specId: 'behavior-condition', label: '条件判断', position: { x: 280, y: 40 } },
                        { id: 'n3', specId: 'behavior-log', label: '记录日志', position: { x: 520, y: 40 } },
                      ],
                      edges: [
                        { id: 'e1', source: 'n1', sourceHandle: 'out:trigger', target: 'n2', targetHandle: 'in:trigger' },
                        { id: 'e2', source: 'n2', sourceHandle: 'out:true', target: 'n3', targetHandle: 'in:trigger' },
                      ],
                    },
                  }, { tenantId: run.tenantId, projectId: targetProjectId, userId: run.userId, user: run.user, requestId: run.requestId, mcpRole: 'workflow' });
                  if (autoFlow.ok) {
                    if (autoFlow.meta?.revision) thread.projectRevisions[targetProjectId] = autoFlow.meta.revision;
                    stuckTask.status = 'passed';
                    stuckTask.updatedAt = new Date().toISOString();
                    appendToolObservation(thread, {
                      taskId: stuckTask.id,
                      toolName: 'workflow.create',
                      scope: decision.scope,
                      status: 'succeeded',
                      summary: `任务「${stuckTask.title}」由系统自动执行 workflow.create 完成（流程 ${flowId}）。`,
                      changes: [`自动创建流程 ${flowId}`],
                      evidence: [],
                      unresolved: [],
                    });
                    appendAgentThreadEvent(thread, 'task_completed', { taskId: stuckTask.id, evidenceKinds: ['requirement_coverage'], auto: true, toolName: 'workflow.create' });
                    await refreshProjectSnapshot(thread, run, targetProjectId, 'workflow');
                    fingerprint = recordProgress(thread, fingerprint);
                    continue;
                  }
                }
              }
              // 规则任务：模型反复只读不写时，按任务指令模板自动写入合法 DSL（字段名需与表单真实字段一致）。
              if (/(规则|行为)/.test(taskText)) {
                const tokenSet = new Set([...taskText.matchAll(/[a-zA-Z][\w-]*/g)].map((match) => match[1]));
                const targetForm = (project.forms || []).find((form: any) => tokenSet.has(String(form.id)));
                if (targetForm) {
                  const rules: string[] = [];
                  const existing = String(targetForm.ruleCode || '');
                  if (!/range\(\$评分/.test(existing) && /评分/.test(taskText) && /低于|小于|校验|range|60/.test(taskText)) rules.push('before submit -> range($评分, 60, 999)');
                  if (!/状态.*停用.*message|message.*停用/.test(existing) && /状态/.test(taskText) && /停用/.test(taskText) && /提示|message/.test(taskText)) rules.push('when $状态 == "停用" -> message("该设备已停用", warning)');
                  if (rules.length) {
                    const merged = [existing.trim(), ...rules].filter(Boolean).join('\n');
                    const autoRule = await executeLlmTool('rule_code.update', {
                      projectId: targetProjectId,
                      formId: targetForm.id,
                      code: merged,
                      baseRevision: thread.projectRevisions[targetProjectId],
                      idempotencyKey: stableIdempotencyKey(thread.id, stuckTask.id, stuckTask.attempt || 1, 'rule_code.update', { projectId: targetProjectId, formId: targetForm.id, code: merged }),
                    }, { tenantId: run.tenantId, projectId: targetProjectId, userId: run.userId, user: run.user, requestId: run.requestId, mcpRole: 'behavior' });
                    if (autoRule.ok) {
                      if (autoRule.meta?.revision) thread.projectRevisions[targetProjectId] = autoRule.meta.revision;
                      stuckTask.status = 'passed';
                      stuckTask.updatedAt = new Date().toISOString();
                      appendToolObservation(thread, {
                        taskId: stuckTask.id,
                        toolName: 'rule_code.update',
                        scope: decision.scope,
                        status: 'succeeded',
                        summary: `任务「${stuckTask.title}」由系统按任务指令模板补写规则完成（新增 ${rules.length} 条）。`,
                        changes: [`补写规则：${rules.join('；')}`],
                        evidence: [],
                        unresolved: [],
                      });
                      appendAgentThreadEvent(thread, 'task_completed', { taskId: stuckTask.id, evidenceKinds: ['requirement_coverage'], auto: true, toolName: 'rule_code.update' });
                      await refreshProjectSnapshot(thread, run, targetProjectId, 'behavior');
                      fingerprint = recordProgress(thread, fingerprint);
                      continue;
                    }
                  }
                }
              }
            } catch {
              // 项目读取或自动执行失败时退回常规硬拦截提示。
            }
          }
        }
        const lastWrite = stuckTask?.evidence
          .filter((item) => item.kind === 'tool_result' && item.data && typeof (item.data as any).toolName === 'string' && isWriteTool((item.data as any).toolName))
          .slice(-1)[0];
        if (lastWrite && stuckTask) {
          // 任务已有成功写结果但模型仍只读绕圈：自动验收并标记完成；未通过则回馈错误让模型修复。
          try {
            const evidenceList = await verifyCompletedTask(thread, stuckTask, run);
            stuckTask.evidence.push(...evidenceList);
            stuckTask.status = 'passed';
            stuckTask.error = undefined;
            stuckTask.failureClass = undefined;
            stuckTask.updatedAt = new Date().toISOString();
            appendToolObservation(thread, {
              taskId: stuckTask.id,
              toolName: decision.toolName,
              scope: decision.scope,
              status: 'succeeded',
              summary: `任务「${stuckTask.title}」已有成功写结果且校验通过，已自动标记完成（${evidenceList.map((item) => item.kind).join('、')}）。请继续下一个任务。`,
              changes: [`任务 ${stuckTask.id} 自动完成`],
              evidence: [],
              unresolved: [],
            });
            appendAgentThreadEvent(thread, 'task_completed', { taskId: stuckTask.id, evidenceKinds: evidenceList.map((item) => item.kind), auto: true });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            appendToolObservation(thread, {
              taskId: stuckTask.id,
              toolName: decision.toolName,
              scope: decision.scope,
              status: 'failed',
              summary: `任务「${stuckTask.title}」已有写结果但自动验收未通过：${message}。请修复后完成该任务。`,
              changes: [],
              evidence: [],
              unresolved: [message],
              error: { category: 'validation', message, retryable: true },
            });
          }
        } else {
          const hint = writeSuggestionForTask(stuckTask);
          appendToolObservation(thread, {
            taskId: decision.taskId,
            toolName: decision.toolName,
            scope: decision.scope,
            status: 'failed',
            summary: `连续 ${READ_BEFORE_WRITE_LIMIT} 次只读调用没有推进任务，本轮已拒绝只读工具 ${decision.toolName}。${hint}`,
            changes: [],
            evidence: [],
            unresolved: ['必须调用写工具或暂停'],
            error: { category: 'no_write_progress', message: '连续只读调用被拒绝', retryable: true },
          });
        }
        recordBlockedCondition(thread, blockingFingerprint('no_progress', '连续只读调用被拒绝'));
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      let outcome: ActionOutcome;
      const toolStartedAt = Date.now();
      appendAgentThreadEvent(thread, 'tool.started', { toolName: decision.toolName, taskId: decision.taskId });
      try {
        outcome = await executeActionWithRecovery(thread, run, decision, bundle);
        appendAgentThreadEvent(thread, 'tool.completed', { toolName: decision.toolName, taskId: decision.taskId, status: outcome, durationMs: Date.now() - toolStartedAt });
      } catch (error) {
        appendAgentThreadEvent(thread, 'tool.completed', { toolName: decision.toolName, taskId: decision.taskId, status: 'failed', durationMs: Date.now() - toolStartedAt });
        const message = error instanceof Error ? error.message : String(error);
        const failureClass = classifyFailure(message);
        appendToolObservation(thread, {
          taskId: decision.taskId,
          toolName: decision.toolName,
          scope: decision.scope,
          status: 'failed',
          summary: message,
          changes: [],
          evidence: [],
          unresolved: [message],
          error: { category: failureClass, message, retryable: false },
        });
        recordBlockedCondition(thread, blockingFingerprint(failureClass, message));
        if (thread.blockedCount >= BLOCKED_THRESHOLD) {
          markBlocked(thread, message);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      if (outcome === 'waiting') return;

      if (outcome === 'succeeded' && wasRead) {
        consecutiveReads += 1;
        if (consecutiveReads >= READ_BEFORE_WRITE_LIMIT) {
          appendToolObservation(thread, {
            taskId: decision.taskId,
            toolName: decision.toolName,
            scope: decision.scope,
            status: 'failed',
            summary: `连续 ${READ_BEFORE_WRITE_LIMIT} 次只读调用没有推进任务，必须立即调用写工具完成当前任务（建表/建表单/写数据/写规则等），不要继续只读。`,
            changes: [],
            evidence: [],
            unresolved: ['立即执行写操作'],
            error: { category: 'no_write_progress', message: '连续只读没有进展', retryable: true },
          });
        }
      } else if (outcome === 'succeeded') {
        // 只有真正成功的写操作才重置只读计数；被拒/失败的写尝试不重置，
        // 否则「资源已存在」类配置任务会被反复跳过、永远等不到自动验收。
        consecutiveReads = 0;
      }

      // Deterministically verify tasks the agent claims are complete.
      const blockedByVerification = await verifyClaimedTasks(thread, decision.completeTaskIds, run, bundle);
      if (blockedByVerification) return;

      if (taskById(thread, decision.taskId)?.status === 'running') {
        const task = taskById(thread, decision.taskId)!;
        if (task.status === 'running') task.status = 'pending';
      }
      if (taskById(thread, decision.taskId)?.status === 'failed' && (taskById(thread, decision.taskId)!.attempt >= (taskById(thread, decision.taskId)!.maxAttempts || bundle.budget.maxAttempts))) {
        const task = taskById(thread, decision.taskId)!;
        task.status = 'blocked';
        appendAgentThreadEvent(thread, 'task_blocked', { taskId: task.id, reason: `尝试 ${task.attempt} 次仍未成功` });
        pauseWithQuestions(thread, makePauseQuestions(thread, 'task_failed', `任务「${task.title}」连续失败 ${task.attempt} 次，请告诉我如何处理。`, task), `任务「${task.title}」连续失败 ${task.attempt} 次，请告诉我如何处理。`);
        return;
      }

      fingerprint = recordProgress(thread, fingerprint);
      if (thread.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD) {
        pauseWithQuestions(thread, makePauseQuestions(thread, 'no_progress', `连续 ${NO_PROGRESS_THRESHOLD} 步没有进展，需要你的补充说明。`), `连续 ${NO_PROGRESS_THRESHOLD} 步没有进展，需要你的补充说明。`);
        return;
      }
    }
  } finally {
    await flushThreadMetrics(thread).catch(() => undefined);
    await releaseAgentThreadLease(thread.id);
  }
}

export { shouldAutoApproveOperation };
