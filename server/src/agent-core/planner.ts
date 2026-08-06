/**
 * Dynamic-plan initialization (v2): deterministic grounding, then one
 * structured LLM call producing the goal contract WITHOUT a task checklist.
 * The dynamic plan is display-only, updated by the model via plan.update,
 * and never gates execution or awaits user confirmation.
 */
import { executeLlmTool } from '../services/llm-tools';
import { MCP_ROLES, type McpRole } from '../services/tool-shared';
import { chat } from './llm';
import { skillCatalog } from './skills';
import { appendAgentThreadEvent, getCapabilityBundle, saveAgentThread, threadProjectIds } from './store';
import type { AgentThread, CapabilityBundleVersion, DynamicPlan, RunContext } from './types';

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

/** 环境摸底：只读检查项目，为动态计划与循环上下文提供现状快照。 */
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

function dynamicPlanSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'successCriteria', 'summary', 'steps', 'assumptions', 'risks'],
    properties: {
      goal: { type: 'string' },
      successCriteria: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
    },
  };
}

function planPrompt(thread: AgentThread, bundle: CapabilityBundleVersion, groundingText: string) {
  const catalog = skillCatalog(bundle);
  const catalogText = catalog.map((item) => `- ${item.role}：${item.description}\n  工具：${item.tools.join('、') || '（无）'}`).join('\n');
  const previous = thread.dynamicPlan
    ? `\n当前动态计划（可能需要修订而非重写）：目标「${thread.dynamicPlan.goal}」\n步骤：${thread.dynamicPlan.steps.join('；') || '（无）'}`
    : '';
  return [
    '你是 FormFlow 项目智能体，处于执行前的动态计划初始化阶段。根据用户要求与项目现状生成目标契约。',
    '目标契约只包含：goal（一句目标）、successCriteria（如何判断完成）、summary（实施概述）、steps（当前思路/剩余步骤的简短展示列表）、assumptions（假设）、risks（风险）。',
    '不生成任务清单，不分配 scope，不写验收标准；执行阶段由智能体在单循环中动态决定每一步。',
    `领域 skill 目录：\n${catalogText}`,
    previous,
    `项目现状：\n${groundingText || '（无）'}`,
    `用户要求：${[...thread.messages].reverse().find((message) => message.role === 'user')?.content || thread.summary || ''}`,
  ].join('\n');
}

/** 校验动态计划结构，返回诊断文本。 */
export function validateDynamicPlan(input: Partial<DynamicPlan>): string[] {
  const problems: string[] = [];
  if (!String(input.goal || '').trim()) problems.push('goal 不能为空');
  if (!Array.isArray(input.successCriteria) || !input.successCriteria.length) problems.push('successCriteria 至少一项');
  if (!Array.isArray(input.steps)) problems.push('steps 必须是数组');
  if (!Array.isArray(input.assumptions)) problems.push('assumptions 必须是数组');
  if (!Array.isArray(input.risks)) problems.push('risks 必须是数组');
  return problems;
}

/** 初始化（或按用户新要求重规划）动态计划：一次 LLM 调用，无任务清单、无需确认。 */
export async function initializeDynamicPlan(thread: AgentThread, run: RunContext) {
  const bundle = getCapabilityBundle(thread.capabilityBundleVersionId, thread.userId);
  if (!bundle) throw new Error('能力包不存在');
  const grounding = await ground(thread, run);
  appendAgentThreadEvent(thread, 'plan.generating', { reason: thread.dynamicPlan ? 'revised' : 'initial' });
  const response = await chat(thread, run, {
    messages: [
      { role: 'system', content: planPrompt(thread, bundle, grounding.text) },
      { role: 'user', content: '请生成动态计划（结构化，不含任务清单）。' },
    ],
    responseSchema: dynamicPlanSchema(),
    temperature: 0.2,
    purpose: 'plan',
  });
  const structured = response.structured as Partial<DynamicPlan> | undefined;
  if (!structured || !structured.goal) throw new Error('动态计划响应缺少 goal');
  const problems = validateDynamicPlan(structured);
  if (problems.length) throw new Error(`动态计划结构无效：${problems.join('；')}`);
  const now = new Date().toISOString();
  thread.dynamicPlan = {
    goal: String(structured.goal).trim(),
    successCriteria: (structured.successCriteria || []).map(String).filter(Boolean),
    summary: String(structured.summary || ''),
    steps: (structured.steps || []).map(String).filter(Boolean),
    assumptions: (structured.assumptions || []).map(String).filter(Boolean),
    risks: (structured.risks || []).map(String).filter(Boolean),
    updatedAt: now,
    updatedBy: 'system',
  };
  thread.dynamicPlanPromptId = [...thread.messages].reverse().find((message) => message.role === 'user')?.id;
  thread.status = 'idle';
  appendAgentThreadEvent(thread, 'plan.updated', { goal: thread.dynamicPlan.goal, steps: thread.dynamicPlan.steps.length, by: 'system', reason: 'initialized' });
  saveAgentThread(thread);
  return thread.dynamicPlan;
}

/** 校验动态计划更新的工具参数。 */
export function applyDynamicPlanUpdate(thread: AgentThread, input: Partial<DynamicPlan>, by: 'model' | 'system') {
  const current = thread.dynamicPlan;
  if (!current) throw new Error('动态计划尚未初始化');
  const asStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    return [];
  };
  const next: DynamicPlan = {
    goal: input.goal !== undefined ? String(input.goal).trim() : current.goal,
    successCriteria: input.successCriteria !== undefined ? asStringArray(input.successCriteria) : current.successCriteria,
    summary: input.summary !== undefined ? String(input.summary) : current.summary,
    steps: input.steps !== undefined ? asStringArray(input.steps) : current.steps,
    assumptions: input.assumptions !== undefined ? asStringArray(input.assumptions) : current.assumptions,
    risks: input.risks !== undefined ? asStringArray(input.risks) : current.risks,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  const problems = validateDynamicPlan(next);
  if (problems.length) throw new Error(`动态计划更新无效：${problems.join('；')}`);
  thread.dynamicPlan = next;
  appendAgentThreadEvent(thread, 'plan.updated', { goal: next.goal, steps: next.steps.length, by, reason: input.summary ? 'revised' : 'touched' });
  saveAgentThread(thread);
  return next;
}
