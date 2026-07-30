import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { serverDataPath } from '../config/paths';

export type DocsState = {
  version: number;
  favorites: string[];
  recent: string[];
  taskProgress: Record<string, boolean>;
  updatedAt: string;
};
export type DocsEvent = {
  type: 'search' | 'open' | 'feedback';
  docId?: string;
  resultCount?: number;
  latencyMs?: number;
  outcome?: 'clicked' | 'abandoned' | 'rewritten';
  category?: 'helpful' | 'not-helpful' | 'missing' | 'outdated' | 'unclear' | 'example-error';
};

const root = serverDataPath('docs');
const stateDir = `${root}/state`;
const metricsFile = `${root}/metrics.json`;
const emptyState = (): DocsState => ({ version: 0, favorites: [], recent: [], taskProgress: {}, updatedAt: new Date(0).toISOString() });
const safeKey = (tenantId: string, userId: string) => createHash('sha256').update(`${tenantId}:${userId}`).digest('hex');

export function readDocsState(tenantId: string, userId: string): DocsState {
  const file = `${stateDir}/${safeKey(tenantId, userId)}.json`;
  if (!existsSync(file)) return emptyState();
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return { ...emptyState(), ...value, version: Math.max(0, Number(value.version) || 0) };
  } catch { return emptyState(); }
}

export function saveDocsState(tenantId: string, userId: string, input: Partial<DocsState>): DocsState {
  const current = readDocsState(tenantId, userId);
  const incomingVersion = Math.max(0, Number(input.version) || 0);
  const incomingTime = Date.parse(input.updatedAt || '') || 0;
  const currentTime = Date.parse(current.updatedAt || '') || 0;
  const currentSnapshot = incomingVersion >= current.version && incomingTime >= currentTime;
  const incomingFavorites = Array.isArray(input.favorites) ? input.favorites.filter((id): id is string => typeof id === 'string') : current.favorites;
  const incomingRecent = Array.isArray(input.recent) ? input.recent.filter((id): id is string => typeof id === 'string') : current.recent;
  const favorites = currentSnapshot
    ? [...new Set(incomingFavorites)].slice(-500)
    : [...new Set([...current.favorites, ...incomingFavorites])].slice(-500);
  const recent = [...new Set([...incomingRecent, ...current.recent])].slice(0, 50);
  const taskProgress = currentSnapshot ? { ...(input.taskProgress || current.taskProgress) } : { ...current.taskProgress, ...(input.taskProgress || {}) };
  const next: DocsState = { version: current.version + 1, favorites, recent, taskProgress, updatedAt: new Date().toISOString() };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(`${stateDir}/${safeKey(tenantId, userId)}.json`, JSON.stringify(next, null, 2));
  return next;
}

export function aggregateDocsEvent(event: DocsEvent) {
  const allowed = new Set(['search', 'open', 'feedback']);
  if (!allowed.has(event.type)) throw new Error('不支持的文档事件');
  const forbidden = Object.keys(event as object).filter((key) => ['query', 'projectId', 'userId', 'tenantId', 'content'].includes(key));
  if (forbidden.length) throw new Error('文档事件不得包含查询文本或项目上下文');
  let metrics: Record<string, { count: number; totalLatencyMs: number; resultCount: number }> = {};
  try { metrics = existsSync(metricsFile) ? JSON.parse(readFileSync(metricsFile, 'utf8')) : {}; } catch { metrics = {}; }
  const day = new Date().toISOString().slice(0, 10);
  const key = [day, event.type, event.docId || '-', event.outcome || event.category || '-'].join('|');
  const current = metrics[key] || { count: 0, totalLatencyMs: 0, resultCount: 0 };
  metrics[key] = {
    count: current.count + 1,
    totalLatencyMs: current.totalLatencyMs + Math.max(0, Math.min(60_000, Number(event.latencyMs) || 0)),
    resultCount: current.resultCount + Math.max(0, Math.min(10_000, Number(event.resultCount) || 0)),
  };
  mkdirSync(root, { recursive: true });
  writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
}
