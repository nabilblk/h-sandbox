CREATE TABLE IF NOT EXISTS dynamic_credential_issuers (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_preset_id TEXT NOT NULL DEFAULT 'github',
  source_type TEXT NOT NULL DEFAULT 'dynamic',
  issuer_type TEXT NOT NULL,
  scope JSONB NOT NULL,
  member_use_allowed BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  fake_env JSONB NOT NULL DEFAULT '{}',
  binding JSONB NOT NULL,
  egress_domains JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  validation_state TEXT NOT NULL DEFAULT 'unvalidated',
  validation_message TEXT,
  validated_at TIMESTAMPTZ,
  last_issued_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_label TEXT,
  disabled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (provider_preset_id = 'github'),
  CHECK (source_type = 'dynamic'),
  CHECK (issuer_type = 'github_app_installation'),
  CHECK (version >= 1),
  CHECK (validation_state IN ('unvalidated', 'valid', 'not_found', 'forbidden', 'invalid', 'unavailable'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dynamic_credential_issuers_active_name_idx
  ON dynamic_credential_issuers(organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dynamic_credential_issuers_org_status_idx
  ON dynamic_credential_issuers(organization_id, disabled_at, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS dynamic_credential_issuers_member_use_idx
  ON dynamic_credential_issuers(organization_id, member_use_allowed, updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE sandbox_credential_attachments
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sandbox_credential_attachments_expiry_idx
  ON sandbox_credential_attachments(expires_at)
  WHERE source_type = 'dynamic' AND detached_at IS NULL;
