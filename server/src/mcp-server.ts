import { Router } from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { AuthRequest, AuthUser } from './middleware/auth';
import { verifyToken } from './middleware/auth';
import { env } from './config/env';
import {
  executeFormFlowTool, isMcpRole, listFormFlowTools, MCP_ROLE_CATALOG,
  type McpRole, type ToolContext,
} from './services/formflow-tool-registry';
import { projectSummary, requireProject, validateProjectModel } from './services/project-authoring';

// Zod's JSON-Schema bridge currently rejects conditional keywords. Keep the
// base shape for MCP discovery; the registry's own validator still enforces
// all conditional constraints before a tool handler can run.
function mcpCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mcpCompatibleSchema);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === 'if' || key === 'then' || key === 'else') continue;
    if (key === 'allOf' && Array.isArray(child)) {
      const retained = child.filter((entry) => !entry || typeof entry !== 'object' || !('if' in entry));
      if (retained.length > 0) result[key] = retained.map(mcpCompatibleSchema);
      continue;
    }
    result[key] = mcpCompatibleSchema(child);
  }
  return result;
}

export function createMcpServer(role: McpRole, context: ToolContext) {
  const scopedContext = { ...context, mcpRole: role };
  const server = new McpServer({ name: `formflow-${role}`, version: '2.0.0' });
  for (const tool of listFormFlowTools(role)) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: z.fromJSONSchema(mcpCompatibleSchema(tool.inputSchema) as any),
      annotations: {
        readOnlyHint: tool.risk === 'read',
        destructiveHint: tool.risk === 'destructive',
        idempotentHint: tool.risk !== 'read',
      },
    }, async (argumentsValue: any) => {
      const result = await executeFormFlowTool(tool.name, argumentsValue || {}, scopedContext);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as any, isError: !result.ok && !('status' in result) };
    });
  }
  server.registerResource('role-capabilities', `formflow://roles/${role}/capabilities`, { mimeType: 'application/json', description: '当前专职 MCP 能力' }, async (uri) => {
    const result = await executeFormFlowTool('system.capabilities.get', {}, scopedContext);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result.ok ? result.data : result) }] };
  });
  if (role === 'form') server.registerResource('component-catalog', 'formflow://catalog/components', { mimeType: 'application/json', description: 'FormFlow 表单控件目录' }, async (uri) => {
    const result = await executeFormFlowTool('catalog.components.list', {}, scopedContext);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result.ok ? result.data : result) }] };
  });
  if (role === 'workflow') server.registerResource('workflow-node-catalog', 'formflow://catalog/workflow-nodes', { mimeType: 'application/json', description: 'FormFlow 工作流节点目录' }, async (uri) => {
    const result = await executeFormFlowTool('catalog.workflow_nodes.list', {}, scopedContext);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result.ok ? result.data : result) }] };
  });
  if (role === 'behavior' || role === 'form') server.registerResource('event-catalog', 'formflow://catalog/events', { mimeType: 'application/json', description: 'FormFlow 行为事件目录' }, async (uri) => {
    const result = await executeFormFlowTool('catalog.events.list', {}, scopedContext);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result.ok ? result.data : result) }] };
  });
  if (role === 'project') server.registerResource('project-summaries', 'formflow://projects', { mimeType: 'application/json', description: '当前可见项目摘要' }, async (uri) => {
    const listed = await executeFormFlowTool('project.list', {}, scopedContext); const visible = listed.ok && Array.isArray(listed.data) ? listed.data : [];
    const projects = visible.flatMap((item: any) => { try { return [{ ...item, summary: projectSummary(requireProject(item.id)) }]; } catch { return []; } });
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(projects) }] };
  });
  if (role === 'quality' || role === 'delivery') server.registerResource('project-validation', new ResourceTemplate('formflow://projects/{projectId}/validation', { list: undefined }), { mimeType: 'application/json', description: '项目校验报告' }, async (uri, variables) => {
    const report = validateProjectModel(requireProject(String(variables.projectId)));
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(report) }] };
  });
  return server;
}

export const mcpRouter = Router();
mcpRouter.all('/', (_req, res) => res.status(410).json({ error: '统一 MCP 已移除，请使用 /mcp/:role', roles: MCP_ROLE_CATALOG }));
mcpRouter.all('/:role', async (req: AuthRequest, res) => {
  const role = req.params.role;
  if (!isMcpRole(role)) return res.status(404).json({ jsonrpc: '2.0', error: { code: -32602, message: `未知 MCP 角色：${role}`, data: { roles: MCP_ROLE_CATALOG } }, id: req.body?.id ?? null });
  if (env.mode === 'cloud' && !req.user) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: '需要 Bearer Token' }, id: null });
  if (env.mode === 'cloud' && !(req as any).tenantId) return res.status(422).json({ jsonrpc: '2.0', error: { code: -32002, message: '需要 x-tenant-id' }, id: null });
  const context: ToolContext = { tenantId: (req as any).tenantId, userId: req.user?.id, user: req.user, requestId: (req as any).requestId, mcpRole: role };
  const server = createMcpServer(role, context); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: error instanceof Error ? error.message : String(error) }, id: null });
  } finally {
    res.on('close', () => { transport.close().catch(() => undefined); server.close().catch(() => undefined); });
  }
});

export async function startStdioMcpServer(role: McpRole) {
  let authenticated: AuthUser | undefined;
  const token = process.env.FORMFLOW_TOKEN;
  if (token) authenticated = verifyToken(token);
  if (env.mode === 'cloud' && !authenticated) throw new Error('云端 stdio MCP 必须设置有效 FORMFLOW_TOKEN');
  if (env.mode === 'cloud' && !process.env.FORMFLOW_TENANT_ID) throw new Error('云端 stdio MCP 必须设置 FORMFLOW_TENANT_ID');
  const server = createMcpServer(role, { tenantId: process.env.FORMFLOW_TENANT_ID, userId: authenticated?.id, user: authenticated, mcpRole: role });
  await server.connect(new StdioServerTransport());
}
