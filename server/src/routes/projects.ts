import { Router } from 'express';
import {
  deleteProjectPackage, listProjectPackages, readProjectPackage, writeProjectPackage,
  getTableSheetData, updateTableSheetData,
} from '../services/project-package-store';

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
router.get('/', (_req, res) => {
  try { res.json(listProjectPackages()); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects - 创建项目
router.post('/', (req, res) => {
  try {
    const project = req.body;
    if (!project.config?.id) project.config = { ...project.config, id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    writeProjectPackage(project);
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/projects/:id - 获取项目
router.get('/:id', (req, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json(project);
  } catch { res.status(404).json({ error: '项目不存在' }); }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', (req, res) => {
  try {
    const project = req.body;
    project.config.updatedAt = new Date().toISOString();
    if (project.config.id !== req.params.id) return res.status(400).json({ error: '项目 ID 与路径不一致' });
    if (!readProjectPackage(req.params.id)) return res.status(404).json({ error: '项目不存在' });
    writeProjectPackage(project);
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', (req, res) => {
  try {
    deleteProjectPackage(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/:id/clone - 克隆项目
router.post('/:id/clone', (req, res) => {
  try {
    const data = readProjectPackage(req.params.id);
    if (!data) return res.status(404).json({ error: '项目不存在' });
    data.config.id = `proj_${Date.now()}`;
    data.config.name = `${data.config.name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    writeProjectPackage(data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as projectRouter };
