CREATE TABLE IF NOT EXISTS sandbox_commands (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_command_id TEXT,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  cwd TEXT,
  env_keys TEXT[] NOT NULL DEFAULT '{}',
  timeout_ms INTEGER,
  detached BOOLEAN NOT NULL DEFAULT false,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'killed'))
);

CREATE INDEX IF NOT EXISTS sandbox_commands_sandbox_idx
  ON sandbox_commands(sandbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sandbox_commands_provider_idx
  ON sandbox_commands(provider, provider_command_id)
  WHERE provider_command_id IS NOT NULL;
