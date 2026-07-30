import { executeLlmTool } from '../services/llm-tools';
import { addAgentArtifact, appendAgentEvent, sessionProjectIds, type AgentSessionV2, type AgentTaskNode } from '../services/project-agent-v2-store';
import { shouldRunQualityGate, qualityDiagnosticFingerprint, type QualityDiagnostic } from '../services/project-agent-v2-remediation';
import type { McpRole } from '../services/formflow-tool-registry';
import type { RunContext } from './types';

export const roleTitles: Record<McpRole, string> = { project: '项目专家', data: '数据专家', form: '表单专家', workflow: '流程专家', behavior: '行为规则专家', quality: '质量专家', delivery: '交付专家' };

export class QualityGateFailure extends Error {
  constructor(message: string, readonly diagnostics: QualityDiagnostic[], readonly artifactId: string) { super(message); }
}

export class RemediationVerificationFailure extends Error {
  constructor(message: string, readonly diagnostics: QualityDiagnostic[], readonly artifactId?: string) { super(message); }
}

export async function verifyTask(session: AgentSessionV2, task: AgentTaskNode, run: RunContext) {
  const projectId = task.projectId || session.projectId;
  if (!projectId) {
    const deleted = [...session.events].reverse().find((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.toolName === 'project.delete' && event.data?.result?.ok);
    const successfulTools = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.result?.ok);
    if (!deleted && !successfulTools.length) throw new Error(`${roleTitles[task.role]}没有产生可验证的工具结果或项目 ID`);
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: deleted ? `${task.title}删除验收` : `${task.title}无项目操作验收`, data: { deleted: Boolean(deleted), acceptance: task.acceptance, toolEvidence: successfulTools.map((event) => ({ seq: event.seq, toolName: event.data?.toolName, result: event.data?.result })) } }); task.evidenceArtifactIds.push(artifact.id); appendAgentEvent(session, 'verification_completed', { taskId: task.id, artifactId: artifact.id, deleted: Boolean(deleted) }); return;
  }
  const dataVerification: Array<{ tableId: string; sheetName: string; keyFields: string[]; valid: boolean }> = [];
  if (task.role === 'data') {
    const writes = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && ['data_source.create', 'data_source.import'].includes(event.data?.toolName) && event.data?.result?.ok && event.data?.resource?.tableId);
    for (const event of writes) {
      const tableId = String(event.data.resource.tableId); const sheetName = String(event.data.resource.sheetName || 'Sheet1'); const keyFields = Array.isArray(event.data.resource.keyFields) ? event.data.resource.keyFields.map(String) : [];
      const source: any = await executeLlmTool('data_source.get', { projectId, id: tableId }, { ...run, projectId, mcpRole: 'data' });
      if (!source.ok) throw new Error(`数据源创建后读取失败：${source.error?.message || tableId}`);
      const keys: any = await executeLlmTool('data_keys.validate', { projectId, tableId, sheetName, ...(keyFields.length ? { keyFields } : {}) }, { ...run, projectId, mcpRole: 'data' });
      if (!keys.ok || keys.data?.valid === false) throw new Error(`数据源主键验收失败：${keys.error?.message || JSON.stringify(keys.data?.errors || [])}`);
      dataVerification.push({ tableId, sheetName, keyFields: keys.data?.keyFields || keyFields, valid: true }); appendAgentEvent(session, 'data_verification_completed', { taskId: task.id, tableId, sheetName, keyFields: keys.data?.keyFields || keyFields });
    }
  }
  if (task.role === 'behavior') {
    const writes = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.result?.ok && event.data?.resource?.kind && ['rule_code', 'behavior'].includes(event.data.resource.kind));
    if (task.access === 'write' && !writes.length) throw new Error('行为规则写任务没有产生可验证的 rule_code.update 或 behavior.upsert 工具结果');
    for (const event of writes) {
      const resource = event.data.resource;
      if (resource.kind === 'rule_code') {
        const lint: any = await executeLlmTool('rule_syntax.lint', { projectId, formId: resource.formId, code: resource.code }, { ...run, projectId, mcpRole: 'behavior' });
        const errors = lint.data?.diagnostics?.filter((item: any) => item.severity === 'error') || [];
        if (!lint.ok || errors.length) throw new Error(`规则写入后语法复检失败：${lint.error?.message || errors.map((item: any) => item.code).join('、')}`);
        const test: any = await executeLlmTool('rule_test.run', { projectId, formId: resource.formId, code: resource.code }, { ...run, projectId, mcpRole: 'behavior' });
        if (!test.ok || test.data?.passed === false) throw new Error(`规则写入后隔离测试失败：${test.error?.message || resource.formId}`);
        appendAgentEvent(session, 'behavior_verification_completed', { taskId: task.id, kind: 'rule_code', formId: resource.formId, rules: lint.data?.rules?.length || 0, scenarios: test.data?.scenarios || [] });
      } else {
        const listArgs = { projectId, scope: resource.scope, ...(resource.formId ? { formId: resource.formId } : {}), ...(resource.tableId ? { tableId: resource.tableId } : {}), ...(resource.sheetName ? { sheetName: resource.sheetName } : {}) };
        const listed: any = await executeLlmTool('behavior.list', listArgs, { ...run, projectId, mcpRole: 'behavior' });
        if (!listed.ok) throw new Error(`结构化行为写入后读取失败：${listed.error?.message || resource.id}`);
        const exists = (listed.data || []).some((item: any) => item.id === resource.id);
        if (resource.deleted ? exists : !exists) throw new Error(`结构化行为复检失败：${resource.id}${resource.deleted ? '仍然存在' : '不存在'}`);
        appendAgentEvent(session, 'behavior_verification_completed', { taskId: task.id, kind: resource.deleted ? 'behavior_delete' : 'behavior', scope: resource.scope, id: resource.id });
      }
    }
  }
  const finalQualityGate = shouldRunQualityGate(task);
  const validation: any = await executeLlmTool('project.validate', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (!validation.ok || validation.data?.valid === false) {
    const diagnostics: QualityDiagnostic[] = (validation.data?.errors || []).map((item: any) => ({ severity: 'error', code: item.code || 'PROJECT_VALIDATION_FAILED', path: item.path || 'project', message: item.message || '项目结构校验失败' }));
    if (validation.data?.semantic?.valid === false) appendAgentEvent(session, 'semantic_gate_failed', { taskId: task.id, diagnostics: validation.data.semantic.errors, projectId, revision: session.projectRevisions?.[projectId] });
    if (finalQualityGate && diagnostics.length) {
      const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}结构诊断`, data: { projectId, validation: validation.data, revision: session.projectRevisions?.[projectId] } });
      appendAgentEvent(session, 'quality_gate_failed', { taskId: task.id, artifactId: artifact.id, stage: 'project.validate', diagnostics });
      throw new QualityGateFailure(`${roleTitles[task.role]}结构门禁未通过`, diagnostics, artifact.id);
    }
    throw new Error(`任务验收失败：${validation.error?.message || `${validation.data?.errors?.length || 0} 个结构错误`}`);
  }
  if (task.remediation) {
    const inspection: any = await executeLlmTool('project.quality.inspect', { projectId }, { ...run, projectId, mcpRole: 'quality' });
    if (!inspection.ok) throw new RemediationVerificationFailure(`修复复检失败：${inspection.error?.message || '质量门禁不可用'}`, task.remediation.diagnostics);
    const expected = new Set(task.remediation.diagnosticFingerprints);
    const remaining = (inspection.data?.diagnostics || []).filter((item: QualityDiagnostic) => item.severity === 'error' && expected.has(qualityDiagnosticFingerprint(item)));
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}质量复检`, data: { projectId, repairedDiagnostics: task.remediation.diagnostics, remainingDiagnostics: remaining, inspection: inspection.data, revision: session.projectRevisions?.[projectId] } });
    if (remaining.length) {
      appendAgentEvent(session, 'remediation_verification_failed', { taskId: task.id, gateTaskId: task.remediation.gateTaskId, artifactId: artifact.id, remainingDiagnostics: remaining });
      throw new RemediationVerificationFailure(`自动修复未生效，仍有 ${remaining.length} 个原质量诊断，请按规范字段重新修正`, remaining, artifact.id);
    }
    task.evidenceArtifactIds.push(artifact.id);
    appendAgentEvent(session, 'remediation_verification_completed', { taskId: task.id, gateTaskId: task.remediation.gateTaskId, artifactId: artifact.id });
  }
  let gate: any;
  if (finalQualityGate) gate = await executeLlmTool('project.quality.inspect', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (task.role === 'delivery') gate = await executeLlmTool('release.preview', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (gate && (!gate.ok || gate.data?.ready === false)) {
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}门禁诊断`, data: { projectId, gate: gate.data, revision: session.projectRevisions?.[projectId] } });
    appendAgentEvent(session, 'quality_gate_failed', { taskId: task.id, artifactId: artifact.id, diagnostics: gate.data?.diagnostics || [], blockers: gate.data?.blockers || [] });
    throw new QualityGateFailure(`${roleTitles[task.role]}门禁未通过`, gate.data?.diagnostics || [], artifact.id);
  }
  const latestRun = gate?.data?.latestRun || gate?.data?.quality?.latestRun;
  for (const result of latestRun?.results || []) if (result.category === 'business' && result.passed === true) {
    const scenario = addAgentArtifact(session, { taskId: task.id, kind: 'scenario_result', title: `场景验证：${result.name || result.id}`, data: { projectId, requirementIds: task.requirementIds || [], scenarioId: result.id, assertion: result.assertion, passed: true, revision: session.projectRevisions?.[projectId] } });
    task.evidenceArtifactIds.push(scenario.id); appendAgentEvent(session, 'requirement_verified', { taskId: task.id, artifactId: scenario.id, requirementIds: task.requirementIds || [], scenarioId: result.id });
  }
  if (task.requirementIds?.length) {
    const coverageArtifact = addAgentArtifact(session, { taskId: task.id, kind: 'requirement_coverage', title: `${task.title}需求覆盖证据`, data: { projectId, requirementIds: task.requirementIds, evidenceKinds: task.evidenceKinds || [], verificationScenarioIds: task.verificationScenarioIds || [], validation: { structural: validation.data?.structural, references: validation.data?.references, semantic: validation.data?.semantic }, gate: gate?.data, revision: session.projectRevisions?.[projectId] } });
    task.evidenceArtifactIds.push(coverageArtifact.id);
  }
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}验收证据`, data: { projectId, acceptance: task.acceptance, dataVerification, validation: validation.data, gate: gate?.data, revision: session.projectRevisions?.[projectId] } }); task.evidenceArtifactIds.push(artifact.id); appendAgentEvent(session, 'verification_completed', { taskId: task.id, projectId, artifactId: artifact.id });
}
