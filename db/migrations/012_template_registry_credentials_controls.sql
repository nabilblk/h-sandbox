ALTER TABLE template_registry_credentials
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'pull',
  ADD COLUMN IF NOT EXISTS repository_prefix TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pull_secret_ref TEXT,
  ADD COLUMN IF NOT EXISTS push_secret_ref TEXT,
  ADD COLUMN IF NOT EXISTS secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS secret_iv TEXT,
  ADD COLUMN IF NOT EXISTS secret_tag TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE template_registry_credentials
  ALTER COLUMN secret_ref DROP NOT NULL;

UPDATE template_registry_credentials
SET purpose = 'pull'
WHERE purpose IS NULL OR purpose = '';

CREATE INDEX IF NOT EXISTS template_registry_credentials_org_host_idx
  ON template_registry_credentials(organization_id, registry_host, revoked_at);

CREATE INDEX IF NOT EXISTS template_registry_credentials_org_purpose_idx
  ON template_registry_credentials(organization_id, purpose, revoked_at);
