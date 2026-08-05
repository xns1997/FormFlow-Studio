/**
 * Goal-contract planning: deterministic grounding, then one structured LLM
 * planning call producing the goal contract + ordered task checklist. Plans
 * always await user confirmation before execution.
 */
import { randomUUID } from 'node:crypto';
import { executeLlmTool } from '../services/llm-tools';
import { MCP_ROLES, type McpRole } from '../services/tool-shared';
import { chat } from './llm';
import { skillCatalog } from './skills';
import { getCapabilityBundle, threadProjectIds, addThreadMessage, appendAgentThreadEvent, saveAgentThread } from './store';
import type { AgentPlan, AgentTask, AgentThread, RunContext } from './types';

const MAX_TASKS = 40;
const MAX_INSTRUCTION_CHARS = 800;

export interface GroundingSummary {
  projects: Array<{ projectId: string; summary: string; validation: string }>;
  text: string;
}

async function inspectProject(run: RunContext, projectId: string) {
  const base = { tenantId: run.tenantId, projectId, userId: run.userId, user: run.user, requestId: run.requestId };
  const [inspect, validation] = await Promise.all([
    executeLlmTool('project.inspect', { projectId }, { ...base, mcpRole: 'project' as McpRole }),
    executeLlmTool('project.validate', { projectId }, { ...base, mcpRole: 'project' as McpRole }),
  ]);
  const inspectText = inspect.ok ? JSON.stringify(inspect.data).slice(0, 3000) : `读取失败：${'error' in inspect ? inspect.error?.message || '' : '需要确认'}`;
  const validationText = validation.ok
    ? (Array.isArray((validation.data as any)?.errors) && (validation.data as any).errors.length
      ? `结构校验未通过（${(validation.data as any).errors.length} 项问题）`
      : '结构校验通过')
    : `校验失败：${'error' in validation ? validation.error?.message || '' : '需要确认'}`;
  return { projectId, summary: inspectText, validation: validationText };
}

/**
 * 环境摸底：只读检查项目并生成目标契约（goal / successCriteria / 项目摘要）。
 */
export async function ground(thread: AgentThread, run: RunContext): Promise<GroundingSummary> {
  const projects = threadProjectIds(thread);
  const results: Array<{ projectId: string; summary: string; validation: string }> = [];
  for (let index = 0; index < projects.length; index += 4) {
    const batch = await Promise.all(projects.slice(index, index + 4).map((projectId) => inspectProject(run, projectId)));
    results.push(...batch);
  }
  const text = results.length
    ? results.map((item) => `项目 ${item.projectId}：${item.validation}\n摘要：${item.summary}`).join('\n\n')
    : '尚未绑定项目，本次需要从零创建项目。';
  appendAgentThreadEvent(thread, 'grounding_completed', { projects: results.map((item) => item.projectId), summaryChars: text.length });
  return { projects: results, text };
}

function plannerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'successCriteria', 'summary', 'assumptions', 'risks', 'tasks'],
    properties: {
      goal: { type: 'string' },
      successCriteria: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      assumptions: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_TASKS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'instruction', 'scope', 'access', 'acceptance'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            instruction: { type: 'string' },
            scope: { type: 'string', enum: [...MCP_ROLES] },
            access: { type: 'string', enum: ['read', 'write'] },
            projectId: { type: 'string' },
            acceptance: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
}

/** 校验任务清单结构（id/scope/access 合法、acceptance 非空），返回诊断文本。 */
export function validatePlanTasks(tasks: Array<{ id: string; title: string; instruction: string; scope: string; access: string; projectId?: string; acceptance: string[] }>) {
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) throw new Error('任务 ID 必须唯一');
  if (tasks.length > MAX_TASKS) throw new Error(`任务数量不能超过 ${MAX_TASKS}`);
  for (const task of tasks) {
    if (!task.id?.trim() || !task.title?.trim() || !task.instruction?.trim()) throw new Error('任务缺少 id/title/instruction');
    if (!MCP_ROLES.includes(task.scope as McpRole)) throw new Error(`任务 ${task.id} 的作用域无效：${task.scope}`);
    if (!['read', 'write'].includes(task.access)) throw new Error(`任务 ${task.id} 的访问类型无效`);
    if (task.instruction.length > MAX_INSTRUCTION_CHARS) throw new Error(`任务 ${task.id} 的指令超过 ${MAX_INSTRUCTION_CHARS} 字符`);
    if (!Array.isArray(task.acceptance) || !task.acceptance.length) throw new Error(`任务 ${task.id} 必须包含验收标准`);
  }
  const writes = tasks.filter((task) => task.access === 'write');
  for (let index = 1; index < writes.length; index += 1) {
    if (writes[index - 1].projectId && writes[index - 1].projectId === writes[index].projectId && writes[index - 1].projectId === tasks.find((task) => task.id === writes[index].id)?.projectId) {
      // same-project writes are serialized by plan order; nothing to enforce here
    }
  }
  return { valid: true };
}

function plannerSystemPrompt(thread: AgentThread, bundle: ReturnType<typeof getCapabilityBundle>, groundingText: string) {
  const catalog = skillCatalog(bundle!);
  const catalogText = catalog.map((item) => `- ${item.role}：${item.description}\n  工具：${item.tools.join('、') || '（无）'}`).join('\n');
  const tasks = thread.plan?.tasks || [];
  const existing = tasks.length
    ? `\n现有计划（可能已被拒绝或执行中断）：${tasks.map((task) => `[${task.status}] ${task.scope} ${task.title}`).join('；')}`
    : '';
  return [
    '你是 FormFlow 项目智能体，处于规划阶段。根据用户要求与项目现状生成一份可确认、可执行、决策完整的目标契约。',
    '目标契约必须包含：goal（一句目标）、successCriteria（如何判断完成）、summary（实施概述）、assumptions（假设）、risks（风险）、tasks（最少且完整的任务清单）。',
    '任务按领域 skill 分配 scope（每个任务只能属于一个领域），access 标明 read/write；同项目的写任务按执行顺序排列，后面的写任务不得先于前面的写任务完成。',
    '任务必须「单一职责、一次完成」：每个任务只创建一个资源或完成一个动作；同一个资源（项目/数据表/表单/流程/规则）只能由一个任务负责创建，禁止重复创建。',
    '任务 id 统一使用小写 t 前缀递增（t1、t2、t3…），不要使用纯数字或大写 T，保证执行循环能按 id 稳定引用任务。',
    '后续任务只能做增量修改：instruction 必须写明「该资源已由前序任务创建，先读取确认现状，只补齐缺失项，不要重复创建」。例如数据表创建任务负责建表与字段，紧随其后的配置任务只调用 data_sheet.configure 设置主键/枚举等缺失配置，绝不再次 data_source.create。',
    '数据写入与建表去重：若建表任务（data_source.create/data_table.create）的 instruction 已包含示例/业务行数据，就不要再单独规划「写入示例数据」任务；若用户要求单独写入数据，建表任务必须只建空表、不写行，由数据写入任务（data_rows.batch/data_source.import）一次性写入，禁止两边写同一批行导致主键重复。',
    '主键配置去重：data_table.create/data_source.create 建表时可一步设置主键（keyFields）与列枚举；不要为同一张新表再规划「配置主键」任务。只有明确要求「补齐已有表的缺失配置」时才规划 data_sheet.configure 任务。',
    '列的枚举值在建表时通过 config.columns[].enum 定义；data_sheet.configure 没有修改列枚举的字段，配置任务不要为枚举反复调用或确认。',
    '用户没有要求模板时，不要规划 project.initialize 或「初始化项目模板」任务：项目创建任务（project.create）之后直接规划数据表创建。',
    '只规划真实可执行的工作，不要规划自动发布：不得出现 release.apply；发布只做到 delivery 领域的 release.preview 预检。',
    '如果信息不足以形成完整契约，可以在 summary 里说明缺口，但不要编造项目结构；必要时任务里只做只读调研并列出待确认问题。',
    '',
    '可用领域 skill 目录：',
    catalogText,
    existing,
    '',
    `项目现状：\n${groundingText}`,
  ].join('\n');
}

/**
 * 规划一轮：基于目标契约生成/确认任务清单；计划模式等待用户确认，目标模式自动确认。
 */
export async function planTurn(thread: AgentThread, prompt: string, run: RunContext) {
  thread.status = 'planning';
  thread.controlSignal = undefined;
  thread.pendingSteer = undefined;
  thread.consecutiveNoProgress = 0;
  thread.blockedCount = 0;
  thread.blockedConditionFingerprint = undefined;
  thread.decisionSteps = 0;
  addThreadMessage(thread, 'user', 'prompt', prompt, thread.turnId);
  saveAgentThread(thread);

  const grounding = await ground(thread, run);
  const bundle = getCapabilityBundle(thread.capabilityBundleVersionId, thread.userId);
  if (!bundle) throw new Error('能力包不存在');

  const response = await chat(thread, run, {
    messages: [
      { role: 'system', content: plannerSystemPrompt(thread, bundle, grounding.text) },
      { role: 'user', content: `用户要求：${prompt}\n\n请输出目标契约与任务清单。` },
    ],
    responseSchema: plannerSchema(),
    temperature: 0.2,
    purpose: 'plan',
  });

  const structured = response.structured;
  if (!structured || !Array.isArray(structured.tasks)) throw new Error('规划响应缺少任务清单');
  validatePlanTasks(structured.tasks);

  const now = new Date().toISOString();
  const previous = thread.plan;
  if (previous) {
    if (previous.status === 'confirmed' || previous.status === 'executed') previous.status = 'superseded';
    for (const task of previous.tasks) if (['pending', 'running'].includes(task.status)) task.status = 'cancelled';
  }
  const tasks: AgentTask[] = structured.tasks.map((task: any) => ({
    id: String(task.id),
    title: String(task.title),
    instruction: String(task.instruction),
    scope: task.scope as McpRole,
    access: task.access as AgentTask['access'],
    projectId: task.projectId ? String(task.projectId) : undefined,
    acceptance: Array.isArray(task.acceptance) ? task.acceptance.map(String) : [],
    status: 'pending',
    attempt: 0,
    maxAttempts: bundle.budget.maxAttempts,
    toolSteps: 0,
    evidence: [],
    createdAt: now,
    updatedAt: now,
  }));
  const plan: AgentPlan = {
    id: `plan_${randomUUID()}`,
    revision: (previous?.revision || 0) + 1,
    request: prompt,
    goal: String(structured.goal),
    successCriteria: (structured.successCriteria || []).map(String),
    summary: String(structured.summary || ''),
    assumptions: (structured.assumptions || []).map(String),
    risks: (structured.risks || []).map(String),
    tasks,
    status: 'pending',
    createdAt: now,
  };
  thread.plan = plan;
  thread.status = 'awaiting_plan_approval';
  addThreadMessage(thread, 'assistant', 'commentary', `已生成目标契约：${plan.goal}。共 ${tasks.length} 个任务，等待你确认后开始执行。`, thread.turnId);
  appendAgentThreadEvent(thread, 'plan_proposed', {
    planId: plan.id,
    planRevision: plan.revision,
    goal: plan.goal,
    taskCount: tasks.length,
    scopeSummary: [...new Set(tasks.map((task) => task.scope))],
  });
  saveAgentThread(thread);
  return plan;
}

/** 依据用户反馈修订计划（新增/调整剩余任务）。 */
export async function replanWithFeedback(thread: AgentThread, feedback: string, run: RunContext) {
  const plan = thread.plan;
  if (plan && plan.status === 'pending') {
    plan.status = 'rejected';
    plan.rejectReason = feedback;
  }
  addThreadMessage(thread, 'user', 'prompt', `计划被拒绝，请按反馈重新规划：${feedback}`, thread.turnId);
  appendAgentThreadEvent(thread, 'plan_rejected', { planId: plan?.id, feedback });
  await planTurn(thread, `${plan?.request || ''}\n\n反馈：${feedback}`, run);
  return thread.plan;
}

/** 执行中重规划：仅重规划剩余任务，保留已完成任务证据与原始目标。 */
/** 仅重规划剩余任务（goal 模式自动确认）。 */
export async function replanRemaining(thread: AgentThread, reason: string, run: RunContext) {
  const plan = thread.plan;
  if (!plan) throw new Error('当前没有计划可重规划');
  const remaining = plan.tasks
    .filter((task) => ['pending', 'running', 'failed'].includes(task.status))
    .map((task) => `[${task.status}] ${task.scope}/${task.access} ${task.title}（${task.id}）：${task.instruction}${task.error ? `（最近错误：${task.error}）` : ''}`)
    .join('\n');
  const request = `${plan.request}\n\n[执行中重规划] ${reason || '请调整剩余任务'}\n当前未完成任务：\n${remaining || '（无）'}`;
  return planTurn(thread, request, run);
}

/** 将待确认的计划置为已确认（计划模式用户批准后调用）。 */
export function confirmPlan(thread: AgentThread) {
  const plan = thread.plan;
  if (!plan || plan.status !== 'pending') throw new Error('待确认计划不存在');
  const pendingTasks = plan.tasks.filter((task) => ['pending', 'failed'].includes(task.status));
  if (!pendingTasks.length) throw new Error('目标契约没有待执行任务');
  plan.status = 'confirmed';
  plan.confirmedAt = new Date().toISOString();
  thread.status = 'idle';
  appendAgentThreadEvent(thread, 'plan_confirmed', { planId: plan.id, planRevision: plan.revision });
  return saveAgentThread(thread);
}
