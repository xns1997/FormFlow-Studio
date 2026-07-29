import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env';

export const REPOSITORY_ROOT = env.repositoryRoot;
export const SERVER_DATA_DIR = env.dataDir || join(REPOSITORY_ROOT, 'server', 'data');
export const PROJECTS_DIR = env.projectsDir || join(REPOSITORY_ROOT, 'projects', 'data');
export const PYTHON_SERVICE_DIR = join(REPOSITORY_ROOT, 'python-service');

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

export const PYTHON_EXECUTABLE = resolvePythonExecutable(env.pythonExecutable, REPOSITORY_ROOT);

export function serverDataPath(...segments: string[]): string {
  return join(SERVER_DATA_DIR, ...segments);
}

export function pythonServicePath(...segments: string[]): string {
  return join(PYTHON_SERVICE_DIR, ...segments);
}
