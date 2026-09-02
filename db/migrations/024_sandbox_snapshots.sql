ALTER TABLE sandbox_operations
  DROP CONSTRAINT IF EXISTS sandbox_operations_kind_check;

ALTER TABLE sandbox_operations
  ADD CONSTRAINT sandbox_operations_kind_check
  CHECK (kind IN ('provision', 'delete', 'renew', 'pause', 'resume', 'snapshot', 'snapshot_delete', 'route_expose'));

CREATE TABLE IF NOT EXISTS sandbox_snapshots (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_sandbox_id TEXT REFERENCES sandboxes(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_snapshot_id TEXT,
  name TEXT,
  status TEXT NOT NULL,
  status_reason TEXT,
  status_message TEXT,
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  template_version_id TEXT,
  template_image_digest TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  provider_state JSONB NOT NULL DEFAULT '{}',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_label TEXT,
  idempotency_key TEXT,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('creating', 'ready', 'failed', 'deleting', 'deleted', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_snapshots_idempotency_idx
  ON sandbox_snapshots(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_snapshots_provider_id_idx
  ON sandbox_snapshots(provider, provider_snapshot_id)
  WHERE provider_snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sandbox_snapshots_org_status_idx
  ON sandbox_snapshots(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sandbox_snapshots_source_sandbox_idx
  ON sandbox_snapshots(source_sandbox_id, created_at DESC);
