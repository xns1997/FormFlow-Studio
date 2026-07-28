import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { canAccessProject } from './permission';
import { projectRevision } from './project-authoring';
import { readProjectPackage } from './project-package-store';
import { ProjectMutationError, projectMutation } from './project-mutation';
import {
  projectWriteMetadata,
  requireDestructiveConfirmation,
  sendProjectMutationError,
  setProjectRevision,
} from './project-mutation-http';

type Resource = Record<string, any> & { id: string };

export interface ProjectResourceRouterDefinition {
  kind: string;
  label: string;
  idParam: string;
  idPrefix: string;
  read(project: Record<string, any>): Resource[];
  write(project: Record<string, any>, resources: Resource[]): void;
  validateDelete?(project: Record<string, any>, id: string): void;
}

function cleanBody(body: Record<string, any>) {
  const { baseRevision: _revision, idempotencyKey: _key, confirmationToken: _confirmation, ...resource } = body;
  return resource;
}

/** Shared REST adapter for stable-ID resources stored inside a project. */
export function createProjectResourceRouter(definition: ProjectResourceRouterDefinition) {
  const router = Router();
  router.get('/:projectId', (req: AuthRequest, res) => {
    const project = readProjectPackage(req.params.projectId);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    if (!canAccessProject(req.user, project, 'view')) return res.status(403).json({ error: '无权查看项目' });
    setProjectRevision(res, projectRevision(project));
    return res.json(definition.read(project));
  });

  router.post('/:projectId', (req: AuthRequest, res) => {
    try {
      const result = projectMutation.apply({
        projectId: req.params.projectId,
        operation: `${definition.kind}.create`,
        payload: req.body,
        ...projectWriteMetadata(req),
        user: req.user,
        access: 'edit',
        change: (project) => {
          const now = new Date().toISOString();
          const resource = {
            ...cleanBody(req.body),
            id: req.body.id || `${definition.idPrefix}_${Date.now()}`,
            createdAt: now,
            updatedAt: now,
          };
          const resources = definition.read(project);
          if (resources.some((item) => item.id === resource.id)) {
            throw new ProjectMutationError('RESOURCE_IN_USE', `${definition.label} ID 已存在`, 409);
          }
          definition.write(project, [...resources, resource]);
          project.config.updatedAt = now;
          return resource;
        },
      });
      setProjectRevision(res, result.revision);
      return res.json(result.data);
    } catch (error) {
      return sendProjectMutationError(res, error);
    }
  });

  router.put(`/:projectId/:${definition.idParam}`, (req: AuthRequest, res) => {
    try {
      const id = req.params[definition.idParam];
      const result = projectMutation.apply({
        projectId: req.params.projectId,
        operation: `${definition.kind}.update`,
        payload: { id, body: req.body },
        ...projectWriteMetadata(req),
        user: req.user,
        access: 'edit',
        change: (project) => {
          const resources = definition.read(project);
          const existing = resources.find((item) => item.id === id);
          if (!existing) throw new ProjectMutationError('RESOURCE_NOT_FOUND', `${definition.label}不存在`, 404);
          const updated = { ...existing, ...cleanBody(req.body), id, updatedAt: new Date().toISOString() };
          definition.write(project, resources.map((item) => item.id === id ? updated : item));
          project.config.updatedAt = updated.updatedAt;
          return updated;
        },
      });
      setProjectRevision(res, result.revision);
      return res.json(result.data);
    } catch (error) {
      return sendProjectMutationError(res, error);
    }
  });

  router.delete(`/:projectId/:${definition.idParam}`, async (req: AuthRequest, res) => {
    const id = req.params[definition.idParam];
    if (!await requireDestructiveConfirmation(req, res, `${definition.kind}.delete`, req.params.projectId, { id })) return;
    try {
      const result = projectMutation.apply({
        projectId: req.params.projectId,
        operation: `${definition.kind}.delete`,
        payload: { id },
        ...projectWriteMetadata(req),
        user: req.user,
        access: 'edit',
        change: (project) => {
          const resources = definition.read(project);
          if (!resources.some((item) => item.id === id)) {
            throw new ProjectMutationError('RESOURCE_NOT_FOUND', `${definition.label}不存在`, 404);
          }
          definition.validateDelete?.(project, id);
          definition.write(project, resources.filter((item) => item.id !== id));
          project.config.updatedAt = new Date().toISOString();
          return { success: true };
        },
      });
      setProjectRevision(res, result.revision);
      return res.json(result.data);
    } catch (error) {
      return sendProjectMutationError(res, error);
    }
  });
  return router;
}
