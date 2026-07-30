import { refreshRequirementCoverage } from '../services/project-agent-requirements';
import { completionBlockers } from '../services/project-agent-actions';
import { executeLlmTool } from '../services/llm-tools';
import { addAgentArtifact, appendAgentEvent, sessionProjectIds, type AgentSessionV2, type AgentPlanRevision, type AgentTaskNode } from '../services/project-agent-v2-store';
import { summarizeCheckedProject, createProjectStateCheckSummary, compactProjectStateCheck, type ProjectStateCheckSummary } from '../services/project-agent-state-check';
import type { McpRole } from '../services/formflow-tool-registry';
import type { RunContext, QuickObservation, TaskObservation, DeepObservation, Reflection } from './types';

export class ProjectAgentObserver {
  /**
   * Lightweight observation: 0 MCP calls. Analyzes task states and coverage.
   */
  observeQuick(session: AgentSessionV2, plan: AgentPlanRevision): QuickObservation {
    const tasks = plan.tasks;
    const coverage = refreshRequirementCoverage(session.requirements || [], tasks, session.artifacts);
    const progress = {
      total: tasks.length,
      passed: tasks.filter(t => t.status === 'passed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      pending: tasks.filter(t => t.status === 'pending').length,
    };
    const failures = tasks
      .filter(t => ['failed', 'blocked'].includes(t.status))
      .map(t => ({
        taskId: t.id,
        role: t.role,
        title: t.title,
        error: t.error || '未知错误',
        failureClass: t.failureClass,
      }));
    const blockers = completionBlockers(session, plan);
    return { coverage, progress, failures, blockers };
  }

  /**
   * Medium observation: 1-2 MCP calls. Adds project validation.
   */
  async observeAfterTask(
    session: AgentSessionV2,
    plan: AgentPlanRevision,
    task: AgentTaskNode,
    run: RunContext,
  ): Promise<TaskObservation> {
    const quick = this.observeQuick(session, plan);
    const projectId = task.projectId || session.projectId;
    let validation = { valid: true, issueCount: 0, issues: [] as string[] };
    if (projectId) {
      try {
        const result: any = await executeLlmTool('project.validate', { projectId }, { ...run, projectId, mcpRole: task.role });
        if (result.ok) {
          const errors = result.data?.errors || [];
          validation = {
            valid: result.data?.valid !== false,
            issueCount: errors.length,
            issues: errors.slice(0, 6).map((e: any) => e.message || e.code || '校验问题'),
          };
        }
      } catch {
        // Validation call failed — don't block observation
      }
    }
    return { ...quick, validation };
  }

  /**
   * Deep observation: 3×N MCP calls. Full project state check.
   */
  async observeDeep(
    session: AgentSessionV2,
    run: RunContext,
    reason: 'before_question' | 'orchestration_stalled' | 'recovery_question',
  ): Promise<DeepObservation> {
    appendAgentEvent(session, 'deep_observation_started', { reason });
    const projects = await Promise.all(
      sessionProjectIds(session).map(async (projectId) => {
        const previousRevision = session.projectRevisions?.[projectId];
        const invoke = (role: McpRole, name: string) =>
          executeLlmTool(name, { projectId }, { ...run, projectId, mcpRole: role });
        const [inspect, validation, loaded]: any[] = await Promise.all([
          invoke('project', 'project.inspect'),
          invoke('quality', 'project.validate'),
          invoke('project', 'project.get'),
        ]);
        const revision = loaded.ok ? loaded.data.revision : undefined;
        if (revision) (session.projectRevisions ||= {})[projectId] = revision;
        return summarizeCheckedProject({
          projectId,
          current: projectId === session.projectId,
          previousRevision,
          inspect,
          validation,
          loaded,
        });
      }),
    );
    session.checkpointRevision = session.projectId
      ? session.projectRevisions?.[session.projectId]
      : undefined;
    const projectState = createProjectStateCheckSummary(reason, projects);
    const activePlan = session.plans.find(p => p.id === session.activePlanId) || session.plans.at(-1);
    const quick = activePlan ? this.observeQuick(session, activePlan) : {
      coverage: { total: 0, planned: 0, supported: 0, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0, planComplete: false, complete: false },
      progress: { total: 0, passed: 0, failed: 0, blocked: 0, pending: 0 },
      failures: [],
      blockers: [],
    };
    appendAgentEvent(session, 'deep_observation_completed', {
      reason,
      fingerprint: projectState.fingerprint,
      summary: projectState.summary,
    });
    return { projectState, quick };
  }

  /**
   * Self-reflection: analyze recent execution patterns.
   */
  reflect(session: AgentSessionV2, plan: AgentPlanRevision): Reflection {
    const recentEvents = session.events.slice(-30);
    const failedTasks = plan.tasks.filter(t => t.status === 'failed');

    // Detect repeated failure patterns
    const failureFingerprints = new Map<string, number>();
    for (const task of failedTasks) {
      const key = `${task.role}:${task.failureClass || 'unknown'}`;
      failureFingerprints.set(key, (failureFingerprints.get(key) || 0) + 1);
    }
    const repeated = [...failureFingerprints.entries()].filter(([, count]) => count >= 2);

    if (repeated.length > 0) {
      const [pattern, count] = repeated[0];
      return {
        needAdjustment: true,
        reason: 'repeated_failures',
        suggestion: `检测到 ${pattern} 模式重复失败 ${count} 次，建议更换执行策略或请求专家协助`,
        pattern,
      };
    }

    // Detect stalled progress
    const recentObservations = (session.observations || []).slice(-4);
    if (recentObservations.length >= 2) {
      const allFailed = recentObservations.every(o => o.status === 'failed');
      if (allFailed) {
        return {
          needAdjustment: true,
          reason: 'stalled_progress',
          suggestion: '连续多次行动均未成功，建议检查前置条件或更换方法',
          pattern: 'stalled',
        };
      }
    }

    return { needAdjustment: false };
  }
}
