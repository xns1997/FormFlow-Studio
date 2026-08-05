import { env } from '../config/env';

export type ComponentHealth = {
  available: boolean;
  status: 'starting' | 'ok' | 'unavailable';
  checkedAt?: string;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
};

const startedAt = Date.now();
const state: { database: ComponentHealth; ai: ComponentHealth; vector: ComponentHealth } = {
  database: { available: false, status: 'starting' },
  ai: { available: false, status: 'starting' },
  vector: { available: false, status: 'starting' },
};
let monitor: NodeJS.Timeout | undefined;
let checking = false;

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

/** 记录数据库健康探针结果。 */
export function recordDatabaseHealth(available: boolean, input: { latencyMs?: number; error?: string; details?: Record<string, unknown> } = {}) {
  state.database = { available, status: available ? 'ok' : 'unavailable', checkedAt: new Date().toISOString(), ...input, details: input.details ?? state.database.details };
}

/** 记录 AI 服务健康探针结果。 */
export function recordAiHealth(available: boolean, input: { latencyMs?: number; error?: string; details?: Record<string, unknown> } = {}) {
  state.ai = { available, status: available ? 'ok' : 'unavailable', checkedAt: new Date().toISOString(), ...input, details: input.details ?? state.ai.details };
}

/** 记录向量库健康探针结果。 */
export function recordVectorHealth(available: boolean, input: { latencyMs?: number; error?: string; details?: Record<string, unknown> } = {}) {
  state.vector = { available, status: available ? 'ok' : 'unavailable', checkedAt: new Date().toISOString(), ...input, details: input.details ?? state.vector.details };
}

/** AI 服务当前是否可用。 */
export function aiAvailable() { return state.ai.available; }

/** 汇总各子系统健康状态（数据库/AI/向量库与最近延迟）。 */
export function runtimeHealth() {
  const ready = state.database.available && (!env.vectorRequired || state.vector.available);
  const status = !ready ? 'not_ready' : state.ai.available ? 'ok' : 'degraded';
  return {
    status,
    ready,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    capabilities: { ai: state.ai.available, vectorSearch: state.vector.available },
    checks: { database: { ...state.database }, ai: { ...state.ai }, vector: { ...state.vector } },
  };
}

/** 执行一次 AI 健康探针并记录结果。 */
export async function checkAiHealth(probe: () => Promise<any>) {
  const started = Date.now();
  try {
    const details = await probe();
    recordAiHealth(details?.status === 'ok', { latencyMs: Date.now() - started, details });
    return state.ai;
  } catch (error) {
    recordAiHealth(false, { latencyMs: Date.now() - started, error: message(error) });
    return state.ai;
  }
}

/** 标记一次 AI RPC 成功（用于熔断统计）。 */
export function markAiRpcSuccess() {
  recordAiHealth(true, { latencyMs: state.ai.latencyMs, details: state.ai.details });
}

/** 标记一次 AI RPC 失败（连续失败触发降级标记）。 */
export function markAiRpcFailure(error: unknown) {
  recordAiHealth(false, { error: message(error) });
}

/** 启动周期健康监控（AI/数据库/向量库探针）。 */
export async function startRuntimeHealthMonitor(options: { ai: () => Promise<any>; database: () => Promise<{ latencyMs: number }>; vector?: () => Promise<{ latencyMs?: number; details?: Record<string, unknown> }>; intervalMs: number }) {
  stopRuntimeHealthMonitor();
  const run = async () => {
    if (checking) return;
    checking = true;
    try {
      const [database, , vector] = await Promise.allSettled([options.database(), checkAiHealth(options.ai), options.vector?.()]);
      if (database.status === 'fulfilled') recordDatabaseHealth(true, database.value);
      else recordDatabaseHealth(false, { error: message(database.reason) });
      if (options.vector) {
        if (vector.status === 'fulfilled') recordVectorHealth(true, vector.value);
        else recordVectorHealth(false, { error: message(vector.reason) });
      }
    } finally { checking = false; }
  };
  await run();
  monitor = setInterval(() => void run(), options.intervalMs);
  monitor.unref();
}

/** 停止周期健康监控。 */
export function stopRuntimeHealthMonitor() {
  if (monitor) clearInterval(monitor);
  monitor = undefined;
}
