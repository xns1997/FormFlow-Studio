import { getFormFlowTool, listFormFlowTools, type McpRole } from './formflow-tool-registry';

/**
 * Project-agent tool policy.
 *
 * Pure logic that shapes which tools a project agent may see and how its
 * arguments are prepared (e.g. injecting the latest checkpoint revision).
 * Kept beside the tool registry so the policy lives at the seam instead of
 * leaking out of an HTTP route; the route and the MCP test both import here.
 */
export function listProjectAgentTools(role: McpRole) {
  return listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply');
}

export function projectAgentToolArguments(toolName: string, argumentsValue: Record<string, any>, checkpointRevision?: string) {
  const definition = getFormFlowTool(toolName);
  const supportsRevision = Boolean((definition?.inputSchema as any)?.properties?.baseRevision);
  return supportsRevision && checkpointRevision && !argumentsValue?.baseRevision ? { ...argumentsValue, baseRevision: checkpointRevision } : argumentsValue;
}
