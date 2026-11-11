SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Widen what a newly issued key may request, never the stored/default scopes of
-- an existing key. Sensitive content remains administrator-only.
ALTER TABLE api_keys DROP CONSTRAINT api_keys_scopes_valid;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_scopes_valid CHECK (
  cardinality(scopes) > 0 AND scopes <@ ARRAY[
    'sandboxes:read', 'sandboxes:write', 'templates:read', 'templates:write',
    'workspaces:read', 'workspaces:write', 'credentials:use', 'credentials:manage',
    'registry:manage', 'audit:read', 'org:read', 'runs:read', 'runs:write', 'runs:content'
  ]::TEXT[] AND array_position(scopes, NULL) IS NULL
);

CREATE TABLE observability_policies (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id INTEGER GENERATED ALWAYS AS IDENTITY UNIQUE CHECK (tenant_id BETWEEN 1 AND 999999999),
  enabled BOOLEAN NOT NULL DEFAULT false,
  allow_content BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY CHECK (id ~ '^run_[A-Za-z0-9_-]{1,64}$'),
  organization_id UUID NOT NULL REFERENCES observability_policies(organization_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  capture TEXT NOT NULL CHECK (capture IN ('metadata', 'content')),
  reported_outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (reported_outcome IN ('unknown', 'succeeded', 'failed', 'cancelled')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  closed_at TIMESTAMPTZ,
  retained_until TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  last_accepted_at TIMESTAMPTZ,
  last_rejected_at TIMESTAMPTZ,
  last_rejection TEXT CHECK (last_rejection IN ('rate_limited', 'collector_unavailable', 'collector_rejected')),
  UNIQUE (organization_id, id),
  CHECK (closed_at IS NOT NULL OR reported_outcome = 'unknown'),
  CHECK (closed_at IS NULL OR closed_at >= created_at),
  CHECK (retained_until > created_at)
);
CREATE INDEX agent_runs_org_time ON agent_runs(organization_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX agent_runs_retention ON agent_runs(retained_until);

CREATE TABLE agent_run_sandboxes (
  organization_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  sandbox_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, run_id, sandbox_id),
  FOREIGN KEY (organization_id, run_id) REFERENCES agent_runs(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, sandbox_id) REFERENCES sandboxes(organization_id, id)
);
CREATE INDEX agent_run_sandboxes_lookup ON agent_run_sandboxes(organization_id, sandbox_id, run_id);

CREATE TABLE telemetry_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  sandbox_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (organization_id, run_id, sandbox_id)
    REFERENCES agent_run_sandboxes(organization_id, run_id, sandbox_id) ON DELETE CASCADE,
  CHECK ((user_id IS NOT NULL)::integer + (api_key_id IS NOT NULL)::integer = 1),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX telemetry_grants_run ON telemetry_grants(organization_id, run_id) WHERE revoked_at IS NULL;
CREATE INDEX telemetry_grants_expiry ON telemetry_grants(expires_at);

-- One row per organization: ingestion accounting cannot grow with workload IDs.
CREATE TABLE telemetry_ingestion_budgets (
  organization_id UUID PRIMARY KEY REFERENCES observability_policies(organization_id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  bytes BIGINT NOT NULL CHECK (bytes >= 0)
);

COMMENT ON TABLE agent_runs IS 'Run ownership and diagnostic watermarks only; no raw telemetry or credential material.';
COMMENT ON COLUMN agent_runs.last_accepted_at IS 'Collector acknowledgement, not evidence of durable storage, query visibility or complete capture.';
COMMENT ON COLUMN agent_runs.retained_until IS 'API visibility deadline. Physical backend and backup reclamation have separate operator policies.';
