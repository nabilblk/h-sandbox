ALTER TABLE workspace_credential_secrets
  ADD COLUMN IF NOT EXISTS custom_profile JSONB;

ALTER TABLE external_secret_references
  ADD COLUMN IF NOT EXISTS custom_profile JSONB;
