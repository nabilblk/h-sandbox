ALTER TABLE sandbox_credential_attachments
  ADD COLUMN IF NOT EXISTS provider_state TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_checked_at TIMESTAMPTZ;

ALTER TABLE sandbox_credential_attachments
  DROP CONSTRAINT IF EXISTS sandbox_credential_attachments_provider_state_check;

ALTER TABLE sandbox_credential_attachments
  ADD CONSTRAINT sandbox_credential_attachments_provider_state_check
  CHECK (provider_state IN ('unknown', 'present', 'missing', 'unavailable'));

CREATE INDEX IF NOT EXISTS sandbox_credential_attachments_provider_check_idx
  ON sandbox_credential_attachments(provider_checked_at, sandbox_id)
  WHERE detached_at IS NULL;
