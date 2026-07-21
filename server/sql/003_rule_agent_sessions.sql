CREATE TABLE IF NOT EXISTS formflow_rule_agent_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    title TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS formflow_rule_agent_sessions_scope_idx
    ON formflow_rule_agent_sessions (tenant_id, user_id, project_id, form_id, updated_at DESC);
