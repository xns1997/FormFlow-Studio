import { resolve } from 'node:path';

function integer(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} 必须是有效端口`);
  return value;
}

export const env = {
  mode: process.env.FORMFLOW_MODE === 'cloud' ? 'cloud' as const : 'local' as const,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer('PORT', 3001),
  repositoryRoot: resolve(process.env.FORMFLOW_ROOT || decodeURIComponent(new URL('../../..', import.meta.url).pathname)),
  dataDir: process.env.FORMFLOW_DATA_DIR,
  projectsDir: process.env.FORMFLOW_PROJECTS_DIR,
  pythonExecutable: process.env.PYTHON_EXECUTABLE,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET || 'formflow-development-secret-change-me',
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'formflow-development-secret-change-me') {
  throw new Error('生产环境必须设置 JWT_SECRET');
}
