import { createHash } from 'node:crypto';
import type { AgentArtifact, AgentRequirement, AgentRequirementCoverage, AgentTaskNode } from './project-agent-v2-store';

const heading = /^(目标|数据设计|功能要求|测试与验收|需求|约束|完成标准)s*[:：]?s*$/;
const acknowledgement = /^(确认|执行|继续|是|否|好|可以|开始)$/;

function normalized(value: string) { return value.replace(/^[-*d.s（）()]+/, '').replace(/s+/g, ' ').trim(); }
function requirementId(statement: string) { return `req_${createHash('sha256').update(statement).digest('hex').slice(0, 12)}`; }
function domain(statement: string): AgentRequirement['domain'] {
  if (/(流程|流转|状态|审批|退回|关闭)/.test(statement)) return 'workflow';
  if (/(自动|规则|必填|校验|权限|带出|不得|只有)/.test(statement)) return 'behavior';
  if (/(表单|控件|查询|统计|展示)/.test(statement)) return 'form';
  if (/(数据|字段|主键|记录|档案|工单)/.test(statement)) return 'data';
  if (/(测试|验收|质量|修复)/.test(statement)) return 'quality';
  if (/(交付|发布|预检|导出)/.test(statement)) return 'delivery';
  return 'project';
}

export function compileAgentRequirements(prompt: string): AgentRequirement[] {
  const statements = prompt.split(/\n|[;；]/).map(normalized).filter((line) => line.length >= 6 && !heading.test(line) && !acknowledgement.test(line));
  const unique = [...new Set(statements)].slice(0, 64);
  return unique.map((statement) => ({
    id: requirementId(statement), statement, domain: domain(statement), acceptanceScenarios: [`验证：${statement}`], risk: /(删除|覆盖|级联|发布)/.test(statement) ? 'high' : 'normal',
    capabilityStatus: 'supported', taskIds: [], evidenceArtifactIds: [],
  }));
}

export function mergeAgentRequirements(current: AgentRequirement[] = [], next: AgentRequirement[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

export function validateRequirementTaskCoverage(requirements: AgentRequirement[], tasks: AgentTaskNode[]) {
  const ids = new Set(requirements.map((item) => item.id));
  for (const task of tasks) for (const id of task.requirementIds || []) if (!ids.has(id)) throw new Error(`任务 ${task.id} 引用了不存在的需求 ${id}`);
  const uncovered = requirements.filter((requirement) => requirement.capabilityStatus === 'supported' && !tasks.some((task) => task.requirementIds?.includes(requirement.id)));
  if (uncovered.length) throw new Error(`规划未覆盖需求：${uncovered.map((item) => `${item.id} ${item.statement}`).join('；')}`);
  for (const requirement of requirements) requirement.taskIds = tasks.filter((task) => task.requirementIds?.includes(requirement.id)).map((task) => task.id);
  return { valid: true };
}

export function refreshRequirementCoverage(requirements: AgentRequirement[] = [], tasks: AgentTaskNode[] = [], artifacts: AgentArtifact[] = []): AgentRequirementCoverage {
  for (const requirement of requirements) {
    const linked = tasks.filter((task) => task.requirementIds?.includes(requirement.id));
    const evidence = artifacts.filter((artifact) => linked.some((task) => task.evidenceArtifactIds.includes(artifact.id)));
    requirement.taskIds = linked.map((task) => task.id); requirement.evidenceArtifactIds = evidence.map((artifact) => artifact.id);
    if (requirement.capabilityStatus === 'capability_gap' || requirement.capabilityStatus === 'needs_user_input') continue;
    if (linked.some((task) => ['failed', 'blocked'].includes(task.status))) requirement.capabilityStatus = 'failed';
    else if (linked.length && linked.every((task) => task.status === 'passed') && evidence.some((artifact) => ['scenario_result', 'requirement_coverage'].includes(artifact.kind))) requirement.capabilityStatus = 'verified';
    else if (requirement.capabilityStatus === 'verified' && !linked.every((task) => task.status === 'passed')) requirement.capabilityStatus = 'supported';
  }
  const counts = { total: requirements.length, supported: 0, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0 };
  for (const requirement of requirements) {
    if (requirement.capabilityStatus === 'verified') counts.verified += 1;
    else if (requirement.capabilityStatus === 'failed') counts.failed += 1;
    else if (requirement.capabilityStatus === 'capability_gap') counts.capabilityGaps += 1;
    else if (requirement.capabilityStatus === 'needs_user_input') counts.needsUserInput += 1;
    else counts.supported += 1;
  }
  return { ...counts, complete: counts.total > 0 && counts.verified === counts.total };
}
