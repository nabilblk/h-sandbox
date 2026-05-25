CREATE TABLE IF NOT EXISTS sandbox_operations (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sandbox_id TEXT REFERENCES sandboxes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT,
  request JSONB NOT NULL DEFAULT '{}',
  result JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind IN ('provision', 'delete', 'renew', 'route_expose')),
  CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_operations_idempotency_idx
  ON sandbox_operations(organization_id, kind, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sandbox_operations_state_idx
  ON sandbox_operations(state, created_at);

CREATE INDEX IF NOT EXISTS sandbox_operations_sandbox_idx
  ON sandbox_operations(sandbox_id, created_at DESC);
