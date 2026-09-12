SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE usage_collection_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  available_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_observed_at TIMESTAMPTZ
);
INSERT INTO usage_collection_state(singleton) VALUES (true);

CREATE TABLE usage_observer_windows (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  observed_through TIMESTAMPTZ NOT NULL,
  CHECK (observed_through >= started_at)
);
CREATE INDEX usage_observer_windows_time ON usage_observer_windows(observed_through);

CREATE TABLE usage_readiness_observations (
  operation_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  sandbox_id TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'censored', 'unsupported')),
  first_ready_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_probe_status TEXT,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  claim_token UUID,
  claim_until TIMESTAMPTZ,
  FOREIGN KEY (organization_id, sandbox_id, operation_id)
    REFERENCES sandbox_operations(organization_id, sandbox_id, id) ON DELETE CASCADE,
  CHECK ((state = 'ready') = (first_ready_at IS NOT NULL)),
  CHECK (first_ready_at IS NULL OR first_ready_at >= accepted_at)
);
CREATE INDEX usage_readiness_due ON usage_readiness_observations(next_check_at, operation_id) WHERE state = 'pending';
CREATE INDEX usage_readiness_org_time ON usage_readiness_observations(organization_id, accepted_at);
CREATE INDEX usage_readiness_retention ON usage_readiness_observations(accepted_at);

-- Read indexes only: admission and release semantics are unchanged. The bounded
-- migration fails instead of waiting indefinitely behind existing writers.
CREATE INDEX sandbox_capacity_history ON sandbox_capacity_reservations(organization_id, created_at);
CREATE INDEX sandbox_operations_usage ON sandbox_operations(organization_id, created_at)
  WHERE kind IN ('provision', 'resume');
CREATE INDEX sandbox_operations_usage_completed ON sandbox_operations(organization_id, completed_at)
  WHERE kind IN ('provision', 'resume');
CREATE INDEX sandbox_operations_usage_discovery ON sandbox_operations(created_at, id)
  WHERE kind IN ('provision', 'resume');
