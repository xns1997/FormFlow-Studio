import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const router = Router();
const HISTORY_DIR = join(import.meta.dirname, '..', 'storage', 'history');
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

function historyPath(projectId: string) { return join(HISTORY_DIR, `${projectId}_versions.json`); }

// GET /api/history/:projectId - 获取版本列表
router.get('/:projectId', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    if (!existsSync(hPath)) return res.json([]);
    res.json(JSON.parse(readFileSync(hPath, 'utf-8')));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/history/:projectId - 创建版本
router.post('/:projectId', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    const versions = existsSync(hPath) ? JSON.parse(readFileSync(hPath, 'utf-8')) : [];
    const nextVersion = versions.length > 0 ? Math.max(...versions.map((v: any) => v.version)) + 1 : 1;
    const version = { id: `${req.params.projectId}_v${nextVersion}`, version: nextVersion, timestamp: new Date().toISOString(), label: req.body.label || `版本 ${nextVersion}`, snapshot: req.body.snapshot || '{}' };
    versions.push(version);
    writeFileSync(hPath, JSON.stringify(versions, null, 2));
    res.json(version);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/history/:projectId/:versionId - 获取版本详情
router.get('/:projectId/:versionId', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    const versions = existsSync(hPath) ? JSON.parse(readFileSync(hPath, 'utf-8')) : [];
    const version = versions.find((v: any) => v.id === req.params.versionId);
    if (!version) return res.status(404).json({ error: '版本不存在' });
    res.json(version);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/history/:projectId/:versionId/restore - 恢复版本
router.post('/:projectId/:versionId/restore', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    const versions = existsSync(hPath) ? JSON.parse(readFileSync(hPath, 'utf-8')) : [];
    const version = versions.find((v: any) => v.id === req.params.versionId);
    if (!version) return res.status(404).json({ error: '版本不存在' });
    res.json(JSON.parse(version.snapshot));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/history/:projectId/:versionId - 删除版本
router.delete('/:projectId/:versionId', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    const versions = existsSync(hPath) ? JSON.parse(readFileSync(hPath, 'utf-8')) : [];
    const filtered = versions.filter((v: any) => v.id !== req.params.versionId);
    writeFileSync(hPath, JSON.stringify(filtered, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/history/:projectId - 清空版本历史
router.delete('/:projectId', (req, res) => {
  try {
    const hPath = historyPath(req.params.projectId);
    if (existsSync(hPath)) unlinkSync(hPath);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as historyRouter };
