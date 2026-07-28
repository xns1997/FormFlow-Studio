import type { AuthUser } from '../middleware/auth';
import { createHash } from 'node:crypto';
import { canAccessProject, type ProjectAccess } from './permission';
import { commitProject, projectRevision, type ProjectSourceFile } from './project-authoring';
import { deleteProjectPackage, readProjectPackage } from './project-package-store';
import {
  createMemoryProjectMutationReplayStore,
  projectMutationReplayStore,
  type ProjectMutationReplayStore,
} from './project-mutation-replay-store';

type Project = Record<string, any>;

export class ProjectMutationError extends Error {
  constructor(
    public readonly code: 'PROJECT_NOT_FOUND' | 'FORBIDDEN' | 'BASE_REVISION_REQUIRED' | 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_KEY_REUSED' | 'PROJECT_REVISION_CONFLICT' | 'RESOURCE_NOT_FOUND' | 'RESOURCE_IN_USE',
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProjectMutationError';
  }
}

export interface ProjectMutationCommand<T> {
  projectId: string;
  operation: string;
  payload?: unknown;
  baseRevision: string;
  idempotencyKey: string;
  user?: Pick<AuthUser, 'id'>;
  access: ProjectAccess;
  sourceFiles?: ProjectSourceFile[];
  change(project: Project): T;
}

export interface ProjectMutationResult<T> {
  data: T;
  project: Project;
  revision: string;
}

export interface ProjectMutationAdapters {
  read(projectId: string): Project | null;
  revision(project: Project): string;
  canAccess(user: Pick<AuthUser, 'id'> | undefined, project: Project, access: ProjectAccess): boolean;
  commit(project: Project, sourceFiles?: ProjectSourceFile[]): { project?: Project; revision: string };
  remove?(projectId: string): void;
}

export function createProjectMutationModule(
  adapters: ProjectMutationAdapters,
  replayStore: ProjectMutationReplayStore = createMemoryProjectMutationReplayStore(),
) {
  const replayIdentity = (command: Pick<ProjectMutationCommand<unknown>, 'user' | 'projectId' | 'idempotencyKey' | 'operation' | 'baseRevision' | 'payload'>) => {
    const replayKey = `${command.user?.id || 'anonymous'}:${command.projectId}:${command.idempotencyKey}`;
    const fingerprint = createHash('sha256').update(JSON.stringify({
      operation: command.operation,
      projectId: command.projectId,
      baseRevision: command.baseRevision,
      payload: command.payload ?? null,
    })).digest('hex');
    const replay = replayStore.get<ProjectMutationResult<unknown>>(replayKey);
    if (replay && replay.fingerprint !== fingerprint) {
      throw new ProjectMutationError('IDEMPOTENCY_KEY_REUSED', '幂等键已绑定到另一项操作，请为新操作生成新键', 409);
    }
    return { replayKey, fingerprint, replay };
  };
  const remember = <T>(replayKey: string, fingerprint: string, result: ProjectMutationResult<T>) => {
    replayStore.set(replayKey, {
      fingerprint,
      result,
      expiresAt: Date.now() + 24 * 60 * 60 * 1_000,
    });
    return result;
  };
  return {
    apply<T>(command: ProjectMutationCommand<T>): ProjectMutationResult<T> {
      if (!command.baseRevision) throw new ProjectMutationError('BASE_REVISION_REQUIRED', '写入必须提供 baseRevision', 428);
      if (!command.idempotencyKey) throw new ProjectMutationError('IDEMPOTENCY_KEY_REQUIRED', '写入必须提供 idempotencyKey', 400);
      const { replayKey, fingerprint, replay } = replayIdentity(command);
      if (replay) return replay.result as ProjectMutationResult<T>;
      const current = adapters.read(command.projectId);
      if (!current) throw new ProjectMutationError('PROJECT_NOT_FOUND', '项目不存在', 404);
      if (!adapters.canAccess(command.user, current, command.access)) throw new ProjectMutationError('FORBIDDEN', '无权修改项目', 403);
      const currentRevision = adapters.revision(current);
      if (currentRevision !== command.baseRevision) {
        throw new ProjectMutationError('PROJECT_REVISION_CONFLICT', '项目已被其他操作更新，请刷新后重试', 409, {
          expectedRevision: command.baseRevision,
          currentRevision,
        });
      }
      const draft = structuredClone(current);
      const data = command.change(draft);
      const committed = adapters.commit(draft, command.sourceFiles);
      const result = {
        data,
        project: committed.project || draft,
        revision: committed.revision,
      };
      return remember(replayKey, fingerprint, result);
    },
    async applyAsync<T>(
      command: Omit<ProjectMutationCommand<T>, 'change'> & { change(project: Project): Promise<T> },
    ): Promise<ProjectMutationResult<T>> {
      if (!command.baseRevision) throw new ProjectMutationError('BASE_REVISION_REQUIRED', '写入必须提供 baseRevision', 428);
      if (!command.idempotencyKey) throw new ProjectMutationError('IDEMPOTENCY_KEY_REQUIRED', '写入必须提供 idempotencyKey', 400);
      const { replayKey, fingerprint, replay } = replayIdentity(command as ProjectMutationCommand<unknown>);
      if (replay) return replay.result as ProjectMutationResult<T>;
      const current = adapters.read(command.projectId);
      if (!current) throw new ProjectMutationError('PROJECT_NOT_FOUND', '项目不存在', 404);
      if (!adapters.canAccess(command.user, current, command.access)) throw new ProjectMutationError('FORBIDDEN', '无权修改项目', 403);
      const currentRevision = adapters.revision(current);
      if (currentRevision !== command.baseRevision) {
        throw new ProjectMutationError('PROJECT_REVISION_CONFLICT', '项目已被其他操作更新，请刷新后重试', 409, {
          expectedRevision: command.baseRevision,
          currentRevision,
        });
      }
      const draft = structuredClone(current);
      const data = await command.change(draft);
      const committed = adapters.commit(draft, command.sourceFiles);
      return remember(replayKey, fingerprint, {
        data,
        project: committed.project || draft,
        revision: committed.revision,
      });
    },
    create<T>(command: Omit<ProjectMutationCommand<T>, 'baseRevision' | 'access' | 'change'> & {
      project: Project;
      data: T;
    }): ProjectMutationResult<T> {
      if (!command.idempotencyKey) throw new ProjectMutationError('IDEMPOTENCY_KEY_REQUIRED', '写入必须提供 idempotencyKey', 400);
      const identity = replayIdentity({ ...command, baseRevision: '' });
      if (identity.replay) return identity.replay.result as ProjectMutationResult<T>;
      if (adapters.read(command.projectId)) throw new ProjectMutationError('RESOURCE_IN_USE', '项目 ID 已存在', 409);
      const draft = structuredClone(command.project);
      const committed = adapters.commit(draft, command.sourceFiles);
      return remember(identity.replayKey, identity.fingerprint, {
        data: command.data,
        project: committed.project || draft,
        revision: committed.revision,
      });
    },
    remove<T>(command: Omit<ProjectMutationCommand<T>, 'change'> & { data: T }): ProjectMutationResult<T> {
      if (!command.baseRevision) throw new ProjectMutationError('BASE_REVISION_REQUIRED', '写入必须提供 baseRevision', 428);
      if (!command.idempotencyKey) throw new ProjectMutationError('IDEMPOTENCY_KEY_REQUIRED', '写入必须提供 idempotencyKey', 400);
      const identity = replayIdentity(command);
      if (identity.replay) return identity.replay.result as ProjectMutationResult<T>;
      const current = adapters.read(command.projectId);
      if (!current) throw new ProjectMutationError('PROJECT_NOT_FOUND', '项目不存在', 404);
      if (!adapters.canAccess(command.user, current, command.access)) throw new ProjectMutationError('FORBIDDEN', '无权修改项目', 403);
      const revision = adapters.revision(current);
      if (revision !== command.baseRevision) {
        throw new ProjectMutationError('PROJECT_REVISION_CONFLICT', '项目已被其他操作更新，请刷新后重试', 409, {
          expectedRevision: command.baseRevision,
          currentRevision: revision,
        });
      }
      if (!adapters.remove) throw new Error('Project mutation remove adapter is not configured');
      adapters.remove(command.projectId);
      return remember(identity.replayKey, identity.fingerprint, {
        data: command.data,
        project: current,
        revision,
      });
    },
  };
}

export const projectMutation = createProjectMutationModule({
  read: readProjectPackage,
  revision: projectRevision,
  canAccess: (user, project, access) => canAccessProject(user as AuthUser | undefined, project, access),
  commit: (project, sourceFiles) => {
    const committed = commitProject(project, sourceFiles);
    return { project, revision: committed.revision };
  },
  remove: (projectId) => {
    // Lazy import is unnecessary here; the package store is already the
    // persistence adapter used by reads.
    deleteProjectPackage(projectId);
  },
}, projectMutationReplayStore);
