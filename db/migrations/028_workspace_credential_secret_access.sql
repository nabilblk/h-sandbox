ALTER TABLE workspace_credential_secrets
  ADD COLUMN IF NOT EXISTS member_use_allowed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS workspace_credential_secrets_member_use_idx
  ON workspace_credential_secrets(organization_id, member_use_allowed, updated_at DESC)
  WHERE deleted_at IS NULL;
