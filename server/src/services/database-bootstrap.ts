import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { env } from '../config/env';
import { serverDataPath } from '../config/paths';

const execFileAsync = promisify(execFile);

export interface DatabaseBootstrapOptions {
  databaseUrl?: string;
  autoStart?: boolean;
  dataDir?: string;
  binDir?: string;
}

export interface DatabaseBootstrapResult {
  available: boolean;
  database: string;
  host: string;
  port: number;
  created: boolean;
  started: boolean;
  managed: boolean;
  latencyMs: number;
  error?: string;
}

function executable(name: string, binDir?: string) {
  return binDir ? join(binDir, name) : name;
}

function errorCode(error: unknown) {
  return String((error as { code?: string })?.code || '');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isLocalHost(host: string) {
  return ['127.0.0.1', 'localhost', '::1'].includes(host);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function connectionInfo(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('FORMFLOW_DATABASE_URL 必须使用 postgresql://');
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) throw new Error('FORMFLOW_DATABASE_URL 必须包含数据库名');
  return { parsed, database, host: parsed.hostname || 'localhost', port: Number(parsed.port || 5432) };
}

async function connect(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
  await client.connect();
  try { await client.query('SELECT 1'); } finally { await client.end(); }
}

export async function probeDatabase(databaseUrl = env.databaseUrl) {
  if (!databaseUrl) throw new Error('未配置 FORMFLOW_DATABASE_URL');
  const startedAt = Date.now();
  await connect(databaseUrl);
  return { latencyMs: Date.now() - startedAt };
}

async function createDatabase(databaseUrl: string, database: string) {
  const maintenance = new URL(databaseUrl);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString(), connectionTimeoutMillis: 2_000 });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    return true;
  } catch (error) {
    if (errorCode(error) === '42P04') return false;
    throw error;
  } finally {
    await client.end();
  }
}

async function startLocalPostgres(parsed: URL, options: DatabaseBootstrapOptions) {
  const info = connectionInfo(parsed.toString());
  if (!isLocalHost(info.host)) throw new Error('只允许自动启动 localhost PostgreSQL');
  const dataDir = options.dataDir || env.postgresDataDir || serverDataPath('postgres');
  const binDir = options.binDir || env.postgresBinDir;
  mkdirSync(dirname(dataDir), { recursive: true });
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    const username = decodeURIComponent(parsed.username || userInfoName());
    await execFileAsync(executable('initdb', binDir), ['-D', dataDir, '-U', username, '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  }
  const logPath = `${dataDir}.log`;
  await execFileAsync(executable('pg_ctl', binDir), ['-D', dataDir, '-l', logPath, '-o', `-p ${info.port} -h ${info.host}`, '-w', 'start']);
  return dataDir;
}

function userInfoName() {
  return process.env.USER || process.env.USERNAME || 'formflow';
}

export async function ensureDatabase(options: DatabaseBootstrapOptions = {}): Promise<DatabaseBootstrapResult> {
  const startedAt = Date.now();
  const databaseUrl = options.databaseUrl || env.databaseUrl;
  if (!databaseUrl) return { available: false, database: '', host: '', port: 0, created: false, started: false, managed: false, latencyMs: Date.now() - startedAt, error: '未配置 FORMFLOW_DATABASE_URL' };
  const info = connectionInfo(databaseUrl);
  let created = false;
  let started = false;
  try {
    await connect(databaseUrl);
  } catch (initialError) {
    if (errorCode(initialError) === '3D000') {
      created = await createDatabase(databaseUrl, info.database);
    } else if ((options.autoStart ?? env.databaseAutoStart) && isLocalHost(info.host) && ['ECONNREFUSED', '57P03'].includes(errorCode(initialError))) {
      await startLocalPostgres(info.parsed, options);
      started = true;
      try { await connect(databaseUrl); }
      catch (afterStartError) {
        if (errorCode(afterStartError) !== '3D000') throw afterStartError;
        created = await createDatabase(databaseUrl, info.database);
      }
    } else {
      return { available: false, database: info.database, host: info.host, port: info.port, created, started, managed: started, latencyMs: Date.now() - startedAt, error: errorMessage(initialError) };
    }
    await connect(databaseUrl);
  }
  return { available: true, database: info.database, host: info.host, port: info.port, created, started, managed: started, latencyMs: Date.now() - startedAt };
}
