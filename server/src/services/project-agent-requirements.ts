import { createHash } from 'node:crypto';
import type { AgentArtifact, AgentRequirement, AgentRequirementCoverage, AgentTaskNode } from './project-agent-v2-store';

function requirementId(statement: string) { return `req_${createHash('sha256').update(statement).digest('hex').slice(0, 12)}`; }

export interface AnalyzedRequirementInput {
  statement: string;
  domain: AgentRequirement['domain'];
  acceptanceScenarios: string[];
  risk?: AgentRequirement['risk'];
}

export function materializeAnalyzedRequirements(input: AnalyzedRequirementInput[]): AgentRequirement[] {
  const unique = new Map<string, AnalyzedRequirementInput>();
  for (const item of input.slice(0, 64)) {
    const statement = String(item.statement || '').replace(/\s+/g, ' ').trim();
    if (statement.length < 4 || unique.has(statement)) continue;
    unique.set(statement, { ...item, statement });
  }
  return [...unique.values()].map((item) => ({
    id: requirementId(item.statement), statement: item.statement, domain: item.domain,
    acceptanceScenarios: (item.acceptanceScenarios || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8),
    risk: item.risk === 'high' ? 'high' : 'normal', capabilityStatus: 'supported', taskIds: [], evidenceArtifactIds: [],
  }));
}

export function validateRequirementTaskCoverage(requirements: AgentRequirement[], tasks: AgentTaskNode[]) {
  const ids = new Set(requirements.map((item) => item.id));
  for (const task of tasks) for (const id of task.requirementIds || []) if (!ids.has(id)) throw new Error(`任务 ${task.id} 引用了不存在的需求 ${id}`);
  const uncovered = requirements.filter((requirement) => requirement.capabilityStatus === 'supported' && !tasks.some((task) => task.requirementIds?.includes(requirement.id)));
  for (const requirement of requirements) requirement.taskIds = tasks.filter((task) => task.requirementIds?.includes(requirement.id)).map((task) => task.id);
  return { valid: uncovered.length === 0, uncovered };
}

export function refreshRequirementCoverage(requirements: AgentRequirement[] = [], tasks: AgentTaskNode[] = [], artifacts: AgentArtifact[] = []): AgentRequirementCoverage {
  for (const requirement of requirements) {
    const allLinked = tasks.filter((task) => task.requirementIds?.includes(requirement.id));
    const linked = allLinked.filter((task) => !['superseded', 'cancelled'].includes(task.status));
    const evidence = artifacts.filter((artifact) => linked.some((task) => task.evidenceArtifactIds.includes(artifact.id)));
    const confirmingEvidence = evidence.some((artifact) => ['scenario_result', 'requirement_coverage'].includes(artifact.kind)
      && Array.isArray((artifact.data as any)?.requirementIds) && (artifact.data as any).requirementIds.includes(requirement.id));
    requirement.taskIds = allLinked.map((task) => task.id); requirement.evidenceArtifactIds = evidence.map((artifact) => artifact.id);
    if (requirement.capabilityStatus === 'capability_gap' || requirement.capabilityStatus === 'needs_user_input') continue;
    if (linked.some((task) => ['failed', 'blocked'].includes(task.status))) requirement.capabilityStatus = 'failed';
    else if (linked.length && linked.every((task) => task.status === 'passed') && confirmingEvidence) requirement.capabilityStatus = 'verified';
    else if (['verified', 'failed'].includes(requirement.capabilityStatus) && (!linked.every((task) => task.status === 'passed') || !confirmingEvidence)) requirement.capabilityStatus = 'supported';
  }
  const counts = { total: requirements.length, planned: 0, supported: 0, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0 };
  for (const requirement of requirements) {
    if (requirement.taskIds.length) counts.planned += 1;
    if (requirement.capabilityStatus === 'verified') counts.verified += 1;
    else if (requirement.capabilityStatus === 'failed') counts.failed += 1;
    else if (requirement.capabilityStatus === 'capability_gap') counts.capabilityGaps += 1;
    else if (requirement.capabilityStatus === 'needs_user_input') counts.needsUserInput += 1;
    else counts.supported += 1;
  }
  return { ...counts, planComplete: counts.total > 0 && counts.planned === counts.total, complete: counts.total > 0 && counts.verified === counts.total };
}
