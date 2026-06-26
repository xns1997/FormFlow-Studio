import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const router = Router();
const PROJECTS_DIR = join(import.meta.dirname, '..', 'storage', 'projects');

function projectPath(id: string) { return join(PROJECTS_DIR, `${id}.json`); }

function loadProject(id: string) {
  if (!existsSync(projectPath(id))) return null;
  return JSON.parse(readFileSync(projectPath(id), 'utf-8'));
}

function saveProject(project: any) {
  writeFileSync(projectPath(project.config.id), JSON.stringify(project, null, 2));
}

// GET /api/behaviors/:projectId - 获取所有行为
router.get('/:projectId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json(project.behaviors || []);
});

// POST /api/behaviors/:projectId - 创建行为
router.post('/:projectId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const behavior = { ...req.body, id: `bh_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  project.behaviors = [...(project.behaviors || []), behavior];
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json(behavior);
});

// PUT /api/behaviors/:projectId/:behaviorId - 更新行为
router.put('/:projectId/:behaviorId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  project.behaviors = (project.behaviors || []).map((b: any) => b.id === req.params.behaviorId ? { ...b, ...req.body, updatedAt: new Date().toISOString() } : b);
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json(project.behaviors.find((b: any) => b.id === req.params.behaviorId));
});

// DELETE /api/behaviors/:projectId/:behaviorId - 删除行为
router.delete('/:projectId/:behaviorId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  project.behaviors = (project.behaviors || []).filter((b: any) => b.id !== req.params.behaviorId);
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json({ success: true });
});

export { router as behaviorRouter };
