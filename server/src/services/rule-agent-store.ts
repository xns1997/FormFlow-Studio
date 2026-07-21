import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { env } from '../config/env';

export interface RuleAgentMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; artifact?: Record<string, unknown>; }
export interface RuleAgentSession {
  id: string; tenantId: string; userId: string; projectId: string; formId: string; title: string;
  profileId: string; messages: RuleAgentMessage[]; proposals: Array<Record<string, any>>;
  createdAt: string; updatedAt: string; archived: boolean;
}

let pool: Pool | undefined;
const memory = new Map<string, RuleAgentSession>();

export async function initRuleAgentStore() {
  if (!env.databaseUrl || pool) return Boolean(pool);
  const candidate = new Pool({ connectionString: env.databaseUrl, max: 4, connectionTimeoutMillis: 3_000 });
  try {
    await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_rule_agent_sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, project_id TEXT NOT NULL, form_id TEXT NOT NULL,
      title TEXT NOT NULL, profile_id TEXT NOT NULL, messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      proposals JSONB NOT NULL DEFAULT '[]'::jsonb, archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await candidate.query('CREATE INDEX IF NOT EXISTS formflow_rule_agent_sessions_scope_idx ON formflow_rule_agent_sessions (tenant_id, user_id, project_id, form_id, updated_at DESC)');
    pool = candidate;
    return true;
  } catch {
    await candidate.end().catch(() => undefined);
    return false;
  }
}

function rowToSession(row: any): RuleAgentSession {
  return { id: row.id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, formId: row.form_id, title: row.title, profileId: row.profile_id, messages: row.messages || [], proposals: row.proposals || [], archived: row.archived, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

export async function createRuleAgentSession(input: Pick<RuleAgentSession, 'tenantId' | 'userId' | 'projectId' | 'formId' | 'profileId'> & { title?: string }) {
  const now = new Date().toISOString();
  const session: RuleAgentSession = { ...input, id: `ras_${randomUUID()}`, title: input.title || '新对话', messages: [], proposals: [], archived: false, createdAt: now, updatedAt: now };
  if (pool) await pool.query('INSERT INTO formflow_rule_agent_sessions (id, tenant_id, user_id, project_id, form_id, title, profile_id, messages, proposals) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [session.id, session.tenantId, session.userId, session.projectId, session.formId, session.title, session.profileId, JSON.stringify([]), JSON.stringify([])]);
  else memory.set(session.id, session);
  return session;
}

export async function listRuleAgentSessions(scope: { tenantId: string; userId: string; projectId: string; formId: string }) {
  if (pool) {
    const result = await pool.query('SELECT * FROM formflow_rule_agent_sessions WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND form_id=$4 AND archived=FALSE ORDER BY updated_at DESC LIMIT 50', [scope.tenantId, scope.userId, scope.projectId, scope.formId]);
    return result.rows.map(rowToSession);
  }
  return [...memory.values()].filter((item) => !item.archived && item.tenantId === scope.tenantId && item.userId === scope.userId && item.projectId === scope.projectId && item.formId === scope.formId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRuleAgentSession(id: string) {
  if (pool) { const result = await pool.query('SELECT * FROM formflow_rule_agent_sessions WHERE id=$1', [id]); return result.rows[0] ? rowToSession(result.rows[0]) : undefined; }
  return memory.get(id);
}

export async function saveRuleAgentSession(session: RuleAgentSession) {
  session.updatedAt = new Date().toISOString();
  if (pool) await pool.query('UPDATE formflow_rule_agent_sessions SET title=$2, profile_id=$3, messages=$4, proposals=$5, archived=$6, updated_at=NOW() WHERE id=$1', [session.id, session.title, session.profileId, JSON.stringify(session.messages), JSON.stringify(session.proposals), session.archived]);
  else memory.set(session.id, session);
  return session;
}
