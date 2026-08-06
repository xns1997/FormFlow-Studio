/**
 * Deterministic verification engine (v2, loop-level).
 *
 * Write-after verification and thread-level final gates. Never relaxed:
 * structural validation, formal rule verification, regression tests and
 * release.preview are enforced by the harness; release.apply is unreachable.
 */
import { randomUUID } from 'node:crypto';
import { executeLlmTool } from '../services/llm-tools';
import { requireProject } from '../services/project-authoring';
import type { McpRole } from '../services/tool-shared';
import { stableIdempotencyKey } from './policy';
import { threadProjectIds } from './store';
import type { AgentEvidence, AgentThread, RunContext } from './types';

/** 门禁失败错误（含门禁名与详情）。 */
export class GateFailure extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

function evidence(kind: AgentEvidence['kind'], summary: string, data?: unknown): AgentEvidence {
  return { id: `aev_${randomUUID()}`, kind, summary, data, createdAt: new Date().toISOString() };
}

async function validateProject(run: RunContext, projectId: string, scope: McpRole) {
  return executeLlmTool('project.validate', { projectId }, {
    tenantId: run.tenantId,
    projectId,
    userId: run.userId,
    user: run.user,
    requestId: run.requestId,
    mcpRole: scope,
  });
}

/** 回归测试门禁是否适用：绑定了项目且有动态计划即适用（失败容错见基线）。 */
export function testGateApplies(thread: AgentThread): boolean {
  return threadProjectIds(thread).length > 0 && Boolean(thread.dynamicPlan);
}

function testFailures(data: any): string[] {
  const errors: string[] = [];
  for (const item of data?.results || []) {
    if (!item.passed) errors.push(`用例「${item.title || item.id}」：${(item.errors || []).join('；')}`);
  }
  for (const item of data?.ruleResults || []) {
    if (!item.passed) errors.push(`规则「${item.formId}」：${item.error || '未通过'}`);
  }
  for (const item of data?.validation?.errors || []) {
    errors.push(`结构校验：${item.message || item.code || ''}`);
  }
  return errors;
}

const normalizeFailure = (value: string) => value.replace(/\s+/g, ' ').trim();

function blockerText(blockers: Array<string | { code?: string; title?: string; message?: string }>): string {
  return blockers.map((item) => (typeof item === 'string' ? item : (item.message || item.code || item.title || ''))).filter(Boolean).join('、');
}

/** 结构校验错误 → 可读详情（代码@路径 消息）。 */
export function validationIssueText(errors: Array<{ code?: string; path?: string; message?: string }>): string {
  return errors.slice(0, 5).map((item) => `${item.code || ''}@${item.path || ''}${item.message ? ` ${item.message}` : ''}`).join('；');
}

/**
 * 目标交付物覆盖检查：从动态计划的目标/成功标准中提取显式要求的资源
 * （表单/数据表/流程/输出/规则/示例数据），与实际项目包核对。
 * 这是「模型声明完成 ≠ 任务完成」的确定性兜底：缺交付物时门禁失败，模型必须修复。
 */
export function goalDeliverableGaps(thread: AgentThread, project: Record<string, any>): string[] {
  const userPrompt = [...thread.messages].reverse().find((message) => message.role === 'user' && message.kind === 'prompt')?.content || '';
  // 任务要求锚定在「用户原始提示词 + 动态计划」上，防止模型把目标写得模糊来绕过交付物检查。
  const text = `${thread.dynamicPlan?.goal || ''}\n${(thread.dynamicPlan?.successCriteria || []).join('\n')}\n${userPrompt}`;
  if (!text.trim()) return [];
  // 否定语义：任务明确「不要创建表/表单/只填元信息」时，跳过对应的交付物要求，避免把说明文字误判为需求。
  const negatedCreation = /不要创建(?:任何)?(?:数据表|数据源|表单)|不建(?:表|表单)|只建空表|只填元信息|不要创建数据表或表单/.test(text);
  const gaps: string[] = [];
  const forms = Array.isArray(project.forms) ? project.forms : [];
  const tables = Array.isArray(project.srcTable) ? project.srcTable : [];
  const workflows = Array.isArray(project.workflows) ? project.workflows : [];
  const outputs = Array.isArray(project.outputs) ? project.outputs : [];
  const formIds = new Set(forms.map((form: any) => form.id));
  const tableIds = new Set(tables.map((table: any) => table.id));
  const flowIds = new Set(workflows.map((flow: any) => flow.id));
  const outputIds = new Set(outputs.map((output: any) => output.id));
  // 只把「像资源 id」的小写标识符当作显式要求，避免把「流程 ID」这类说明文字误判为缺失资源。
  const mentionedIds = (pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]).filter((id: any) => /^[a-z][a-z0-9_]*$/.test(String(id)));
  for (const id of mentionedIds(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g)) if (!formIds.has(id)) gaps.push(`表单 ${id}`);
  for (const id of mentionedIds(/(?:数据表|数据源|表)\s*[：: ]+([a-zA-Z][\w-]*)/g)) if (!tableIds.has(id)) gaps.push(`数据表 ${id}`);
  for (const id of mentionedIds(/(?:工作流|流程)\s*[：: ]+([a-zA-Z][\w-]*)/g)) if (!flowIds.has(id)) gaps.push(`工作流 ${id}`);
  for (const id of mentionedIds(/(?:输出|output)\s*[：: ]+([a-zA-Z][\w-]*)/g)) if (!outputIds.has(id)) gaps.push(`输出 ${id}`);
  if (!negatedCreation && /登记|录入|新增|查询|修改|表单/.test(text)) {
    if (forms.length < 2 && /登记|录入|新增/.test(text) && /查询|修改|查看|列表/.test(text)) gaps.push('至少 2 个表单（录入/登记 + 查询/修改）');
    const emptyForms = forms.filter((form: any) => !((form.design?.components) || []).length).map((form: any) => form.id);
    if (emptyForms.length) gaps.push(`表单缺少控件（0 组件）：${emptyForms.join('、')}`);
  }
  if (!negatedCreation && /规则|行为|联动/.test(text)) {
    const hasFormRule = forms.some((form: any) => String(form.ruleCode || '').trim() || (form.behaviors || []).length);
    const hasAnyRule = hasFormRule
      || tables.some((table: any) => (table.behaviors || []).length)
      || Boolean(project.globalBehaviors && ((project.globalBehaviors.rules || []).length || (project.globalBehaviors.behaviors || []).length));
    const hasLinkageFlow = workflows.some((workflow: any) => (workflow.nodes || []).length > 0);
    const wantsFormRule = /表单规则|提交前校验|必填|rule_code|表单.*规则|规则.*表单|校验.*必填/.test(text);
    const wantsLinkage = /跨表|联动|工作流|写回|流程/.test(text);
    if (wantsFormRule && !hasFormRule) {
      gaps.push('表单规则（未发现任何 ruleCode 或 behaviors）。用 rule_code.update 写表单规则，先 rule_syntax.lint');
    } else if (wantsLinkage && !(hasAnyRule || hasLinkageFlow)) {
      gaps.push('行为规则/行为或联动流程（未发现任何 ruleCode、behaviors 或 workflow）。跨表联动用 workflow.generate_from_table（生成写回流程），单表单规则用 rule_code.update 或 behavior.upsert');
    } else if (!wantsFormRule && !wantsLinkage && !(hasAnyRule || hasLinkageFlow)) {
      gaps.push('行为规则/行为或联动流程（未发现任何 ruleCode、behaviors 或 workflow）');
    }
  }
  if (!negatedCreation && /示例数据|内置.{0,4}数据|行数据/.test(text)) {
    const hasRows = tables.some((table: any) => (table.sheets || []).some((sheet: any) => Number(sheet.rowCount || 0) > 0 || (sheet.rows || []).length > 0));
    if (!hasRows) gaps.push('示例/内置数据（所有数据表均为空）');
  }
  return [...new Set(gaps)];
}

/** 按目标文本过滤无关阻塞项（v1 按任务 scope 过滤的等价物）。 */
function goalRelevantBlockers(thread: AgentThread, blockers: Array<string | { code?: string; title?: string; message?: string }>): string[] {
  const text = `${thread.dynamicPlan?.goal || ''}\n${(thread.dynamicPlan?.successCriteria || []).join('\n')}`;
  const wantsData = /数据表|数据源|录入|导入|行数据|表/.test(text);
  const wantsForm = /表单|录入|查询|登记|form/.test(text);
  return blockers.filter((item) => {
    const value = typeof item === 'string' ? item : (item.message || item.code || item.title || '');
    if (/尚未配置数据源/.test(value)) return wantsData;
    if (/尚未配置表单/.test(value)) return wantsForm;
    if (/回归测试|测试套件/.test(value)) return false;
    return true;
  }).map((item) => typeof item === 'string' ? item : (item.message || item.code || item.title || '')).filter(Boolean);
}

async function runProjectTestOnce(thread: AgentThread, run: RunContext, projectId: string, generateIfMissing: boolean) {
  const base = { tenantId: run.tenantId, projectId, userId: run.userId, user: run.user, requestId: run.requestId, mcpRole: 'quality' as McpRole };
  let revision = thread.projectRevisions[projectId];
  if (!revision) {
    const current = await executeLlmTool('project.get', { projectId }, { ...base, mcpRole: 'project' });
    if (current.ok && current.meta?.revision) {
      thread.projectRevisions[projectId] = current.meta.revision;
      revision = current.meta.revision;
    }
  }
  const runKey = stableIdempotencyKey(thread.id, `test-gate:${revision || 'none'}`, 1, 'project_test.run', { projectId });
  let result = await executeLlmTool('project_test.run', { projectId, baseRevision: revision, idempotencyKey: runKey }, base);
  if (!result.ok && generateIfMissing && /TEST_SUITE_NOT_FOUND|套件不存在/.test('error' in result ? result.error?.message || '' : '')) {
    const generate = await executeLlmTool('project_test.generate', {
      projectId,
      baseRevision: revision,
      idempotencyKey: stableIdempotencyKey(thread.id, 'test-gate', 1, 'project_test.generate', { projectId }),
    }, base);
    if (generate.ok && generate.meta?.revision) thread.projectRevisions[projectId] = generate.meta.revision;
    result = await executeLlmTool('project_test.run', {
      projectId,
      baseRevision: thread.projectRevisions[projectId],
      idempotencyKey: stableIdempotencyKey(thread.id, `test-gate:${thread.projectRevisions[projectId] || 'none'}`, 1, 'project_test.run', { projectId }),
    }, base);
  }
  return result;
}

/** 捕获回归测试基线：预存失败不阻塞，引入失败必须修复。 */
export async function captureTestBaseline(thread: AgentThread, run: RunContext) {
  if (!testGateApplies(thread)) return;
  const projects = threadProjectIds(thread);
  if (!projects.length) return;
  const failures: string[] = [];
  for (const projectId of projects) {
    try {
      const result = await runProjectTestOnce(thread, run, projectId, false);
      if (result.ok) {
        failures.push(...testFailures(result.data as any));
        if (result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
      }
    } catch {
      // 基线捕获失败不阻断执行；最终门禁会重新运行测试。
    }
  }
  thread.testBaseline = {
    capturedAt: new Date().toISOString(),
    passed: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

async function runTestGate(thread: AgentThread, run: RunContext, projectId: string): Promise<{ failures: string[]; evidence: AgentEvidence[] }> {
  const failures: string[] = [];
  const evidenceList: AgentEvidence[] = [];
  const result = await runProjectTestOnce(thread, run, projectId, true);
  if (!result.ok) {
    failures.push(`项目 ${projectId} 回归测试执行失败：${'error' in result ? result.error?.message || '未知错误' : '需要确认'}`);
    return { failures, evidence: evidenceList };
  }
  if (result.meta?.revision) thread.projectRevisions[projectId] = result.meta.revision;
  const current = testFailures(result.data as any);
  const baseline = new Set((thread.testBaseline?.failures || []).map(normalizeFailure));
  const introduced = current.filter((failure) => !baseline.has(normalizeFailure(failure)));
  const preexisting = current.filter((failure) => baseline.has(normalizeFailure(failure)));
  if (preexisting.length) evidenceList.push(evidence('scenario_result', `项目 ${projectId} 回归：${preexisting.length} 项为执行前已存在失败（不阻塞）`));
  if (introduced.length) {
    failures.push(`项目 ${projectId} 回归测试新增失败：${introduced.slice(0, 5).join('；')}`);
  } else {
    evidenceList.push(evidence('scenario_result', `项目 ${projectId} 回归测试通过（覆盖率 ${((result.data as any)?.coverage ?? 0)}%）`));
  }
  return { failures, evidence: evidenceList };
}

/** 对携带 Behavior Rule DSL 的表单做有界模型检查（静态错误/触发链/确定性）。 */
export async function verifyFormalRules(run: RunContext, projectId: string): Promise<AgentEvidence[]> {
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
    if (reasons.length) throw new GateFailure(`表单「${form.name || form.id}」规则形式化验证未通过：${reasons.join('；')}`, report);
    evidenceList.push(evidence('formal_verification', `表单「${form.name || form.id}」规则模型检查通过（探索 ${report.statesExplored} 个状态）`, { formId: form.id, statesExplored: report.statesExplored, ruleCount: report.ruleCount, acyclic: true, deterministic: true }));
  }
  return evidenceList;
}

/**
 * 写后最小验证：结构校验（必做）+ 行为/规则写入后的形式化验证。
 * 失败抛 GateFailure，由循环回灌模型修复；成功返回证据。
 */
export async function verifyProjectAfterWrite(thread: AgentThread, run: RunContext, projectId: string, scope: McpRole): Promise<AgentEvidence[]> {
  const evidenceList: AgentEvidence[] = [];
  const result = await validateProject(run, projectId, 'project');
  if (!result.ok) {
    throw new GateFailure(`写入后的项目校验失败：${'error' in result ? result.error?.message || '未知错误' : '需要确认'}`, 'error' in result ? result.error : undefined);
  }
  const errors = Array.isArray((result.data as any)?.errors) ? (result.data as any).errors : [];
  if (errors.length) {
    throw new GateFailure(`写入后的项目校验未通过（${errors.length} 项结构问题）：${validationIssueText(errors)}`, { errors: errors.slice(0, 20) });
  }
  evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`, { revision: result.meta?.revision, errors: 0 }));
  if (scope === 'behavior') {
    evidenceList.push(...await verifyFormalRules(run, projectId));
  }
  return evidenceList;
}

export interface FinalGateResult {
  passed: boolean;
  failures: string[];
  evidence: AgentEvidence[];
}

/**
 * 轻量完成门禁（小任务增量模式）：每个项目只做结构校验 + 形式化验证 + 目标交付物覆盖，
 * 跳过回归测试/质量检查/发布预检——这些由专门的收尾任务（finalGate: true）执行。
 */
export async function runLightFinalGates(thread: AgentThread, run: RunContext): Promise<FinalGateResult> {
  const failures: string[] = [];
  const evidenceList: AgentEvidence[] = [];
  const projects = threadProjectIds(thread);
  if (!projects.length) {
    const goal = `${thread.dynamicPlan?.goal || ''} ${(thread.dynamicPlan?.successCriteria || []).join(' ')}`;
    if (/创建|新建|构建|从零|项目/.test(goal)) {
      return {
        passed: false,
        failures: ['尚未创建或绑定任何项目：目标要求创建项目，但当前没有项目可验证。'],
        evidence: evidenceList,
      };
    }
    return { passed: true, failures, evidence: evidenceList };
  }
  for (const projectId of projects) {
    const validation = await validateProject(run, projectId, 'project');
    if (!validation.ok) {
      failures.push(`项目 ${projectId} 结构校验失败：${'error' in validation ? validation.error?.message || '未知错误' : '需要确认'}`);
      continue;
    }
    const errors = Array.isArray((validation.data as any)?.errors) ? (validation.data as any).errors : [];
    if (errors.length) {
      failures.push(`项目 ${projectId} 结构校验未通过（${errors.length} 项问题）：${validationIssueText(errors)}`);
      continue;
    }
    evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`));
    try {
      const gaps = goalDeliverableGaps(thread, requireProject(projectId));
      if (gaps.length) {
        failures.push(`项目 ${projectId} 目标交付物缺失：${gaps.join('、')}。请补齐后再完成任务。`);
      } else {
        evidenceList.push(evidence('requirement_coverage', `项目 ${projectId} 目标交付物覆盖检查通过`));
      }
    } catch (error) {
      failures.push(`项目 ${projectId} 目标交付物检查失败：${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      evidenceList.push(...await verifyFormalRules(run, projectId));
    } catch (error) {
      failures.push(error instanceof GateFailure ? error.message : String(error));
    }
  }
  return { passed: failures.length === 0, failures, evidence: evidenceList };
}

/** 线程最终门禁：结构 + 形式化 + 回归 + 质量 + 发布预检；release.apply 永不调用。 */
export async function runFinalGates(thread: AgentThread, run: RunContext): Promise<FinalGateResult> {
  const failures: string[] = [];
  const evidenceList: AgentEvidence[] = [];
  const projects = threadProjectIds(thread);
  if (!projects.length) {
    const goal = `${thread.dynamicPlan?.goal || ''} ${(thread.dynamicPlan?.successCriteria || []).join(' ')}`;
    if (/创建|新建|构建|从零|项目/.test(goal)) {
      return {
        passed: false,
        failures: ['尚未创建或绑定任何项目：目标要求创建项目，但当前没有项目可验证。请先创建项目（project.create / project.initialize / project.build_from_data）。'],
        evidence: evidenceList,
      };
    }
    return { passed: true, failures, evidence: evidenceList };
  }
  for (const projectId of projects) {
    const validation = await validateProject(run, projectId, 'project');
    if (!validation.ok) {
      failures.push(`项目 ${projectId} 结构校验失败：${'error' in validation ? validation.error?.message || '未知错误' : '需要确认'}`);
      continue;
    }
    const errors = Array.isArray((validation.data as any)?.errors) ? (validation.data as any).errors : [];
    if (errors.length) {
      failures.push(`项目 ${projectId} 结构校验未通过（${errors.length} 项问题）：${validationIssueText(errors)}`);
      continue;
    }
    evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`));

    try {
      const gaps = goalDeliverableGaps(thread, requireProject(projectId));
      if (gaps.length) {
        failures.push(`项目 ${projectId} 目标交付物缺失：${gaps.join('、')}。请补齐后再完成任务。`);
      } else {
        evidenceList.push(evidence('requirement_coverage', `项目 ${projectId} 目标交付物覆盖检查通过`));
      }
    } catch (error) {
      failures.push(`项目 ${projectId} 目标交付物检查失败：${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      evidenceList.push(...await verifyFormalRules(run, projectId));
    } catch (error) {
      failures.push(error instanceof GateFailure ? error.message : String(error));
    }

    if (testGateApplies(thread)) {
      const test = await runTestGate(thread, run, projectId);
      failures.push(...test.failures);
      evidenceList.push(...test.evidence);
    }

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
      const blockers = goalRelevantBlockers(thread, ((quality.data as any)?.blockers || []) as Array<string | { code?: string; title?: string; message?: string }>);
      const ready = (quality.data as any)?.ready === true || blockers.length === 0;
      if (!ready) {
        failures.push(`项目 ${projectId} 质量门禁未通过：${blockerText(blockers).slice(0, 400)}`);
      } else {
        evidenceList.push(evidence('semantic_validation', `项目 ${projectId} 质量门禁通过`));
      }
    }

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
      const blockers = goalRelevantBlockers(thread, ((preview.data as any)?.quality?.blockers || []) as Array<string | { code?: string; title?: string; message?: string }>);
      const ready = (preview.data as any)?.ready === true || blockers.length === 0;
      if (!ready) {
        failures.push(`项目 ${projectId} 发布预检未就绪：${blockerText(blockers).slice(0, 400)}`);
      } else {
        evidenceList.push(evidence('delivery_preview', `项目 ${projectId} 发布预检就绪`));
      }
    }
  }
  return { passed: failures.length === 0, failures, evidence: evidenceList };
}
