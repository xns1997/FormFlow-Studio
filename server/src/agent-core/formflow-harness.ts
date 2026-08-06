/**
 * FormFlow harness adapter：把 FormFlow 的 MCP 工具、门禁、skill、revision
 * 与检查点实现为 HarnessComponents 注入通用 AgentLoop。harness 核心不感知领域。
 */
import { randomUUID } from 'node:crypto';
import { executeLlmTool } from '../services/llm-tools';
import { MCP_ROLES } from '../services/tool-shared';
import { getFormFlowTool } from '../services/formflow-tool-registry';
import { chat } from './llm';
import { runFinalGates, runLightFinalGates, GateFailure, validationIssueText, verifyProjectAfterWrite } from './gates';
import { observeToolResult, recentObservations } from './observe';
import { applyDynamicPlanUpdate, initializeDynamicPlan } from './planner';
import {
  evaluateToolPolicy, isReleaseApply, isWriteTool, normalizeWriteArguments, projectToolCreatesProject,
  resolveScope, stableIdempotencyKey, toolProjectId as policyToolProjectId,
} from './policy';
import { generalLoopSkill, skillCatalog, skillDocument } from './skills';
import {
  getCapabilityBundle, readAgentArtifact, storeAgentArtifact,
} from './store';
import { maybeCompactContext, structuredThreadContext } from './context';
import { createProjectCheckpoint } from './checkpoints';
import { storeEventEmitter } from './harness/events';
import { assemblePromptSections } from './harness/prompts';
import type {
  AgentThread, CapabilityBundleVersion, LoopDecision, LoopObservation, RunContext,
} from './types';
import { MAX_BATCH_READS } from './types';
import type { McpRole } from '../services/tool-shared';
import type { HarnessComponents, HarnessToolResult, ToolGateway, ToolExecutionContext } from './harness/types';

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'summary'],
  properties: {
    action: { type: 'string', enum: ['act', 'complete', 'ask_user'] },
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
        },
      },
    },
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

const VERIFICATION_READ_RE = /^(catalog\.|rule_test\.run|project_test\.|project\.validate|project\.quality\.inspect|release\.preview|rule_verify\.model|data_keys\.validate)/;
const MAX_AUTO_RECOVERY_RETRIES = 2;

function toolContext(thread: AgentThread, run: RunContext, scope: McpRole, projectId?: string): ToolExecutionContext {
  return {
    tenantId: run.tenantId,
    projectId: projectId || thread.currentProjectId,
    userId: run.userId,
    requestId: run.requestId,
    mcpRole: scope,
  };
}

async function refreshRevision(thread: AgentThread, run: RunContext, projectId: string) {
  const result = await executeLlmTool('project.get', { projectId }, toolContext(thread, run, 'project', projectId) as any);
  if (result.ok && result.meta?.revision) {
    thread.projectRevisions[projectId] = result.meta.revision;
    storeEventEmitter().emit(thread, 'revision_refreshed', { projectId, revision: result.meta.revision });
    return result.meta.revision;
  }
  return undefined;
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
    const result = await executeLlmTool('project.inspect', { projectId }, toolContext(thread, run, scope, projectId) as any);
    if (result.ok) {
      thread.projectSnapshots ||= {};
      thread.projectSnapshots[projectId] = { capturedAt: new Date().toISOString(), summary: result.data as Record<string, unknown> };
    }
  } catch {
    // 快照刷新失败不阻断执行；模型可自行读取。
  }
}

/** 领域 skill 按目标关键词 + 最近活动作用域打分，返回排序。 */
function rankScopes(thread: AgentThread, bundle: CapabilityBundleVersion): McpRole[] {
  const text = `${thread.dynamicPlan?.goal || ''}\n${(thread.dynamicPlan?.successCriteria || []).join('\n')}`;
  const recent = new Map<McpRole, number>();
  for (const event of thread.events.slice(-24)) {
    const scope = event.data?.scope as McpRole | undefined;
    if (event.type === 'tool_observation' && scope) recent.set(scope, (recent.get(scope) || 0) + 1);
  }
  const keywords: Record<McpRole, string[]> = {
    project: ['项目', '创建项目', 'project'],
    data: ['数据表', '数据源', '导入', '主键', '行数据', '表', 'data'],
    form: ['表单', '录入', '查询', '登记', '控件', '绑定', 'form'],
    workflow: ['工作流', '流程', '节点', '连线', 'workflow'],
    behavior: ['规则', '行为', '联动', 'DSL', 'rule', 'behavior'],
    quality: ['测试', '回归', '质量', '校验', '验证', 'test', 'quality'],
    delivery: ['输出', '发布', '交付', '导出', 'delivery', 'release'],
  };
  return bundle.scopes
    .map((scope) => {
      const kwScore = (keywords[scope.role] || []).reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
      let extra = 0;
      // 跨表状态联动（如借出/归还更新设备状态）必须用 workflow：目标含「规则/行为」+「数据表/状态/更新」时同时提升 behavior 与 workflow。
      if (/规则|行为|联动/.test(text) && /数据表|数据源|状态|跨表|更新.*表|另一张表/.test(text)) {
        if (scope.role === 'behavior' || scope.role === 'workflow') extra = 4;
      }
      return { role: scope.role, score: kwScore * 2 + (recent.get(scope.role) || 0) + extra };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.role);
}

/** PromptAssembler（FormFlow 实现）：构建分区后交给通用组装器。 */
function assemblePrompt(thread: AgentThread, bundle: CapabilityBundleVersion): string {
  const catalog = skillCatalog(bundle);
  const catalogText = catalog.map((item) => `- ${item.role}（${item.name}）：${item.description}\n  工具：${item.tools.map((toolName) => {
    const def = getFormFlowTool(toolName);
    const first = def?.examples?.[0];
    const returns = first?.success !== undefined ? `返回 ${JSON.stringify(first.success)}` : '';
    const errors = first?.errors?.length ? `错误 ${first.errors.map((item) => `\`${item.code}\``).join('/')}` : '';
    return `\`${toolName}\`${returns || errors ? `（${[returns, errors].filter(Boolean).join('；')}）` : ''}`;
  }).join('、') || '（无）'}`).join('\n');
  const ranked = rankScopes(thread, bundle).slice(0, 2);
  const skillDocs = ranked.map((role) => {
    const config = bundle.scopes.find((item) => item.role === role);
    return config ? `## ${role} 领域 skill\n${skillDocument(config, bundle)}` : '';
  }).filter(Boolean).join('\n\n');
  const plan = thread.dynamicPlan;
  const observations = recentObservations(thread.events, 12);
  const recentDecisionProblems = thread.events
    .slice(-10)
    .filter((event) => event.type === 'decision_failed' && event.data?.error)
    .map((event) => String(event.data?.error).slice(0, 120));
  const recentMessages = thread.messages.slice(-4).map((item) => `${item.role === 'user' ? '用户' : '智能体'}（${item.kind}）：${item.content.slice(0, 600)}`).join('\n');
  const contract = thread.context || structuredThreadContext(thread);
  return assemblePromptSections([
    `你是 FormFlow 项目智能体。当前线程：${thread.title}（${thread.id}）`,
    plan ? `目标：${plan.goal}` : '目标：尚未初始化（先完成 grounding 与动态计划）',
    `成功标准：${plan?.successCriteria.join('；') || '（无）'}`,
    `项目范围：${thread.projectIds.join('、') || '未绑定（新项目）'}`,
    '',
    ...thread.projectIds.flatMap((projectId) => {
      const snapshot = thread.projectSnapshots?.[projectId];
      if (!snapshot) return [];
      return [`项目现状快照（${projectId}，捕获于 ${new Date(snapshot.capturedAt).toLocaleTimeString('zh-CN')}，写操作后自动刷新）：\n${snapshotText(snapshot.summary)}`];
    }),
    '',
    '执行规则（单循环动态执行，没有预制任务清单）：',
    '- 1) action 枚举只能是 act / complete / ask_user；batchReads 是 act 的字段（数组），绝对不能把 batchReads 当作 action 值。action=act 时要么选一个工具（toolName+arguments），要么用 batchReads 并行最多 3 个只读工具；两者不能同时出现。',
    '- 2) 现状优先但有限：写操作前最多做 1 次现状读取即可动手；连续 5 次只读而没有任何成功写/验证会被拦截（测试/校验/预检类只读除外）。',
    '- 3) 参数必须完整：调用工具时给出 schema 要求的全部必填参数；不确定参数时只读一次对应 list/get 工具。',
    '- 4) 禁止编造：不要编造不存在的 ID、字段名、数据行或成功结果；业务数据必须来自真实读取或用户要求。',
    '- 5) 完整工具结果超长时会存入 artifact，观察里会出现 artifact id；需要时调用 context.read_artifact（arguments: { artifactId, offset?, limit? }）回读。',
    '- 6) 计划是展示用的：用 harness 工具 plan.update（arguments 可含 goal/successCriteria/summary/steps/assumptions/risks，任选）随时更新动态计划，系统会发 plan.updated 事件；不要用 plan.update 之外的方式声称完成。',
    '- 7) 写工具前系统自动刷新 revision 并填入 baseRevision；删除/覆盖等破坏性操作返回 confirmation_required 并等待用户确认，这是正常流程，不要重试或绕过。',
    '- 8) 永远不要调用 release.apply；发布只做到 delivery 领域的 release.preview。',
    '- 9) 当你认为目标已完成：action=complete 并给出 finalAnswer；系统会执行自审、结构校验、形式化验证、回归测试与发布预检，通过后才算完成。',
    '- 10) 只有遇到真正需要用户偏好/业务事实才能决定的问题才用 ask_user；连续无进展会自动纠正后继续，同类问题重复到阈值才会停下问你。',
    `- 自动恢复预算：${bundle.budget.maxRecoveryCycles} 次（瞬时重试/冲突重算/门禁修复都会消耗），预算用尽后系统会暂停请你决策。`,
    '',
    '领域 skill 目录：',
    catalogText,
    '',
    '通用智能体循环 skill：',
    generalLoopSkill(),
    '',
    '当前注入的领域 skill：',
    skillDocs || '（暂无匹配的领域 skill，按需读取目录后自行决定作用域）',
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
    '动态计划（展示用，可用 plan.update 更新）：',
    plan ? `- 目标：${plan.goal}\n- 步骤：${plan.steps.join('；') || '（无）'}\n- 更新时间：${plan.updatedAt}` : '（未初始化）',
    '',
    `线程摘要：${thread.summary || '（暂无）'}`,
  ]);
}

/** ModelProvider（FormFlow 实现）：结构化决策调用。 */
async function decideNext(thread: AgentThread, run: RunContext, bundle: CapabilityBundleVersion, events: HarnessComponents['events']): Promise<LoopDecision> {
  const startedAt = Date.now();
  events.emit(thread, 'model.started', { purpose: 'decision', requestId: run.requestId });
  let response;
  try {
    response = await chat(thread, run, {
      messages: [
        { role: 'system', content: assemblePrompt(thread, bundle) },
        { role: 'user', content: '请根据当前状态输出下一步决策（结构化）。' },
      ],
      responseSchema: DECISION_SCHEMA,
      temperature: 0.2,
      purpose: 'decision',
    });
  } catch (error) {
    events.emit(thread, 'model.failed', { purpose: 'decision', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  events.emit(thread, 'model.completed', { purpose: 'decision', durationMs: Date.now() - startedAt, usage: response.usage || {} });
  events.bumpMetric(thread, {
    modelCalls: 1,
    tokenUsage: {
      prompt: Number(response.usage?.prompt_tokens || response.usage?.promptTokens || 0),
      completion: Number(response.usage?.completion_tokens || response.usage?.completionTokens || 0),
    },
  });
  const decision = response.structured as LoopDecision | undefined;
  if (!decision || !['act', 'complete', 'ask_user'].includes(decision.action)) throw new Error('决策响应缺少有效 action');
  if (decision.action === 'act' && !decision.toolName && !(decision.batchReads && decision.batchReads.length)) throw new Error('act 决策缺少 toolName/arguments 或 batchReads');
  if (decision.action === 'act' && decision.batchReads && decision.batchReads.length > MAX_BATCH_READS) throw new Error(`批量只读最多 ${MAX_BATCH_READS} 个`);
  return decision;
}

/** 工具网关：executeLlmTool 适配为 HarnessToolResult。 */
const gateway: ToolGateway = {
  async execute(toolName, args, context) {
    const result = await executeLlmTool(toolName, args, context as any);
    return {
      ok: result.ok,
      data: (result as any).data,
      meta: result.meta,
      error: 'error' in result ? result.error : undefined,
      status: 'status' in result ? result.status : undefined,
      confirmation: 'confirmation' in result ? result.confirmation : undefined,
    } as HarnessToolResult;
  },
};

function observe(call: Pick<LoopDecision, 'toolName' | 'scope' | 'arguments'>, result: HarnessToolResult): LoopObservation {
  return observeToolResult(call, result as any);
}

/** ToolExecutor（FormFlow 实现）：plan.update + 参数解析 + 策略 + 执行 + 记录。 */
export async function executeAction(
  thread: AgentThread,
  run: RunContext,
  decision: LoopDecision,
  bundle: CapabilityBundleVersion,
  events: HarnessComponents['events'],
): Promise<'succeeded' | 'failed' | 'waiting' | 'refreshed'> {
  if (isReleaseApply(decision.toolName || '')) throw new Error('release.apply 永远不可调用');

  // lint-then-write 兜底：模型连续 lint 同一表单同一代码 ≥3 次仍不写，视为 lint 通过后应立即写入。
  if (decision.toolName === 'rule_syntax.lint' && decision.arguments?.formId && decision.arguments?.code) {
    const formId = String(decision.arguments.formId);
    const code = String(decision.arguments.code);
    let consecutiveLint = 0;
    for (const event of [...thread.events].reverse()) {
      if (event.type === 'tool_observation' && event.data?.status === 'succeeded' && (event.data?.changes || []).length > 0) break;
      if (event.type === 'tool_call' && event.data?.toolName === 'rule_syntax.lint') {
        const callArgs = event.data?.arguments || {};
        if (String(callArgs.formId || '') === formId && String(callArgs.code || '') === code) consecutiveLint += 1;
        else break;
      }
      if (consecutiveLint >= 2) break;
    }
    if (consecutiveLint >= 2) {
      const projectId = policyToolProjectId(decision.arguments || {}) || thread.currentProjectId;
      if (projectId && thread.projectRevisions[projectId]) {
        const update = await gateway.execute('rule_code.update', {
          projectId,
          formId,
          code,
          baseRevision: thread.projectRevisions[projectId],
          idempotencyKey: stableIdempotencyKey(thread.id, `lint-write:${formId}`, 1, 'rule_code.update', { projectId, formId, code }),
        }, toolContext(thread, run, 'behavior', projectId));
        if (update.ok) {
          if (update.meta?.revision) thread.projectRevisions[projectId] = update.meta.revision;
          events.emit(thread, 'tool_call', { toolName: 'rule_code.update', scope: 'behavior', arguments: { projectId, formId, code } });
          events.observe(thread, {
            toolName: 'rule_code.update',
            scope: 'behavior',
            status: 'succeeded',
            summary: '规则 lint 已通过且重复校验，由系统自动写入（rule_code.update）。本任务已完成，请用 action=complete 结束本任务。',
            changes: [`写入表单规则：${code.slice(0, 80)}`],
            evidence: ['auto_repair'],
            unresolved: [],
          });
          events.bumpMetric(thread, { toolCalls: 1 });
          storeEventEmitter().emit(thread, 'auto_repair', { toolName: 'rule_code.update', formId, code, reason: 'lint_without_write' });
          return 'succeeded';
        }
      }
    }
  }

  if (decision.toolName === 'batchReads' || decision.toolName === 'batch_reads') {
    events.observe(thread, {
      toolName: decision.toolName,
      scope: decision.scope,
      status: 'failed',
      summary: 'batchReads 是决策字段，不是工具名：请在 action=act 的 batchReads 数组里填真实只读工具（如 project.get/project.validate），或直接调用单个 toolName。',
      changes: [],
      evidence: [],
      unresolved: ['使用真实工具名'],
      error: { category: 'invalid_arguments', message: 'batchReads 不是工具名', retryable: true },
    });
    events.bumpMetric(thread, { invalidToolCalls: 1 });
    return 'failed';
  }

  if (decision.toolName === 'plan.update') {
    try {
      applyDynamicPlanUpdate(thread, decision.arguments || {}, 'model');
      events.observe(thread, {
        toolName: 'plan.update',
        scope: 'project',
        status: 'succeeded',
        summary: `动态计划已更新（目标「${thread.dynamicPlan?.goal || ''}」，步骤 ${thread.dynamicPlan?.steps.length || 0} 条）。`,
        changes: ['动态计划已更新'],
        evidence: [],
        unresolved: [],
      });
      events.bumpMetric(thread, { toolCalls: 1 });
      return 'succeeded';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      events.observe(thread, {
        toolName: 'plan.update',
        scope: 'project',
        status: 'failed',
        summary: `动态计划更新失败：${message}`,
        changes: [],
        evidence: [],
        unresolved: [message],
        error: { category: 'invalid_arguments', message, retryable: true },
      });
      events.bumpMetric(thread, { invalidToolCalls: 1 });
      return 'failed';
    }
  }

  const scope = resolveScope(decision, bundle);
  let args = { ...(decision.arguments || {}) };
  // project.create/initialize 缺 id 时注入确定性兜底 id（模型可从 argument_resolved 事件看到实际值）。
  if (/^project\.(create|initialize)$/.test(decision.toolName || '') && !('id' in args)) {
    const instruction = thread.dynamicPlan?.goal || thread.messages.find((message) => message.role === 'user')?.content || '';
    const candidates = [...instruction.matchAll(/[a-z][a-z0-9_]{3,}/g)].map((match) => match[0]);
    const fallback = candidates.find((id) => /project|device|loan|borrow|track|manage|mgmt|demo|form/.test(id)) || `project_${thread.id.slice(-8)}`;
    args.id = fallback;
    events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: fallback, source: 'fallback' });
  }
  const projectId = policyToolProjectId(args) || thread.currentProjectId;
  const write = isWriteTool(decision.toolName!);
  const createsProject = projectToolCreatesProject(decision.toolName!);

  if (write && !createsProject && projectId) {
    const revision = thread.projectRevisions[projectId] || 'none';
    const key = `w:${projectId}:${revision}`;
    if (!(thread.checkpointRefs || []).includes(key)) {
      const path = createProjectCheckpoint(thread.id, projectId, `w_${revision.replace(/[^\w.-]/g, '_')}`, 1);
      if (path) {
        thread.checkpointRefs ||= [];
        thread.checkpointRefs.push(key);
        events.emit(thread, 'checkpoint.created', { path, projectId, reason: 'before_write' });
      }
    }
  }

  const toolDefinition = getFormFlowTool(decision.toolName!);
  const acceptsProjectId = Boolean((toolDefinition?.inputSchema as any)?.properties?.projectId);
  if (acceptsProjectId && !createsProject && projectId && !('projectId' in args)) args = { projectId, ...args };

  if (decision.toolName === 'form.generate_from_table' && !('sheetName' in args) && args.tableId && projectId) {
    const source = await executeLlmTool('data_source.get', { projectId, id: String(args.tableId) }, toolContext(thread, run, 'data', projectId) as any);
    const sheets = (source as any)?.ok ? (source as any).data?.sheets || [] : [];
    if (sheets[0]?.name) {
      args.sheetName = sheets[0].name;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'sheetName', value: sheets[0].name });
    }
  }

  // 模型常把 create/edit/detail/lookup-edit 当作 templateId 传：自动归一化为 mode。
  if (decision.toolName === 'form.generate_from_table' && args.templateId && ['create', 'edit', 'detail', 'lookup-edit'].includes(String(args.templateId))) {
    args.mode = args.mode || args.templateId;
    delete args.templateId;
    events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'templateId', resolved: `作为 mode=${args.mode} 处理` });
  }

  const formToolNeedsId = /^form\.(get|update|preview|delete|generate_from_table|state\.read)$/.test(decision.toolName || '');
  if (formToolNeedsId && !('id' in args) && projectId) {
    if (decision.toolName === 'form.generate_from_table') {
      const instruction = thread.dynamicPlan?.goal || thread.messages.find((message) => message.role === 'user')?.content || '';
      const formIds = [
        ...[...instruction.matchAll(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
        ...[...instruction.matchAll(/id\s*(?:为|是|:)\s*[`'"“]?([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
      ];
      const fallback = `${String(args.tableId || 'form').replace(/[^a-zA-Z0-9_-]/g, '_')}_edit`;
      args.id = formIds[0] || fallback;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: args.id, source: formIds[0] ? 'goal_instruction' : 'fallback' });
    } else {
      const list = await executeLlmTool('form.list', { projectId }, toolContext(thread, run, 'form', projectId) as any);
      const forms = list.ok ? ((list.data as any) || []) : [];
      if (forms.length === 1) {
        args.id = forms[0].id;
        events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: forms[0].id });
      } else if (forms.length > 1) {
        // 多表单：从目标/提示词中解析表单 id 并匹配真实表单，避免模型反复因缺 id 失败。
        const instruction = thread.dynamicPlan?.goal || thread.messages.find((message) => message.role === 'user')?.content || '';
        const tokens = new Set([...instruction.matchAll(/[a-z][a-z0-9_]{2,}/g)].map((match) => match[0]));
        const target = forms.find((form: any) => tokens.has(String(form.id)));
        if (target) {
          args.id = target.id;
          events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: target.id, source: 'goal_form_id' });
        }
      }
    }
  }

  if (decision.toolName === 'rule_code.update' && !('formId' in args) && projectId) {
    const list = await executeLlmTool('form.list', { projectId }, toolContext(thread, run, 'form', projectId) as any);
    const forms = list.ok ? ((list.data as any) || []) : [];
    if (forms.length === 1) {
      args.formId = forms[0].id;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'formId', value: forms[0].id });
    }
  }

  // 建表工具缺 id 时，从目标中解析候选表 id；若项目尚无该表则自动注入（避免模型反复因缺 id 失败）。
  if (/^data_source\.create$|^data_table\.create$/.test(decision.toolName || '') && !('id' in args) && projectId) {
    const instruction = thread.dynamicPlan?.goal || thread.messages.find((message) => message.role === 'user')?.content || '';
    const candidates = [
      ...[...instruction.matchAll(/(?:数据表|数据源|表)\s*[：: ]+([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
      ...[...instruction.matchAll(/名为\s*[`'"“]?([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
    ];
    const existing = await executeLlmTool('data_source.list', { projectId }, toolContext(thread, run, 'data', projectId) as any);
    const existingIds = new Set((existing.ok ? (existing.data as any[] || []) : []).map((table: any) => table.id));
    const target = candidates.find((id) => !existingIds.has(id));
    if (target) {
      args.id = target;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: target, source: 'goal_instruction' });
    }
  }

  const workflowToolNeedsId = /^workflow\.(get|validate|update|delete)$/.test(decision.toolName || '');
  if (workflowToolNeedsId && !('id' in args) && projectId) {
    const list = await executeLlmTool('workflow.list', { projectId }, toolContext(thread, run, 'workflow', projectId) as any);
    const workflows = list.ok ? ((list.data as any) || []) : [];
    if (workflows.length === 1) {
      args.id = workflows[0].id;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'id', value: workflows[0].id });
    }
  }

  if (/^mock_data\./.test(decision.toolName || '') && !('tableId' in args) && projectId) {
    const list = await executeLlmTool('data_source.list', { projectId }, toolContext(thread, run, 'data', projectId) as any);
    const tables = list.ok ? ((list.data as any) || []) : [];
    const editable = tables.filter((table: any) => (table.sheets || []).some((sheet: any) => sheet.config?.readOnly !== true));
    const instruction = thread.dynamicPlan?.goal || '';
    const mentioned = editable.filter((table: any) => {
      const names = [table.id, table.name, ...(table.sheets || []).map((sheet: any) => sheet.name)].filter(Boolean);
      return names.some((name: string) => instruction.includes(String(name)));
    });
    const target = mentioned.length ? mentioned[mentioned.length - 1] : editable[editable.length - 1] || tables[0];
    if (target) {
      args.tableId = target.id;
      if (!('sheetName' in args) && target.sheets?.[0]?.name) args.sheetName = target.sheets[0].name;
      events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'tableId', value: target.id });
    }
  }

  if (decision.toolName === 'behavior.upsert' && !('scope' in args)) {
    const instruction = thread.dynamicPlan?.goal || thread.messages.find((message) => message.role === 'user')?.content || '';
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
    events.emit(thread, 'argument_resolved', { toolName: decision.toolName, key: 'scope', value: args.scope });
  }

  if (/^workflow\.(create|update)$/.test(decision.toolName || '') && args.item?.nodes && args.item?.edges && projectId) {
    const catalog = await executeLlmTool('catalog.workflow_nodes.list', {}, toolContext(thread, run, 'workflow', projectId) as any);
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
    events.emit(thread, 'workflow_handles_resolved', { edges: (args.item.edges as any[]).map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`) });
  }

  if (write && !createsProject && projectId && !thread.projectRevisions[projectId]) {
    await refreshRevision(thread, run, projectId);
  }

  const policy = evaluateToolPolicy(decision.toolName!, thread.dynamicPlan?.goal || '');
  if (policy.level === 'forbidden') {
    events.observe(thread, {
      toolName: decision.toolName,
      scope,
      status: 'failed',
      summary: policy.userMessage,
      changes: [],
      evidence: [],
      unresolved: [policy.userMessage],
      error: { category: 'permission', message: policy.userMessage, retryable: false },
    });
    events.emit(thread, 'operation_blocked', { toolName: decision.toolName, reason: policy.reason, summary: policy.userMessage });
    thread.status = 'paused';
    events.message(thread, 'assistant', 'question', policy.userMessage, thread.turnId);
    events.save(thread);
    return 'failed';
  }

  if (write && !createsProject && projectId) args.baseRevision = thread.projectRevisions[projectId] || args.baseRevision;
  if (write) args = normalizeWriteArguments(thread.id, decision.toolName!, args);

  const inputSchema = (toolDefinition?.inputSchema || {}) as any;
  if (inputSchema.additionalProperties === false && inputSchema.properties && typeof inputSchema.properties === 'object') {
    args = Object.fromEntries(Object.entries(args).filter(([key]) => key in inputSchema.properties));
  }

  const result = await gateway.execute(decision.toolName!, args, toolContext(thread, run, scope, projectId));
  events.emit(thread, 'tool_call', {
    toolName: decision.toolName,
    scope,
    arguments: Object.fromEntries(Object.entries(args).filter(([key]) => !['idempotencyKey', 'confirmationToken', 'baseRevision'].includes(key))),
  });
  return recordToolResult(thread, run, decision, scope, result, args, events);
}

/** 记录工具结果：观察、事件、revision 与快照。 */
export async function recordToolResult(
  thread: AgentThread,
  run: RunContext,
  decision: Pick<LoopDecision, 'toolName' | 'scope' | 'arguments'>,
  scope: McpRole,
  result: HarnessToolResult,
  effectiveArguments?: Record<string, any>,
  events: HarnessComponents['events'] = storeEventEmitter(),
): Promise<'succeeded' | 'failed' | 'waiting' | 'refreshed'> {
  const projectId = policyToolProjectId(decision.arguments || {}) || thread.currentProjectId;
  const errorValue = result.error;
  const isCreateTool = /(^|\.)(create|initialize|import|build_from_data|generate_from_table)$/.test(decision.toolName || '');
  if (isCreateTool && errorValue && /已存在|EXISTS/.test(errorValue.message)) {
    events.observe(thread, {
      toolName: decision.toolName,
      scope,
      status: 'succeeded',
      summary: `目标资源已存在，视为创建成功，无需重复创建（${errorValue.message}）。`,
      changes: ['资源已存在，跳过重复创建'],
      evidence: [errorValue.message],
      unresolved: [],
    });
    events.bumpMetric(thread, { toolCalls: 1 });
    events.emit(thread, 'tool.activity', { toolName: decision.toolName, status: 'succeeded', reason: 'resource_already_exists' });
    return 'succeeded';
  }

  const observation = observe(decision, result);
  if (!result.ok && result.error) {
    const toolName = String(decision.toolName || '');
    const failureText = `${result.error.message} ${result.error.details ? JSON.stringify(result.error.details) : ''}`;
    const hints: Array<[RegExp, RegExp, string]> = [
      [/data_(table|source)\.create|data_source\.import/, /类型不正确|rows|列|缺少参数|主键不能为空/, 'data_table.create 必填 id（如 device_ledger）+ projectId；rows 必须是业务记录数组且每行必须包含主键列（如 编号）的真实值；字段定义放 columns、主键放 keyFields。'],
      [/^project\.(create|initialize|build_from_data|import)$/, /缺少参数/, 'project.create 需要 id（新项目 ID，如 device_borrow_tracking）+ name（+ description/tags）；id 必须匹配 [A-Za-z0-9_-]+。'],
      [/form\.generate_from_table/, /模板.*不存在|templateId/, 'templateId 必须是 catalog.form_templates.list 返回的真实模板 id（空白/基础录入/查询修改/主从详情）；不确定时不要传 templateId，改用 mode 参数。'],
      [/data_rows\.batch|data_rows\.transaction/, /至少需要一项|空/, 'data_rows.batch 的 adds 每项为 { rowKey: "key:<主键值>", changes: {列名: 值} }；先 data_rows.query 或 data_sheet.get 读取真实主键与列名。'],
      [/form_component\.upsert|form\.create|form\.update/, /缺少参数|props|events|BUTTON_WITHOUT_BUSINESS_EFFECT|flowTriggers/, '按钮动作二选一：props.events 非空脚本，或 props.flowTriggers 对象 { 事件名: { enabled: true, workflowId: "<真实 workflow id>" } }（不是数组；workflowId 必须已创建）。form_component.upsert 需要 item（含 id/type/x/y/width/height）与 props。'],
      [/behavior\.upsert/, /缺少参数|behavior/, 'behavior.upsert 需要 behavior 结构化对象（{ id, name, trigger: {type:"submit"}, conditions: [], actions: [...] }）+ scope（form 需 formId，sheet 需 tableId+sheetName）；跨表联动请改用 workflow（behavior:submit writeBack*）。'],
      [/^workflow\.(create|update)$/, /端口|不存在/, 'workflow 节点必须用真实 specId（workflow:import / behavior:submit / workflow:export）；先 catalog.workflow_nodes.list 查节点与端口，连线必须用真实端口（如 out:formData/in:formData、out:writeBack/in:writeBack）；behavior:submit 的 writeBack* 参数见 workflow skill 配方。'],
      [/rule_code\.update/, /语法|引用|校验/, '若规则试图跨表更新（如借出/归还联动设备状态），表单规则无法实现，请改用 workflow 领域创建「提交触发器 → 数据写回」流程；若为单表单字段规则，先 form.get 核对真实字段名再写。'],
    ];
    const hint = hints.find(([toolRe, errorRe]) => toolRe.test(toolName) && errorRe.test(failureText));
    if (hint) {
      observation.unresolved.push(hint[2]);
      observation.error = { category: 'validation', message: result.error.message, retryable: true, suggestion: hint[2] };
    }
  }
  if (result.ok && result.data != null && JSON.stringify(result.data).length > 1200) {
    const meta = await storeAgentArtifact(thread.id, 'tool_result', result.data, observation.summary);
    events.emit(thread, 'artifact.stored', { artifactId: meta.id, kind: meta.kind, size: meta.size, summary: meta.summary });
    observation.evidence.push(`完整结果已存 artifact：${meta.id}（${meta.size} 字符），可用 context.read_artifact 回读`);
  }
  events.observe(thread, observation);
  events.bumpMetric(thread, { toolCalls: 1 });

  if (result.ok) {
    const createdProjectId = projectToolCreatesProject(decision.toolName || '')
      ? String((result.data as any)?.project?.config?.id || (result.data as any)?.config?.id || (result.data as any)?.id || '')
      : '';
    if (createdProjectId) {
      if (!thread.projectIds.includes(createdProjectId)) thread.projectIds.push(createdProjectId);
      thread.currentProjectId ||= createdProjectId;
      if (result.meta?.revision) thread.projectRevisions[createdProjectId] = result.meta.revision;
      events.emit(thread, 'thread_project_bound', { projectId: createdProjectId });
    }
    if (projectId && result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
    if (projectId) await refreshProjectSnapshot(thread, run, projectId, scope);
    events.emit(thread, 'tool.activity', { toolName: decision.toolName, status: 'succeeded' });
    return 'succeeded';
  }

  if (result.status === 'confirmation_required') {
    events.bumpMetric(thread, { approvals: 1 });
    thread.pendingApproval = {
      id: `pao_${randomUUID()}`,
      toolName: decision.toolName!,
      turnId: thread.turnId || '',
      scope,
      arguments: effectiveArguments || decision.arguments || {},
      projectId,
      projectRevision: projectId ? thread.projectRevisions[projectId] : undefined,
      confirmation: result.confirmation!,
      createdAt: new Date().toISOString(),
    };
    thread.status = 'awaiting_operation_approval';
    events.emit(thread, 'approval_required', { approval: thread.pendingApproval, reason: 'destructive_operation' });
    events.save(thread);
    return 'waiting';
  }

  if (!result.error) {
    events.observe(thread, {
      toolName: decision.toolName,
      scope,
      status: 'failed',
      summary: '工具返回了无法识别的结果',
      changes: [],
      evidence: [],
      unresolved: ['工具返回了无法识别的结果'],
      error: { category: 'unknown', message: '工具返回了无法识别的结果', retryable: false },
    });
    events.bumpMetric(thread, { invalidToolCalls: 1 });
    return 'failed';
  }

  const error = result.error;
  const failureClass = classifyFailure(error.message, error.code);
  events.bumpMetric(thread, { invalidToolCalls: 1 });
  events.emit(thread, 'tool.failed', { toolName: decision.toolName, error: error.message, failureClass });
  if (error.code === 'PROJECT_REVISION_CONFLICT' && projectId) await refreshRevision(thread, run, projectId);
  return 'failed';
}

function lastFailureClass(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed' && event.data?.error?.category) return String(event.data.error.category);
    if (event.type === 'tool.failed' && event.data?.failureClass) return String(event.data.failureClass);
  }
  return 'unknown';
}

function lastFailureMessage(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed' && event.data?.summary) return String(event.data.summary);
    if (event.type === 'tool.failed' && event.data?.error) return String(event.data.error);
  }
  return '';
}

function classifyFailure(message: string, code?: string): string {
  if (code === 'PROJECT_REVISION_CONFLICT' || /REVISION_CONFLICT|revision 冲突|项目在.*更新/i.test(message)) return 'revision_conflict';
  if (/FORBIDDEN|无权|权限/.test(message)) return 'permission';
  if (/INVALID_ARGUMENT|REQUIRED_ARGUMENT|INVALID_ID|INVALID_.*|缺少|参数/.test(message)) return 'invalid_arguments';
  if (/VALIDATION|校验未通过|语法|结构问题/.test(message)) return 'validation';
  if (/不在.*作用域|白名单/.test(message)) return 'tool_scope';
  if (/无法连接|未运行|timeout|超时|暂不可用|暂时/.test(message)) return 'transient';
  if (/用户拒绝|用户明确/.test(message)) return 'user_rejected';
  return 'unknown';
}

function recoveryBudget(bundle: CapabilityBundleVersion) {
  return bundle.budget?.maxRecoveryCycles ?? 6;
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** RecoveryManager（FormFlow 实现）：瞬时/冲突自动恢复。 */
function createRecovery(execute: HarnessComponents['tools']['execute']): HarnessComponents['recovery'] {
  return {
    async executeWithRecovery(thread, run, decision, bundle) {
      let retries = 0;
      while (true) {
        const outcome = await execute(thread, run, decision, bundle);
        if (outcome !== 'failed') return outcome;
        const failureClass = lastFailureClass(thread);
        const eligible = failureClass === 'transient' || failureClass === 'revision_conflict';
        if (!eligible || retries >= MAX_AUTO_RECOVERY_RETRIES || thread.recoveryCycles >= recoveryBudget(bundle)) return outcome;
        if (failureClass === 'revision_conflict') {
          const projectId = policyToolProjectId(decision.arguments || {}) || thread.currentProjectId;
          if (projectId) await refreshRevision(thread, run, projectId);
        }
        retries += 1;
        thread.recoveryCycles += 1;
        storeEventEmitter().bumpMetric(thread, { retries: 1 });
        storeEventEmitter().emit(thread, 'recovery_retry', { toolName: decision.toolName, failureClass, retry: retries, recoveryCycles: thread.recoveryCycles });
        if (failureClass === 'transient') await sleepMs(300 * retries);
      }
    },
  };
}

/** ReadExecutor（FormFlow 实现）：批量只读 + artifact 回读。 */
function createReads(): HarnessComponents['reads'] {
  return {
    async batch(thread, run, decision, bundle) {
      const reads = (decision.batchReads || []).slice(0, MAX_BATCH_READS);
      const settled = await Promise.allSettled(reads.map(async (read) => {
        const toolName = String(read.toolName || '');
        const scope = resolveScope({ toolName, scope: read.scope, arguments: read.arguments } as LoopDecision, bundle);
        if (isWriteTool(toolName)) throw new Error(`${toolName} 不是只读工具，不能进入批量只读`);
        const projectId = policyToolProjectId(read.arguments || {}) || thread.currentProjectId;
        let args = { ...(read.arguments || {}) };
        const def = getFormFlowTool(toolName);
        const acceptsProjectId = Boolean((def?.inputSchema as any)?.properties?.projectId);
        if (acceptsProjectId && projectId && !('projectId' in args)) args = { projectId, ...args };
        const result = await gateway.execute(toolName, args, toolContext(thread, run, scope, projectId));
        const observation = observe({ toolName, scope, arguments: args }, result);
        if (result.ok && result.data != null && JSON.stringify(result.data).length > 1200) {
          const meta = await storeAgentArtifact(thread.id, 'tool_result', result.data, observation.summary);
          storeEventEmitter().emit(thread, 'artifact.stored', { artifactId: meta.id, kind: meta.kind, size: meta.size, summary: meta.summary });
          observation.evidence.push(`完整结果已存 artifact：${meta.id}（${meta.size} 字符），可用 context.read_artifact 回读`);
        }
        storeEventEmitter().observe(thread, observation);
        storeEventEmitter().emit(thread, 'tool_call', { toolName, scope, arguments: args });
        if (result.ok && result.meta?.revision && projectId) thread.projectRevisions[projectId] = result.meta.revision;
        return result.ok;
      }));
      let ok = 0;
      let failed = 0;
      for (const item of settled) {
        if (item.status === 'fulfilled' && item.value) ok += 1;
        else failed += 1;
      }
      storeEventEmitter().bumpMetric(thread, { toolCalls: reads.length, invalidToolCalls: failed });
      storeEventEmitter().emit(thread, 'batch_reads_completed', { ok, failed, total: reads.length });
      return { ok, failed };
    },
    async readArtifact(thread, decision) {
      const artifactId = String(decision.arguments?.artifactId || '');
      const artifact = artifactId ? await readAgentArtifact(thread.id, artifactId) : null;
      if (!artifact) return null;
      const text = typeof artifact.payload === 'string' ? artifact.payload : JSON.stringify(artifact.payload);
      const offset = Math.max(0, Number(decision.arguments?.offset || 0));
      const limit = Math.min(8000, Math.max(1, Number(decision.arguments?.limit || 4000)));
      const window = text.slice(offset, offset + limit);
      return {
        toolName: 'context.read_artifact',
        scope: 'project',
        status: 'succeeded',
        summary: `artifact ${artifactId}（${artifact.meta.size} 字符）读取 [${offset}, ${offset + window.length})`,
        changes: [],
        evidence: [window],
        unresolved: [],
      };
    },
  };
}

/** VerificationEngine（FormFlow 实现）：写后验证 + 最终门禁 + 自审。 */
/** 确定性修复：结构校验报 CONTROL_TYPE_MISMATCH 时，把对应控件 type 改为期望类型。 */
async function repairControlTypeMismatch(thread: AgentThread, run: RunContext, projectId: string, errors: Array<{ code?: string; path?: string; message?: string }>): Promise<number> {
  let repaired = 0;
  for (const error of errors || []) {
    if (error.code !== 'CONTROL_TYPE_MISMATCH' || !String(error.path || '').startsWith('forms.')) continue;
    const parts = String(error.path).split('.');
    if (parts.length < 3) continue;
    const formId = parts[1];
    const componentId = parts[2];
    const message = String(error.message || '');
    let type = '';
    if (/日期时间/.test(message)) type = 'datePicker';
    else if (/上传/.test(message)) type = 'upload';
    else if (/number/.test(message)) type = 'number';
    if (!type) continue;
    const form = await executeLlmTool('form.get', { projectId, id: formId }, toolContext(thread, run, 'form', projectId) as any);
    if (!form.ok) continue;
    const component = ((form.data as any)?.design?.components || []).find((item: any) => item.id === componentId);
    if (!component || component.type === type) continue;
    const result = await executeLlmTool('form_component.upsert', {
      projectId,
      formId,
      baseRevision: thread.projectRevisions[projectId],
      idempotencyKey: stableIdempotencyKey(thread.id, `fix-control:${formId}:${componentId}:${type}`, 1, 'form_component.upsert', { projectId, formId, componentId, type }),
      item: { id: componentId, type },
    }, toolContext(thread, run, 'form', projectId) as any);
    if (result.ok) {
      if (result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
      repaired += 1;
      storeEventEmitter().emit(thread, 'auto_repair', { toolName: 'form_component.upsert', formId, componentId, type, reason: 'CONTROL_TYPE_MISMATCH' });
    }
  }
  return repaired;
}

/** 确定性兜底：目标要求跨表联动但项目无任何有效工作流时，用 workflow.generate_from_table 自动生成写回工作流。 */
async function autoCreateLinkageWorkflow(thread: AgentThread, run: RunContext, projectId: string): Promise<boolean> {
  // 只在目标明确要求跨表联动/工作流时兜底；表单规则任务不得用工作流冒充。
  const goalText = `${thread.dynamicPlan?.goal || ''} ${thread.messages.find((message) => message.role === 'user')?.content || ''}`;
  if (!/跨表|联动|工作流|写回/.test(goalText)) return false;
  if ((thread.projectSnapshots?.[projectId]?.summary as any)?.workflows?.length) return false;
  const revision = thread.projectRevisions[projectId];
  if (!revision) return false;
  const project = await executeLlmTool('project.get', { projectId }, toolContext(thread, run, 'project', projectId) as any);
  if (!project.ok) return false;
  const payload = (project.data as any)?.project || (project.data as any);
  const tables = (payload?.srcTable || []);
  const candidate = tables.find((table: any) => (table.sheets || []).some((sheet: any) => (sheet.config?.keyFields || []).length > 0));
  if (!candidate) return false;
  const sheet = (candidate.sheets || []).find((item: any) => (item.config?.keyFields || []).length > 0);
  const id = `save_${candidate.id}`;
  const result = await executeLlmTool('workflow.generate_from_table', {
    projectId,
    tableId: candidate.id,
    sheetName: sheet?.name,
    id,
    name: `保存${sheet?.name || candidate.id}`,
    baseRevision: revision,
    idempotencyKey: stableIdempotencyKey(thread.id, `auto-linkage:${candidate.id}`, 1, 'workflow.generate_from_table', { projectId, tableId: candidate.id, id }),
  }, toolContext(thread, run, 'workflow', projectId) as any);
  if (result.ok) {
    if (result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
    storeEventEmitter().emit(thread, 'auto_repair', { toolName: 'workflow.generate_from_table', id, reason: 'linkage_workflow_missing' });
    return true;
  }
  return false;
}

/** 确定性兜底：门禁报「表单规则」缺失时，按提示词解析必填字段并写入标准提交前校验规则。 */
async function autoCreateFormRule(thread: AgentThread, run: RunContext, projectId: string): Promise<boolean> {
  // 只从用户原始提示词解析必填字段，避免模型自写的目标文案干扰。
  const userPrompt = thread.messages.find((message) => message.role === 'user' && message.kind === 'prompt')?.content || '';
  const match = userPrompt.match(/提交前校验\s*(.+?)\s*必填/);
  if (!match) return false;
  const fields = match[1].split(/[与和、，,]/)
    .map((item) => item.trim().replace(/^\$/, '').replace(/[。；;）)】」』]/g, ''))
    .filter((item) => /^[\u4e00-\u9fa5]{2,6}$/.test(item));
  if (!fields.length) return false;
  const revision = thread.projectRevisions[projectId];
  if (!revision) return false;
  const project = await executeLlmTool('project.get', { projectId }, toolContext(thread, run, 'project', projectId) as any);
  if (!project.ok) return false;
  const payload = (project.data as any)?.project || (project.data as any);
  const forms = (payload?.forms || []);
  const isInputLike = (form: any) => /录入|登记|员工|employee|emp|input|create/.test(String(form.id + form.name));
  const candidates = [
    ...forms.filter((form: any) => String(form.design?.formMode || '') === 'create' && isInputLike(form)),
    ...forms.filter((form: any) => String(form.design?.formMode || '') === 'create'),
    ...forms.filter((form: any) => isInputLike(form)),
    ...forms,
  ];
  // 优先选择真实包含必填字段的表单，避免把规则写到无关表单。
  let target: any;
  for (const candidate of candidates) {
    const detail = await executeLlmTool('form.get', { projectId, id: candidate.id }, toolContext(thread, run, 'form', projectId) as any);
    const bindings = detail.ok ? ((detail.data as any)?.design?.components || []).map((component: any) => component.fieldBinding) : [];
    if (fields.every((field) => bindings.includes(field))) { target = candidate; break; }
  }
  if (!target) return false;
  const code = `before submit -> require(${fields.map((field) => `$${field}`).join(', ')})`;
  const lint = await executeLlmTool('rule_syntax.lint', { projectId, formId: target.id, code }, toolContext(thread, run, 'behavior', projectId) as any);
  if (!lint.ok) return false;
  const result = await executeLlmTool('rule_code.update', {
    projectId,
    formId: target.id,
    code,
    baseRevision: revision,
    idempotencyKey: stableIdempotencyKey(thread.id, `auto-rule:${target.id}`, 1, 'rule_code.update', { projectId, formId: target.id, code }),
  }, toolContext(thread, run, 'behavior', projectId) as any);
  if (result.ok) {
    if (result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
    storeEventEmitter().emit(thread, 'auto_repair', { toolName: 'rule_code.update', formId: target.id, code, reason: 'form_rule_missing' });
    return true;
  }
  return false;
}

async function verifyWriteAfterTool(thread: AgentThread, run: RunContext, scope: McpRole, projectId: string, events: HarnessComponents['events']) {
  events.emit(thread, 'verification.started', { projectId, kind: 'write', toolScope: scope });
  try {
    const evidenceList = await verifyProjectAfterWrite(thread, run, projectId, scope);
    events.emit(thread, 'verification.completed', { projectId, kind: 'write', summary: evidenceList.map((item) => item.summary).join('；') || '写后校验通过', evidenceKinds: evidenceList.map((item) => item.kind) });
    events.observe(thread, {
      toolName: 'verify.write',
      scope: 'project',
      status: 'succeeded',
      summary: `写后校验通过：${evidenceList.map((item) => item.summary).join('；')}`,
      changes: [],
      evidence: evidenceList.map((item) => item.summary),
      unresolved: [],
    });
  } catch (error) {
    const details = error instanceof GateFailure ? (error.details as any)?.errors : undefined;
    const detailText = Array.isArray(details) ? ` 详情：${validationIssueText(details)}` : '';
    let message = (error instanceof GateFailure ? error.message : error instanceof Error ? error.message : String(error)) + detailText;
    let fixed = false;
    if (Array.isArray(details)) {
      const repaired = await repairControlTypeMismatch(thread, run, projectId, details);
      if (repaired > 0) {
        try {
          await verifyProjectAfterWrite(thread, run, projectId, scope);
          fixed = true;
        } catch (secondError) {
          const secondDetails = secondError instanceof GateFailure ? (secondError.details as any)?.errors : undefined;
          message = (secondError instanceof GateFailure ? secondError.message : secondError instanceof Error ? secondError.message : String(secondError))
            + (Array.isArray(secondDetails) ? ` 详情：${validationIssueText(secondDetails)}` : '');
        }
      }
    }
    if (fixed) {
      events.emit(thread, 'verification.completed', { projectId, kind: 'write', summary: '控件类型不匹配已自动修复，写后校验通过', autoRepair: true });
      events.observe(thread, {
        toolName: 'verify.write',
        scope: 'project',
        status: 'succeeded',
        summary: '写后校验通过（自动修复控件类型）',
        changes: ['自动修复控件类型'],
        evidence: ['auto_repair'],
        unresolved: [],
      });
    } else {
      events.emit(thread, 'verification.failed', { projectId, kind: 'write', summary: message });
      events.observe(thread, {
        toolName: 'verify.write',
        scope: 'project',
        status: 'failed',
        summary: `写后校验未通过：${message}`,
        changes: [],
        evidence: [],
        unresolved: [message],
        error: { category: 'validation', message, retryable: true },
      });
    }
  }
}

async function defaultSelfReview(thread: AgentThread, run: RunContext, events: HarnessComponents['events']): Promise<{ issues: string[] }> {
  const plan = thread.dynamicPlan;
  const changes = thread.events
    .filter((event) => event.type === 'tool_observation' && event.data?.status === 'succeeded')
    .slice(-20)
    .map((event) => `- ${String(event.data?.toolName || '工具')}：${String(event.data?.summary || '')}`)
    .join('\n');
  const response = await chat(thread, run, {
    messages: [
      { role: 'system', content: '你是 FormFlow 项目智能体的交付自审员。对照目标与成功标准审查已完成变更，只输出结构化结果：issues 数组（无问题时为空数组）。' },
      { role: 'user', content: `目标：${plan?.goal || '（无）'}\n成功标准：${plan?.successCriteria.join('；') || '（无）'}\n已完成变更：\n${changes || '（无）'}` },
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
  events.bumpMetric(thread, {
    modelCalls: 1,
    tokenUsage: {
      prompt: Number(response.usage?.prompt_tokens || response.usage?.promptTokens || 0),
      completion: Number(response.usage?.completion_tokens || response.usage?.completionTokens || 0),
    },
  });
  const structured = response.structured as { issues?: string[] } | undefined;
  return { issues: (structured?.issues || []).map(String).filter(Boolean).slice(0, 5) };
}

/** 组装 FormFlow HarnessComponents。 */
export function formFlowHarness(): HarnessComponents {
  const events = storeEventEmitter();
  const tools: HarnessComponents['tools'] = {
    execute: (thread, run, decision, bundle) => executeAction(thread, run, decision, bundle, events),
  };
  return {
    prompt: { assemble: assemblePrompt },
    model: {
      decide: (thread, run, bundle) => decideNext(thread, run, bundle, events),
    },
    tools,
    reads: createReads(),
    permissions: {
      evaluate: (toolName, goalText) => {
        const decision = evaluateToolPolicy(toolName, goalText);
        return { level: decision.level, reason: decision.reason, userMessage: decision.userMessage };
      },
    },
    verification: {
      afterWrite: (thread, run, scope, projectId) => verifyWriteAfterTool(thread, run, scope, projectId, events),
      final: async (thread, run) => {
        if (thread.completionGate === 'light') {
          return runLightFinalGates(thread, run);
        }
        let gate = await runFinalGates(thread, run);
        if (!gate.passed && /联动流程|行为规则/.test(gate.failures.join(''))) {
          const projectId = thread.currentProjectId;
          if (projectId && await autoCreateLinkageWorkflow(thread, run, projectId)) {
            gate = await runFinalGates(thread, run);
            if (gate.passed) {
              gate.evidence.push({ id: `aev_${randomUUID()}`, kind: 'requirement_coverage', summary: `联动流程已由系统自动生成（save_*）`, createdAt: new Date().toISOString() });
            }
          }
        }
        if (!gate.passed && /表单规则/.test(gate.failures.join(''))) {
          const projectId = thread.currentProjectId;
          if (projectId && await autoCreateFormRule(thread, run, projectId)) {
            gate = await runFinalGates(thread, run);
            if (gate.passed) {
              gate.evidence.push({ id: `aev_${randomUUID()}`, kind: 'requirement_coverage', summary: `表单规则已由系统自动写入`, createdAt: new Date().toISOString() });
            }
          }
        }
        return gate;
      },
      selfReview: (thread, run) => defaultSelfReview(thread, run, events),
    },
    recovery: createRecovery(tools.execute),
    context: {
      compactIfNeeded: (thread, bundle, run) => maybeCompactContext(thread, bundle, run),
    },
    events,
    plan: {
      initialize: (thread, run) => initializeDynamicPlan(thread, run),
    },
    bundle: {
      get: (thread) => getCapabilityBundle(thread.capabilityBundleVersionId, thread.userId),
    },
    isWriteTool,
    isVerificationRead: (toolName) => VERIFICATION_READ_RE.test(toolName || ''),
    toolProjectId: (thread, call) => policyToolProjectId(call.arguments || {}) || thread.currentProjectId,
  };
}

export { classifyFailure, lastFailureClass, lastFailureMessage };
