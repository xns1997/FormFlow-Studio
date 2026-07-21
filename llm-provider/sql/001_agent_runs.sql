CREATE TABLE IF NOT EXISTS formflow_llm_agent_runs (
    namespace TEXT NOT NULL,
    run_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace, run_id)
);

CREATE INDEX IF NOT EXISTS formflow_llm_agent_runs_expires_idx
    ON formflow_llm_agent_runs (expires_at);

CREATE INDEX IF NOT EXISTS formflow_llm_agent_runs_scope_idx
    ON formflow_llm_agent_runs (namespace, tenant_id, project_id, updated_at DESC);
