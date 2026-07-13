import { join } from 'node:path';
import { env } from './env';

export const REPOSITORY_ROOT = env.repositoryRoot;
export const SERVER_DATA_DIR = env.dataDir || join(REPOSITORY_ROOT, 'server', 'data');
export const PROJECTS_DIR = env.projectsDir || join(REPOSITORY_ROOT, 'projects', 'data');
export const PYTHON_SERVICE_DIR = join(REPOSITORY_ROOT, 'python-service');
export const PYTHON_EXECUTABLE = env.pythonExecutable || join(REPOSITORY_ROOT, 'venv', 'bin', 'python3');

export function serverDataPath(...segments: string[]): string {
  return join(SERVER_DATA_DIR, ...segments);
}

export function pythonServicePath(...segments: string[]): string {
  return join(PYTHON_SERVICE_DIR, ...segments);
}
