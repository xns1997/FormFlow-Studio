CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS formflow_knowledge_chunks (
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
);

CREATE INDEX IF NOT EXISTS formflow_chunks_scope_idx ON formflow_knowledge_chunks (tenant_id, project_id, collection, embedding_model);
CREATE INDEX IF NOT EXISTS formflow_chunks_source_idx ON formflow_knowledge_chunks (tenant_id, project_id, source_id);
CREATE INDEX IF NOT EXISTS formflow_chunks_metadata_idx ON formflow_knowledge_chunks USING gin (metadata);
