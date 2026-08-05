/**
 * Project management tools.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import JSZip from 'jszip';
import { REPOSITORY_ROOT } from '../../config/paths';
import { canAccessProject } from '../permission';
import {
  assertRevision, createEmptyProject, generatedForm, listProjectPackages,
  normalizeFormDesign, packageProject, projectRevision, projectSummary, queryProjectRows, requireProject,
  serializeTableSource, tableFromInput, toolError, validateProjectModel,
} from '../project-authoring';
import { inspectProjectQuality } from '../project-quality';
import { buildProjectTemplate, resolveProjectTemplateId } from '../../../../shared/project-templates';
import { getStagedUpload, consumeStagedUpload } from '../upload-staging';
import type { RegisterFn, ToolHelpers } from './types';

function user(context: any) { return context.user || (context.userId ? { id: context.userId, username: context.userId, role: 'viewer' } : undefined); }

export function registerProjectTools(register: RegisterFn, h: ToolHelpers) {
  const { projectId } = h;
  register({ name: 'project.list', title: '项目列表', description: '列出可见 FormFlow 项目。', inputSchema: h.schema(), risk: 'read', examples: [{ summary: '列出全部项目', arguments: {} }], handler: (_input, context) => listProjectPackages().filter((item) => { try { return canAccessProject(user(context), requireProject(item.id), 'view'); } catch { return false; } }) });
  register({ name: 'project.get', title: '读取项目', description: '读取完整项目模型和 revision。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '读取项目并取最新 revision', arguments: { projectId: 'device_mgmt' }, success: { project: { config: { id: 'device_mgmt', name: '设备巡检管理' }, srcTable: [], forms: [], workflows: [] }, summary: { data: [], forms: [], workflows: [] }, revision: '…' }, errors: [{ code: 'PROJECT_NOT_FOUND', message: '项目不存在' }] }], handler: (input, context) => { const project = requireProject(projectId(input, context)); return { project, summary: projectSummary(project), revision: projectRevision(project) }; } });
  register({ name: 'project.inspect', title: '检查项目', description: '返回适合大模型消费的项目摘要。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '查看项目摘要（表/表单/流程/行为）', arguments: { projectId: 'device_mgmt' } }], handler: (input, context) => projectSummary(requireProject(projectId(input, context))) });
  register({ name: 'project.map', title: '项目结构地图', description: '返回数据表/表单/流程/规则的结构化索引与交叉引用摘要（表单绑定到哪张表、规则挂在哪个表单、流程引用哪些表单），适合大模型快速定位而不必读取整包。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '查看项目结构地图', arguments: { projectId: 'device_mgmt' } }], handler: (input, context) => {
    const project = requireProject(projectId(input, context));
    const tables = (project.srcTable || []).map((table: any) => ({
      id: table.id,
      name: table.name || table.id,
      sheets: (table.sheets || []).map((sheet: any) => ({ name: sheet.name, columns: (sheet.headers || []).length, keyFields: sheet.config?.keyFields || [], readOnly: !!sheet.config?.readOnly })),
    }));
    const tableIds = new Set(tables.map((table: any) => table.id));
    const forms = (project.forms || []).map((form: any) => {
      const boundTables = [...new Set((form.design?.bindings || [])
        .map((binding: any) => binding?.config?.tableId)
        .filter((tableId: string | undefined): tableId is string => Boolean(tableId) && tableIds.has(tableId)))];
      return {
        id: form.id,
        name: form.name || form.id,
        mode: form.design?.formMode || 'edit',
        components: form.design?.components?.length || 0,
        hasRuleCode: Boolean(String(form.ruleCode || '').trim()),
        behaviors: form.behaviors?.length || 0,
        boundTables,
      };
    });
    const workflows = (project.workflows || []).map((flow: any) => ({ id: flow.id, name: flow.name || flow.id, nodes: flow.nodes?.length || 0, edges: flow.edges?.length || 0 }));
    const behaviors = { global: project.globalBehaviors?.length || 0, sheets: project.sheetBehaviors?.length || 0, forms: (project.forms || []).reduce((count: number, form: any) => count + (form.behaviors?.length || 0), 0) };
    const relations = (project.dataRelations || []).map((relation: any) => ({ id: relation.id, from: relation.fromTable || relation.sourceTable, to: relation.toTable || relation.targetTable }));
    return {
      tables,
      forms,
      workflows,
      behaviors,
      relations,
      counts: {
        tables: tables.length,
        forms: forms.length,
        workflows: workflows.length,
        behaviors: behaviors.global + behaviors.sheets + behaviors.forms,
        relations: relations.length,
      },
    };
  } });
  register({ name: 'project.validate', title: '校验项目', description: '运行 FormFlow v2 结构、引用和主键校验。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '校验项目结构', arguments: { projectId: 'device_mgmt' }, success: { valid: true, errors: [], counts: { forms: 2, dataSources: 1, workflows: 1, behaviors: 2, outputs: 0 } }, errors: [{ code: 'MISSING_KEY', message: '可编辑 Sheet 必须配置主键' }] }], handler: (input, context) => validateProjectModel(requireProject(projectId(input, context))) });
  register({ name: 'project.create', title: '创建项目', description: '创建空 FormFlow v2 项目。', inputSchema: h.schema(['id', 'name', 'idempotencyKey'], { id: h.string, name: h.string, idempotencyKey: h.string }), risk: 'write', examples: [{ summary: '创建空项目', arguments: { id: 'device_mgmt', name: '设备巡检管理', idempotencyKey: 'dev-init-1' }, success: { revision: '…' }, errors: [{ code: 'PROJECT_EXISTS', message: '项目已存在' }] }], handler: (input, context) => h.commitProject(createEmptyProject({ ...input, ownerId: context.userId })) });
  register({ name: 'project.initialize', title: '初始化项目', description: '创建项目并按模板生成基础表单骨架。', inputSchema: h.schema(['id', 'name', 'idempotencyKey'], { id: h.string, name: h.string, description: h.string, author: h.string, tags: { type: 'array', items: h.string }, templateId: h.string, idempotencyKey: h.string }), risk: 'write', examples: [{ summary: '用游戏数据分析模板初始化项目', arguments: { id: 'device_mgmt', name: '设备巡检管理', templateId: 'game_analytics', idempotencyKey: 'init-1' } }], handler: (input, context) => {
    createEmptyProject({ ...input, ownerId: context.userId });
    const requestedTemplateId = String(input.templateId || 'game_analytics');
    const templateId = resolveProjectTemplateId(requestedTemplateId);
    if (!templateId) throw toolError('TEMPLATE_NOT_FOUND', `模板 ${requestedTemplateId} 不存在`, 'templateId');
    const project = buildProjectTemplate(templateId, {
      id: String(input.id), name: String(input.name), description: String(input.description || ''), author: String(input.author || 'FormFlow Agent'),
      tags: Array.isArray(input.tags) ? input.tags.map(String) : ['模板', templateId], ownerId: context.userId,
    });
    return h.commitProject(project);
  } });
  register({ name: 'project.update', title: '更新项目', description: '更新项目元信息或设置；发布草稿由 release.update 负责。', inputSchema: h.schema(['projectId', 'baseRevision', 'idempotencyKey'], { projectId: h.string, baseRevision: h.string, idempotencyKey: h.string, config: h.object, settings: h.object }), risk: 'write', requiredAccess: 'edit', examples: [{ summary: '更新项目描述', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'upd-1', config: { description: '设备巡检管理项目' } } }], handler: (input, context) => { if (input.release) throw toolError('INVALID_ARGUMENT', 'release 草稿必须使用 delivery MCP 的 release.update', 'release'); const project = requireProject(projectId(input, context)); assertRevision(project, input.baseRevision); if (input.config) project.config = { ...project.config, ...input.config, id: project.config.id }; if (input.settings) project.settings = { ...project.settings, ...input.settings }; project.config.updatedAt = new Date().toISOString(); return h.commitProject(project); } });
  register({ name: 'project.clone', title: '克隆项目', description: '将项目克隆为新稳定 ID。', inputSchema: h.schema(['projectId', 'newId', 'idempotencyKey'], { projectId: h.string, newId: h.string, name: h.string, idempotencyKey: h.string }), risk: 'write', requiredAccess: 'view', examples: [{ summary: '克隆项目到新 ID', arguments: { projectId: 'device_mgmt', newId: 'device_mgmt_copy', idempotencyKey: 'clone-1' } }], handler: (input, context) => {
    const source = structuredClone(requireProject(projectId(input, context)));
    const sourceId = source.config.id;
    if (existsSync(join(REPOSITORY_ROOT, 'projects', 'data', `${input.newId}.formflow`))) throw toolError('PROJECT_EXISTS', '目标项目已存在');
    const now = new Date().toISOString();
    source.config = { ...source.config, id: input.newId, name: input.name || `${source.config.name} (副本)`, createdAt: now, updatedAt: now, access: context.userId ? { ownerId: context.userId, members: {} } : source.config.access };
    const sourceFiles = (source.srcTable || []).map((table: any) => {
      const path = join(REPOSITORY_ROOT, 'projects', 'data', `${sourceId}.formflow`, 'data', basename(table.fileName));
      if (!existsSync(path)) throw toolError('SOURCE_FILE_MISSING', `原表 ${table.fileName} 不存在`);
      return { fileName: table.fileName, buffer: readFileSync(path) };
    });
    return h.commitProject(source, sourceFiles);
  } });
  register({ name: 'project.delete', title: '删除项目', description: '永久删除项目包。', inputSchema: h.schema(['projectId', 'idempotencyKey'], { projectId: h.string, confirmationToken: h.string, idempotencyKey: h.string }), risk: 'destructive', requiredAccess: 'manage', impact: (input) => ({ projectId: input.projectId, deletes: 'entire_project' }), examples: [{ summary: '删除项目（需确认）', arguments: { projectId: 'device_mgmt', idempotencyKey: 'del-1' } }], handler: async (input) => { const { deleteProjectPackage } = await import('../project-package-store'); deleteProjectPackage(input.projectId); return { deleted: true, projectId: input.projectId }; } });
  register({ name: 'project.diff', title: '项目差异', description: '比较当前项目和候选 patch 的顶层资源差异。', inputSchema: h.schema(['projectId', 'patch'], { projectId: h.string, patch: h.object }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '比较若更新描述会改哪些顶层资源', arguments: { projectId: 'device_mgmt', patch: { config: { description: '新描述' } } } }], handler: (input, context) => { const project = requireProject(projectId(input, context)); const changes = Object.keys(input.patch || {}).filter((key) => JSON.stringify(project[key]) !== JSON.stringify(input.patch[key])); return { revision: projectRevision(project), changedSections: changes }; } });
  register({ name: 'project.import', title: '导入项目包', description: '从已上传的单文件 .formflow 项目包导入；校验后解包写入项目存储目录。', inputSchema: h.schema(['fileId', 'idempotencyKey'], { fileId: h.string, projectId: h.string, overwrite: h.boolean, baseRevision: h.string, idempotencyKey: h.string, confirmationToken: h.string }), risk: 'write', confirmWhen: (input) => !!input.overwrite, impact: (input) => ({ projectId: input.projectId, overwrite: !!input.overwrite }), examples: [{ summary: '导入已上传的项目包', arguments: { fileId: '<上传返回的 fileId>', idempotencyKey: 'import-1' } }], handler: async (input, context) => {
    const meta = getStagedUpload(String(input.fileId)); if (!meta) throw toolError('FILE_NOT_FOUND', '上传的 .formflow 文件不存在或已过期', 'fileId');
    if (!String(meta.originalName || '').toLowerCase().endsWith('.formflow')) throw toolError('INVALID_PROJECT_PACKAGE_EXTENSION', '仅支持 .formflow 项目包', 'fileId'); if (context.tenantId && meta.tenantId !== context.tenantId) throw toolError('FORBIDDEN_FILE', '上传文件不属于当前租户', 'fileId');
    const zip = await JSZip.loadAsync(readFileSync(meta.path)); const readJson = async (name: string, fallback: any = undefined) => { const entry = zip.file(name); if (!entry) { if (fallback !== undefined) return fallback; throw toolError('INVALID_PROJECT_PACKAGE', `项目包缺少 ${name}`); } try { return JSON.parse(await entry.async('string')); } catch (error) { throw toolError('INVALID_PROJECT_PACKAGE', `项目包内 ${name} 不是合法 JSON：${error instanceof Error ? error.message : '格式错误'}`); } };
    const manifest = await readJson('project.json'); if (manifest.kind !== 'formflow-project' || manifest.formatVersion !== 2) throw toolError('UNSUPPORTED_PROJECT_PACKAGE', '仅支持 FormFlow v2 项目包');
    const formIndex = await readJson('forms/_index.json', { forms: [] }); const forms: any[] = [];
    for (const entry of formIndex.forms || []) { const design = normalizeFormDesign(await readJson(`forms/${entry.fileName}`)); const behaviors = await readJson(`forms/${entry.behaviorsFileName}`, { behaviors: [], ruleCode: '' }); forms.push({ id: entry.id, name: entry.name, design, behaviors: behaviors.behaviors || [], ruleCode: behaviors.ruleCode || '', createdAt: design.createdAt, updatedAt: design.updatedAt }); }
    const dataIndex = await readJson('data/_index.json', { sources: [] }); const srcTable: any[] = []; const sheetBehaviors: any[] = []; const sourceFiles: Array<{ buffer: Buffer; fileName: string }> = [];
    for (const entry of dataIndex.sources || []) { srcTable.push(await readJson(`data/${entry.metaFile}`)); const behaviorFile = await readJson(`data/${entry.behaviorsFile}`, { sheets: [] }); sheetBehaviors.push(...(behaviorFile.sheets || [])); const raw = zip.file(`data/${entry.fileName}`); if (!raw) throw toolError('INVALID_PROJECT_PACKAGE', `项目包缺少原表 data/${entry.fileName}`); sourceFiles.push({ buffer: await raw.async('nodebuffer'), fileName: entry.fileName }); }
    const global = await readJson('global-behaviors.json', { behaviors: [] }); const workflows = await readJson('workflows/workflows.json', { workflows: [] }); const outputs = await readJson('outputs/outputs.json', { outputs: [] }); const testing = await readJson('testing/testing.json', { profiles: [], suites: [], fixtures: [], runs: [] }); const id = String(input.projectId || manifest.config.id); const existing = (() => { try { return requireProject(id); } catch { return undefined; } })();
    if (existing && !canAccessProject(user(context), existing, 'manage')) throw toolError('FORBIDDEN', '需要项目 manage 权限'); if (existing && !input.overwrite) throw toolError('PROJECT_EXISTS', `项目 ${id} 已存在`); if (existing) assertRevision(existing, input.baseRevision);
    const project = { config: { ...manifest.config, id, updatedAt: new Date().toISOString(), ...(context.userId ? { access: { ownerId: context.userId, members: {} } } : {}) }, settings: manifest.settings, release: await readJson('release.json', manifest.release), forms, srcTable, sheetBehaviors, globalBehaviors: global.behaviors || [], workflows: workflows.workflows || [], outputs: outputs.outputs || [], testing };
    const committed = h.commitProject(project, sourceFiles);
    consumeStagedUpload(meta.id);
    return committed;
  } });
  register({ name: 'project.build_from_data', title: '从数据构建项目', description: '一次创建项目、导入数据、配置主键并生成表单。', inputSchema: h.schema(['id', 'name', 'dataSource', 'idempotencyKey'], { id: h.string, name: h.string, dataSource: h.object, forms: { type: 'array' }, idempotencyKey: h.string }), risk: 'write', examples: [{ summary: '从内联数据一次构建项目', arguments: { id: 'device_mgmt', name: '设备巡检管理', idempotencyKey: 'build-1', dataSource: { id: 'device', rows: [{ 编号: 'D-001', 名称: '机床A', 评分: 88 }], config: { keyFields: ['编号'] } }, forms: ['create', 'edit', 'detail'] } }], handler: (input, context) => {
    const project = createEmptyProject({ ...input, ownerId: context.userId });
    const built = tableFromInput({ ...input.dataSource, tenantId: context.tenantId });
    project.srcTable.push(built.table);
    const sheet = built.table.sheets[0];
    const formSpecs = input.forms?.length ? input.forms : [{ id: `${built.table.id}_create`, mode: 'create' }, { id: `${built.table.id}_edit`, mode: 'edit' }, { id: `${built.table.id}_detail`, mode: 'detail' }];
    for (const formInput of formSpecs) project.forms.push(generatedForm(built.table, sheet, formInput));
    project.release.defaultFormId = project.forms[0]?.id;
    return h.commitProject(project, built.sourceFiles);
  } });
  register({ name: 'project.export', title: '导出项目', description: '生成确定性的单文件 .formflow 项目包。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '导出项目包（base64）', arguments: { projectId: 'device_mgmt' } }], handler: async (input, context) => { const buffer = await packageProject(projectId(input, context)); return { fileName: `${projectId(input, context)}.formflow`, encoding: 'base64', content: buffer.toString('base64'), bytes: buffer.length }; } });
  register({ name: 'project.package.export', title: '导出项目包', description: 'project.export 的 .formflow 项目包别名。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '导出项目包', arguments: { projectId: 'device_mgmt' } }], handler: async (input, context) => { const buffer = await packageProject(projectId(input, context)); return { fileName: `${projectId(input, context)}.formflow`, encoding: 'base64', content: buffer.toString('base64'), bytes: buffer.length }; } });
  register({ name: 'project.package.validate', title: '校验项目包', description: '校验当前项目包。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '校验项目包', arguments: { projectId: 'device_mgmt' } }], handler: (input, context) => validateProjectModel(requireProject(projectId(input, context))) });
  register({ name: 'project.quality.inspect', title: '项目质量检查', description: '汇总阶段门禁、结构诊断、绑定缺口和最近测试状态。', inputSchema: h.schema(['projectId'], { projectId: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '查看项目质量门禁', arguments: { projectId: 'device_mgmt' } }], handler: (input, context) => inspectProjectQuality(requireProject(projectId(input, context))) });
}
