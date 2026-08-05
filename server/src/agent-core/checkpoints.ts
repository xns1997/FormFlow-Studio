/**
 * 写前自动检查点 + 用户回滚。
 *
 * 每个写任务首次执行前快照项目包目录；任务失败/用户停止后可恢复到最近检查点。
 * 恢复由用户显式触发（UI/API），智能体不会自动回滚。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { serverDataPath } from '../config/paths';
import { projectPackagePath } from '../services/project-package-store';

const CHECKPOINT_ROOT = process.env.AGENT_CHECKPOINT_STORE_PATH || serverDataPath('agent-checkpoints');

function safePart(value: string) {
  if (!/^[\w.-]+$/.test(value)) throw new Error('无效的检查点路径段');
  return value;
}

export function checkpointPath(threadId: string, projectId: string, taskId: string, attempt: number) {
  return join(CHECKPOINT_ROOT, safePart(threadId), `${safePart(projectId)}__${safePart(taskId)}__${attempt}`);
}

/** 快照项目包目录；返回检查点路径（项目不存在时返回 null）。 */
export function createProjectCheckpoint(threadId: string, projectId: string, taskId: string, attempt: number): string | null {
  const source = projectPackagePath(projectId);
  if (!existsSync(source)) return null;
  const target = checkpointPath(threadId, projectId, taskId, attempt);
  mkdirSync(target, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  return target;
}

export function listThreadCheckpoints(threadId: string): string[] {
  const root = join(CHECKPOINT_ROOT, safePart(threadId));
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

/** 把项目恢复到指定检查点（交换目录，成功后清理当前版本）。返回是否恢复成功。 */
export function restoreProjectCheckpoint(threadId: string, projectId: string, taskId: string, attempt: number): boolean {
  const source = checkpointPath(threadId, projectId, taskId, attempt);
  if (!existsSync(source)) return false;
  const target = projectPackagePath(projectId);
  const backup = `${target}.restore-${process.pid}-${Date.now()}`;
  if (existsSync(target)) renameSync(target, backup);
  try {
    renameSync(source, target);
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (existsSync(backup) && !existsSync(target)) renameSync(backup, target);
    throw error;
  }
}
