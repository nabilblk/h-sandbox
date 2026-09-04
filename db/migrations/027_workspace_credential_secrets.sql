CREATE TABLE IF NOT EXISTS workspace_credential_secrets (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_preset_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'harakiri_encrypted',
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  fake_env JSONB NOT NULL DEFAULT '{}',
  binding JSONB NOT NULL,
  egress_domains JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_label TEXT,
  rotated_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_type = 'harakiri_encrypted'),
  CHECK (version >= 1),
  CHECK (
    (secret_ciphertext IS NULL AND secret_iv IS NULL AND secret_tag IS NULL)
    OR
    (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL AND secret_tag IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_credential_secrets_active_name_idx
  ON workspace_credential_secrets(organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS workspace_credential_secrets_org_status_idx
  ON workspace_credential_secrets(organization_id, disabled_at, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS workspace_credential_secrets_provider_idx
  ON workspace_credential_secrets(organization_id, provider_preset_id, updated_at DESC);
