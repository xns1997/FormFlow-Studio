import type { AuthUser } from '../middleware/auth';
import { env } from '../config/env';

export type ProjectAccess = 'view' | 'edit' | 'run' | 'manage';
type ProjectAcl = { ownerId?: string; members?: Record<string, ProjectAccess[]> };

const implied: Record<ProjectAccess, ProjectAccess[]> = {
  view: ['view'], run: ['view', 'run'], edit: ['view', 'run', 'edit'], manage: ['view', 'run', 'edit', 'manage'],
};

/** 读取项目的 ACL（兼容新旧字段位置）。 */
export function projectAcl(project: any): ProjectAcl { return project?.config?.access || project?.access || {}; }

/** 按 ACL 判断用户是否具备指定权限。 */
export function canAccessProjectAcl(user: AuthUser | undefined, project: any, access: ProjectAccess) {
  const acl = projectAcl(project);
  if (!acl.ownerId && !acl.members) return true; // 兼容升级前的本地项目
  if (!user) return false;
  if (user.role === 'admin' || acl.ownerId === user.id) return true;
  const grants = acl.members?.[user.id] || [];
  return grants.some((grant) => implied[grant].includes(access));
}

/** 项目访问判断：owner 放行，其余按 ACL 成员授权。 */
export function canAccessProject(user: AuthUser | undefined, project: any, access: ProjectAccess) {
  return env.mode === 'local' || canAccessProjectAcl(user, project, access);
}

/** 设置项目成员授权（owner 不可被降级）。 */
export function setProjectMember(project: any, userId: string, grants: ProjectAccess[]) {
  project.config.access ||= {};
  project.config.access.members ||= {};
  project.config.access.members[userId] = [...new Set(grants)];
  return project;
}
