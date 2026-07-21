CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_id TEXT,
  phase TEXT NOT NULL,
  payload JSONB NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS formflow_project_agent_v2_scope_idx ON formflow_project_agent_v2_sessions (tenant_id, user_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_plans (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE, id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, payload JSONB NOT NULL, PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_tasks (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE, plan_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, access TEXT NOT NULL, payload JSONB NOT NULL, PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_events (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE, seq BIGINT NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(session_id,seq));
CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_artifacts (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE, id TEXT NOT NULL, task_id TEXT, kind TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(session_id,id));
CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_approvals (session_id TEXT PRIMARY KEY REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE, id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS formflow_project_agent_capability_versions (
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
CREATE INDEX IF NOT EXISTS formflow_project_agent_capability_owner_idx ON formflow_project_agent_capability_versions (owner_id, bundle_id, version DESC);
