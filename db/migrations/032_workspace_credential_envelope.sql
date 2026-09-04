ALTER TABLE workspace_credential_secrets
  ADD COLUMN IF NOT EXISTS encryption_scheme TEXT NOT NULL DEFAULT 'direct-v1',
  ADD COLUMN IF NOT EXISTS key_id TEXT,
  ADD COLUMN IF NOT EXISTS wrapped_dek_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS wrapped_dek_iv TEXT,
  ADD COLUMN IF NOT EXISTS wrapped_dek_tag TEXT;

ALTER TABLE workspace_credential_secrets
  DROP CONSTRAINT IF EXISTS workspace_credential_secrets_envelope_check;

ALTER TABLE workspace_credential_secrets
  ADD CONSTRAINT workspace_credential_secrets_envelope_check CHECK (
    encryption_scheme = 'direct-v1'
    OR (
      encryption_scheme = 'envelope-v1'
      AND (
        (secret_ciphertext IS NULL AND secret_iv IS NULL AND secret_tag IS NULL
          AND key_id IS NULL AND wrapped_dek_ciphertext IS NULL
          AND wrapped_dek_iv IS NULL AND wrapped_dek_tag IS NULL)
        OR
        (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL AND secret_tag IS NOT NULL
          AND key_id IS NOT NULL AND wrapped_dek_ciphertext IS NOT NULL
          AND wrapped_dek_iv IS NOT NULL AND wrapped_dek_tag IS NOT NULL)
      )
    )
  );
