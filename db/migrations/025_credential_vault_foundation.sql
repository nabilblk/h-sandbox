CREATE TABLE IF NOT EXISTS sandbox_credential_attachments (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  credential_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  binding_name TEXT NOT NULL,
  match JSONB NOT NULL,
  auth JSONB NOT NULL,
  fake_env JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  provider_revision INTEGER,
  provider_metadata JSONB NOT NULL DEFAULT '{}',
  last_error TEXT,
  injected_at TIMESTAMPTZ,
  detached_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_type IN ('inline_ephemeral', 'harakiri_encrypted', 'external_ref', 'dynamic')),
  CHECK (status IN ('pending', 'injected', 'requires_reinjection', 'detached', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_credential_attachments_active_binding_idx
  ON sandbox_credential_attachments(sandbox_id, binding_name)
  WHERE detached_at IS NULL;

CREATE INDEX IF NOT EXISTS sandbox_credential_attachments_org_sandbox_idx
  ON sandbox_credential_attachments(organization_id, sandbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sandbox_credential_attachments_status_idx
  ON sandbox_credential_attachments(organization_id, status, updated_at DESC);
