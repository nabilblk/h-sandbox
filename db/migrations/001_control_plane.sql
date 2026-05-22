CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_subject TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_template_id TEXT NOT NULL DEFAULT 'python-3.12',
  idle_ttl_seconds INTEGER NOT NULL DEFAULT 300,
  max_concurrency INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT NOT NULL,
  icon TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  boot_ms INTEGER NOT NULL DEFAULT 150,
  visibility TEXT NOT NULL DEFAULT 'public',
  default_entrypoint TEXT[] NOT NULL DEFAULT ARRAY['sleep', '3600'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last_four TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id);

CREATE TABLE IF NOT EXISTS sandboxes (
  id TEXT PRIMARY KEY,
  opensandbox_id TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  cpu_pct INTEGER NOT NULL DEFAULT 0,
  memory_mb INTEGER NOT NULL DEFAULT 0,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_label TEXT NOT NULL,
  cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
  ttl_seconds INTEGER NOT NULL DEFAULT 300,
  started_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  public_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandboxes_org_idx ON sandboxes(organization_id);
CREATE INDEX IF NOT EXISTS sandboxes_status_idx ON sandboxes(status);
CREATE INDEX IF NOT EXISTS sandboxes_expires_idx ON sandboxes(expires_at);

CREATE TABLE IF NOT EXISTS sandbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandbox_events_sandbox_idx ON sandbox_events(sandbox_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sandbox_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  port INTEGER NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'http',
  host TEXT NOT NULL,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sandbox_id, port)
);

CREATE TABLE IF NOT EXISTS sandbox_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandbox_schedules_due_idx ON sandbox_schedules(run_at, completed_at);

CREATE TABLE IF NOT EXISTS sandbox_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id TEXT REFERENCES sandboxes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cpu_pct INTEGER NOT NULL DEFAULT 0,
  memory_mb INTEGER NOT NULL DEFAULT 0,
  disk_io_kbps INTEGER NOT NULL DEFAULT 0,
  network_out_kbps INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandbox_metrics_org_time_idx ON sandbox_metrics(organization_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS egress_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES templates(id) ON DELETE CASCADE,
  host_pattern TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'allow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_org_time_idx ON audit_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
