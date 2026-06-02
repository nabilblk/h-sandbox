CREATE TABLE IF NOT EXISTS terminal_attach_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terminal_attach_tickets_sandbox_idx
  ON terminal_attach_tickets(sandbox_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS terminal_attach_tickets_expiry_idx
  ON terminal_attach_tickets(expires_at)
  WHERE used_at IS NULL;
