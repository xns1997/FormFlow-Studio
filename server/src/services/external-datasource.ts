/**
 * External Datasource Service
 *
 * Manages database connections (MySQL, PostgreSQL) and API endpoints
 * as data sources. Configuration is stored encrypted in the project directory.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────

export type DatasourceType = 'mysql' | 'postgresql' | 'api';

export interface MysqlConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface PostgresqlConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface ApiConnection {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  dataPath?: string; // JSONPath to extract data array
  pagination?: {
    type: 'offset' | 'cursor' | 'nextLink';
    param?: string;
    limitParam?: string;
    defaultLimit?: number;
    cursorField?: string;
    nextLinkField?: string;
  };
}

export interface DatasourceConfig {
  id: string;
  name: string;
  type: DatasourceType;
  connection: MysqlConnection | PostgresqlConnection | ApiConnection;
  query?: string; // SQL query for databases
  cache: { enabled: boolean; ttl: number };
  writeBack: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatasourceQueryResult {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  fromCache?: boolean;
}

// ── Encryption ─────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.FORMFLOW_DS_SECRET || 'formflow-default-secret-change-me';
  return createHash('sha256').update(secret).digest();
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ── Config Storage ─────────────────────────────────────

function configDir(projectDir: string): string {
  return join(projectDir, '.datasources');
}

function configPath(projectDir: string, id: string): string {
  return join(configDir(projectDir), `${id}.json`);
}

function cachePath(projectDir: string, id: string): string {
  return join(configDir(projectDir), `${id}.cache.json`);
}

export function saveDatasourceConfig(projectDir: string, config: DatasourceConfig): void {
  const dir = configDir(projectDir);
  mkdirSync(dir, { recursive: true });
  // Encrypt connection info: encrypt() 返回 base64 字符串，直接存字符串；
  // 之前对密文执行 JSON.parse 会在保存时必然抛错，导致配置无法写入。
  const encrypted = {
    ...config,
    connection: encrypt(JSON.stringify(config.connection)),
    _encrypted: true,
  };
  writeFileSync(configPath(projectDir, config.id), JSON.stringify(encrypted, null, 2));
}

export function loadDatasourceConfig(projectDir: string, id: string): DatasourceConfig | null {
  const path = configPath(projectDir, id);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (raw._encrypted) {
      if (typeof raw.connection !== 'string') return null;
      const decrypted = decrypt(raw.connection);
      raw.connection = JSON.parse(decrypted);
      delete raw._encrypted;
    }
    return raw as DatasourceConfig;
  } catch {
    // 配置文件损坏或密文无法解密（密钥变更/文件被篡改）时按不存在处理。
    return null;
  }
}

export function listDatasourceConfigs(projectDir: string): DatasourceConfig[] {
  const dir = configDir(projectDir);
  if (!existsSync(dir)) return [];
  const fs = require('node:fs');
  return fs.readdirSync(dir)
    .filter((f: string) => f.endsWith('.json') && !f.endsWith('.cache.json'))
    .map((f: string) => {
      try {
        const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (raw._encrypted) {
          if (typeof raw.connection !== 'string') return null;
          raw.connection = JSON.parse(decrypt(raw.connection));
          delete raw._encrypted;
        }
        return raw as DatasourceConfig;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function deleteDatasourceConfig(projectDir: string, id: string): void {
  const path = configPath(projectDir, id);
  const cPath = cachePath(projectDir, id);
  const fs = require('node:fs');
  if (existsSync(path)) fs.unlinkSync(path);
  if (existsSync(cPath)) fs.unlinkSync(cPath);
}

// ── Query Execution ────────────────────────────────────

export async function queryDatasource(
  projectDir: string,
  config: DatasourceConfig,
  options?: { forceRefresh?: boolean },
): Promise<DatasourceQueryResult> {
  // Check cache first
  if (config.cache.enabled && !options?.forceRefresh) {
    const cached = readCache(projectDir, config.id, config.cache.ttl);
    if (cached) return { ...cached, fromCache: true };
  }

  const start = Date.now();
  let result: DatasourceQueryResult;

  switch (config.type) {
    case 'mysql':
      result = await queryMysql(config.connection as MysqlConnection, config.query || '');
      break;
    case 'postgresql':
      result = await queryPostgresql(config.connection as PostgresqlConnection, config.query || '');
      break;
    case 'api':
      result = await queryApi(config.connection as ApiConnection);
      break;
    default:
      throw new Error(`不支持的数据源类型: ${config.type}`);
  }

  result.executionTime = Date.now() - start;

  // Write cache
  if (config.cache.enabled) {
    writeCache(projectDir, config.id, result);
  }

  return result;
}

// ── MySQL ──────────────────────────────────────────────

async function queryMysql(conn: MysqlConnection, query: string): Promise<DatasourceQueryResult> {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl ? {} : undefined,
    connectTimeout: 10000,
  });
  try {
    const [rows, fields] = await connection.execute(query);
    const headers = (fields || []).map((f: { name: string }) => f.name);
    const data = Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
    return { headers, rows: data, rowCount: data.length, executionTime: 0 };
  } finally {
    await connection.end();
  }
}

// ── PostgreSQL ─────────────────────────────────────────

async function queryPostgresql(conn: PostgresqlConnection, query: string): Promise<DatasourceQueryResult> {
  const { Client } = require('pg');
  const client = new Client({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const result = await client.query(query);
    const headers = (result.fields || []).map((f: { name: string }) => f.name);
    return { headers, rows: result.rows, rowCount: result.rowCount || 0, executionTime: 0 };
  } finally {
    await client.end();
  }
}

// ── API ────────────────────────────────────────────────

async function queryApi(conn: ApiConnection): Promise<DatasourceQueryResult> {
  const response = await fetch(conn.url, {
    method: conn.method,
    headers: {
      'Content-Type': 'application/json',
      ...conn.headers,
    },
    body: conn.method === 'POST' ? conn.body : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  // Extract data using dataPath
  let data: unknown[];
  if (conn.dataPath) {
    data = extractDataPath(json, conn.dataPath);
  } else if (Array.isArray(json)) {
    data = json;
  } else if (Array.isArray(json.data)) {
    data = json.data;
  } else if (Array.isArray(json.rows)) {
    data = json.rows;
  } else if (Array.isArray(json.items)) {
    data = json.items;
  } else if (Array.isArray(json.results)) {
    data = json.results;
  } else {
    data = [json];
  }

  const rows = data.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object');
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  return { headers, rows, rowCount: rows.length, executionTime: 0 };
}

function extractDataPath(obj: unknown, path: string): unknown[] {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[part];
  }
  return Array.isArray(current) ? current : [];
}

// ── Cache ──────────────────────────────────────────────

interface CachedResult {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  cachedAt: number;
}

function readCache(projectDir: string, id: string, ttl: number): Omit<DatasourceQueryResult, 'fromCache'> | null {
  const path = cachePath(projectDir, id);
  if (!existsSync(path)) return null;
  try {
    const cached: CachedResult = JSON.parse(readFileSync(path, 'utf8'));
    if (Date.now() - cached.cachedAt > ttl * 1000) return null;
    return { headers: cached.headers, rows: cached.rows, rowCount: cached.rowCount, executionTime: cached.executionTime };
  } catch {
    return null;
  }
}

function writeCache(projectDir: string, id: string, result: DatasourceQueryResult): void {
  const dir = configDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const cached: CachedResult = { ...result, cachedAt: Date.now() };
  writeFileSync(cachePath(projectDir, id), JSON.stringify(cached));
}

// ── Connection Testing ─────────────────────────────────

export async function testConnection(config: DatasourceConfig): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    switch (config.type) {
      case 'mysql': {
        const mysql = require('mysql2/promise');
        const conn = config.connection as MysqlConnection;
        const connection = await mysql.createConnection({
          host: conn.host, port: conn.port, database: conn.database,
          user: conn.user, password: conn.password, ssl: conn.ssl ? {} : undefined,
          connectTimeout: 5000,
        });
        await connection.ping();
        await connection.end();
        return { success: true, message: 'MySQL 连接成功', latency: Date.now() - start };
      }
      case 'postgresql': {
        const { Client } = require('pg');
        const conn = config.connection as PostgresqlConnection;
        const client = new Client({
          host: conn.host, port: conn.port, database: conn.database,
          user: conn.user, password: conn.password,
          ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 5000,
        });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
        return { success: true, message: 'PostgreSQL 连接成功', latency: Date.now() - start };
      }
      case 'api': {
        const conn = config.connection as ApiConnection;
        const response = await fetch(conn.url, {
          method: 'HEAD',
          headers: conn.headers,
          signal: AbortSignal.timeout(5000),
        });
        return {
          success: response.ok,
          message: response.ok ? 'API 连接成功' : `API 返回 ${response.status}`,
          latency: Date.now() - start,
        };
      }
      default:
        return { success: false, message: `不支持的类型: ${config.type}` };
    }
  } catch (err) {
    return {
      success: false,
      message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
      latency: Date.now() - start,
    };
  }
}
