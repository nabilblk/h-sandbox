# Usage Observations: Implementation Contract

Published in Developer Preview `0.5.0-rc.10`, September 12, 2026. See the
[delivery record](../release-notes/0.5.0-rc.10-delivery.md) for artifact identities,
native evidence and the separate public-lab deployment.

## Sources and Boundaries

Historical slot occupancy uses `sandbox_capacity_reservations` intervals, not
sandbox status, resource allocations or provider CPU measurements. All creation
paths, including snapshot restore and asynchronous provisioning, admit a
`provision` operation. Restore is distinguished by the existing
`request.restoreSnapshotId` presence; only that boolean is selected for usage.
Resume has its own operation. A no-op lifecycle request returns an existing or
in-memory operation and does not count as another admission.

Retained-slot resume updates the reservation's operation ID. Its interval remains
one continuous hold but each actual execution cycle needs a distinct readiness
observation. Pause releases only when the provider's suspension guarantee allows
it. Delete/expiry release only through existing confirmed-cleanup rules.

Operational service paths retain terminated sandbox, operation and reservation
records. Migration 038 foreign keys prevent casual deletion of their source
history. Usage retention does not prune these operational ledgers. Do not add a
hard-delete path without maintaining the advertised observation boundary.

## Chosen Bounds

| Source writer | Historical fact used; invariant retained |
| --- | --- |
| [`createSandbox`](../../apps/api/src/services/sandboxes.ts) | Provision operation and initial reservation commit atomically; sync, async and restore share the admitted identity. Failed preparation only releases through the existing before-dispatch fence. |
| [`sandbox-lifecycle`](../../apps/api/src/services/sandbox-lifecycle.ts) | Retained-slot resume changes its operation reference; released-slot resume reserves a new generation. Pause/kill use recorded runtime effects and qualified release. |
| [`sandbox-operation-worker`](../../apps/api/src/services/sandbox-operation-worker.ts) | Attempts keep the operation ID. Queuing, execution and confirmed/uncertain effects remain owned by the worker, not the observer. |
| [`sandbox-lease`](../../apps/api/src/services/sandbox-lease.ts) | Expiry/provider reconciliation releases only on qualified absence/suspension. A terminal-looking record is not enough. |
| [`sandbox-capacity-reconciler`](../../apps/api/src/services/sandbox-capacity-reconciler.ts) | Canceled-before-dispatch and settled cleanup use the same recorded hold/release facts. Unsettled effects retain occupancy. |
| [`sandbox-operations`](../../apps/api/src/services/sandbox-operations.ts) | Acceptance identity is durable; latest terminal state/time can change when an operation is explicitly retried. Outcome counts are not an immutable attempt log. |

```text
Admission / lifecycle / reconciliation
  -> existing operations + reservation intervals (authoritative facts)
Independent observer -> fenced readiness observations + continuity windows
  -> read-only organization history -> API -> SDK / CLI / Usage view
Process metrics -> separate private listener -> operator-owned monitoring
```

History never writes back into the operational facts. Outcome counts use the
latest recorded terminal state and completion time at query time; retrying a
failed operation can revise an earlier outcome count without creating another
admission. An append-only attempt/event history would require additional durable
transitions and is deliberately not claimed by this increment.

- An independent, non-overlapping worker loop runs every 10 seconds. It discovers
  at most 200 missing operation observations and claims at most eight probes per
  tick, with at most two network probes in flight. A probe uses the existing
  2.5-second readiness timeout; a work lease lasts 30 seconds.
- A cycle is observed for at most 10 minutes from acceptance. Ready timestamps
  are first successful observations, not actual provider start times. Queue delay
  and sampling delay are included; unsupported or lost observations are explicit.
- History uses a repeatable-read, read-only transaction, a two-second statement
  timeout, UTC half-open windows, at most 30 days and 1,500 buckets. Each source
  read is capped at 100,000 rows; exceeding that bound returns a typed error.
- Retention defaults to 30 days and is configurable from 1 to 30 days. Observation
  cleanup is bounded. Source holds remain intact, including pre-window carry-in.
- Collector continuity is recorded as windows, not one permanent row per poll or
  per running sandbox. A gap longer than 30 seconds opens a new window. Historical
  gaps are preserved across process restart, disabled collection and restore.

The qualification fixture is 50,000 accepted operations over 30 days with 200
held slots. The provisional target is p95 history latency below one second,
without more than a 15% increase in median admission latency over three matched
baseline/observer trials on the same disposable PostgreSQL runner. These are
acceptance budgets, not public latency guarantees. Hosted PostgreSQL run
[34705192495](https://github.com/nabilblk/h-sandbox/actions/runs/34705192495)
passed all 14 scenarios: ten history queries measured p95 **337 ms**, and the
matched observer trials passed both admission and cleanup budgets. Final release
CI [34708352422](https://github.com/nabilblk/h-sandbox/actions/runs/34708352422)
also passed the required PostgreSQL gate.

The PostgreSQL fixture is pinned to GitHub-hosted Ubuntu 24.04 and PostgreSQL
16.15. It uses a separate observer pool, three alternating baseline/observer
pairs of 75 admission-and-confirmed-release cycles at 150 ms pacing, five warmup
cycles discarded, and compares the median of each pair's measured medians. Both
admission and confirmed cleanup have a 15% regression budget. Ten measured
history queries follow two warmups with 50,000 readiness rows as well as
operation rows. Relation sizes including indexes are emitted as numeric evidence.
Measured relation sizes including indexes were 18,513,920 bytes for readiness
observations, 47,800,320 for the operational records and 434,176 for holds.
Those controlled-fixture sizes are not production storage or WAL guarantees.

At that reference scale, readiness storage adds about 1,667 rows/day before
30-day retention. Production index/WAL overhead and workload distribution still
need operator measurements; no storage-size guarantee is inferred from the schema. In continuous service,
coverage uses one extendable interval rather than 8,640 new rows per day. Discovery
and pruning use fixed, database-clock cutoffs per pass so timestamp indexes remain
usable. No timestamp-only discovery cursor can skip an earlier, late-committing
operation. Continuous sampling of already-ready runtimes is not performed.

Claims last 30 seconds and results require the same unexpired token. A pass gets
12 seconds of network budget, at most two concurrent probes, and no connection
spans a probe. Pending rows are terminalized after the ten-minute observation
window. Backlogs expose pending count/age; they do not authorize more capacity.

## Compatibility and Failure Handling

Migration 039 is additive. Capacity-aware rc.9 writers retained migration 038's
contract in the published rc.9/rc.10 compatibility test. Schema 039 stayed
installed throughout rollback and re-upgrade; no down-migration was tested.
Never run rc.8 writers against these schemas. Migration
index locks are bounded to three seconds, statements to 30 seconds; migration
failure rolls the transaction back. There is no generic down-migration promise.

Readiness GET remains read-only. Observation failures cannot fail an accepted
create, release capacity, renew a lease or replay a command. Network calls happen
outside transactions. Claims and results are fenced by execution operation,
reservation generation, provider identity and runtime-effect version.

Coverage begins at the new collection epoch and retention cutoff. There is no
historical backfill from today's state. Incomplete buckets are marked, gaps are
null, and sums cover only qualified intervals. Counts of outcomes use their
terminal time, not the admission cohort's denominator. Readiness percentiles use
observed members of the admission cohort and expose missing/unsupported counts.

The legacy `/v1/usage` response stays unchanged. The new `/v1/usage/history`
requires `org:read` and never accepts a client-selected organization as its
authorization boundary. CPU consumption and billable compute remain unavailable.

## Rollout Status

| Binary / schema / client combination | Contract and evidence |
| --- | --- |
| Published rc.9 / schema 038 / rc.9 clients | Previously qualified reference install; history absent. See the existing rc.9 receipts. |
| Source candidate / schema 039 / source-packed clients | All 11 gates passed in native run 34707522766, including private metrics and real first-task output. Not published-artifact evidence. |
| rc.9 binaries / schema 039 retained | Passed in the source-native rehearsal. History absent and observer stopped; existing capacity, keys and files retained. Never remove schema 038. |
| Source candidate re-upgraded / schema 039 | Historical fingerprint preserved and old-binary interval exposed as a collection gap in that rehearsal. |
| Published rc.10 / published clients | Installation, first task, CLI/SDK work, real history, encrypted recovery and provider-loss gates passed in run 34708761898. Its final compatibility check failed; that run is not full qualification. |
| Published rc.9 -> rc.10 -> rc.9 -> rc.10 / schema 039 retained | All 11 gates and cleanup passed in run 34709727741. Older SDK/new API, keys, capacity, files and history preserved; old-binary interval remains a gap. Qualified only on the named single-node amd64/local-path fixture. |

Source-native evidence is [run 34707522766](https://github.com/nabilblk/h-sandbox/actions/runs/34707522766).
Published-pair evidence is [retained separately](evidence/standalone-34709727741.json).
The compatibility harness imports the older SDK without initializing a second
Playwright runtime; the rerun qualified the unchanged published bundle. Never use
a populated lab as the destructive fixture. See
[release operations](../ci-release.md#usage-candidate-qualification).
