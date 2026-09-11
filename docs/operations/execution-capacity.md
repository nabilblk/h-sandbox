# Execution Capacity Operations

Status: included in 0.5.0-rc.9, migration 038. Older 0.5.0-rc.8 does not
implement this protocol. Do not deploy mixed old/new API and scheduler writers.
The [public concept](https://sb.harakiri.io/#docs/execution-capacity) describes
developer behavior once the matching documentation is deployed.

The September 11 public lab deployment now runs the source-commit capacity build;
see its [delivery receipt](../release-notes/2026-09-11-capacity-delivery.md) for
immutable images, maintenance activation and live acceptance. This does not
republish the rc.8 SDK/CLI or certify every deployment profile.

## Before Installing

An execution slot represents one potentially executing sandbox, not CPU, memory,
PVCs, cost or process count. Pick an organization limit that fits your evaluation;
the compatibility default of 200 does not size a Kubernetes cluster. Use native
resource quotas and node capacity controls independently.

Fresh organizations start enforced. Every organization present when migration
038 runs starts reconciling, including empty ones. The migration backfills all
sandbox records as uncertain, even locally terminated ones. No native API call
runs inside a database migration.

## Upgrade And Activate

1. Schedule a mutation maintenance window. Block new create, resume, pause,
   stop and activity/renew requests at the edge. Drain callers and account for
   requests already sent to the provider. An accepted timeout may still finish.
2. Stop **every** old API and scheduler/worker replica, including jobs and local
   contributors pointing at this database. Scaling only the public API is not
   sufficient. Do not perform an ordinary mixed-version rolling upgrade.
3. Back up PostgreSQL and retained volumes together. Record image/chart digests,
   organization IDs, runtime identities and unresolved native operations. Keep
   encryption key material in the operator secret system, not this report.
4. Apply migrations with the matching build and keep mutation access closed.
   Run the matching inventory command with the same database, provider and
   control-plane key configuration as the API. It uses the provider interface,
   not pod execution or direct runtime edits.

```bash
# Run inside the matching API image or built apps/api directory.
# Supply DATABASE_URL and runtime settings through your operator secret system.
node dist/capacity-inventory.js --organization "$ORG_ID"

# Only after verifying old writers have stopped:
node dist/capacity-inventory.js --organization "$ORG_ID" \
  --apply --writers-stopped
```

5. Inspect the JSON result. Dry-run is the default and does not change inventory.
   `enforced` means recognized records were checked; `reconciling` means some
   evidence is unresolved; `quarantined` means duplicate/untracked execution was
   detected. Missing provider list matches are **not** proof of absence.
6. If an old record has no runtime identity, obtain a complete authoritative
   provider/operator inventory and confirm no old request can still create it.
   Keep that evidence in the incident record. The CLI accepts a JSON map from
   sandbox ID to a substantive evidence reference for these cases only:

```json
{
  "sbx_legacy": "Incident CAP-123: complete provider inventory checked; all old writers and outstanding creates drained."
}
```

```bash
node dist/capacity-inventory.js --organization "$ORG_ID" \
  --apply --writers-stopped --absence-evidence ./verified-absence.json
```

The flag is an operator attestation, not an automated discovery guarantee. Never
manufacture evidence to make activation pass. A normal provider list can be
paginated or incomplete. The command reports positive untracked runtimes but
cannot certify that a partial listing found every orphan. Inventory every
provider page independently before activation and after restoring backups.

7. Start only matching writers, verify `GET /v1/org/capacity`, then reopen traffic.
   Exercise create, async create, stop and same-key retries in a dedicated test
   organization. Do not kill users' sandboxes to obtain test capacity.

Existing over-limit execution is grandfathered. Reduce use through normal stop
operations or raise the configured limit through a human admin session. Changing
unrelated settings must not rewrite the limit. A limit update requires the latest
`capacityRevision` as `expectedCapacityRevision`.

## Uncertain Capacity

The scheduler claims bounded due batches across held phases, including records
locally labeled error or terminated. It adopts an interrupted provision only on
exact organization, sandbox, operation, effect and generation metadata. Multiple
matches quarantine admission. Delete acknowledgement, lease timeout and an empty
list never release a reservation. A trusted GET observation of absence releases
only when no earlier producer remains unsettled. Pause releases only under the
provider's confirmed non-execution contract.

Inspect `sandbox_runtime_effects` together with `sandbox_capacity_reservations`
and the accepted operation. Use read-only queries scoped to the affected org:

```sql
SELECT sandbox_id, generation, phase, reason, checked_at, next_check_at
FROM sandbox_capacity_reservations
WHERE organization_id = :'org_id' AND released_at IS NULL
ORDER BY next_check_at, sandbox_id;

SELECT sandbox_id, kind, generation, operation_id, provider_id,
       dispatched_at, acknowledged_at, uncertain_at
FROM sandbox_runtime_effects
WHERE organization_id = :'org_id' AND settled_at IS NULL;
```

Escalate sustained uncertain holds, overdue `next_check_at`, reconciler failures,
quarantined organizations and an unavailable scheduler. Do not clear tables,
change local status, delete operation evidence or force-detach workspaces. There
is no public force-release API. Resolve an ambiguous native operation with the
runtime operator before any repair. A permanently unknown outcome deliberately
requires human review instead of a timed automatic slot release.

## Backup Recovery And Rollback

Keep mutations closed and old writers stopped after restoring a backup. A runtime
can survive a database restore, including one missing from the restored database.
Repeat complete provider inventory, then run:

```bash
node dist/capacity-inventory.js --organization "$ORG_ID" \
  --recovery --apply --writers-stopped
```

Recovery can recreate a held generation for a known surviving runtime whose old
reservation was released. Untracked runtimes quarantine the org and must be
resolved explicitly with the runtime operator. Unsettled effects remain closed;
the command does not cancel network requests or blindly replay credentials.

Compatible rollback means a build which still honors migration 038 and its
effect protocol. Do not start pre-capacity binaries against the migrated system
and claim enforcement. A pre-feature rollback requires another maintenance
window and a reconciled database/runtime recovery procedure. Keep additive
tables and audit evidence; there is no destructive down migration here.

The [isolated installation and rollback receipt](execution-capacity-install-acceptance.md)
records this rehearsal with a surviving native runtime, one occupied slot and
retained workspace data. Its local-only acceptance image is not a published
candidate; it also records the separate cold-start readiness finding.

Create intent digests use domain-separated HMAC for secret-bearing inputs.
Inline credentials are never persisted as replay input. Rotating the
control-plane key may make old sensitive intent comparisons unverifiable; inspect
the accepted operation and report a conflict, not a blind replacement create.

## Implementation And Verification

- `services/organization-capacity.ts`: organization lock and ledger counts.
- `services/sandbox-runtime-effects.ts`: durable dispatch ownership and fencing.
- `services/sandbox-provision.ts`: common synchronous/worker executor.
- `services/sandbox-capacity-reconciler.ts`: bounded provider-evidence recovery.
- `services/capacity-inventory.ts`: maintenance activation and audited recovery.

Paths above are relative to `apps/api/src`. Lock order is organization,
sandbox, operation/effect and reservation. Workspace triggers remain inside the
admission transaction. Counts run in a statement after the organization row
lock at READ COMMITTED. Provider I/O never holds that organization lock.

```bash
CAPACITY_TEST_REQUIRED=1 \
SANDBOX_TEST_DATABASE_URL=postgres://test-user@127.0.0.1:5432/test-db \
pnpm --filter @harakiri/api exec node --test --test-concurrency=1 --import tsx \
  src/organization-capacity.test.ts src/capacity-faults.test.ts
```

Use a disposable PostgreSQL database. Tests use isolated schemas and real
competing connections, not mocked SQL for the admission proof. CI requires this
suite and fails if its database is absent. The ordinary unit test command skips
database suites without a test URL and the native test unless explicitly opted
in. Suite files run sequentially because their isolated-schema migrations share
PostgreSQL's extension catalog; contention scenarios still use independent,
concurrent database connections inside each suite.

The [fault-injection receipt](execution-capacity-fault-acceptance.md) covers
write/commit failures, credential cleanup and real caller disconnects. A lost
delete-dispatch acknowledgement deliberately remains held until runtime absence
is confirmed; these tests do not promise automatic retry of every unknown effect.

For native acceptance, install `pg_dump` and `pg_restore` matching the test
PostgreSQL major version. Supply the provider API credential privately. Use a
provider with spare resources; the test creates up to two 1-core/128-MB workloads
at a time and cleans only IDs it owns. It never changes the installed API.

```bash
# SANDBOX_TEST_DATABASE_URL must name a disposable database, not your platform DB.
export DATABASE_URL="$SANDBOX_TEST_DATABASE_URL"
export OPEN_SANDBOX_BASE_URL=http://127.0.0.1:18088
export OPEN_SANDBOX_GATEWAY_URL=http://127.0.0.1:18089
export OPEN_SANDBOX_ALLOW_FALLBACK=0
# This capacity-only test does not enable the network/Vault sidecar.
export OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0
# OPEN_SANDBOX_API_KEY must already be supplied from your secret system.
CAPACITY_NATIVE_REQUIRED=1 pnpm --filter @harakiri/api exec tsx --test src/capacity-native.test.ts
```

The native test provisions only a random test organization in an isolated schema.
Its HTTP subtest runs the actual [SDK tutorial](../../examples/sdk-execution-capacity/README.md)
with a scoped API key. Its recovery subtest uses `pg_dump`/`pg_restore` against that
schema while an owned runtime survives. It must retain a diagnostic schema if
native cleanup cannot be confirmed. Do not delete that evidence to hide a failed
run.

See the [local acceptance receipt](execution-capacity-acceptance.md) for the
observed environment and limits, and the active
[execution plan](../exec-plans/active/organization-capacity-admission.md) for
remaining delivery gates. Simulated-provider results are not native OpenSandbox
pause, snapshot, Vault, OpenShift or isolation certification.
