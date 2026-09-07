ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS provider_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sandboxes_active_expiration_idx ON sandboxes(expires_at)
  WHERE status IN ('running', 'idle', 'pending') AND opensandbox_id IS NOT NULL;
