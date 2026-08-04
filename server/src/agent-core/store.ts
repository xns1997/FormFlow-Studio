/**
 * Thread + capability bundle store.
 *
 * Local mode persists to JSON files; cloud mode mirrors every write to
 * PostgreSQL tables (created by server/sql/005_agent_threads.sql and
 * idempotently ensured at boot). Old v1/v2 agent tables are untouched.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { MCP_ROLE_CATALOG } from '../services/formflow-tool-registry';
import type { McpRole } from '../services/tool-shared';
import { serverDataPath } from '../config/paths';
import { env } from '../config/env';
import type {
  AgentThread, AgentMode, CapabilityBundleVersion, PendingApproval, ThreadEvent,
  ThreadHistoryPage, ThreadHistorySummary, ThreadHistoryStatus, ThreadMessage, ThreadStatus,
} from './types';

const THREAD_STORE_PATH = process.env.AGENT_THREAD_STORE_PATH || serverDataPath('configs', 'agent-threads.json');
const BUNDLE_STORE_PATH = process.env.AGENT_BUNDLE_STORE_PATH || serverDataPath('configs', 'agent-capability-bundles.json');

const listeners = new Map<string, Set<(event: ThreadEvent) => void>>();
const liveThreads = new Map<string, AgentThread>();
const leases = new Set<string>();
const leaseOwners = new Map<string, string>();
const mirrorQueues = new Map<string, Promise<void>>();
let pool: Pool | undefined;
let initialization: Promise<void> | undefined;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return fallback; }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, path);
}

function threads() { return readJson<AgentThread[]>(THREAD_STORE_PATH, []); }
function bundles() { return readJson<CapabilityBundleVersion[]>(BUNDLE_STORE_PATH, []); }

// ─── Default capability bundle ────────────────────────────────────────────────

export function defaultCapabilityBundle(ownerId = 'system'): CapabilityBundleVersion {
  const now = new Date().toISOString();
  return {
    id: 'cap_default_v1',
    bundleId: 'cap_default',
    version: 1,
    ownerId,
    name: 'FormFlow 标准能力包',
    description: '按领域 skill 组织七个 MCP 作用域，单循环按需调用。',
    status: 'published',
    scopes: MCP_ROLE_CATALOG.map((entry) => ({
      role: entry.id,
      name: entry.title,
      description: entry.description,
      instructions: `严格按照 ${entry.id} 领域的 skill 工作，只调用该领域工具。`,
      tools: [],
      toolMode: 'all' as const,
      knowledge: [],
    })),
    context: { recentMessages: 8, maxSummaryChars: 6000 },
    budget: { maxDecisionSteps: 40, maxAttempts: 3, maxToolSteps: 24, maxRecoveryCycles: 6 },
    createdAt: now,
    publishedAt: now,
  };
}

function ensureDefaultBundle() {
  const items = bundles();
  if (!items.some((item) => item.id === 'cap_default_v1')) writeJson(BUNDLE_STORE_PATH, [defaultCapabilityBundle(), ...items]);
}

export function validateBundle(bundle: CapabilityBundleVersion) {
  if (!bundle.name?.trim()) throw new Error('能力包名称不能为空');
  const { budget } = bundle;
  if (budget.maxDecisionSteps < 1 || budget.maxDecisionSteps > 128) throw new Error('最大决策步数必须在 1 到 128 之间');
  if (budget.maxAttempts < 1 || budget.maxAttempts > 5) throw new Error('任务最大尝试次数必须在 1 到 5 之间');
  if (budget.maxToolSteps < 1 || budget.maxToolSteps > 128) throw new Error('工具步上限必须在 1 到 128 之间');
  if (budget.maxRecoveryCycles < 1 || budget.maxRecoveryCycles > 16) throw new Error('恢复周期必须在 1 到 16 之间');
  const roles = bundle.scopes.map((scope) => scope.role);
  if (new Set(roles).size !== roles.length) throw new Error('能力包不能重复注册同一作用域');
  for (const expected of MCP_ROLE_CATALOG.map((entry) => entry.id)) if (!roles.includes(expected)) throw new Error(`能力包缺少 ${expected} 作用域`);
  for (const scope of bundle.scopes) {
    if (!scope.name?.trim()) throw new Error(`作用域 ${scope.role} 名称不能为空`);
    if (scope.tools.includes('release.apply')) throw new Error('能力包不得启用 release.apply');
    if (!['all', 'selected'].includes(scope.toolMode)) throw new Error(`作用域 ${scope.role} 的工具授权模式无效`);
    const knowledgeIds = new Set<string>();
    for (const item of scope.knowledge || []) {
      if (!item.id?.trim() || !item.title?.trim() || !item.content?.trim()) throw new Error(`作用域 ${scope.role} 的知识条目不完整`);
      if (knowledgeIds.has(item.id)) throw new Error(`作用域 ${scope.role} 存在重复知识 ID：${item.id}`);
      knowledgeIds.add(item.id);
    }
  }
  return { valid: true };
}

export function listCapabilityBundles(ownerId: string) {
  ensureDefaultBundle();
  return bundles().filter((item) => item.ownerId === ownerId || item.ownerId === 'system');
}

export function getCapabilityBundle(id: string, ownerId: string) {
  return listCapabilityBundles(ownerId).find((item) => item.id === id);
}

export function saveCapabilityBundleDraft(input: Partial<CapabilityBundleVersion> & { name: string }, ownerId: string) {
  ensureDefaultBundle();
  const items = bundles();
  const now = new Date().toISOString();
  const bundleId = input.bundleId || `cap_${randomUUID()}`;
  const existing = input.id ? items.find((item) => item.id === input.id && item.ownerId === ownerId && item.status === 'draft') : undefined;
  const value: CapabilityBundleVersion = {
    id: existing?.id || `capv_${randomUUID()}`,
    bundleId,
    version: existing?.version || Math.max(0, ...items.filter((item) => item.bundleId === bundleId).map((item) => item.version)) + 1,
    ownerId,
    name: input.name.trim(),
    description: String(input.description || ''),
    status: 'draft',
    scopes: input.scopes?.length ? input.scopes : defaultCapabilityBundle(ownerId).scopes,
    context: input.context || { recentMessages: 8, maxSummaryChars: 6000 },
    budget: input.budget || { maxDecisionSteps: 40, maxAttempts: 3, maxToolSteps: 24, maxRecoveryCycles: 6 },
    createdAt: existing?.createdAt || now,
  };
  const next = existing ? items.map((item) => (item.id === existing.id ? value : item)) : [...items, value];
  writeJson(BUNDLE_STORE_PATH, next);
  mirrorBundle(value);
  return value;
}

export function publishCapabilityBundle(id: string, ownerId: string) {
  const items = bundles();
  const draft = items.find((item) => item.id === id && item.ownerId === ownerId && item.status === 'draft');
  if (!draft) throw new Error('能力包草稿不存在');
  validateBundle(draft);
  const value = { ...draft, status: 'published' as const, publishedAt: new Date().toISOString() };
  writeJson(BUNDLE_STORE_PATH, items.map((item) => (item.id === id ? value : item)));
  mirrorBundle(value);
  return value;
}

function mirrorBundle(value: CapabilityBundleVersion) {
  void pool?.query(
    `INSERT INTO formflow_agent_capability_versions(id,bundle_id,version,owner_id,status,payload,created_at,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,published_at=EXCLUDED.published_at`,
    [value.id, value.bundleId, value.version, value.ownerId, value.status, JSON.stringify(value), value.createdAt, value.publishedAt || null],
  );
}

// ─── Boot / PG mirror ─────────────────────────────────────────────────────────

export function initializeAgentStore() {
  if (initialization) return initialization;
  initialization = (async () => {
    ensureDefaultBundle();
    if (env.mode === 'cloud' && env.databaseUrl) {
      const candidate = new Pool({ connectionString: env.databaseUrl, max: 6, connectionTimeoutMillis: 3_000 });
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_agent_threads (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, current_project_id TEXT,
        status TEXT NOT NULL, payload JSONB NOT NULL, archived BOOLEAN NOT NULL DEFAULT FALSE,
        lease_owner TEXT, lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await candidate.query(`CREATE INDEX IF NOT EXISTS formflow_agent_threads_scope_idx ON formflow_agent_threads (tenant_id, user_id, current_project_id, updated_at DESC)`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_agent_events (
        thread_id TEXT NOT NULL REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
        seq BIGINT NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (thread_id, seq))`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_agent_approvals (
        thread_id TEXT PRIMARY KEY REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
        id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_agent_capability_versions (
        id TEXT PRIMARY KEY, bundle_id TEXT NOT NULL, version INTEGER NOT NULL, owner_id TEXT NOT NULL,
        status TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ, UNIQUE (bundle_id, version))`);
      const [threadRows, bundleRows] = await Promise.all([
        candidate.query('SELECT payload FROM formflow_agent_threads ORDER BY created_at'),
        candidate.query('SELECT payload FROM formflow_agent_capability_versions ORDER BY created_at'),
      ]);
      if (threadRows.rows.length) writeJson(THREAD_STORE_PATH, threadRows.rows.map((row) => row.payload));
      if (bundleRows.rows.length) writeJson(BUNDLE_STORE_PATH, bundleRows.rows.map((row) => row.payload));
      pool = candidate;
    }
    const recovered = threads();
    let changed = false;
    for (const thread of recovered) {
      if (!thread.mode) { thread.mode = 'plan'; changed = true; }
      if (['planning', 'executing'].includes(thread.status)) {
        thread.status = 'paused';
        for (const task of thread.plan?.tasks || []) if (task.status === 'running') task.status = 'pending';
        appendEventRaw(thread, 'execution_recovered', { reason: 'server_restart', checkpointRevision: thread.projectRevisions[thread.currentProjectId || ''] });
        changed = true;
      } else if (thread.status === 'awaiting_operation_approval') {
        thread.status = 'paused';
        changed = true;
      }
    }
    if (changed) { writeJson(THREAD_STORE_PATH, recovered); recovered.forEach(mirrorThread); }
    recovered.forEach((thread) => liveThreads.set(thread.id, thread));
  })();
  return initialization;
}

function appendEventRaw(thread: AgentThread, type: string, data: any) {
  const event: ThreadEvent = { id: `aev_${randomUUID()}`, seq: (thread.events.at(-1)?.seq || 0) + 1, type, data, createdAt: new Date().toISOString() };
  thread.events.push(event);
  if (thread.events.length > 2000) thread.events = thread.events.slice(-2000);
  return event;
}

function mirrorThread(value: AgentThread) {
  if (!pool) return;
  const snapshot = JSON.parse(JSON.stringify(value)) as AgentThread;
  const job = async () => {
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO formflow_agent_threads(id,tenant_id,user_id,current_project_id,status,payload,archived,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(id) DO UPDATE SET current_project_id=EXCLUDED.current_project_id,status=EXCLUDED.status,payload=EXCLUDED.payload,archived=EXCLUDED.archived,updated_at=EXCLUDED.updated_at`,
        [snapshot.id, snapshot.tenantId, snapshot.userId, snapshot.currentProjectId || null, snapshot.status, JSON.stringify(snapshot), snapshot.archived, snapshot.createdAt, snapshot.updatedAt],
      );
      const lastEvent = await client.query('SELECT COALESCE(MAX(seq),0) AS seq FROM formflow_agent_events WHERE thread_id=$1', [snapshot.id]);
      const persistedSeq = Number(lastEvent.rows[0]?.seq || 0);
      for (const event of snapshot.events.filter((item) => item.seq > persistedSeq)) {
        await client.query(
          'INSERT INTO formflow_agent_events(thread_id,seq,type,payload,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(thread_id,seq) DO NOTHING',
          [snapshot.id, event.seq, event.type, JSON.stringify(event.data), event.createdAt],
        );
      }
      if (snapshot.pendingApproval) {
        await client.query(
          'INSERT INTO formflow_agent_approvals(thread_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(thread_id) DO UPDATE SET id=EXCLUDED.id,payload=EXCLUDED.payload,updated_at=NOW()',
          [snapshot.id, snapshot.pendingApproval.id, JSON.stringify(snapshot.pendingApproval)],
        );
      } else {
        await client.query('DELETE FROM formflow_agent_approvals WHERE thread_id=$1', [snapshot.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
    } finally {
      client.release();
    }
  };
  const previous = mirrorQueues.get(snapshot.id) || Promise.resolve();
  const next = previous.then(job, job);
  mirrorQueues.set(snapshot.id, next);
  void next.finally(() => { if (mirrorQueues.get(snapshot.id) === next) mirrorQueues.delete(snapshot.id); });
}

// ─── Thread CRUD ──────────────────────────────────────────────────────────────

export function threadProjectIds(thread: Pick<AgentThread, 'projectIds' | 'currentProjectId'>) {
  return [...new Set([...(thread.projectIds || []), ...(thread.currentProjectId ? [thread.currentProjectId] : [])].map(String).filter(Boolean))];
}

export function createAgentThread(input: { tenantId: string; userId: string; projectIds?: string[]; currentProjectId?: string; title?: string; profileId: string; capabilityBundleVersionId?: string }) {
  ensureDefaultBundle();
  const bundle = getCapabilityBundle(input.capabilityBundleVersionId || 'cap_default_v1', input.userId);
  if (!bundle || bundle.status !== 'published') throw new Error('请选择已发布且有权使用的能力包版本');
  const now = new Date().toISOString();
  const value: AgentThread = {
    schemaVersion: 1,
    id: `pat_${randomUUID()}`,
    tenantId: input.tenantId,
    userId: input.userId,
    projectIds: [...new Set(input.projectIds || [])],
    currentProjectId: input.currentProjectId,
    projectRevisions: {},
    title: input.title || '项目智能体',
    profileId: input.profileId,
    capabilityBundleVersionId: bundle.id,
    mode: 'plan',
    status: 'idle',
    messages: [],
    summary: '',
    events: [],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  writeJson(THREAD_STORE_PATH, [...threads(), value]);
  liveThreads.set(value.id, value);
  mirrorThread(value);
  return value;
}

export function getAgentThread(id: string) {
  const live = liveThreads.get(id);
  if (live) return live;
  const value = threads().find((item) => item.id === id);
  if (value) liveThreads.set(id, value);
  return value;
}

export function saveAgentThread(value: AgentThread) {
  value.updatedAt = new Date().toISOString();
  liveThreads.set(value.id, value);
  const items = threads();
  const index = items.findIndex((item) => item.id === value.id);
  if (index >= 0) items[index] = value; else items.push(value);
  writeJson(THREAD_STORE_PATH, items);
  mirrorThread(value);
  return value;
}

export function listAgentThreads(scope: { tenantId: string; userId: string; projectId?: string; scopeKind?: 'project' | 'unbound' | 'all' }) {
  const kind = scope.scopeKind || (scope.projectId ? 'project' : 'unbound');
  if (kind === 'project' && !scope.projectId) throw new Error('按项目查询线程时 projectId 不能为空');
  return threads()
    .map((item) => liveThreads.get(item.id) || (liveThreads.set(item.id, item), item))
    .filter((item) => {
      if (item.archived || item.tenantId !== scope.tenantId || item.userId !== scope.userId) return false;
      if (kind === 'all') return true;
      if (kind === 'unbound') return threadProjectIds(item).length === 0;
      return threadProjectIds(item).includes(String(scope.projectId));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function threadHistoryStatus(status: ThreadStatus): ThreadHistoryStatus {
  if (['awaiting_plan_approval', 'awaiting_operation_approval', 'paused', 'blocked', 'failed'].includes(status)) return 'attention';
  if (['completed', 'stopped'].includes(status)) return 'completed';
  return 'active';
}

function historySummary(thread: AgentThread): ThreadHistorySummary {
  const tasks = thread.plan?.tasks || [];
  return {
    id: thread.id,
    title: thread.title,
    projectIds: threadProjectIds(thread),
    status: threadHistoryStatus(thread.status),
    goal: thread.plan?.goal || '',
    taskProgress: {
      total: tasks.length,
      passed: tasks.filter((task) => task.status === 'passed').length,
      failed: tasks.filter((task) => task.status === 'failed').length,
      complete: thread.status === 'completed',
    },
    pinnedAt: thread.pinnedAt,
    archived: thread.archived,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

function compareHistory(left: ThreadHistorySummary, right: ThreadHistorySummary) {
  const leftPinned = left.pinnedAt || '';
  const rightPinned = right.pinnedAt || '';
  if (Boolean(leftPinned) !== Boolean(rightPinned)) return leftPinned ? -1 : 1;
  if (leftPinned !== rightPinned) return rightPinned.localeCompare(leftPinned);
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return right.id.localeCompare(left.id);
}

function historyCursor(item: ThreadHistorySummary) {
  return Buffer.from(JSON.stringify({ p: item.pinnedAt || '', u: item.updatedAt, i: item.id }), 'utf8').toString('base64url');
}

function decodeHistoryCursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return { p: String(parsed.p || ''), u: String(parsed.u || ''), i: String(parsed.i || '') };
  } catch {
    throw new Error('历史任务游标无效');
  }
}

export function listThreadHistory(input: { tenantId: string; userId: string; q?: string; status?: ThreadHistoryStatus; projectId?: string; archived?: boolean; cursor?: string; limit?: number }, canInclude?: (thread: AgentThread) => boolean): ThreadHistoryPage {
  const query = String(input.q || '').trim().toLocaleLowerCase();
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 30));
  const cursor = decodeHistoryCursor(input.cursor);
  const items = threads()
    .map((item) => liveThreads.get(item.id) || (liveThreads.set(item.id, item), item))
    .filter((item) => item.tenantId === input.tenantId && item.userId === input.userId && item.archived === Boolean(input.archived) && (!canInclude || canInclude(item)))
    .map(historySummary)
    .filter((item) => !input.status || item.status === input.status)
    .filter((item) => !input.projectId || (input.projectId === '__unbound__' ? item.projectIds.length === 0 : item.projectIds.includes(input.projectId)))
    .filter((item) => !query || `${item.title}\n${item.goal}\n${item.projectIds.join('\n')}`.toLocaleLowerCase().includes(query))
    .sort(compareHistory);
  let start = 0;
  if (cursor) {
    const exact = items.findIndex((item) => (item.pinnedAt || '') === cursor.p && item.updatedAt === cursor.u && item.id === cursor.i);
    if (exact >= 0) start = exact + 1;
  }
  const page = items.slice(start, start + limit);
  return { items: page, nextCursor: start + limit < items.length && page.length ? historyCursor(page.at(-1)!) : undefined };
}

export function findActiveProjectThread(scope: { tenantId: string; userId: string; projectId: string }, excludeId?: string) {
  return listAgentThreads({ ...scope, scopeKind: 'project' }).find(
    (item) => item.id !== excludeId && ['executing', 'awaiting_operation_approval'].includes(item.status),
  );
}

export function archiveAgentThread(value: AgentThread) {
  value.archived = true;
  return saveAgentThread(value);
}

export function restoreAgentThread(value: AgentThread) {
  value.archived = false;
  return saveAgentThread(value);
}

export async function deleteAgentThread(value: AgentThread) {
  if (leases.has(value.id)) throw new Error('任务仍在执行，请先等待安全暂停');
  await mirrorQueues.get(value.id)?.catch(() => undefined);
  if (pool) await pool.query('DELETE FROM formflow_agent_threads WHERE id=$1', [value.id]);
  writeJson(THREAD_STORE_PATH, threads().filter((item) => item.id !== value.id));
  liveThreads.delete(value.id);
  listeners.delete(value.id);
  leaseOwners.delete(value.id);
  leases.delete(value.id);
  mirrorQueues.delete(value.id);
  return { deleted: true as const, id: value.id };
}

export function updateAgentThreadMetadata(value: AgentThread, input: { title?: string; pinned?: boolean }) {
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 80) throw new Error('任务名称必须为 1–80 个字符');
    value.title = title;
  }
  if (input.pinned !== undefined) value.pinnedAt = input.pinned ? new Date().toISOString() : undefined;
  return saveAgentThread(value);
}

export function setAgentThreadMode(value: AgentThread, mode: AgentMode) {
  if (!['plan', 'goal'].includes(mode)) throw new Error('执行模式必须是 plan 或 goal');
  value.mode = mode;
  return saveAgentThread(value);
}

export function setAgentThreadProjectScope(value: AgentThread, projectIds: string[], currentProjectId?: string) {
  const normalized = [...new Set(projectIds.map(String).map((id) => id.trim()).filter(Boolean))];
  if (currentProjectId && !normalized.includes(currentProjectId)) throw new Error('当前项目必须包含在限定项目范围内');
  value.projectIds = normalized;
  value.currentProjectId = currentProjectId || normalized[0];
  value.projectRevisions = Object.fromEntries(Object.entries(value.projectRevisions || {}).filter(([id]) => normalized.includes(id)));
  return saveAgentThread(value);
}

// ─── Events / SSE ─────────────────────────────────────────────────────────────

export function appendAgentThreadEvent(value: AgentThread, type: string, data: any) {
  const event = appendEventRaw(value, type, data);
  saveAgentThread(value);
  for (const listener of listeners.get(value.id) || []) listener(event);
  return event;
}

export function subscribeAgentThreadEvents(id: string, listener: (event: ThreadEvent) => void) {
  const set = listeners.get(id) || new Set();
  set.add(listener);
  listeners.set(id, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(id);
  };
}

export function threadEventsAfter(value: AgentThread, afterSeq = 0) {
  return value.events.filter((event) => event.seq > afterSeq);
}

export function addThreadMessage(value: AgentThread, role: 'user' | 'assistant', kind: ThreadMessage['kind'], content: string, turnId?: string, questions?: ThreadMessage['questions']) {
  const message = { id: `amsg_${randomUUID()}`, role, kind, content, turnId, ...(questions?.length ? { questions } : {}), createdAt: new Date().toISOString() };
  value.messages.push(message);
  return message;
}

// ─── Lease ────────────────────────────────────────────────────────────────────

export async function acquireAgentThreadLease(id: string) {
  if (leases.has(id)) return false;
  const owner = `${process.pid}:${randomUUID()}`;
  if (pool) {
    const result = await pool.query(
      'UPDATE formflow_agent_threads SET lease_owner=$2,lease_expires_at=NOW()+INTERVAL \'45 seconds\' WHERE id=$1 AND (lease_expires_at IS NULL OR lease_expires_at<NOW()) RETURNING id',
      [id, owner],
    );
    if (!result.rows[0]) return false;
  }
  leaseOwners.set(id, owner);
  leases.add(id);
  return true;
}

export async function renewAgentThreadLease(id: string) {
  const owner = leaseOwners.get(id);
  if (pool && owner) await pool.query('UPDATE formflow_agent_threads SET lease_expires_at=NOW()+INTERVAL \'45 seconds\' WHERE id=$1 AND lease_owner=$2', [id, owner]);
}

export async function releaseAgentThreadLease(id: string) {
  const owner = leaseOwners.get(id);
  leases.delete(id);
  leaseOwners.delete(id);
  if (pool && owner) await pool.query('UPDATE formflow_agent_threads SET lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$2', [id, owner]);
}

export function hasAgentThreadLease(id: string) {
  return leases.has(id);
}

// ─── Context compaction ───────────────────────────────────────────────────────

export function compactThreadMessages(value: AgentThread, maxChars: number, recentMessages: number) {
  const old = value.messages.slice(0, Math.max(0, value.messages.length - recentMessages));
  if (!old.length) return;
  const addition = old.map((item) => `${item.role === 'user' ? '用户' : '智能体'}：${item.content}`).join('\n');
  value.summary = `${value.summary}\n${addition}`.trim().slice(-maxChars);
  value.messages = value.messages.slice(-recentMessages);
  appendAgentThreadEvent(value, 'context_compacted', { summarizedMessages: old.length, summaryChars: value.summary.length });
}

export type { PendingApproval };
