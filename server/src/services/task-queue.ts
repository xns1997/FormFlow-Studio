import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { serverDataPath } from '../config/paths';

export type TaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type DagStep = { id: string; dependsOn?: string[]; condition?: { step: string; equals?: unknown }; retries?: number; action: { type: 'http' | 'delay' | 'value'; url?: string; method?: string; body?: unknown; ms?: number; value?: unknown } };
export type TaskRecord = { id: string; name: string; state: TaskState; progress: number; payload: { steps?: DagStep[]; [key: string]: unknown }; result?: unknown; error?: string; logs: { at: string; message: string }[]; createdAt: string; startedAt?: string; finishedAt?: string };

const TASK_DIR = serverDataPath('tasks');
const TASK_FILE = `${TASK_DIR}/tasks.json`;
const records = new Map<string, TaskRecord>();
let queue: Queue | undefined;
let worker: Worker | undefined;

function persist() {
  mkdirSync(TASK_DIR, { recursive: true });
  writeFileSync(TASK_FILE, JSON.stringify([...records.values()].slice(-1000), null, 2));
}
function load() {
  if (!existsSync(TASK_FILE)) return;
  try { for (const task of JSON.parse(readFileSync(TASK_FILE, 'utf8')) as TaskRecord[]) records.set(task.id, task); } catch { /* ignore invalid cache */ }
}
load();

function log(task: TaskRecord, message: string) { task.logs.push({ at: new Date().toISOString(), message }); persist(); }

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
  const task = records.get(id);
  if (!task || task.state === 'cancelled') return;
  task.state = 'running'; task.startedAt = new Date().toISOString(); log(task, '任务开始');
  try {
    const outputs: Record<string, unknown> = {};
    const pending = new Map((task.payload.steps || []).map((step) => [step.id, step]));
    while (pending.size) {
      const runnable = [...pending.values()].filter((step) => (step.dependsOn || []).every((dependency) => dependency in outputs));
      if (!runnable.length) throw new Error('DAG 存在循环依赖或缺失依赖');
      await Promise.all(runnable.map(async (step) => {
        if (step.condition && outputs[step.condition.step] !== step.condition.equals) {
          outputs[step.id] = { skipped: true }; pending.delete(step.id); log(task, `跳过步骤 ${step.id}`); return;
        }
        let lastError: unknown;
        for (let attempt = 0; attempt <= (step.retries || 0); attempt += 1) {
          try { outputs[step.id] = await runAction(step.action); lastError = undefined; break; }
          catch (error) { lastError = error; log(task, `步骤 ${step.id} 第 ${attempt + 1} 次失败: ${error}`); }
        }
        if (lastError) throw lastError;
        pending.delete(step.id); log(task, `完成步骤 ${step.id}`);
      }));
      task.progress = Math.round((Object.keys(outputs).length / Math.max(1, task.payload.steps?.length || 1)) * 100); persist();
    }
    task.state = 'completed'; task.progress = 100; task.result = outputs; task.finishedAt = new Date().toISOString(); log(task, '任务完成');
  } catch (error) {
    task.state = 'failed'; task.error = error instanceof Error ? error.message : String(error); task.finishedAt = new Date().toISOString(); log(task, `任务失败: ${task.error}`);
  }
}

export function initTaskQueue() {
  if (!process.env.REDIS_URL || queue) return;
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue('formflow-tasks', { connection });
  worker = new Worker('formflow-tasks', (job: Job) => executeTask(job.data.id), { connection });
  worker.on('error', (error) => console.error('[task-worker]', error));
}

export async function enqueueTask(name: string, payload: TaskRecord['payload']) {
  const task: TaskRecord = { id: `task_${randomUUID()}`, name: name || '未命名任务', state: 'queued', progress: 0, payload, logs: [], createdAt: new Date().toISOString() };
  records.set(task.id, task); persist();
  if (queue) await queue.add('execute', { id: task.id }, { attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  else queueMicrotask(() => executeTask(task.id));
  return task;
}
export function listTasks(limit = 100) { return [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
export function getTask(id: string) { return records.get(id); }
export function cancelTask(id: string) { const task = records.get(id); if (task && ['queued', 'running'].includes(task.state)) { task.state = 'cancelled'; task.finishedAt = new Date().toISOString(); persist(); } return task; }
