export type OfflineQueueState = 'pending' | 'conflict' | 'failed';

export interface OfflineQueueItem {
  id: string;
  tenantId?: string;
  userId?: string;
  scopeKey?: string;
  projectId?: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  baseRevision?: string;
  createdAt: number;
  updatedAt: number;
  state: OfflineQueueState;
  attempts: number;
  nextAttemptAt?: number;
  error?: string;
}

const DB_NAME = 'formflow-recovery';
const STORE_NAME = 'offline-queue';
const memory = new Map<string, OfflineQueueItem>();

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地恢复存储不可用'));
  });
}

async function openDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return new Promise<IDBDatabase | undefined>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('projectId', 'projectId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地恢复存储不可用'));
  }).catch(() => undefined);
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  try {
    const transaction = db.transaction(STORE_NAME, mode);
    return await requestToPromise(run(transaction.objectStore(STORE_NAME)));
  } finally {
    db.close();
  }
}

export async function enqueueOffline(item: Omit<OfflineQueueItem, 'createdAt' | 'updatedAt' | 'state' | 'attempts'>): Promise<OfflineQueueItem> {
  const now = Date.now();
  const record: OfflineQueueItem = { ...item, createdAt: now, updatedAt: now, state: 'pending', attempts: 0 };
  memory.set(record.id, record);
  try { await withStore('readwrite', (store) => store.put(record)); } catch { /* memory fallback keeps the UI usable */ }
  return record;
}

export async function listOfflineQueue(projectId?: string, scopeKey?: string): Promise<OfflineQueueItem[]> {
  const values = [...memory.values()].filter((item) => (!projectId || item.projectId === projectId) && (!scopeKey || item.scopeKey === scopeKey));
  try {
    const stored = await withStore('readonly', (store) => store.getAll());
    if (stored) {
      for (const item of stored) memory.set(item.id, item);
    }
  } catch { /* use the in-memory snapshot */ }
  return [...memory.values()]
    .filter((item) => (!projectId || item.projectId === projectId) && (!scopeKey || item.scopeKey === scopeKey))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateOfflineQueue(id: string, patch: Partial<Pick<OfflineQueueItem, 'state' | 'attempts' | 'error' | 'nextAttemptAt'>>): Promise<void> {
  const current = memory.get(id);
  if (!current) return;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  memory.set(id, next);
  try { await withStore('readwrite', (store) => store.put(next)); } catch { /* best effort */ }
}

export async function removeOfflineQueue(id: string): Promise<void> {
  memory.delete(id);
  try { await withStore('readwrite', (store) => store.delete(id)); } catch { /* best effort */ }
}

export async function clearOfflineQueue(projectId?: string, scopeKey?: string): Promise<void> {
  const items = await listOfflineQueue(projectId, scopeKey);
  await Promise.all(items.map((item) => removeOfflineQueue(item.id)));
}

export async function pruneOfflineQueue(retentionDays: number, scopeKey?: string): Promise<void> {
  if (retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const items = await listOfflineQueue(undefined, scopeKey);
  await Promise.all(items.filter((item) => item.updatedAt < cutoff).map((item) => removeOfflineQueue(item.id)));
}

export async function replayOfflineQueue(execute: (item: OfflineQueueItem) => Promise<'completed' | 'conflict' | 'retry'>, scopeKey?: string): Promise<void> {
  const items = await listOfflineQueue(undefined, scopeKey);
  const now = Date.now();
  for (const item of items.filter((entry) => entry.state === 'pending' && entry.attempts < 8 && (!entry.nextAttemptAt || entry.nextAttemptAt <= now))) {
    await updateOfflineQueue(item.id, { attempts: item.attempts + 1 });
    try {
      const result = await execute(item);
      if (result === 'completed') await removeOfflineQueue(item.id);
      else if (result === 'conflict') await updateOfflineQueue(item.id, { state: 'conflict', error: '服务器版本已变化，需要人工合并' });
      else await updateOfflineQueue(item.id, { nextAttemptAt: Date.now() + Math.min(60_000, 1_000 * 2 ** item.attempts) });
    } catch (error) {
      const attempts = item.attempts + 1;
      await updateOfflineQueue(item.id, { state: attempts >= 8 ? 'failed' : 'pending', nextAttemptAt: Date.now() + Math.min(60_000, 1_000 * 2 ** item.attempts), error: error instanceof Error ? error.message : String(error) });
    }
  }
}
