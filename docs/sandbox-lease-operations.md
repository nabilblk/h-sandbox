# Sandbox Lease Coordination

Version: `0.5.0-rc.3`; requires migration 036 and matching API/scheduler binaries.
This fixes expiration at the original schedule despite a successful renewal.

## Ownership and State

Harakiri owns the product TTL and durable scheduling state. OpenSandbox owns
native runtime enforcement. Runtime calls use `RuntimeProvider`, never
Kubernetes exec or a second pod-management implementation.

`sandboxes.expires_at` is the effective product deadline.
`sandboxes.provider_expires_at` is the last confirmed native deadline, internal
to the control plane. Both are needed: OpenSandbox can have a longer minimum
create lease than Harakiri's supported 10-second TTL. An unchanged longer native
deadline is not evidence of renewal and must not extend a short product TTL.

`sandbox_schedules.run_at` remains a scheduling hint. Renewal updates all active
TTL schedules and recreates a missing schedule under the sandbox lock. The
scheduler selects due sandboxes by `expires_at`, not a stale schedule row.

## Coordination and Failures

API renewal, operation-worker retries, command/session activity and terminal
keepalive share `services/sandbox-lease.ts`. Each uses one PostgreSQL connection
and transaction to lock the sandbox row, inspect current state, call the native
provider, and persist the confirmed deadline and schedule. Explicit renewal
also completes its claimed operation in that transaction. Provider get, renew
and delete calls have 10-second transport deadlines; lock acquisition is bounded
to 10 seconds. No transaction surrounds command execution or terminal streaming.
These native lifecycle calls propagate provider errors even if the legacy
`OPEN_SANDBOX_ALLOW_FALLBACK` setting is enabled. Only a real provider 404 can
mean a missing runtime; a 503 must not be treated as absence or renewal success.

Expiration uses the same row lock and rechecks state and deadline after waiting.
Only one scheduler can terminate the runtime and complete pending schedules.
State reconciliation also acquires the lock before reading the provider, so
an older observation cannot overwrite a concurrent renewal. A scheduler process
does not overlap its own ticks. Per-sandbox provider failures are logged and do
not prevent other sandboxes from being reconciled.

A native renewal can succeed just before a database error or process crash.
The next provider observation compares its deadline with the last confirmed
provider deadline. A change is reconciled before expiration can delete anything.
Provider read errors, unknown runtime states and missing native deadlines do not
authorize speculative deletion. Availability can suffer and cleanup can be late,
but the control plane must not claim a failed renewal succeeded.

Pause/resume state updates are conditional. A lifecycle call selected before
expiration cannot restore `running` after another caller has terminated the
sandbox. Paused and transitioning runtimes are not renewed by the TTL service.

## Upgrade and Rollback

1. Stop the old scheduler before applying this correction. An old scheduler
   still ignores the renewed deadline and is not safe alongside the new API.
2. Apply additive migration `036_sandbox_provider_expiration.sql`.
3. Deploy the updated API and scheduler together, then run the verification below.

Existing rows have no confirmed provider baseline. Their first reconciliation
adopts the current native deadline conservatively. A legacy short TTL can
therefore last until the provider deadline during this one-time transition.
New sandboxes retain the requested short TTL. Do not invent a provider baseline
from a local timestamp, because it could hide an interrupted renewal.

No column or data must be dropped to roll back the binary. However, rolling
back restores the original correctness defect. Keep the scheduler stopped while
deciding whether to recover forward; avoid unattended mixed-version operation.
An absent scheduler can delay short-TTL cleanup beyond the product deadline;
native provider expiry remains a separate upper bound. This is not a guarantee
of exactly-on-time termination during outages.

## Verification

Use an isolated, migrated PostgreSQL database for concurrency tests:

```bash
SANDBOX_TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  pnpm --filter @harakiri/api exec tsx --test src/sandbox-lease.test.ts
```

CI runs these alongside persistent-workspace PostgreSQL tests. They cover both
race orders, duplicate schedulers/schedules, idempotency, worker execution,
tenant isolation, inactive states, provider/database failures, native recovery,
conditional pause and the provider minimum-TTL distinction.

Run the live regression with an authorized test key and a running scheduler:

```bash
HARAKIRI_API_URL=https://your-api.example.com \
HARAKIRI_API_KEY="$TEST_API_KEY" \
  pnpm smoke:renew
```

The script builds and uses the repository SDK. Allow about three minutes. It
creates a 60-second sandbox, renews it near its original deadline, waits another
12 seconds beyond that original deadline without command activity, and then
runs a command. It verifies that command activity advances expiry, waits for
final expiration without more activity, and checks a separate 10-second TTL.
It deletes only its own sandboxes in `finally`. Default template: `python-3.12`;
override with `HARAKIRI_RENEW_SMOKE_TEMPLATE` if needed. It does not inspect or
mutate production database records and does not exec into sandbox pods.

The old two-second smoke proved only that a timestamp moved. Passing that test
was not evidence that renewal survived the original scheduler deadline.
