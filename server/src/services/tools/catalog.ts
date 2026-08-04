/**
 * Catalog and system capability tools.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../../config/paths';
import { PROJECT_TEMPLATES } from '../../../../shared/project-templates';
import { FORM_TEMPLATES, getFormTemplate } from '../../../../shared/form-templates';
import { OPERATION_TEMPLATES, getOperationTemplate } from '../template';
import { requireProject } from '../project-authoring';
import type { RegisterFn, ToolHelpers } from './types';

function componentCatalog() {
  const directory = join(REPOSITORY_ROOT, 'ui', 'src', 'designer', 'controls');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.tsx')).flatMap((name) => {
    const source = readFileSync(join(directory, name), 'utf8');
    return source.split('registerControl({').slice(1).flatMap((block) => {
      const match = block.match(/^\s*\n?\s*type:\s*'([^']+)',\s*label:\s*'([^']+)',\s*category:\s*'([^']+)'/);
      if (!match) return [];
      const allowedProps = [...new Set([...block.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((item) => item[1]))];
      const size = block.match(/defaultSize:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/);
      return [{ type: match[1], label: match[2], category: match[3], allowedProps, defaultSize: size ? { width: Number(size[1]), height: Number(size[2]) } : undefined, source: name }];
    });
  });
}

function workflowCatalog() {
  const root = join(REPOSITORY_ROOT, 'ui', 'nodes'); const result: any[] = [];
  if (!existsSync(root)) return result;
  const walk = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name === 'schema.json') { try { result.push(JSON.parse(readFileSync(path, 'utf8'))); } catch { /* invalid plugin schema stays undiscoverable */ } } } };
  walk(root); return result.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

export function registerCatalogTools(register: RegisterFn, { schema, string }: ToolHelpers, mcpRoles: readonly string[], listFormFlowTools: (role?: string) => any[]) {
  register({ name: 'system.capabilities.get', title: '获取能力', description: '返回当前专职 MCP 的能力、限制和版本。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看当前角色的能力与工具数量', arguments: {} }], handler: (_input, context) => ({ formatVersion: 2, role: context.mcpRole, tools: context.mcpRole ? listFormFlowTools(context.mcpRole).length : listFormFlowTools().length, roles: mcpRoles, limits: { uploadBytes: 50 * 1024 * 1024, inlineBytes: 5 * 1024 * 1024, inlineRows: 10_000, queryPageSize: 500, batchChanges: 1000 }, transports: ['agent', 'mcp-http', 'mcp-stdio'] }) });
  register({ name: 'catalog.templates.list', title: '项目模板目录', description: '列出可用于初始化项目的模板。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看可用项目模板', arguments: {} }], handler: () => PROJECT_TEMPLATES });
  register({ name: 'catalog.form_templates.list', title: '表单模板目录', description: '列出可用于 form.create / form.generate_from_table 的表单模板（空白、基础录入、查询修改、主从详情）。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看表单模板', arguments: {} }], handler: () => FORM_TEMPLATES });
  register({ name: 'catalog.form_templates.get', title: '表单模板详情', description: '读取表单模板的定义、默认表单模式、从表生成能力与可用生成选项。', inputSchema: schema(['key'], { key: string }), risk: 'read', examples: [{ summary: '查看“查询修改”模板详情', arguments: { key: 'lookup-edit' } }], handler: (input) => getFormTemplate(String(input.key)) || (() => { throw new Error(`表单模板 ${input.key} 不存在`); })() });
  register({ name: 'catalog.operation_templates.list', title: '操作模板目录', description: '列出内置与当前项目导入的操作模板及其选择契约。', inputSchema: schema([], { projectId: string, category: string }), risk: 'read', examples: [{ summary: '列出项目内全部操作模板', arguments: { projectId: 'device_mgmt' } }], handler: (input, context) => { const custom = input.projectId ? requireProject(String(input.projectId || context.projectId || '')).customOperationTemplates || [] : []; const templates = [...OPERATION_TEMPLATES, ...custom]; return input.category ? templates.filter((item: any) => item.category === input.category) : templates; } });
  register({ name: 'catalog.operation_templates.get', title: '操作模板详情', description: '读取内置或当前项目导入模板的定义、参数 Schema 和生成物摘要。', inputSchema: schema(['templateId'], { projectId: string, templateId: string }), risk: 'read', examples: [{ summary: '读取操作模板详情', arguments: { projectId: 'device_mgmt', templateId: 'employee-record' } }], handler: (input, context) => getOperationTemplate(input.templateId, input.projectId ? requireProject(String(input.projectId || context.projectId || '')) : undefined) });
  register({ name: 'catalog.components.list', title: '控件目录', description: '列出当前 UI 注册的表单控件。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看可用控件', arguments: {} }], handler: componentCatalog });
  register({ name: 'catalog.components.get', title: '控件详情', description: '读取指定表单控件。', inputSchema: schema(['type'], { type: string }), risk: 'read', examples: [{ summary: '读取 input 控件详情', arguments: { type: 'input' } }], handler: (input) => componentCatalog().find((item) => item.type === input.type) || (() => { throw new Error(`控件 ${input.type} 不存在`); })() });
  register({ name: 'catalog.workflow_nodes.list', title: '流程节点目录', description: '列出全部工作流节点 Schema。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看流程节点目录', arguments: {} }], handler: () => workflowCatalog().map(({ id, label, description, category, kind, ports }: any) => ({ id, label, description, category, kind, ports })) });
  register({ name: 'catalog.workflow_nodes.get', title: '流程节点详情', description: '读取工作流节点完整 Schema。', inputSchema: schema(['id'], { id: string }), risk: 'read', examples: [{ summary: '读取条件节点完整 Schema（端口/属性）', arguments: { id: 'behavior-condition' } }], handler: (input) => workflowCatalog().find((item: any) => item.id === input.id) || (() => { throw new Error(`节点 ${input.id} 不存在`); })() });
  register({ name: 'catalog.events.list', title: '事件目录', description: '列出表单、字段、控件和工作表行为事件。', inputSchema: schema(), risk: 'read', examples: [{ summary: '查看行为事件', arguments: {} }], handler: () => ['formLoad', 'formSubmit', 'fieldChange', 'fieldFocus', 'fieldBlur', 'onClick', 'onChange', 'onFocus', 'onBlur', 'onSubmit', 'onTabChange', 'sheetLoad', 'rowChange'] });
}
