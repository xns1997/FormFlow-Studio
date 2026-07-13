import type { AuthUser } from '../middleware/auth';

export type ProjectAccess = 'view' | 'edit' | 'run' | 'manage';
type ProjectAcl = { ownerId?: string; members?: Record<string, ProjectAccess[]> };

const implied: Record<ProjectAccess, ProjectAccess[]> = {
  view: ['view'], run: ['view', 'run'], edit: ['view', 'run', 'edit'], manage: ['view', 'run', 'edit', 'manage'],
};

export function projectAcl(project: any): ProjectAcl { return project?.config?.access || project?.access || {}; }

export function canAccessProject(user: AuthUser | undefined, project: any, access: ProjectAccess) {
  const acl = projectAcl(project);
  if (!acl.ownerId && !acl.members) return true; // 兼容升级前的本地项目
  if (!user) return false;
  if (user.role === 'admin' || acl.ownerId === user.id) return true;
  const grants = acl.members?.[user.id] || [];
  return grants.some((grant) => implied[grant].includes(access));
}

export function setProjectMember(project: any, userId: string, grants: ProjectAccess[]) {
  project.config.access ||= {};
  project.config.access.members ||= {};
  project.config.access.members[userId] = [...new Set(grants)];
  return project;
}
