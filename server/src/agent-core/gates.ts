/**
 * Deterministic acceptance gates. Never relaxed by goal confirmation:
 * write tasks must pass project.validate, completion requires quality gates
 * and release.preview, and release.apply is unreachable.
 */
import { randomUUID } from 'node:crypto';
import { executeLlmTool } from '../services/llm-tools';
import { requireProject } from '../services/project-authoring';
import type { McpRole } from '../services/tool-shared';
import { threadProjectIds } from './store';
import type { AgentEvidence, AgentTask, AgentThread, RunContext } from './types';

export class GateFailure extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

function evidence(kind: AgentEvidence['kind'], summary: string, data?: unknown): AgentEvidence {
  return { id: `aev_${randomUUID()}`, kind, summary, data, createdAt: new Date().toISOString() };
}

/**
 * Checks that a task's requested deliverables actually exist in the project.
 * Task instructions often name the resources they must create; a task may not
 * be marked passed until those resources are present.
 */
export function missingTaskDeliverables(project: Record<string, any>, task: AgentTask): string[] {
  const text = `${task.title}\n${task.instruction}`;
  const missing: string[] = [];
  const ids = (pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]).filter((id) => /^[a-zA-Z][\w-]*$/.test(id));
  const forms = new Set((project.forms || []).map((form: any) => form.id));
  for (const id of ids(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)) {
    if (!forms.has(id)) missing.push(`表单 ${id}`);
  }
  const flows = new Set((project.workflows || []).map((flow: any) => flow.id));
  for (const id of ids(/(?:工作流|流程)\s*[：: ]+([a-zA-Z][\w-]*)/g)) {
    if (!flows.has(id)) missing.push(`工作流 ${id}`);
  }
  const tables = new Set((project.srcTable || []).map((table: any) => table.id));
  for (const id of ids(/(?:数据表|数据源)\s*[：: ]+([a-zA-Z][\w-]*)/g)) {
    if (!tables.has(id)) missing.push(`数据表 ${id}`);
  }
  if (/主键|keyFields/.test(text)) {
    const keyTableIds = ids(/(?:数据表|数据源|表)\s*[：: ]+([a-zA-Z][\w-]*)/g);
    for (const tableId of keyTableIds) {
      const table = (project.srcTable || []).find((item: any) => item.id === tableId);
      if (table) {
        const keys = (table.sheets || []).flatMap((sheet: any) => sheet.config?.keyFields || []);
        if (!keys.length) missing.push(`数据表 ${tableId} 的主键`);
      }
    }
  }
  if (/(规则|行为)/.test(text)) {
    // 指令可能写「为 device_edit 添加规则」而不带「表单」前缀；用项目真实表单 id 匹配指令 token。
    const tokens = new Set([...text.matchAll(/[a-zA-Z][\w-]*/g)].map((match) => match[1]));
    for (const form of project.forms || []) {
      if (tokens.has(String(form.id)) && !String(form.ruleCode || '').trim() && !(form.behaviors || []).length) {
        missing.push(`表单 ${form.id} 的规则/行为`);
      }
    }
  }
  return missing;
}

async function validateProject(thread: AgentThread, run: RunContext, projectId: string, scope: McpRole) {
  const result = await executeLlmTool('project.validate', { projectId }, {
    tenantId: run.tenantId,
    projectId,
    userId: run.userId,
    user: run.user,
    requestId: run.requestId,
    mcpRole: scope,
  });
  return result;
}

/**
 * Runs bounded model checking over every form that carries Behavior Rule DSL.
 * Deterministic gate: rules with a suspected infinite trigger chain, a
 * non-deterministic transition, or a static error block task completion.
 * Projects without rule code are skipped (no rules to verify).
 */
async function verifyFormalRules(thread: AgentThread, run: RunContext, projectId: string): Promise<AgentEvidence[]> {
  const project = requireProject(projectId);
  const ruleForms = (project.forms || []).filter((form: any) => form && String(form.ruleCode || '').trim().length > 0);
  if (!ruleForms.length) return [];
  const evidenceList: AgentEvidence[] = [];
  for (const form of ruleForms) {
    const result = await executeLlmTool('rule_verify.model', { projectId, formId: form.id }, {
      tenantId: run.tenantId,
      projectId,
      userId: run.userId,
      user: run.user,
      requestId: run.requestId,
      mcpRole: 'behavior',
    });
    if (!result.ok) {
      throw new GateFailure(`表单「${form.name || form.id}」规则形式化验证失败：${'error' in result ? result.error?.message || '未知错误' : '需要确认'}`);
    }
    const report = result.data as any;
    const reasons: string[] = [];
    if (Array.isArray(report.staticDiagnostics) && report.staticDiagnostics.some((item: any) => item.severity === 'error')) reasons.push('静态分析存在错误');
    if (report.acyclic === false) reasons.push('存在疑似无限触发链或模型检查超出预算');
    if (report.deterministic === false) reasons.push('迁移确定性抽查不一致');
    if (reasons.length) {
      throw new GateFailure(`表单「${form.name || form.id}」规则形式化验证未通过：${reasons.join('；')}`, report);
    }
    evidenceList.push(evidence('formal_verification', `表单「${form.name || form.id}」规则模型检查通过（探索 ${report.statesExplored} 个状态）`, { formId: form.id, statesExplored: report.statesExplored, ruleCount: report.ruleCount, acyclic: true, deterministic: true }));
  }
  return evidenceList;
}

/**
 * Verifies a task the agent claims is complete. Runs project.validate for
 * write tasks and attaches structural evidence; throws GateFailure otherwise.
 */
export async function verifyCompletedTask(thread: AgentThread, task: AgentTask, run: RunContext) {
  const evidenceList: AgentEvidence[] = [];
  const projectId = task.projectId || thread.currentProjectId;
  if (task.access === 'write' && projectId) {
    const result = await validateProject(thread, run, projectId, 'project');
    if (!result.ok) {
      const message = 'error' in result ? result.error?.message || '项目结构校验失败' : '项目校验需要确认';
      throw new GateFailure(`任务「${task.title}」写入后的项目校验未通过：${message}`, 'error' in result ? result.error : undefined);
    }
    const validation = result.data;
    const errors = Array.isArray((validation as any)?.errors) ? (validation as any).errors : [];
    if (errors.length) {
      throw new GateFailure(
        `任务「${task.title}」写入后的项目校验未通过（${errors.length} 项结构问题）`,
        { errors: errors.slice(0, 20) },
      );
    }
    evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`, { revision: result.meta?.revision, errors: 0 }));
    const missing = missingTaskDeliverables(requireProject(projectId), task);
    if (missing.length) {
      throw new GateFailure(`任务「${task.title}」要求的交付物缺失：${missing.join('、')}。请补齐后再完成任务。`, { missing });
    }
  }
  if (projectId) {
    evidenceList.push(...await verifyFormalRules(thread, run, projectId));
  }
  return evidenceList;
}

export interface FinalGateResult {
  passed: boolean;
  failures: string[];
  evidence: AgentEvidence[];
}

/**
 * Thread-level completion gates: per-project structural + quality checks and a
 * delivery preview for delivery-scope plans. release.apply is never offered.
 */
export async function runFinalGates(thread: AgentThread, run: RunContext, planScopeRoles: McpRole[]): Promise<FinalGateResult> {
  const failures: string[] = [];
  const evidenceList: AgentEvidence[] = [];
  const projects = threadProjectIds(thread);
  if (!projects.length) {
    return { passed: true, failures, evidence: evidenceList };
  }
  for (const projectId of projects) {
    const validation = await validateProject(thread, run, projectId, 'project');
    if (!validation.ok) {
      failures.push(`项目 ${projectId} 结构校验失败：${'error' in validation ? validation.error?.message || '未知错误' : '需要确认'}`);
      continue;
    }
    const errors = Array.isArray((validation.data as any)?.errors) ? (validation.data as any).errors : [];
    if (errors.length) {
      failures.push(`项目 ${projectId} 结构校验未通过（${errors.length} 项问题）`);
      continue;
    }
    evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`));

    try {
      evidenceList.push(...await verifyFormalRules(thread, run, projectId));
    } catch (error) {
      failures.push(error instanceof GateFailure ? error.message : String(error));
    }

    if (planScopeRoles.includes('quality')) {
      const quality = await executeLlmTool('project.quality.inspect', { projectId }, {
        tenantId: run.tenantId,
        projectId,
        userId: run.userId,
        user: run.user,
        requestId: run.requestId,
        mcpRole: 'quality',
      });
      if (!quality.ok) {
        failures.push(`项目 ${projectId} 质量检查失败：${'error' in quality ? quality.error?.message || '未知错误' : '需要确认'}`);
      } else {
        const blockers = ((quality.data as any)?.blockers || []) as Array<string>;
        const nonTestBlockers = blockers.filter((blocker) => !/test|测试|回归/i.test(String(blocker)));
        const ready = (quality.data as any)?.ready === true || nonTestBlockers.length === 0;
        if (!ready) {
        const summary = (quality.data as any)?.summary || (quality.data as any)?.quality || {};
        failures.push(`项目 ${projectId} 质量门禁未通过：${JSON.stringify(summary).slice(0, 400)}${nonTestBlockers.length ? `；阻塞项：${nonTestBlockers.map((item: any) => item.code || item.title || item.message).join('、')}` : ''}`);
        } else {
        evidenceList.push(evidence('semantic_validation', `项目 ${projectId} 质量门禁通过`));
        }
      }
    }

    if (planScopeRoles.includes('delivery')) {
      const preview = await executeLlmTool('release.preview', { projectId }, {
        tenantId: run.tenantId,
        projectId,
        userId: run.userId,
        user: run.user,
        requestId: run.requestId,
        mcpRole: 'delivery',
      });
      if (!preview.ok) {
        failures.push(`项目 ${projectId} 发布预检失败：${'error' in preview ? preview.error?.message || '未知错误' : '需要确认'}`);
      } else {
        const blockers = ((preview.data as any)?.quality?.blockers || []) as Array<string>;
        const nonTestBlockers = blockers.filter((blocker) => !/test|测试|回归/i.test(String(blocker)));
        const ready = (preview.data as any)?.ready === true || nonTestBlockers.length === 0;
        if (!ready) {
          const validation = (preview.data as any)?.validation || {};
          failures.push(`项目 ${projectId} 发布预检未就绪：${JSON.stringify(validation).slice(0, 400)}${nonTestBlockers.length ? `；阻塞项：${nonTestBlockers.map((item: any) => item.code || item.title || item.message).join('、')}` : ''}`);
        } else {
          evidenceList.push(evidence('delivery_preview', `项目 ${projectId} 发布预检就绪`));
        }
      }
    }
  }
  return { passed: failures.length === 0, failures, evidence: evidenceList };
}
