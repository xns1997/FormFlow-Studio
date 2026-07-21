import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { env } from '../config/env';

export type VectorScope = { tenantId?: string; projectId?: string };
export type KnowledgeChunkInput = {
  id?: string;
  sourceId: string;
  sourceType?: string;
  chunkIndex?: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
};
export type VectorSearchInput = VectorScope & {
  collection?: string;
  embeddingModel: string;
  embedding: number[];
  limit?: number;
  sourceTypes?: string[];
  metadata?: Record<string, unknown>;
};

let pool: Pool | undefined;
let extensionVersion: string | undefined;
let indexedDimensions: number[] = [];

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function scope(scope: VectorScope) { return { tenantId: scope.tenantId || 'local', projectId: scope.projectId || '' }; }

export function vectorLiteral(values: number[]) {
  if (!Array.isArray(values) || !values.length) throw new Error('向量不能为空');
  if (values.length > 16_000) throw new Error('向量维度不能超过 16000');
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('向量只能包含有限数值');
  return `[${values.join(',')}]`;
}

function dimensions(value: number[]) { vectorLiteral(value); return value.length; }

async function createDimensionIndex(client: Pool, dimension: number) {
  const name = `formflow_chunks_embedding_hnsw_${dimension}`;
  await client.query(`CREATE INDEX IF NOT EXISTS ${name} ON formflow_knowledge_chunks USING hnsw ((embedding::vector(${dimension})) vector_cosine_ops) WHERE dimensions = ${dimension}`);
}

export async function initVectorStore(databaseUrl = env.databaseUrl) {
  const startedAt = Date.now();
  if (!databaseUrl) return { available: false, latencyMs: Date.now() - startedAt, error: '未配置 FORMFLOW_DATABASE_URL' };
  if (pool) return { available: true, latencyMs: Date.now() - startedAt, details: { extension: 'vector', extensionVersion, indexedDimensions } };
  const candidate = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3_000 });
  try {
    await candidate.query('CREATE EXTENSION IF NOT EXISTS vector');
    const version = await candidate.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    extensionVersion = String(version.rows[0]?.extversion || 'unknown');
    await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_knowledge_chunks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      collection TEXT NOT NULL DEFAULT 'default',
      source_type TEXT NOT NULL DEFAULT 'document',
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      embedding_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding VECTOR NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, project_id, collection, source_id, chunk_index, embedding_model)
    )`);
    await candidate.query('CREATE INDEX IF NOT EXISTS formflow_chunks_scope_idx ON formflow_knowledge_chunks (tenant_id, project_id, collection, embedding_model)');
    await candidate.query('CREATE INDEX IF NOT EXISTS formflow_chunks_source_idx ON formflow_knowledge_chunks (tenant_id, project_id, source_id)');
    await candidate.query('CREATE INDEX IF NOT EXISTS formflow_chunks_metadata_idx ON formflow_knowledge_chunks USING gin (metadata)');
    for (const dimension of env.vectorIndexDimensions) await createDimensionIndex(candidate, dimension);
    indexedDimensions = [...env.vectorIndexDimensions];
    pool = candidate;
    return { available: true, latencyMs: Date.now() - startedAt, details: { extension: 'vector', extensionVersion, indexedDimensions } };
  } catch (error) {
    await candidate.end().catch(() => undefined);
    return { available: false, latencyMs: Date.now() - startedAt, error: errorMessage(error), details: { extension: 'vector' } };
  }
}

export async function probeVectorStore() {
  if (!pool) throw new Error('pgvector 尚未初始化');
  const startedAt = Date.now();
  await pool.query("SELECT '[1,0]'::vector <=> '[1,0]'::vector AS distance");
  return { latencyMs: Date.now() - startedAt, details: { extension: 'vector', extensionVersion, indexedDimensions } };
}

function activePool() { if (!pool) throw new Error('pgvector 不可用'); return pool; }

export async function upsertKnowledgeChunks(input: VectorScope & { collection?: string; embeddingModel: string; chunks: KnowledgeChunkInput[] }) {
  if (!input.embeddingModel) throw new Error('缺少 embeddingModel');
  if (!input.chunks.length || input.chunks.length > 100) throw new Error('每次必须写入 1 到 100 个知识分块');
  const client = await activePool().connect();
  const currentScope = scope(input);
  try {
    await client.query('BEGIN');
    const rows = [];
    for (const chunk of input.chunks) {
      if (!chunk.sourceId || !chunk.content.trim()) throw new Error('知识分块必须包含 sourceId 和 content');
      const dimension = dimensions(chunk.embedding);
      if (chunk.chunkIndex !== undefined && (!Number.isInteger(chunk.chunkIndex) || chunk.chunkIndex < 0)) throw new Error('chunkIndex 必须是非负整数');
      const id = chunk.id || `chunk_${randomUUID()}`;
      const hash = createHash('sha256').update(chunk.content).digest('hex');
      const result = await client.query(
        `INSERT INTO formflow_knowledge_chunks
          (id, tenant_id, project_id, collection, source_type, source_id, chunk_index, content, content_hash, metadata, embedding_model, dimensions, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::vector)
         ON CONFLICT (tenant_id, project_id, collection, source_id, chunk_index, embedding_model) DO UPDATE SET
          content = EXCLUDED.content, content_hash = EXCLUDED.content_hash, metadata = EXCLUDED.metadata,
          dimensions = EXCLUDED.dimensions, embedding = EXCLUDED.embedding, updated_at = NOW()
         RETURNING id, source_id, chunk_index, dimensions`,
        [id, currentScope.tenantId, currentScope.projectId, input.collection || 'default', chunk.sourceType || 'document', chunk.sourceId, chunk.chunkIndex ?? 0, chunk.content, hash, JSON.stringify(chunk.metadata || {}), input.embeddingModel, dimension, vectorLiteral(chunk.embedding)],
      );
      rows.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return rows.map((row) => ({ id: row.id, sourceId: row.source_id, chunkIndex: row.chunk_index, dimensions: row.dimensions }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function searchKnowledge(input: VectorSearchInput) {
  const dimension = dimensions(input.embedding);
  const currentScope = scope(input);
  const values: unknown[] = [currentScope.tenantId, currentScope.projectId, input.collection || 'default', input.embeddingModel, dimension, vectorLiteral(input.embedding)];
  const filters = ['tenant_id = $1', 'project_id = $2', 'collection = $3', 'embedding_model = $4', 'dimensions = $5'];
  if (input.sourceTypes?.length) { values.push(input.sourceTypes); filters.push(`source_type = ANY($${values.length}::text[])`); }
  if (input.metadata && Object.keys(input.metadata).length) { values.push(JSON.stringify(input.metadata)); filters.push(`metadata @> $${values.length}::jsonb`); }
  values.push(Math.min(Math.max(Number(input.limit || 10), 1), 50));
  const result = await activePool().query(
    `SELECT id, source_type, source_id, chunk_index, content, metadata, embedding_model,
      1 - (embedding::vector(${dimension}) <=> $6::vector(${dimension})) AS score
     FROM formflow_knowledge_chunks WHERE ${filters.join(' AND ')}
     ORDER BY embedding::vector(${dimension}) <=> $6::vector(${dimension}) LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({ id: row.id, sourceType: row.source_type, sourceId: row.source_id, chunkIndex: row.chunk_index, content: row.content, metadata: row.metadata, embeddingModel: row.embedding_model, score: Number(row.score) }));
}

export async function deleteKnowledge(input: VectorScope & { collection?: string; sourceId?: string }) {
  const currentScope = scope(input);
  const values: unknown[] = [currentScope.tenantId, currentScope.projectId, input.collection || 'default'];
  let sourceFilter = '';
  if (input.sourceId) { values.push(input.sourceId); sourceFilter = ` AND source_id = $${values.length}`; }
  const result = await activePool().query(`DELETE FROM formflow_knowledge_chunks WHERE tenant_id = $1 AND project_id = $2 AND collection = $3${sourceFilter}`, values);
  return result.rowCount || 0;
}

export async function shutdownVectorStore() {
  const active = pool; pool = undefined;
  if (active) await active.end();
}
