import { Router } from 'express';
import { readProjectPackage, writeProjectPackage } from '../services/project-package-store';

const router = Router();

const loadProject = readProjectPackage;
const saveProject = writeProjectPackage;

// GET /api/workflows/:projectId - 获取所有流程
router.get('/:projectId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json(project.workflows || []);
});

// POST /api/workflows/:projectId - 创建流程
router.post('/:projectId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const workflow = { ...req.body, id: `wf_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  project.workflows = [...(project.workflows || []), workflow];
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json(workflow);
});

// PUT /api/workflows/:projectId/:workflowId - 更新流程
router.put('/:projectId/:workflowId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  project.workflows = (project.workflows || []).map((w: any) => w.id === req.params.workflowId ? { ...w, ...req.body, updatedAt: new Date().toISOString() } : w);
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json(project.workflows.find((w: any) => w.id === req.params.workflowId));
});

// DELETE /api/workflows/:projectId/:workflowId - 删除流程
router.delete('/:projectId/:workflowId', (req, res) => {
  const project = loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  project.workflows = (project.workflows || []).filter((w: any) => w.id !== req.params.workflowId);
  project.config.updatedAt = new Date().toISOString();
  saveProject(project);
  res.json({ success: true });
});

export { router as workflowRouter };
