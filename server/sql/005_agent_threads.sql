CREATE TABLE IF NOT EXISTS formflow_agent_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  current_project_id TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS formflow_agent_threads_scope_idx ON formflow_agent_threads (tenant_id, user_id, current_project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS formflow_agent_events (
  thread_id TEXT NOT NULL REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (thread_id, seq)
);

CREATE TABLE IF NOT EXISTS formflow_agent_approvals (
  thread_id TEXT PRIMARY KEY REFERENCES formflow_agent_threads(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS formflow_agent_capability_versions (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (bundle_id, version)
);
CREATE INDEX IF NOT EXISTS formflow_agent_capability_owner_idx ON formflow_agent_capability_versions (owner_id, bundle_id, version DESC);
