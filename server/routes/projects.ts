import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const router = Router();
const PROJECTS_DIR = join(import.meta.dirname, '..', 'storage', 'projects');

if (!existsSync(PROJECTS_DIR)) mkdirSync(PROJECTS_DIR, { recursive: true });

function projectPath(id: string) { return join(PROJECTS_DIR, `${id}.json`); }

// GET /api/projects - 列出所有项目
router.get('/', (_req, res) => {
  try {
    const files = readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
    const projects = files.map((f) => {
      try {
        const data = JSON.parse(readFileSync(join(PROJECTS_DIR, f), 'utf-8'));
        return { id: data.config?.id || f.replace('.json', ''), name: data.config?.name || f, updatedAt: data.config?.updatedAt, tableCount: data.srcTable?.length || 0 };
      } catch { return null; }
    }).filter(Boolean);
    res.json(projects);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/projects/:id - 获取项目
router.get('/:id', (req, res) => {
  try {
    const data = readFileSync(projectPath(req.params.id), 'utf-8');
    res.json(JSON.parse(data));
  } catch { res.status(404).json({ error: '项目不存在' }); }
});

// POST /api/projects - 创建项目
router.post('/', (req, res) => {
  try {
    const project = req.body;
    if (!project.config?.id) project.config = { ...project.config, id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    writeFileSync(projectPath(project.config.id), JSON.stringify(project, null, 2));
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', (req, res) => {
  try {
    const project = req.body;
    project.config.updatedAt = new Date().toISOString();
    writeFileSync(projectPath(req.params.id), JSON.stringify(project, null, 2));
    res.json(project);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', (req, res) => {
  try {
    const path = projectPath(req.params.id);
    if (existsSync(path)) unlinkSync(path);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/:id/clone - 克隆项目
router.post('/:id/clone', (req, res) => {
  try {
    const data = JSON.parse(readFileSync(projectPath(req.params.id), 'utf-8'));
    data.config.id = `proj_${Date.now()}`;
    data.config.name = `${data.config.name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    writeFileSync(projectPath(data.config.id), JSON.stringify(data, null, 2));
    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as projectRouter };
