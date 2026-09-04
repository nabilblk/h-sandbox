ALTER TABLE sandbox_credential_attachments
  ADD COLUMN IF NOT EXISTS refresh_attempted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sandbox_credential_attachments_reconcile_idx
  ON sandbox_credential_attachments(status, refresh_attempted_at, expires_at)
  WHERE detached_at IS NULL
    AND source_type IN ('harakiri_encrypted', 'external_ref', 'dynamic');
