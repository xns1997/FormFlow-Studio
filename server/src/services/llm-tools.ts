import {
  executeFormFlowTool, getFormFlowTool, listFormFlowTools, registerExternalFormFlowTool,
  type FormFlowToolDefinition, type McpRole, type ToolContext,
} from './formflow-tool-registry';

export type LlmToolHandler = FormFlowToolDefinition['handler'];

export function registerLlmTool(role: McpRole, name: string, handler: LlmToolHandler) {
  return registerExternalFormFlowTool({
    name,
    title: name,
    description: `外部注册工具 ${name}`,
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
    risk: 'read',
    ownerRole: role,
    handler,
  });
}

export function executeLlmTool(name: string, argumentsValue: unknown, context: ToolContext) {
  return executeFormFlowTool(name, argumentsValue, context);
}

export { getFormFlowTool, listFormFlowTools };
