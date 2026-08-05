import {
  executeFormFlowTool, getFormFlowTool, listFormFlowTools, registerExternalFormFlowTool,
  type FormFlowToolDefinition, type McpRole, type ToolContext,
} from './formflow-tool-registry';

export type LlmToolHandler = FormFlowToolDefinition['handler'];

/** 注册 LLM 工具（角色作用域）。 */
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

/** 执行 LLM 工具（含审计与错误归一化）。 */
export function executeLlmTool(name: string, argumentsValue: unknown, context: ToolContext) {
  return executeFormFlowTool(name, argumentsValue, context);
}

export { getFormFlowTool, listFormFlowTools };
