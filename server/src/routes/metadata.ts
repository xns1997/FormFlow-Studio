import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { serverDataPath } from '../config/paths';
const router = Router(); const dir = serverDataPath('metadata');
const pathFor = (id: string) => `${dir}/${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`;
router.get('/:projectId', (req, res) => {
  const path = pathFor(req.params.projectId);
  if (!existsSync(path)) return res.json({ projectId: req.params.projectId, fields: {} });
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return res.json(parsed && typeof parsed === 'object' ? parsed : { projectId: req.params.projectId, fields: {} });
  } catch {
    // 元数据文件损坏时返回空字段，避免整个路由 500。
    return res.json({ projectId: req.params.projectId, fields: {} });
  }
});
router.put('/:projectId', (req, res) => { mkdirSync(dir, { recursive: true }); const value = { projectId: req.params.projectId, fields: req.body.fields || {}, updatedAt: new Date().toISOString() }; writeFileSync(pathFor(req.params.projectId), JSON.stringify(value, null, 2)); res.json(value); });
export { router as metadataRouter };
