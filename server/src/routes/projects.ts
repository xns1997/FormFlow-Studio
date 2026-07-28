import { Router } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import multer from 'multer';
import {
  deleteProjectPackage, listProjectPackages, readProjectPackage,
  getTableSheetData, updateTableSheetData,
  projectPackagePath,
} from '../services/project-package-store';
import type { AuthRequest } from '../middleware/auth';
import { canAccessProject, setProjectMember, type ProjectAccess } from '../services/permission';
import { acquireProjectLock, getProjectLock, releaseProjectLock } from '../services/project-lock';
import { addAudit } from '../services/audit-store';
import {
  commitProject, fullSourceRows, packageProject, projectRevision, tableFromBuffer,
} from '../services/project-authoring';
import { executeFormFlowTool } from '../services/formflow-tool-registry';
import { stageUpload } from '../services/upload-staging';
import { dataVersion } from '../services/data-preview';

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
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '数据不存在', detail: `项目: ${projectId}, 表: ${tableId}, Sheet: ${sheetName}` });
    const start = (page - 1) * pageSize;
    const rows = result.data.slice(start, start + pageSize);
    res.json({ rows, total: result.data.length, page, pageSize, headers: result.headers });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/data/add - 新增行
router.post('/data/add', (req, res) => {
  try {
    const { projectId, tableId, sheetName, row } = req.body;
    if (!projectId || !tableId || !sheetName || !row) return res.status(400).json({ error: '参数不完整' });
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '数据不存在' });
    const next = [...result.data, row];
    updateTableSheetData(projectId, tableId, sheetName, next);
    res.json({ success: true, rowIndex: next.length - 1, total: next.length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/data/update - 更新行
router.post('/data/update', (req, res) => {
  try {
    const { projectId, tableId, sheetName, rowIndex, patch } = req.body;
    if (!projectId || !tableId || !sheetName || rowIndex == null || !patch) return res.status(400).json({ error: '参数不完整' });
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '数据不存在' });
    if (rowIndex < 0 || rowIndex >= result.data.length) return res.status(400).json({ error: '无效行索引' });
    const next = [...result.data];
    next[rowIndex] = { ...next[rowIndex], ...patch };
    updateTableSheetData(projectId, tableId, sheetName, next);
    res.json({ success: true, rowIndex, row: next[rowIndex] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/data/delete - 删除行
router.post('/data/delete', (req, res) => {
  try {
    const { projectId, tableId, sheetName, rowIndex } = req.body;
    if (!projectId || !tableId || !sheetName || rowIndex == null) return res.status(400).json({ error: '参数不完整' });
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '数据不存在' });
    if (rowIndex < 0 || rowIndex >= result.data.length) return res.status(400).json({ error: '无效行索引' });
    const next = result.data.filter((_, i) => i !== rowIndex);
    updateTableSheetData(projectId, tableId, sheetName, next);
    res.json({ success: true, rowIndex, total: next.length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

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
router.post('/:id/data-sources/import', dataSourceUpload.single('file'), (req: AuthRequest, res) => {
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
    const id = existing?.id || stableTableId(project, req.file.originalname);
    const table = tableFromBuffer({ id, fileName: req.file.originalname, buffer: req.file.buffer, existingTable: existing });
    if (existing) project.srcTable = project.srcTable.map((entry: any) => entry.id === id ? table : entry);
    else project.srcTable = [...(project.srcTable || []), table];
    project.config.updatedAt = new Date().toISOString();
    const committed = commitProject(project, [{ fileName: table.fileName, buffer: req.file.buffer }]);
    addAudit({ userId: req.user?.id, username: req.user?.username, action: existing ? 'data-source.replace' : 'data-source.import', resource: id, projectId: req.params.id });
    return res.json({ table, projectUpdatedAt: project.config.updatedAt, revision: committed.revision });
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
    const project = req.body;
    if (!project.config?.id) project.config = { ...project.config, id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (req.user) project.config.access ||= { ownerId: req.user.id, members: {} };
    commitProject(project);
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.create', resource: project.config.id, projectId: project.config.id });
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/projects/:id - 获取项目
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
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
    commitProject(project, newSourceFiles);
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.update', resource: req.params.id, projectId: req.params.id });
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'manage')) return res.status(403).json({ error: '无权管理项目' });
    deleteProjectPackage(req.params.id);
    addAudit({ userId: req.user?.id, username: req.user?.username, action: 'project.delete', resource: req.params.id, projectId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/:id/clone - 克隆项目
router.post('/:id/clone', (req: AuthRequest, res) => {
  try {
    const data = readProjectPackage(req.params.id);
    if (!data) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, data, 'view')) return res.status(403).json({ error: '无权查看项目' });
    const sourceProjectId = data.config.id;
    data.config.id = `proj_${Date.now()}`;
    data.config.name = `${data.config.name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    if (req.user) data.config.access = { ownerId: req.user.id, members: {} };
    const sourceFiles = (data.srcTable || []).map((table: any) => {
      const source = join(projectPackagePath(sourceProjectId), 'data', basename(table.fileName));
      if (!existsSync(source)) throw new Error(`原表缺失: ${table.fileName}`);
      return { fileName: table.fileName, buffer: readFileSync(source) };
    });
    commitProject(data, sourceFiles);
    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/:id/access/:userId', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'manage')) return res.status(403).json({ error: '无权管理项目' });
    const valid: ProjectAccess[] = ['view', 'edit', 'run', 'manage'];
    const grants = Array.isArray(req.body.grants) ? req.body.grants : [];
    if (grants.some((grant: string) => !valid.includes(grant as ProjectAccess))) return res.status(400).json({ error: '无效权限' });
    commitProject(setProjectMember(project, req.params.userId, grants));
    res.json(project.config.access);
  } catch (error) { res.status(500).json({ error: String(error) }); }
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
