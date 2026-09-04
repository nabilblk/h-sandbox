CREATE TABLE IF NOT EXISTS external_secret_references (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_preset_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'external_ref',
  resolver_type TEXT NOT NULL,
  reference JSONB NOT NULL,
  member_use_allowed BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  fake_env JSONB NOT NULL DEFAULT '{}',
  binding JSONB NOT NULL,
  egress_domains JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  validation_state TEXT NOT NULL DEFAULT 'unvalidated',
  validation_message TEXT,
  resolved_version_ref TEXT,
  validated_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_label TEXT,
  disabled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_type = 'external_ref'),
  CHECK (resolver_type = 'kubernetes_secret'),
  CHECK (version >= 1),
  CHECK (validation_state IN ('unvalidated', 'valid', 'not_found', 'forbidden', 'invalid', 'unavailable'))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_secret_references_active_name_idx
  ON external_secret_references(organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS external_secret_references_org_status_idx
  ON external_secret_references(organization_id, disabled_at, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS external_secret_references_member_use_idx
  ON external_secret_references(organization_id, member_use_allowed, updated_at DESC)
  WHERE deleted_at IS NULL;
