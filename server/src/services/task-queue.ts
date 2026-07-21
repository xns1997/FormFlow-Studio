import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { serverDataPath } from '../config/paths';
import { env } from '../config/env';

export type TaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type DagStep = { id: string; dependsOn?: string[]; condition?: { step: string; equals?: unknown }; retries?: number; action: { type: 'http' | 'delay' | 'value'; url?: string; method?: string; body?: unknown; ms?: number; value?: unknown } };
export type TaskRecord = { id: string; name: string; state: TaskState; progress: number; payload: { steps?: DagStep[]; [key: string]: unknown }; result?: unknown; error?: string; logs: { at: string; message: string }[]; createdAt: string; startedAt?: string; finishedAt?: string };

const TASK_DIR = serverDataPath('tasks');
const TASK_FILE = `${TASK_DIR}/tasks.json`;
const records = new Map<string, TaskRecord>();
const workerId = `worker_${process.pid}_${randomUUID()}`;
let pool: Pool | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let polling = false;

function persistFallback() {
  if (pool) return;
  mkdirSync(TASK_DIR, { recursive: true });
  writeFileSync(TASK_FILE, JSON.stringify([...records.values()].slice(-1000), null, 2));
}

function loadFallback() {
  if (!existsSync(TASK_FILE)) return;
  try { for (const task of JSON.parse(readFileSync(TASK_FILE, 'utf8')) as TaskRecord[]) records.set(task.id, task); } catch { /* ignore invalid local fallback */ }
}
loadFallback();

function rowToTask(row: any): TaskRecord {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    progress: Number(row.progress || 0),
    payload: row.payload || {},
    result: row.result ?? undefined,
    error: row.error || undefined,
    logs: row.logs || [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    startedAt: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at)) : undefined,
    finishedAt: row.finished_at ? (row.finished_at instanceof Date ? row.finished_at.toISOString() : String(row.finished_at)) : undefined,
  };
}

async function saveTask(task: TaskRecord, client: Pool | PoolClient = pool as Pool) {
  if (!client) { persistFallback(); return; }
  await client.query(
    `INSERT INTO formflow_tasks
      (id, name, state, progress, payload, result, error, logs, created_at, started_at, finished_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10, $11, NOW())
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, state = EXCLUDED.state, progress = EXCLUDED.progress,
      payload = EXCLUDED.payload, result = EXCLUDED.result, error = EXCLUDED.error,
      logs = EXCLUDED.logs, started_at = EXCLUDED.started_at,
      finished_at = EXCLUDED.finished_at,
      locked_by = CASE WHEN EXCLUDED.state IN ('completed', 'failed', 'cancelled') THEN NULL ELSE formflow_tasks.locked_by END,
      lease_expires_at = CASE WHEN EXCLUDED.state IN ('completed', 'failed', 'cancelled') THEN NULL ELSE formflow_tasks.lease_expires_at END,
      updated_at = NOW()`,
    [task.id, task.name, task.state, task.progress, JSON.stringify(task.payload), task.result === undefined ? null : JSON.stringify(task.result), task.error || null, JSON.stringify(task.logs), task.createdAt, task.startedAt || null, task.finishedAt || null],
  );
}

async function log(task: TaskRecord, message: string) {
  task.logs.push({ at: new Date().toISOString(), message });
  await saveTask(task);
}

async function runAction(action: DagStep['action']) {
  if (action.type === 'delay') { await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(action.ms || 0)))); return { delayed: action.ms || 0 }; }
  if (action.type === 'value') return action.value;
  if (!action.url) throw new Error('HTTP 动作缺少 URL');
  const response = await fetch(action.url, { method: action.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: ['GET', 'HEAD'].includes(action.method || 'GET') ? undefined : JSON.stringify(action.body) });
  const value = await response.json().catch(() => response.text());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return value;
}

export async function executeTask(id: string) {
  let task = records.get(id);
  if (!task && pool) {
    const result = await pool.query('SELECT * FROM formflow_tasks WHERE id = $1', [id]);
    if (result.rows[0]) { task = rowToTask(result.rows[0]); records.set(id, task); }
  }
  if (!task || task.state === 'cancelled') return;
  task.state = 'running'; task.startedAt ||= new Date().toISOString(); await log(task, '任务开始');
  try {
    const outputs: Record<string, unknown> = {};
    const pending = new Map((task.payload.steps || []).map((step) => [step.id, step]));
    while (pending.size) {
      const runnable = [...pending.values()].filter((step) => (step.dependsOn || []).every((dependency) => dependency in outputs));
      if (!runnable.length) throw new Error('DAG 存在循环依赖或缺失依赖');
      await Promise.all(runnable.map(async (step) => {
        if (step.condition && outputs[step.condition.step] !== step.condition.equals) {
          outputs[step.id] = { skipped: true }; pending.delete(step.id); await log(task!, `跳过步骤 ${step.id}`); return;
        }
        let lastError: unknown;
        for (let attempt = 0; attempt <= (step.retries || 0); attempt += 1) {
          try { outputs[step.id] = await runAction(step.action); lastError = undefined; break; }
          catch (error) { lastError = error; await log(task!, `步骤 ${step.id} 第 ${attempt + 1} 次失败: ${error}`); }
        }
        if (lastError) throw lastError;
        pending.delete(step.id); await log(task!, `完成步骤 ${step.id}`);
      }));
      task.progress = Math.round((Object.keys(outputs).length / Math.max(1, task.payload.steps?.length || 1)) * 100); await saveTask(task);
    }
    task.state = 'completed'; task.progress = 100; task.result = outputs; task.finishedAt = new Date().toISOString(); await log(task, '任务完成');
  } catch (error) {
    task.state = 'failed'; task.error = error instanceof Error ? error.message : String(error); task.finishedAt = new Date().toISOString(); await log(task, `任务失败: ${task.error}`);
  }
}

async function claimAndExecute() {
  if (!pool || polling) return;
  polling = true;
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query("SELECT * FROM formflow_tasks WHERE state = 'queued' OR (state = 'running' AND lease_expires_at < NOW()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
    if (!result.rows[0]) { await client.query('COMMIT'); return; }
    const task = rowToTask(result.rows[0]);
    task.state = 'running'; task.startedAt ||= new Date().toISOString();
    await client.query("UPDATE formflow_tasks SET state = 'running', started_at = COALESCE(started_at, NOW()), locked_by = $2, lease_expires_at = NOW() + INTERVAL '30 seconds', updated_at = NOW() WHERE id = $1", [task.id, workerId]);
    await client.query('COMMIT');
    records.set(task.id, task);
    const heartbeat = setInterval(() => {
      void pool?.query("UPDATE formflow_tasks SET lease_expires_at = NOW() + INTERVAL '30 seconds', updated_at = NOW() WHERE id = $1 AND locked_by = $2 AND state = 'running'", [task.id, workerId]);
    }, 10_000);
    heartbeat.unref();
    try { await executeTask(task.id); } finally { clearInterval(heartbeat); }
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[task-worker]', error);
  } finally {
    client?.release();
    polling = false;
  }
}

export async function initTaskQueue() {
  const databaseUrl = env.databaseUrl;
  const required = env.databaseRequired;
  if (pool) return;
  if (!databaseUrl) {
    if (required) throw new Error('FORMFLOW_DATABASE_REQUIRED=true 时必须配置 FORMFLOW_DATABASE_URL');
    return;
  }
  const candidate = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000 });
  try {
    await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      progress INTEGER NOT NULL DEFAULT 0,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error TEXT,
      logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      locked_by TEXT,
      lease_expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await candidate.query('ALTER TABLE formflow_tasks ADD COLUMN IF NOT EXISTS locked_by TEXT');
    await candidate.query('ALTER TABLE formflow_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ');
    await candidate.query("CREATE INDEX IF NOT EXISTS formflow_tasks_queue_idx ON formflow_tasks (state, created_at) WHERE state = 'queued'");
    await candidate.query("CREATE INDEX IF NOT EXISTS formflow_tasks_lease_idx ON formflow_tasks (lease_expires_at) WHERE state = 'running'");
    pool = candidate;
    for (const task of records.values()) await saveTask(task);
    pollTimer = setInterval(() => void claimAndExecute(), 250);
    pollTimer.unref();
    void claimAndExecute();
  } catch (error) {
    await candidate.end().catch(() => undefined);
    if (required) throw error;
    console.error('[task-queue] PostgreSQL unavailable; using local fallback', error);
  }
}

export async function enqueueTask(name: string, payload: TaskRecord['payload']) {
  const task: TaskRecord = { id: `task_${randomUUID()}`, name: name || '未命名任务', state: 'queued', progress: 0, payload, logs: [], createdAt: new Date().toISOString() };
  records.set(task.id, task); await saveTask(task);
  if (pool) void claimAndExecute(); else queueMicrotask(() => void executeTask(task.id));
  return task;
}

export async function listTasks(limit = 100) {
  if (!pool) return [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  const result = await pool.query('SELECT * FROM formflow_tasks ORDER BY created_at DESC LIMIT $1', [Math.min(Math.max(limit, 1), 1000)]);
  return result.rows.map(rowToTask);
}

export async function getTask(id: string) {
  if (!pool) return records.get(id);
  const result = await pool.query('SELECT * FROM formflow_tasks WHERE id = $1', [id]);
  return result.rows[0] ? rowToTask(result.rows[0]) : undefined;
}

export async function cancelTask(id: string) {
  const task = await getTask(id);
  if (task && ['queued', 'running'].includes(task.state)) { task.state = 'cancelled'; task.finishedAt = new Date().toISOString(); await saveTask(task); records.set(task.id, task); }
  return task;
}

export async function shutdownTaskQueue() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  const activePool = pool;
  pool = undefined;
  if (activePool) await activePool.end();
}
