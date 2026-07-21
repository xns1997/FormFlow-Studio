import { resolve } from 'node:path';
import { userInfo } from 'node:os';

function integer(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} 必须是有效端口`);
  return value;
}

function milliseconds(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= 1_000 ? Math.floor(value) : fallback;
}

function integerList(name: string) {
  return [...new Set(String(process.env[name] || '').split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 2_000))];
}

const mode = process.env.FORMFLOW_MODE === 'cloud' ? 'cloud' as const : 'local' as const;
const localDatabaseUrl = `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/formflow`;

export const env = {
  mode,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer('PORT', 3001),
  repositoryRoot: resolve(process.env.FORMFLOW_ROOT || decodeURIComponent(new URL('../../..', import.meta.url).pathname)),
  dataDir: process.env.FORMFLOW_DATA_DIR,
  projectsDir: process.env.FORMFLOW_PROJECTS_DIR,
  pythonExecutable: process.env.PYTHON_EXECUTABLE,
  databaseUrl: process.env.FORMFLOW_DATABASE_URL || process.env.DATABASE_URL || (mode === 'local' ? localDatabaseUrl : undefined),
  databaseRequired: process.env.FORMFLOW_DATABASE_REQUIRED ? process.env.FORMFLOW_DATABASE_REQUIRED === 'true' : true,
  databaseAutoStart: process.env.FORMFLOW_DATABASE_AUTO_START ? process.env.FORMFLOW_DATABASE_AUTO_START === 'true' : mode === 'local',
  postgresDataDir: process.env.FORMFLOW_POSTGRES_DATA_DIR,
  postgresBinDir: process.env.FORMFLOW_POSTGRES_BIN_DIR,
  healthIntervalMs: milliseconds('FORMFLOW_HEALTH_INTERVAL_MS', 10_000),
  vectorRequired: process.env.FORMFLOW_VECTOR_REQUIRED === 'true',
  vectorIndexDimensions: integerList('FORMFLOW_VECTOR_INDEX_DIMENSIONS'),
  jwtSecret: process.env.JWT_SECRET || 'formflow-development-secret-change-me',
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'formflow-development-secret-change-me') {
  throw new Error('生产环境必须设置 JWT_SECRET');
}
