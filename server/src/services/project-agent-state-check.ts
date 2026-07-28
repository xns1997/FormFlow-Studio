import { createHash } from 'node:crypto';

export type ProjectStateCheckReason = 'initial_grounding' | 'before_question' | 'orchestration_stalled' | 'recovery_question';

export interface ProjectStateCheckItem {
  projectId: string;
  current: boolean;
  available: boolean;
  revision?: string;
  revisionChanged: boolean;
  business: {
    name?: string;
    description?: string;
    dataSources: number;
    sheets: number;
    forms: number;
    workflows: number;
    behaviors: number;
    outputs: number;
    testSuites: number;
    latestTestPassed?: boolean;
    dataOverview: string[];
    formOverview: string[];
    workflowOverview: string[];
  };
  validation: { valid: boolean; issueCount: number; issues: string[] };
  error?: string;
}

export interface ProjectStateCheckSummary {
  checkedAt: string;
  reason: ProjectStateCheckReason;
  procedure: ['inspect_business_structure', 'validate_project', 'refresh_revision', 'summarize_for_decision'];
  projects: ProjectStateCheckItem[];
  summary: string;
  fingerprint: string;
}

const list = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : undefined;
const named = (value: any, fallback: string) => text(value?.name || value?.title || value?.id, 60) || fallback;

function validationSummary(result: any) {
  if (!result?.ok) return { valid: false, issueCount: 1, issues: [text(result?.error?.message, 180) || '项目校验失败'] };
  const data = result.data || {};
  const raw = [...list(data.errors), ...list(data.issues), ...list(data.diagnostics)].filter(Boolean);
  const issues = raw.slice(0, 6).map((item: any) => text(typeof item === 'string' ? item : item.message || item.code, 180) || '未命名校验问题');
  const valid = typeof data.valid === 'boolean' ? data.valid : raw.length === 0;
  return { valid, issueCount: raw.length, issues };
}

export function summarizeCheckedProject(input: {
  projectId: string;
  current: boolean;
  previousRevision?: string;
  inspect: any;
  validation: any;
  loaded: any;
}): ProjectStateCheckItem {
  if (!input.inspect?.ok || !input.loaded?.ok) {
    return { projectId: input.projectId, current: input.current, available: false, revisionChanged: false,
      business: { dataSources: 0, sheets: 0, forms: 0, workflows: 0, behaviors: 0, outputs: 0, testSuites: 0, dataOverview: [], formOverview: [], workflowOverview: [] },
      validation: validationSummary(input.validation), error: text(input.inspect?.error?.message || input.loaded?.error?.message, 180) || '无法读取项目状态' };
  }
  const summary = input.inspect.data || input.loaded.data?.summary || {};
  const dataSources = list(summary.data); const forms = list(summary.forms); const workflows = list(summary.workflows);
  const revision = text(input.loaded.data?.revision, 120);
  const behavior = summary.behaviors || {};
  const dataOverview = dataSources.slice(0, 8).map((source: any) => `${named(source, '数据源')}：${list(source.sheets).length} 个工作表`);
  const formOverview = forms.slice(0, 8).map((form: any) => `${named(form, '表单')}：${Number(form.components || 0)} 个控件`);
  const workflowOverview = workflows.slice(0, 8).map((flow: any) => `${named(flow, '流程')}：${Number(flow.nodes || 0)} 个节点`);
  return {
    projectId: input.projectId, current: input.current, available: true, revision,
    revisionChanged: Boolean(input.previousRevision && revision && input.previousRevision !== revision),
    business: {
      name: text(summary.project?.name, 80), description: text(summary.project?.description, 200), dataSources: dataSources.length,
      sheets: dataSources.reduce((count: number, source: any) => count + list(source.sheets).length, 0), forms: forms.length, workflows: workflows.length,
      behaviors: Number(behavior.global || 0) + Number(behavior.sheets || 0) + Number(behavior.forms || 0), outputs: list(summary.outputs).length,
      testSuites: Number(summary.testing?.suites || 0), latestTestPassed: typeof summary.testing?.latestPassed === 'boolean' ? summary.testing.latestPassed : undefined,
      dataOverview, formOverview, workflowOverview,
    },
    validation: validationSummary(input.validation),
  };
}

export function createProjectStateCheckSummary(reason: ProjectStateCheckReason, projects: ProjectStateCheckItem[], checkedAt = new Date().toISOString()): ProjectStateCheckSummary {
  const available = projects.filter((item) => item.available); const invalid = projects.filter((item) => !item.validation.valid);
  const changed = projects.filter((item) => item.revisionChanged);
  const summary = !projects.length ? '当前尚未创建或限定项目。' : `已检查 ${projects.length} 个项目：${available.length} 个可读取，${invalid.length} 个存在校验问题${changed.length ? `，${changed.length} 个在上次观察后发生变化` : ''}。`;
  const stable = projects.map(({ projectId, available: ok, revision, business, validation }) => ({ projectId, ok, revision, business, validation }));
  return { checkedAt, reason, procedure: ['inspect_business_structure', 'validate_project', 'refresh_revision', 'summarize_for_decision'], projects, summary,
    fingerprint: createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 20) };
}

export function compactProjectStateCheck(summary: ProjectStateCheckSummary) {
  return { checkedAt: summary.checkedAt, summary: summary.summary, projects: summary.projects.map((item) => ({
    project: item.business.name || item.projectId, current: item.current, available: item.available, changedSinceLastCheck: item.revisionChanged,
    structure: { dataSources: item.business.dataSources, sheets: item.business.sheets, forms: item.business.forms, workflows: item.business.workflows, behaviors: item.business.behaviors, outputs: item.business.outputs, testSuites: item.business.testSuites },
    data: item.business.dataOverview, forms: item.business.formOverview, workflows: item.business.workflowOverview,
    validation: item.validation, error: item.error,
  })) };
}
