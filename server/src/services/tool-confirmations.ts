import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { env } from '../config/env';

type Confirmation = {
  token: string; operationHash: string; userId: string; tenantId?: string; projectId?: string;
  toolName: string; expiresAt: number; used: boolean;
};

const memory = new Map<string, Confirmation>();
let schemaReady = false;

export function operationHash(toolName: string, input: unknown, context: { userId?: string; tenantId?: string; projectId?: string }) {
  const sanitized = input && typeof input === 'object' ? { ...(input as Record<string, unknown>), confirmationToken: undefined } : input;
  return createHash('sha256').update(JSON.stringify({ toolName, input: sanitized, userId: context.userId || '', tenantId: context.tenantId || '', projectId: context.projectId || '' })).digest('hex');
}

async function database<T>(action: (client: Client) => Promise<T>): Promise<T | undefined> {
  if (!env.databaseUrl) return undefined;
  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    if (!schemaReady) {
      await client.query(`CREATE TABLE IF NOT EXISTS llm_tool_confirmations (
        token TEXT PRIMARY KEY, operation_hash TEXT NOT NULL, user_id TEXT NOT NULL,
        tenant_id TEXT, project_id TEXT, tool_name TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
      )`);
      schemaReady = true;
    }
    return await action(client);
  } catch (error) {
    if (env.mode === 'cloud') throw error;
    return undefined;
  } finally { await client.end().catch(() => undefined); }
}

export async function issueConfirmation(input: Omit<Confirmation, 'token' | 'expiresAt' | 'used'>) {
  const value: Confirmation = { ...input, token: `confirm_${randomUUID()}`, expiresAt: Date.now() + 5 * 60_000, used: false };
  const saved = await database(async (client) => {
    await client.query('INSERT INTO llm_tool_confirmations(token, operation_hash, user_id, tenant_id, project_id, tool_name, expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [value.token, value.operationHash, value.userId, value.tenantId || null, value.projectId || null, value.toolName, new Date(value.expiresAt)]);
    return true;
  });
  if (!saved) memory.set(value.token, value);
  return { token: value.token, expiresAt: new Date(value.expiresAt).toISOString() };
}

export async function consumeConfirmation(token: string, expected: Omit<Confirmation, 'token' | 'expiresAt' | 'used'>) {
  if (!token) return false;
  const consumed = await database(async (client) => {
    const result = await client.query('UPDATE llm_tool_confirmations SET used_at=NOW() WHERE token=$1 AND operation_hash=$2 AND user_id=$3 AND tool_name=$4 AND used_at IS NULL AND expires_at>NOW() RETURNING token', [token, expected.operationHash, expected.userId, expected.toolName]);
    return result.rowCount === 1;
  });
  if (consumed !== undefined) return consumed;
  const value = memory.get(token);
  if (!value || value.used || value.expiresAt <= Date.now() || value.operationHash !== expected.operationHash || value.userId !== expected.userId || value.toolName !== expected.toolName) return false;
  value.used = true; memory.delete(token); return true;
}
