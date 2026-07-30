/**
 * Project state checking module.
 *
 * Extracted from project-agent-v2.ts route file.
 * Provides read-only project state inspection for grounding and question reconsideration.
 */

import { executeLlmTool, listFormFlowTools } from '../services/llm-tools';
import {
  summarizeCheckedProject,
  createProjectStateCheckSummary,
  compactProjectStateCheck,
  type ProjectStateCheckReason,
  type ProjectStateCheckSummary,
} from '../services/project-agent-state-check';
import {
  addAgentArtifact,
  appendAgentEvent,
  setAgentPhase,
  sessionProjectIds,
  type AgentSessionV2,
} from '../services/project-agent-v2-store';
import type { McpRole } from '../services/formflow-tool-registry';
import type { RunContext } from './types';

const roleOrder: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];

/**
 * Read-only project check at the start of a turn.
 * Checks capabilities, catalogs, and project state.
 */
export async function ground(session: AgentSessionV2, run: RunContext) {
  setAgentPhase(session, 'grounding');
  const invoke = (role: McpRole, name: string, args: Record<string, unknown>) =>
    executeLlmTool(name, args, { ...run, projectId: session.projectId, mcpRole: role });

  const roleCapabilitiesRaw = Object.fromEntries(
    await Promise.all(roleOrder.map(async (role) => [role, await invoke(role, 'system.capabilities.get', {})])),
  );
  const roleCapabilities = Object.fromEntries(
    roleOrder.map((role) => [role, { available: Boolean((roleCapabilitiesRaw as any)[role]?.ok), toolCount: listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply').length }]),
  );
  const toolCatalog = Object.fromEntries(
    roleOrder.map((role) => [role, { count: listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply').length }]),
  );

  const [componentCatalog, workflowCatalog, eventCatalog] = await Promise.all([
    invoke('form', 'catalog.components.list', {}),
    invoke('workflow', 'catalog.workflow_nodes.list', {}),
    invoke('behavior', 'catalog.events.list', {}),
  ]);

  const projects = await Promise.all(
    sessionProjectIds(session).map(async (projectId) => {
      const previousRevision = session.projectRevisions?.[projectId];
      const [inspect, validation, loaded]: any[] = await Promise.all([
        invoke('project', 'project.inspect', { projectId }),
        invoke('quality', 'project.validate', { projectId }),
        invoke('project', 'project.get', { projectId }),
      ]);
      const revision = loaded.ok ? loaded.data.revision : undefined;
      if (revision) (session.projectRevisions ||= {})[projectId] = revision;
      return summarizeCheckedProject({ projectId, current: projectId === session.projectId, previousRevision, inspect, validation, loaded });
    }),
  );

  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  const projectState = createProjectStateCheckSummary('initial_grounding', projects);
  const artifact = addAgentArtifact(session, {
    kind: 'grounding',
    title: '限定项目只读检查',
    data: {
      roleCapabilities,
      toolCatalog,
      capabilityCatalog: {
        components: Array.isArray((componentCatalog as any).data) ? (componentCatalog as any).data.length : 0,
        workflowNodes: Array.isArray((workflowCatalog as any).data) ? (workflowCatalog as any).data.length : 0,
        events: Array.isArray((eventCatalog as any).data) ? (eventCatalog as any).data.length : 0,
      },
      projectState: compactProjectStateCheck(projectState),
    },
  });

  appendAgentEvent(session, 'grounding_completed', {
    artifactId: artifact.id,
    projectId: session.projectId,
    projectIds: sessionProjectIds(session),
    revision: session.checkpointRevision,
  });

  return artifact;
}

/**
 * Check project state before asking questions.
 * Used to avoid unnecessary questions by checking if the answer can be derived from project state.
 */
export async function checkCurrentProjectState(
  session: AgentSessionV2,
  run: RunContext,
  reason: ProjectStateCheckReason,
): Promise<ProjectStateCheckSummary> {
  appendAgentEvent(session, 'project_state_check_started', { reason, message: '提问前正在核对项目现状' });

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
      return summarizeCheckedProject({ projectId, current: projectId === session.projectId, previousRevision, inspect, validation, loaded });
    }),
  );

  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  const summary = createProjectStateCheckSummary(reason, projects);
  const compact = compactProjectStateCheck(summary);

  addAgentArtifact(session, { kind: 'grounding', title: '提问前项目状态检查', data: compact });
  appendAgentEvent(session, 'project_state_check_completed', {
    reason,
    summary: summary.summary,
    fingerprint: summary.fingerprint,
    changedProjects: projects.filter((item) => item.revisionChanged).length,
    message: '已核对项目现状，正在判断是否仍需询问',
  });

  return summary;
}
