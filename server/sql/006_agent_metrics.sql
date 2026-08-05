CREATE TABLE IF NOT EXISTS formflow_agent_turn_metrics (
    thread_id TEXT NOT NULL REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, turn_id)
);

CREATE INDEX IF NOT EXISTS formflow_agent_turn_metrics_created_idx
    ON formflow_agent_turn_metrics (created_at DESC);

CREATE TABLE IF NOT EXISTS formflow_agent_artifacts (
    thread_id TEXT NOT NULL REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
    artifact_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, artifact_id)
);
