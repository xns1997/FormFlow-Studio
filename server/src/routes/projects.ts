import { Router } from 'express';
import {
  deleteProjectPackage, listProjectPackages, readProjectPackage, writeProjectPackage,
  getTableSheetData, updateTableSheetData,
} from '../services/project-package-store';
import type { AuthRequest } from '../middleware/auth';
import { canAccessProject, setProjectMember, type ProjectAccess } from '../services/permission';
import { acquireProjectLock, getProjectLock, releaseProjectLock } from '../services/project-lock';
import { addAudit } from '../services/audit-store';

const router = Router();

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
    writeProjectPackage(project);
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
    writeProjectPackage(project);
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
    data.config.id = `proj_${Date.now()}`;
    data.config.name = `${data.config.name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    if (req.user) data.config.access = { ownerId: req.user.id, members: {} };
    writeProjectPackage(data);
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
    writeProjectPackage(setProjectMember(project, req.params.userId, grants));
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
