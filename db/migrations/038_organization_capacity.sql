ALTER TABLE organizations
  ADD COLUMN capacity_state TEXT NOT NULL DEFAULT 'reconciling'
    CHECK (capacity_state IN ('enforced', 'reconciling', 'quarantined')),
  ADD COLUMN capacity_revision INTEGER NOT NULL DEFAULT 1 CHECK (capacity_revision > 0),
  ADD CONSTRAINT organizations_capacity_limit CHECK (max_concurrency BETWEEN 1 AND 10000) NOT VALID;

-- Every pre-upgrade organization stays closed until old writers have been stopped.
-- Even an empty organization could otherwise be written by an older API process.
ALTER TABLE organizations ALTER COLUMN capacity_state SET DEFAULT 'enforced';

ALTER TABLE sandboxes ADD CONSTRAINT sandboxes_organization_id_unique UNIQUE (organization_id, id);
ALTER TABLE sandbox_operations ADD CONSTRAINT sandbox_operations_identity_unique UNIQUE (organization_id, sandbox_id, id);

CREATE TABLE sandbox_capacity_reservations (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  sandbox_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0),
  operation_id TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('reserved', 'active', 'releasing', 'uncertain', 'released')),
  reason TEXT,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, generation),
  FOREIGN KEY (organization_id, sandbox_id) REFERENCES sandboxes(organization_id, id),
  FOREIGN KEY (organization_id, sandbox_id, operation_id) REFERENCES sandbox_operations(organization_id, sandbox_id, id),
  CHECK ((phase = 'released') = (released_at IS NOT NULL))
);
CREATE UNIQUE INDEX sandbox_capacity_one_hold ON sandbox_capacity_reservations (sandbox_id) WHERE released_at IS NULL;
CREATE INDEX sandbox_capacity_org_held ON sandbox_capacity_reservations (organization_id, phase) WHERE released_at IS NULL;
CREATE INDEX sandbox_capacity_due ON sandbox_capacity_reservations (next_check_at, sandbox_id) WHERE released_at IS NULL;

-- Historical status is not evidence that a dispatched runtime has disappeared.
INSERT INTO sandbox_capacity_reservations (organization_id, sandbox_id, generation, phase, reason)
  SELECT organization_id, id, 1, 'uncertain', 'legacy_inventory' FROM sandboxes;

CREATE TABLE sandbox_runtime_effects (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  sandbox_id TEXT NOT NULL,
  operation_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('prepare', 'provision', 'pause', 'resume', 'delete', 'renew')),
  generation INTEGER NOT NULL,
  provider_id TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  dispatched_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  uncertain_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, sandbox_id) REFERENCES sandboxes(organization_id, id),
  FOREIGN KEY (sandbox_id, generation) REFERENCES sandbox_capacity_reservations(sandbox_id, generation),
  FOREIGN KEY (organization_id, sandbox_id, operation_id) REFERENCES sandbox_operations(organization_id, sandbox_id, id)
);
CREATE UNIQUE INDEX sandbox_runtime_one_effect ON sandbox_runtime_effects(sandbox_id) WHERE settled_at IS NULL;
CREATE INDEX sandbox_runtime_effect_operation ON sandbox_runtime_effects(operation_id);
