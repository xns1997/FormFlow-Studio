import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../config/env';
import { readProjectPackage, writeProjectPackage } from './project-package-store';
import { compileBehaviorDsl, applyBehaviorDslToComponents, hasBehaviorDslErrors } from '../../../ui/src/services/engine/behaviorDsl';
import type { RuleAgentSession } from './rule-agent-store';

export const ruleHash = (source: string) => createHash('sha256').update(source).digest('hex');

export function inferRuleAgentIntent(prompt: string): 'explain' | 'inspect' | 'edit' | 'lint' | 'test' {
  if (/(状态|当前值|实时|表单数据|看一下表单)/i.test(prompt)) return 'inspect';
  if (/(测试|运行|模拟|场景)/i.test(prompt)) return 'test';
  if (/(检查|语法|lint|报错|诊断)/i.test(prompt)) return 'lint';
  if (/(修改|添加|新增|删除|改成|生成|编写|实现|隐藏|显示|必填|禁用|赋值)/i.test(prompt)) return 'edit';
  return 'explain';
}

export function formContext(projectId: string, formId: string) {
  const project = readProjectPackage(projectId);
  if (!project) throw new Error('项目不存在');
  const form = (project.forms || []).find((item: any) => item.id === formId);
  if (!form) throw new Error('表单不存在');
  const components = form.design?.components || [];
  const fields = components.map((component: any) => String(component.fieldBinding || component.props?.name || '')).filter(Boolean);
  return { project, form, components, fields, tables: project.srcTable || [], workflows: project.workflows || [] };
}

export function lintRuleCode(projectId: string, formId: string, code: string) {
  const context = formContext(projectId, formId);
  return compileBehaviorDsl(code, { fields: context.fields, components: context.components, tables: context.tables, workflows: context.workflows });
}

export function runRuleSandbox(projectId: string, formId: string, code: string) {
  const compilation = lintRuleCode(projectId, formId, code);
  const errors = compilation.diagnostics.filter((item) => item.severity === 'error');
  const mockedEffects = compilation.rules.flatMap((rule) => rule.actions.flatMap((action: any) => {
    if (action.type === 'runWorkflow') return [{ type: 'workflow', detail: `mock run(${action.workflowId || '当前流程'})` }];
    if (action.type === 'submitData') return [{ type: 'submit', detail: 'mock submitData' }];
    if (action.type === 'setOptions') return [{ type: 'data', detail: `mock options(${action.targetField})` }];
    if (action.type === 'showMessage') return [{ type: 'message', detail: `mock message(${action.messageType || 'info'})` }];
    return [];
  }));
  const scenarios = [
    { name: '语法与引用完整性', passed: errors.length === 0, details: errors.length ? errors.map((item) => `L${item.line} [${item.code}] ${item.message}`) : [`${compilation.rules.length} 条规则已编译`] },
    { name: '副作用隔离', passed: true, details: mockedEffects.length ? [`${mockedEffects.length} 个外部动作已转为 mock`] : ['未发现外部副作用'] },
  ];
  return { passed: scenarios.every((item) => item.passed), scenarios, mockedEffects, preview: compilation.preview };
}

export function readRuleReference(query = '') {
  const source = readFileSync(join(env.repositoryRoot, 'docs', 'behavior-rule-syntax.md'), 'utf8');
  const terms = query.toLowerCase().split(/\s+/).filter((item) => item.length > 1);
  const sections = source.split(/(?=^##\s)/m);
  const selected = terms.length ? sections.filter((section) => terms.some((term) => section.toLowerCase().includes(term))).slice(0, 4) : sections.slice(0, 4);
  return (selected.length ? selected : sections.slice(0, 4)).join('\n').slice(0, 8_000);
}

export function createRuleProposal(session: RuleAgentSession, input: { code: string; summary?: string; proposedCode: string; changes?: string[]; assumptions?: string[] }) {
  const compilation = lintRuleCode(session.projectId, session.formId, input.proposedCode);
  return {
    id: `rap_${randomUUID()}`, sessionId: session.id, summary: input.summary || '规则代码修改', proposedCode: input.proposedCode,
    changes: input.changes || [], assumptions: input.assumptions || [], baseRuleHash: ruleHash(input.code), diagnostics: compilation.diagnostics,
    testResult: hasBehaviorDslErrors(compilation) ? undefined : runRuleSandbox(session.projectId, session.formId, input.proposedCode), createdAt: new Date().toISOString(),
  };
}

export function applyRuleProposal(session: RuleAgentSession, proposal: Record<string, any>, baseRuleHash: string, confirmFailedTests: boolean) {
  const { project, form } = formContext(session.projectId, session.formId);
  if (proposal.baseRuleHash !== baseRuleHash || ruleHash(form.ruleCode || '') !== baseRuleHash) throw new Error('规则代码已变更，建议已过期，请重新生成');
  const compilation = lintRuleCode(session.projectId, session.formId, proposal.proposedCode || '');
  if (hasBehaviorDslErrors(compilation)) throw new Error('提案仍包含语法错误，不能应用');
  const testResult = runRuleSandbox(session.projectId, session.formId, proposal.proposedCode || '');
  if (!testResult.passed && !confirmFailedTests) throw new Error('沙箱测试失败，需要二次确认');
  const applied = applyBehaviorDslToComponents(form.design?.components || [], proposal.proposedCode || '');
  if (applied.unapplied.length) throw new Error(applied.unapplied.join('\n'));
  const updatedAt = new Date().toISOString();
  project.forms = project.forms.map((item: any) => item.id === form.id ? { ...item, ruleCode: proposal.proposedCode, design: { ...item.design, components: applied.components, updatedAt }, updatedAt } : item);
  writeProjectPackage(project);
  return { ruleCode: proposal.proposedCode, components: applied.components, updatedAt, testResult };
}
