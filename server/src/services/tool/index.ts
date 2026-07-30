/**
 * Tool registry barrel export.
 *
 * The original 238-line file is already well-organized with clear sections.
 * This barrel provides the import path for future decomposition:
 *
 *   Registry (definitions, lookup, listing)    → registry.ts  [TODO]
 *   Executor (execution, audit, mutation)       → executor.ts  [TODO]
 *   Policy (preflight, confirmations)           → policy.ts    [TODO]
 *
 * The file is small enough that splitting is optional — the barrel
 * provides the organizational structure without the risk.
 */

export {
  validateMcpToolRegistry,
  listFormFlowTools,
  getFormFlowTool,
  executeFormFlowTool,
  registerExternalFormFlowTool,
  MCP_ROLES,
  MCP_ROLE_CATALOG,
  isMcpRole,
  resultSchema,
  anyObject,
} from '../formflow-tool-registry';

export type {
  JsonSchema,
  ToolRisk,
  McpRole,
  ToolContext,
  ToolResult,
  ToolWarning,
  FormFlowToolDefinition,
} from '../formflow-tool-registry';
