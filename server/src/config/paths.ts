import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env';

/** 仓库根目录。 */
export const REPOSITORY_ROOT = env.repositoryRoot;
/** 服务数据目录。 */
export const SERVER_DATA_DIR = env.dataDir || join(REPOSITORY_ROOT, 'server', 'data');
/** 项目数据目录。 */
export const PROJECTS_DIR = env.projectsDir || join(REPOSITORY_ROOT, 'projects', 'data');
/** Python 服务目录。 */
export const PYTHON_SERVICE_DIR = join(REPOSITORY_ROOT, 'python-service');

/** 解析 Python 可执行文件路径（显式配置 > 环境变量 > 仓库 venv）。 */
export function resolvePythonExecutable(
  configured: string | undefined,
  repositoryRoot: string,
  platform: NodeJS.Platform = process.platform,
  executableExists: (path: string) => boolean = existsSync,
) {
  if (configured) return configured;
  const localCandidates = platform === 'win32'
    ? [join(repositoryRoot, 'venv', 'Scripts', 'python.exe')]
    : [join(repositoryRoot, 'venv', 'bin', 'python3'), join(repositoryRoot, 'venv', 'bin', 'python')];
  return localCandidates.find(executableExists) || (platform === 'win32' ? 'python' : 'python3');
}

/** 实际使用的 Python 可执行文件。 */
export const PYTHON_EXECUTABLE = resolvePythonExecutable(env.pythonExecutable, REPOSITORY_ROOT);

/** 拼装服务数据目录下的路径。 */
export function serverDataPath(...segments: string[]): string {
  return join(SERVER_DATA_DIR, ...segments);
}

/** 拼装 Python 服务目录下的路径。 */
export function pythonServicePath(...segments: string[]): string {
  return join(PYTHON_SERVICE_DIR, ...segments);
}
