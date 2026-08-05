/**
 * Deterministic acceptance gates. Never relaxed by goal confirmation:
 * write tasks must pass project.validate, completion requires quality gates
 * and release.preview, and release.apply is unreachable.
 */
import { randomUUID } from 'node:crypto';
import { executeLlmTool } from '../services/llm-tools';
import { requireProject } from '../services/project-authoring';
import type { McpRole } from '../services/tool-shared';
import { stableIdempotencyKey } from './policy';
import { threadProjectIds } from './store';
import type { AgentEvidence, AgentTask, AgentThread, RunContext } from './types';

/** 门禁失败错误（含门禁名与详情）。 */
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
/** 检查任务声明的交付物在项目模型中是否齐备，返回缺失项。 */
export function missingTaskDeliverables(project: Record<string, any>, task: AgentTask): string[] {
  const text = `${task.title}\n${task.instruction}`;
  const missing: string[] = [];
  const ids = (pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]).filter((id) => /^[a-zA-Z][\w-]*$/.test(id));
  // 兼容「创建 department 数据表」这类 id 在名词前的写法；仅在主体模式无命中时兜底。
  const fallbackIds = (noun: string) => ids(new RegExp(`创建\\s*[\`'"“]?([a-zA-Z][\\w-]*)(?=\\s*${noun})`, 'g'));
  const forms = new Set((project.forms || []).map((form: any) => form.id));
  const formIdCandidates = ids(/(?:表单|form)\s*[：: ]+([a-zA-Z][\w-]*)/g);
  for (const id of formIdCandidates.length ? formIdCandidates : fallbackIds('表单')) {
    if (!forms.has(id)) missing.push(`表单 ${id}`);
  }
  const flows = new Set((project.workflows || []).map((flow: any) => flow.id));
  const flowIdCandidates = ids(/(?:工作流|流程)\s*[：: ]+([a-zA-Z][\w-]*)/g);
  for (const id of flowIdCandidates.length ? flowIdCandidates : fallbackIds('(?:流程|工作流)')) {
    if (!flows.has(id)) missing.push(`工作流 ${id}`);
  }
  const tables = new Set((project.srcTable || []).map((table: any) => table.id));
  const tableIdCandidates = ids(/(?:数据表|数据源)\s*[：: ]+([a-zA-Z][\w-]*)/g);
  for (const id of tableIdCandidates.length ? tableIdCandidates : fallbackIds('(?:数据表|数据源)')) {
    if (!tables.has(id)) missing.push(`数据表 ${id}`);
  }
  if (/主键|keyFields/.test(text)) {
    const keyTableIds = tableIdCandidates;
    for (const tableId of keyTableIds) {
      const table = (project.srcTable || []).find((item: any) => item.id === tableId);
      if (table) {
        const keys = (table.sheets || []).flatMap((sheet: any) => sheet.config?.keyFields || []);
        if (!keys.length) missing.push(`数据表 ${tableId} 的主键`);
      }
    }
  }
  const wantsEmptyTable = /空数据表|空表|只建空|不写行|不写入|先不写|暂不写|不要写/.test(text);
  if (!wantsEmptyTable && /写入|示例数据|数据行|导入|写行数据/.test(text)) {
    const dataTableIds = [
      ...tableIdCandidates,
      ...ids(/(?:写入|导入)\s*(?:到|至|进)?\s*[`'"“]?([a-zA-Z][\w-]*)/g),
    ];
    for (const tableId of [...new Set(dataTableIds)]) {
      const table = (project.srcTable || []).find((item: any) => item.id === tableId);
      if (table) {
        const rows = (table.sheets || []).reduce((total: number, sheet: any) => total + Number(sheet.rowCount || sheet.rows?.length || 0), 0);
        if (!rows) missing.push(`数据表 ${tableId} 的行数据`);
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
  if (/控件|组件/.test(text)) {
    for (const id of formIdCandidates) {
      const form = (project.forms || []).find((item: any) => item.id === id);
      if (form && !(form.design?.components || []).length) missing.push(`表单 ${id} 的控件`);
    }
  }
  if (/绑定|binding/i.test(text)) {
    for (const id of formIdCandidates) {
      const form = (project.forms || []).find((item: any) => item.id === id);
      if (form && !(form.design?.bindings || []).length) missing.push(`表单 ${id} 的绑定`);
    }
  }
  return missing;
}

async function validateProject(run: RunContext, projectId: string, scope: McpRole) {
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

/** 写计划（data/form/behavior/workflow 任一写任务）或 quality 作用域计划需要测试入闸。 */
/** 当前线程是否适用回归测试门禁（存在需生成/运行的测试任务）。 */
export function testGateApplies(thread: AgentThread): boolean {
  const tasks = thread.plan?.tasks || [];
  return tasks.some((task) => task.scope === 'quality')
    || tasks.some((task) => task.access === 'write' && ['data', 'form', 'behavior', 'workflow'].includes(task.scope));
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

/**
 * 质量门禁按计划作用域过滤无关阻塞项：
 * - 只有计划包含 data/form 领域写任务时，才因「项目尚未配置数据源/表单」阻塞；
 * - 回归测试类阻塞交给独立测试门禁（区分预存/引入），不在质量门禁重复判死。
 */
function scopeRelevantBlockers(thread: AgentThread, blockers: Array<string | { code?: string; title?: string; message?: string }>): string[] {
  const tasks = thread.plan?.tasks || [];
  const hasScope = (role: McpRole) => tasks.some((task) => task.scope === role);
  return blockers.filter((item) => {
    const text = typeof item === 'string' ? item : (item.message || item.code || item.title || '');
    if (/尚未配置数据源/.test(text)) return hasScope('data');
    if (/尚未配置表单/.test(text)) return hasScope('form');
    if (/回归测试|测试套件/.test(text)) return false;
    return true;
  }).map((item) => typeof item === 'string' ? item : (item.message || item.code || item.title || '')).filter(Boolean);
}

async function runProjectTestOnce(thread: AgentThread, run: RunContext, projectId: string, generateIfMissing: boolean) {
  const base = { tenantId: run.tenantId, projectId, userId: run.userId, user: run.user, requestId: run.requestId, mcpRole: 'quality' as McpRole };
  const revision = thread.projectRevisions[projectId];
  const runKey = stableIdempotencyKey(thread.id, `test-gate:${revision || 'none'}`, 1, 'project_test.run', { projectId });
  let result = await executeLlmTool('project_test.run', {
    projectId,
    baseRevision: revision,
    idempotencyKey: runKey,
  }, base);
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

/** 捕获执行开始前的测试基线（预存失败不阻塞，引入失败必须修复）。 */
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
      // 基线捕获失败不阻断执行；完成门禁会重新运行测试。
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
  if (preexisting.length) {
    evidenceList.push(evidence('scenario_result', `项目 ${projectId} 回归：${preexisting.length} 项为执行前已存在失败（不阻塞）`));
  }
  if (introduced.length) {
    failures.push(`项目 ${projectId} 回归测试新增失败：${introduced.slice(0, 5).join('；')}`);
  } else {
    evidenceList.push(evidence('scenario_result', `项目 ${projectId} 回归测试通过（覆盖率 ${((result.data as any)?.coverage ?? 0)}%）`));
  }
  return { failures, evidence: evidenceList };
}

/**
 * Runs bounded model checking over every form that carries Behavior Rule DSL.
 * Deterministic gate: rules with a suspected infinite trigger chain, a
 * non-deterministic transition, or a static error block task completion.
 * Projects without rule code are skipped (no rules to verify).
 */
async function verifyFormalRules(run: RunContext, projectId: string): Promise<AgentEvidence[]> {
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
/** 验证单个已完成任务：结构校验、质量检查与形式化规则门禁。 */
export async function verifyCompletedTask(thread: AgentThread, task: AgentTask, run: RunContext) {
  const evidenceList: AgentEvidence[] = [];
  const projectId = task.projectId || thread.currentProjectId;
  if (task.access === 'write' && projectId) {
    const result = await validateProject(run, projectId, 'project');
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
 * Thread-level completion gates: per-project structural + quality checks and a
 * delivery preview for delivery-scope plans. release.apply is never offered.
 */
/** 线程最终门禁：结构校验 + 质量/交付预检（release.preview），不自动发布。 */
export async function runFinalGates(thread: AgentThread, run: RunContext, planScopeRoles: McpRole[]): Promise<FinalGateResult> {
  const failures: string[] = [];
  const evidenceList: AgentEvidence[] = [];
  const projects = threadProjectIds(thread);
  if (!projects.length) {
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
      failures.push(`项目 ${projectId} 结构校验未通过（${errors.length} 项问题）`);
      continue;
    }
    evidenceList.push(evidence('structural_validation', `项目 ${projectId} 结构校验通过`));

    try {
      evidenceList.push(...await verifyFormalRules(run, projectId));
    } catch (error) {
      failures.push(error instanceof GateFailure ? error.message : String(error));
    }

    // 测试是系统协议的一部分：写计划完成前必须运行回归，预存失败不阻塞、引入失败必须修复。
    if (testGateApplies(thread)) {
      const test = await runTestGate(thread, run, projectId);
      failures.push(...test.failures);
      evidenceList.push(...test.evidence);
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
        const blockers = scopeRelevantBlockers(thread, ((quality.data as any)?.blockers || []) as Array<string | { code?: string; title?: string; message?: string }>);
        const ready = (quality.data as any)?.ready === true || blockers.length === 0;
        if (!ready) {
        failures.push(`项目 ${projectId} 质量门禁未通过：${blockerText(blockers).slice(0, 400)}`);
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
        const blockers = scopeRelevantBlockers(thread, ((preview.data as any)?.quality?.blockers || []) as Array<string | { code?: string; title?: string; message?: string }>);
        const ready = (preview.data as any)?.ready === true || blockers.length === 0;
        if (!ready) {
          failures.push(`项目 ${projectId} 发布预检未就绪：${blockerText(blockers).slice(0, 400)}`);
        } else {
          evidenceList.push(evidence('delivery_preview', `项目 ${projectId} 发布预检就绪`));
        }
      }
    }
  }
  return { passed: failures.length === 0, failures, evidence: evidenceList };
}
