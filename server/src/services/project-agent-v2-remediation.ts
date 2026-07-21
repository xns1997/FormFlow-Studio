import type { AgentPlanRevision, AgentTaskNode } from './project-agent-v2-store';
import type { McpRole } from './formflow-tool-registry';

export type QualityDiagnostic = { severity?: string; code?: string; path?: string; message?: string };

export function qualityDiagnosticFingerprint(item: QualityDiagnostic) {
  return `${String(item.code || 'QUALITY')}:${String(item.path || 'project')}`;
}

export function shouldRunQualityGate(task: AgentTaskNode) {
  if (task.role !== 'quality') return false;
  const text = `${task.title}\n${task.instruction}\n${task.acceptance.join('\n')}`;
  return /质量(检查|门禁|验收)|项目校验|执行.{0,8}回归测试|project\.quality\.inspect/i.test(text);
}

function diagnosticRole(item: QualityDiagnostic): McpRole {
  const path = String(item.path || ''); const code = String(item.code || '');
  if (path.includes('.behaviors.') || path.endsWith('.ruleCode') || /BEHAVIOR|RULE/.test(code)) return 'behavior';
  if (path.startsWith('forms.') || /BUTTON|FORM|COMPONENT|BINDING|CONTROL|SELECT|QUERY|RESULT_TABLE/.test(code)) return 'form';
  if (path.startsWith('data.') || /DATA|SHEET|KEY/.test(code)) return 'data';
  if (path.startsWith('workflows.') || /WORKFLOW|NODE|EDGE/.test(code)) return 'workflow';
  if (path.startsWith('behaviors.')) return 'behavior';
  if (path.startsWith('outputs.') || path.startsWith('release.') || /OUTPUT|RELEASE/.test(code)) return 'delivery';
  return 'project';
}

export function qualityRemediationInstruction(role: McpRole, diagnostics: QualityDiagnostic[]) {
  const details = diagnostics.map((item) => `[${item.code || 'DIAGNOSTIC'}] ${item.path || 'project'}：${item.message || '项目诊断'}`);
  const guidance: Partial<Record<McpRole, string>> = {
    form: '按钮必须通过 props.events 连接与其业务语义匹配的真实脚本，或通过 flowTriggers 连接真实流程；不得写入无效的 props.onClick。日志、消息提示、空结果表或无关流程不算修复。按字段语义选择输入、日期、长文本和上传控件。',
    behavior: '先读取冻结行为 Schema 和引用资源。禁止未知常量、未支持的跨表表达式、重复目标写入和没有当前用户比较的伪权限。',
    workflow: '状态流程必须有实际触发、参数、数据写回、目标字段和需求中的退回路径，不能只画状态节点。',
    data: '明确声明列类型、枚举和主键；禁止根据单条样例把编号、人名和描述推断为枚举。',
  };
  return `根据以下已确认诊断修改 ${role} 领域资源：\n${details.join('\n')}\n只执行本领域资源修正。必须使用实时工具目录和冻结 FormFlow v2 支持的规范字段，不得臆造属性或用占位效果消除诊断。${guidance[role] || ''}写入后运行 project.validate 并读回目标资源；调度器将独立复检原诊断及其对应的需求场景。`;
}

export function replaceInvalidRemediationTask(plan: AgentPlanRevision, failedTaskId: string, maxAttempts: number, round: number) {
  const failed = plan.tasks.find((task) => task.id === failedTaskId); if (!failed?.remediation) return undefined;
  const replacement: AgentTaskNode = {
    ...structuredClone(failed), id: `${failed.id}_corrected_r${round}`, title: `修正诊断项（${failed.role}）`,
    instruction: qualityRemediationInstruction(failed.role, failed.remediation.diagnostics), status: 'pending', attempt: 0, maxAttempts,
    error: undefined, failureClass: undefined, blockedBy: [], evidenceArtifactIds: [], origin: 'diagnostic', generation: (failed.generation || 0) + 1,
    supersedesTaskId: failed.id,
  };
  failed.status = 'superseded'; failed.blockedBy = [];
  const index = plan.tasks.indexOf(failed); plan.tasks.splice(index + 1, 0, replacement);
  for (const task of plan.tasks) if (task.id !== failed.id && task.id !== replacement.id && task.dependsOn.includes(failed.id)) task.dependsOn = [...new Set(task.dependsOn.map((id) => id === failed.id ? replacement.id : id))];
  return replacement;
}

export function supersedeInvalidCrossRoleRepairs(plan: AgentPlanRevision, replacementTaskId: string) {
  const invalid = plan.tasks.filter((task) => task.id !== replacementTaskId && task.role === 'quality' && task.access === 'write' && !['passed', 'running', 'superseded', 'cancelled'].includes(task.status) && (/(?:修复|修改|配置).{0,30}(?:forms\.|表单|按钮|控件)|(?:forms\.|表单|按钮|控件).{0,30}(?:修复|修改|配置)/i.test(`${task.title}\n${task.instruction}`)));
  const invalidIds = new Set(invalid.map((task) => task.id));
  for (const task of invalid) { task.status = 'superseded'; task.blockedBy = []; }
  for (const task of plan.tasks) if (!invalidIds.has(task.id) && task.id !== replacementTaskId && task.dependsOn.some((id) => invalidIds.has(id))) task.dependsOn = [...new Set(task.dependsOn.map((id) => invalidIds.has(id) ? replacementTaskId : id))];
  return [...invalidIds];
}

export function insertQualityRemediationTasks(plan: AgentPlanRevision, gateTask: AgentTaskNode, diagnostics: QualityDiagnostic[], maxAttempts: number, round: number) {
  const actionable = diagnostics.filter((item) => item.severity === 'error');
  if (!actionable.length) return [];
  const groups = new Map<McpRole, QualityDiagnostic[]>();
  for (const item of actionable) { const role = diagnosticRole(item); groups.set(role, [...(groups.get(role) || []), item]); }
  const gateIndex = plan.tasks.findIndex((item) => item.id === gateTask.id); if (gateIndex < 0) return [];
  const originalDependencies = [...gateTask.dependsOn]; let previousDependencies = originalDependencies;
  const tasks = [...groups.entries()].map(([role, items], index): AgentTaskNode => {
    const details = items.map((item) => `[${item.code || 'DIAGNOSTIC'}] ${item.path || 'project'}：${item.message || '项目诊断'}`);
    const task: AgentTaskNode = {
      id: `repair_${gateTask.id}_r${round}_${index + 1}_${role}`, role, title: `自动修正诊断项（${role}）`, access: 'write',
      projectId: gateTask.projectId,
      instruction: qualityRemediationInstruction(role, items),
      dependsOn: [...previousDependencies], acceptance: details.map((item) => `已修复 ${item}`), status: 'pending', attempt: 0, maxAttempts, evidenceArtifactIds: [],
      requirementIds: [...(gateTask.requirementIds || [])], evidenceKinds: [...(gateTask.evidenceKinds || [])], verificationScenarioIds: [...(gateTask.verificationScenarioIds || [])],
      remediation: { gateTaskId: gateTask.id, diagnostics: items, diagnosticFingerprints: items.map(qualityDiagnosticFingerprint) },
    };
    previousDependencies = [task.id]; return task;
  });
  gateTask.dependsOn = [...new Set([...originalDependencies, tasks.at(-1)!.id])];
  // A gate rerun after a concrete repair is a new verification pass, not a retry of
  // the unchanged task. Reset its attempt budget so low-budget bundles still verify.
  gateTask.status = 'pending'; gateTask.attempt = 0; gateTask.error = undefined;
  plan.tasks.splice(gateIndex, 0, ...tasks);
  return tasks;
}
