CREATE TABLE IF NOT EXISTS llm_tool_confirmations (
  token TEXT PRIMARY KEY,
  operation_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  project_id TEXT,
  tool_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_llm_tool_confirmations_expiry
  ON llm_tool_confirmations(expires_at)
  WHERE used_at IS NULL;
