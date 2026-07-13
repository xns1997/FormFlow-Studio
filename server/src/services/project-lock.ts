import { randomUUID } from 'crypto';
export type ProjectLock = { projectId: string; userId: string; username: string; token: string; acquiredAt: string; expiresAt: string };
const locks = new Map<string, ProjectLock>();
function active(projectId: string) { const lock = locks.get(projectId); if (lock && Date.parse(lock.expiresAt) <= Date.now()) { locks.delete(projectId); return undefined; } return lock; }
export function getProjectLock(projectId: string) { return active(projectId); }
export function acquireProjectLock(projectId: string, user: { id: string; username: string }, ttlMs = 120000) {
  const current = active(projectId);
  if (current && current.userId !== user.id) return undefined;
  const lock: ProjectLock = { projectId, userId: user.id, username: user.username, token: current?.token || randomUUID(), acquiredAt: current?.acquiredAt || new Date().toISOString(), expiresAt: new Date(Date.now() + Math.min(600000, Math.max(30000, ttlMs))).toISOString() };
  locks.set(projectId, lock); return lock;
}
export function releaseProjectLock(projectId: string, userId: string, token?: string) { const lock = active(projectId); if (!lock || lock.userId !== userId || (token && token !== lock.token)) return false; return locks.delete(projectId); }
