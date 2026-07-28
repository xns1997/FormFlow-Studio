import { Router } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import multer from 'multer';
import {
  listProjectPackages, readProjectPackage,
  projectPackagePath,
} from '../services/project-package-store';
import type { AuthRequest } from '../middleware/auth';
import { canAccessProject, setProjectMember, type ProjectAccess } from '../services/permission';
import { acquireProjectLock, getProjectLock, releaseProjectLock } from '../services/project-lock';
import { addAudit } from '../services/audit-store';
import {
  batchProjectRows, fullSourceRows, packageProject, projectRevision,
  queryProjectRows, serializeTableSource, tableFromBuffer,
} from '../services/project-authoring';
import { executeFormFlowTool } from '../services/formflow-tool-registry';
import { stageUpload } from '../services/upload-staging';
import { dataVersion } from '../services/data-preview';
import { projectMutation } from '../services/project-mutation';
import { projectWriteMetadata, requireDestructiveConfirmation, sendProjectMutationError, setProjectRevision } from '../services/project-mutation-http';

const router = Router();
const dataSourceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function stableTableId(project: any, fileName: string) {
  const base = basename(fileName, extname(fileName)).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'table';
  let candidate = `table_${base}`;
  let index = 2;
  const ids = new Set((project.srcTable || []).map((table: any) => table.id));
  while (ids.has(candidate)) candidate = `table_${base}_${index++}`;
  return candidate;
}

// ── 数据操作（POST，短 URL）— 必须在 /:id 之前 ────

// POST /api/projects/data/query - 查询行数据
router.post('/data/query', (req, res) => {
  try {
    const { projectId, tableId, sheetName, page = 1, pageSize = 100 } = req.body;
    if (!projectId || !tableId || !sheetName) return res.status(400).json({ error: '缺少 projectId / tableId / sheetName' });
    const project = readProjectPackage(projectId);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject((req as AuthRequest).user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
    res.json(queryProjectRows(project, { tableId, sheetName, page, pageSize }));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/data/batch - 使用稳定 rowKey 原子应用一次编辑会话。
router.post('/data/batch', async (req: AuthRequest, res) => {
  try {
    const { projectId, tableId, sheetName, baseVersion, adds = [], updates = [], deletes = [] } = req.body;
    if (!projectId || !tableId || !sheetName) return res.status(400).json({ error: '参数不完整' });
    if (deletes.length && !await requireDestructiveConfirmation(req, res, 'data-rows.batch', projectId, {
      tableId, sheetName, deletes: deletes.length,
    })) return;
    const sourceFiles: Array<{ fileName: string; buffer: Buffer }> = [];
    const result = projectMutation.apply({
      projectId,
      operation: 'data-rows.batch',
      payload: { tableId, sheetName, baseVersion, adds, updates, deletes },
      ...projectWriteMetadata(req),
      user: req.user,
      access: 'edit',
      sourceFiles,
      change: (draft) => {
        const data = batchProjectRows(draft, { tableId, sheetName, baseVersion, adds, updates, deletes });
        sourceFiles.push(...serializeTableSource(draft, tableId, sheetName));
        return data;
      },
    });
    setProjectRevision(res, result.revision);
    return res.json({ ...result.data, revision: result.revision });
  } catch (error) {
    return sendProjectMutationError(res, error);
  }
});

for (const legacyPath of ['/data/add', '/data/update', '/data/delete']) {
  router.post(legacyPath, (_req, res) => res.status(410).json({
    code: 'LEGACY_ROW_MUTATION_REMOVED',
    error: '逐行索引写入已移除，请使用 /api/projects/data/batch 的稳定 rowKey 原子写入',
  }));
}

router.post('/package/import', dataSourceUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有项目包' });
    const staged = stageUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedBy: req.user?.id,
    });
    const result = await executeFormFlowTool('project.import', {
      fileId: staged.id,
      projectId: req.body.projectId,
      idempotencyKey: `http-import-${staged.id}`,
    }, { user: req.user, userId: req.user?.id, requestId: `http-${staged.id}`, mcpRole: 'project' });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result.data);
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

// GET /api/projects/:id/runtime-data - 按需返回来自原表的完整运行数据。
router.get('/:id/runtime-data', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
    const tables = (project.srcTable || []).map((table: any) => ({
      id: table.id,
      sheets: (table.sheets || []).map((sheet: any) => ({
        name: sheet.name,
        headers: sheet.headers,
        rowCount: sheet.rowCount,
        rows: fullSourceRows(project, table, sheet),
        dataVersion: dataVersion(fullSourceRows(project, table, sheet)),
      })),
    }));
    return res.json({ projectId: req.params.id, revision: projectRevision(project), tables });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

// POST /api/projects/:id/data-sources/import - 原表与项目元数据一次提交。
router.post('/:id/data-sources/import', dataSourceUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'edit')) return res.status(403).json({ error: '无权编辑项目' });
    if (!req.file) return res.status(400).json({ error: '没有文件' });
    const mode = req.body.mode === 'replace' ? 'replace' : 'create';
    const existing = mode === 'replace'
      ? (project.srcTable || []).find((table: any) => table.id === req.body.tableId)
      : undefined;
    if (mode === 'replace' && !existing) return res.status(404).json({ error: '要替换的数据表不存在' });
    if (mode === 'replace' && !await requireDestructiveConfirmation(req, res, 'data-source.replace', req.params.id, {
      projectId: req.params.id,
      tableId: existing.id,
      fileName: existing.fileName,
    })) return;
    const id = existing?.id || stableTableId(project, req.file.originalname);
    const table = tableFromBuffer({ id, fileName: req.file.originalname, buffer: req.file.buffer, existingTable: existing });
    const result = projectMutation.apply({
      projectId: req.params.id,
      operation: existing ? 'data-source.replace' : 'data-source.import',
      payload: { mode, tableId: id, fileName: req.file.originalname, dataHash: table.dataHash },
      ...projectWriteMetadata(req),
      user: req.user,
      access: 'edit',
      sourceFiles: [{ fileName: table.fileName, buffer: req.file.buffer }],
      change: (draft) => {
        if (existing) draft.srcTable = draft.srcTable.map((entry: any) => entry.id === id ? table : entry);
        else draft.srcTable = [...(draft.srcTable || []), table];
        draft.config.updatedAt = new Date().toISOString();
        return table;
      },
    });
    addAudit({ userId: req.user?.id, username: req.user?.username, action: existing ? 'data-source.replace' : 'data-source.import', resource: id, projectId: req.params.id });
    setProjectRevision(res, result.revision);
    return res.json({ table: result.data, projectUpdatedAt: result.project.config.updatedAt, revision: result.revision });
  } catch (error) {
    return res.status(400).json({ error: '数据源导入失败', detail: String(error) });
  }
});

router.get('/:id/package', async (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
    const buffer = await packageProject(req.params.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${project.config.name || req.params.id}.formflow`)}`);
    return res.send(buffer);
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

// ── 项目 CRUD ────────────────────────────────────

// GET /api/projects - 列出所有项目
router.get('/', (req: AuthRequest, res) => {
  try { res.json(listProjectPackages().filter((project: any) => canAccessProject(req.user, project, 'view'))); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects - 创建项目
router.post('/', (req: AuthRequest, res) => {
  try {
    const metadata = projectWriteMetadata(req);
    const project = req.body;
    if (!project.config?.id) project.config = { ...project.config, id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (req.user) project.config.access ||= { ownerId: req.user.id, members: {} };
    const result = projectMutation.create({
      projectId: project.config.id,
      operation: 'project.create',
      payload: project,
      idempotencyKey: metadata.idempotencyKey,
      user: req.user,
      project,
      data: project,
    });
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.create', resource: project.config.id, projectId: project.config.id });
    setProjectRevision(res, result.revision);
    res.json(result.project);
  } catch (e) { sendProjectMutationError(res, e); }
});

// GET /api/projects/:id - 获取项目
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
    setProjectRevision(res, projectRevision(project));
    res.json(project);
  } catch { res.status(404).json({ error: '项目不存在' }); }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', (req: AuthRequest, res) => {
  try {
    const existing = readProjectPackage(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, existing, 'edit')) return res.status(403).json({ error: '无权编辑项目' });
    const lock = getProjectLock(req.params.id);
    if (lock && (!req.user || lock.userId !== req.user.id || req.headers['x-project-lock'] !== lock.token)) return res.status(409).json({ error: '项目编辑锁无效', lock });
    const project = req.body;
    project.config.updatedAt = new Date().toISOString();
    if (project.config.id !== req.params.id) return res.status(400).json({ error: '项目 ID 与路径不一致' });
    if (!readProjectPackage(req.params.id)) return res.status(404).json({ error: '项目不存在' });
    const existingTables = new Map((existing.srcTable || []).map((table: any) => [table.id, table]));
    const newSourceFiles: Array<{ fileName: string; buffer: Buffer }> = [];
    for (const table of project.srcTable || []) {
      const stored = existingTables.get(table.id) as any;
      if (!stored) {
        const totalRows = (table.sheets || []).reduce((sum: number, sheet: any) => sum + Number(sheet.rowCount || 0), 0);
        if (table.fileType !== 'json' || totalRows > 0) return res.status(400).json({ error: '新增非空数据表必须使用项目数据源导入接口', tableId: table.id });
        const value = (table.sheets || []).length === 1
          ? []
          : Object.fromEntries((table.sheets || []).map((sheet: any) => [sheet.name, []]));
        const buffer = Buffer.from(JSON.stringify(value, null, 2));
        table.fileName = basename(table.fileName || `${table.id}.json`);
        table.fileSize = buffer.length;
        table.dataHash = createHash('sha256').update(buffer).digest('hex');
        newSourceFiles.push({ fileName: table.fileName, buffer });
        continue;
      }
      table.fileName = stored.fileName;
      table.fileType = stored.fileType;
      table.fileSize = stored.fileSize;
      table.dataHash = stored.dataHash;
      const incomingSheets = new Map((table.sheets || []).map((sheet: any) => [sheet.name, sheet]));
      table.sheets = (stored.sheets || []).map((storedSheet: any) => {
        const incoming = incomingSheets.get(storedSheet.name) as any;
        return incoming ? { ...storedSheet, config: incoming.config || storedSheet.config } : storedSheet;
      });
    }
    const result = projectMutation.apply({
      projectId: req.params.id,
      operation: 'project.update',
      payload: project,
      ...projectWriteMetadata(req),
      user: req.user,
      access: 'edit',
      sourceFiles: newSourceFiles,
      change: (draft) => {
        for (const key of Object.keys(draft)) delete draft[key];
        Object.assign(draft, project);
        return draft;
      },
    });
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.update', resource: req.params.id, projectId: req.params.id });
    setProjectRevision(res, result.revision);
    res.json(result.project);
  } catch (e) { sendProjectMutationError(res, e); }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'manage')) return res.status(403).json({ error: '无权管理项目' });
    if (!await requireDestructiveConfirmation(req, res, 'project.delete', req.params.id, {
      projectId: req.params.id,
      projectName: project.config?.name,
      deletes: 'entire_project',
    })) return;
    const result = projectMutation.remove({
      projectId: req.params.id,
      operation: 'project.delete',
      payload: { projectId: req.params.id },
      ...projectWriteMetadata(req),
      user: req.user,
      access: 'manage',
      data: { success: true },
    });
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.delete', resource: req.params.id, projectId: req.params.id });
    res.json(result.data);
  } catch (e) { sendProjectMutationError(res, e); }
});

// POST /api/projects/:id/clone - 克隆项目
router.post('/:id/clone', (req: AuthRequest, res) => {
  try {
    const metadata = projectWriteMetadata(req);
    if (!metadata.idempotencyKey) return res.status(400).json({ error: '写入必须提供 idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const data = readProjectPackage(req.params.id);
    if (!data) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, data, 'view')) return res.status(403).json({ error: '无权查看项目' });
    const sourceProjectId = data.config.id;
    data.config.id = `proj_${createHash('sha256').update(metadata.idempotencyKey).digest('hex').slice(0, 16)}`;
    data.config.name = `${data.config.name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    if (req.user) data.config.access = { ownerId: req.user.id, members: {} };
    const sourceFiles = (data.srcTable || []).map((table: any) => {
      const source = join(projectPackagePath(sourceProjectId), 'data', basename(table.fileName));
      if (!existsSync(source)) throw new Error(`原表缺失: ${table.fileName}`);
      return { fileName: table.fileName, buffer: readFileSync(source) };
    });
    const result = projectMutation.create({
      projectId: data.config.id,
      operation: 'project.clone',
      payload: { sourceProjectId, targetProjectId: data.config.id },
      idempotencyKey: metadata.idempotencyKey,
      user: req.user,
      project: data,
      sourceFiles,
      data,
    });
    setProjectRevision(res, result.revision);
    res.json(result.project);
  } catch (e) { sendProjectMutationError(res, e); }
});

router.put('/:id/access/:userId', (req: AuthRequest, res) => {
  try {
    const valid: ProjectAccess[] = ['view', 'edit', 'run', 'manage'];
    const grants = Array.isArray(req.body.grants) ? req.body.grants : [];
    if (grants.some((grant: string) => !valid.includes(grant as ProjectAccess))) return res.status(400).json({ error: '无效权限' });
    const result = projectMutation.apply({
      projectId: req.params.id,
      operation: 'project.access.update',
      payload: { userId: req.params.userId, grants },
      ...projectWriteMetadata(req),
      user: req.user,
      access: 'manage',
      change: (draft) => {
        setProjectMember(draft, req.params.userId, grants);
        draft.config.updatedAt = new Date().toISOString();
        return draft.config.access;
      },
    });
    setProjectRevision(res, result.revision);
    res.json(result.data);
  } catch (error) { sendProjectMutationError(res, error); }
});

router.get('/:id/lock', (req, res) => res.json(getProjectLock(req.params.id) || null));
router.post('/:id/lock', (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: '需要登录' });
  const lock = acquireProjectLock(req.params.id, req.user, Number(req.body.ttlMs));
  return lock ? res.json(lock) : res.status(409).json({ error: '项目正在由其他用户编辑', lock: getProjectLock(req.params.id) });
});
router.delete('/:id/lock', (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: '需要登录' });
  res.json({ success: releaseProjectLock(req.params.id, req.user.id, req.body?.token) });
});

export { router as projectRouter };
