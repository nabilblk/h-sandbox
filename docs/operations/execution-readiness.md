# Execution Readiness and Cold-Start Acceptance

September 11, 2026. **Published and deployed in candidate 0.5.0-rc.9; source acceptance below
is separate from the [delivery receipt](../release-notes/0.5.0-rc.9-delivery.md).** No schema migration or provider upgrade is required
by this change. The existing capacity migration requirements remain unchanged.

## Contract

Lifecycle and execution readiness answer different questions. A provider can
report `running` before its execution service accepts connections. Harakiri's
default SDK wait previously returned on that lifecycle observation, causing a
first-write HTTP 502 in the [installation acceptance](execution-capacity-install-acceptance.md).

`GET /v1/sandboxes/{id}/readiness` requires `sandboxes:read`, checks organization
ownership before contacting a runtime, and returns `Cache-Control: no-store`.
The response contains `sandbox` and `readiness: { status, checkedAt }`:

| Status | Meaning |
| --- | --- |
| `ready` | Execution health succeeded and no conflicting runtime transition was observed during the probe |
| `starting` | Provisioning/transition is unfinished, the provider ID is missing, or health did not confirm readiness |
| `unavailable` | The execution service could not be checked, including connection failures or probe timeout |
| `not_running` | Current lifecycle is not an executable state, such as paused, error or terminated |
| `unsupported` | The configured adapter does not implement execution readiness |

This is an observation, not a lease guaranteeing the next request succeeds.
It does not test a user application's route, dependencies or model provider.
Normal get/list/reconnect remain database inventory reads. Health polling does
not renew TTL, mutate lifecycle, create a runtime, or release an execution slot.

## Implementation

- `RuntimeProvider.isReady(ref, signal)` is a read-only execution-service probe.
  Adapters must honor cancellation and must not implement it by executing a
  command. An absent method fails closed as `unsupported`.
- The OpenSandbox adapter resolves the execd endpoint on every probe, preserves
  its access token and gateway routing headers, and issues one `GET /ping`.
  Only HTTP 200 establishes readiness. It does not probe control-plane health.
  This uses the upstream [execd API contract](https://github.com/alibaba/OpenSandbox/blob/main/specs/execd-api.yaml).
- The service bounds endpoint resolution and health together to 2.5 seconds.
  Public results do not include raw upstream errors or credentials. Runtime
  effect versions and the current sandbox identity/state are re-read after a
  probe so a concurrent pause/delete/replacement cannot reuse stale success.
  Network requests occur outside database locks.
- Default HTTP creation uses a 60-second provisioning/readiness wait budget.
  Validation and synchronous credential preparation can take longer. Exhaustion
  returns 202 with the accepted ID, not cancellation or a replacement. Explicit
  `wait:false` skips health waiting; `waitTimeoutMs` selects the wait budget.
- Default SDK creation and waits require execution health. Explicit time-limited
  or async creation returns acceptance so the caller can persist the ID and
  continue with `waitForSandbox`. SDK deadlines cover in-flight reads and sleep;
  caller cancellation stops waiting without stopping execution. Non-executing
  status waits remain lifecycle-only. Git bootstrap cannot skip health merely
  because creation returned `running`.
- CLI creation inherits the SDK behavior and does not show stale queued status
  after a successful wait. Onboarding does not execute its sample on a pending
  response; a subsequent attempt reuses the original idempotency key.

Commands and file writes are not automatically retried by this change. A failed
write may have taken effect. Retrying health is safe; replaying arbitrary work is
not. Capacity continues to be held until independent lifecycle reconciliation
establishes safe release.

## Native Acceptance

Two rounds of three fresh native runtimes passed on the isolated arm64 k0s
fixture. The changed API ran locally against the fixture's PostgreSQL and
OpenSandbox services; its capacity-aware scheduler remained in Kubernetes.
Dev authentication and runtime fallback were disabled. A short-lived scoped key
was issued using the existing key-management service for the fixture owner and
revoked after each round. These were runtime tests, not a repeat of browser OIDC
or an installation of newly published artifacts.

| Mode | First round readiness | Repeatable smoke readiness | Result |
| --- | --- | --- | --- |
| Async (`wait:false`) | 7.048 s | 5.545 s | 202 acceptance, then explicit readiness wait |
| Default synchronous | 5.171 s | 5.142 s | 201 with confirmed execution readiness |
| Short wait (`waitTimeoutMs:1`) | 4.297 s | 4.299 s | 202 retains the accepted ID, then explicit wait |

Every runtime used exactly one create request, one first file write and one first
command, with no warm-up command, fixed post-create sleep or mutation retry.
The command read back the exact file bytes. Each runtime occupied one slot under
limit one; termination restored zero occupied slots. All six test runtimes were
cleaned up. The first round additionally verified absence through the provider's
read-only API. Images were already cached: these results do not measure uncached
image-pull latency or certify another architecture/deployment profile.

Regression coverage also injects `running` before healthy execution, endpoint
errors, in-flight timeout/cancellation, tenant/scope denial, concurrent effects,
unsupported providers, idempotent create replay and failures after a successful
probe. The workspace test suite passes 603 checks, with six opt-in integration
checks skipped in that default run. Separately, the 157 PostgreSQL capacity/fault
tests pass without skipping. Type checking, OpenAPI synchronization and doc-link
checks pass. Browser
authorization/documentation contracts pass (17 tests), including onboarding's
pending guard; documentation was inspected at desktop and mobile widths.

## Repeat the Native Test

Use a dedicated organization with no occupied execution slots, matching source
API/SDK, and an existing digest-pinned template with a writable workdir and `cat`.
The test creates real runtimes. Supply an API key privately with `org:read`,
`templates:read`, `sandboxes:read` and `sandboxes:write`; do not use a customer org.

```bash
pnpm --filter @h-sandbox/sdk build
export HARAKIRI_API_URL="https://your-test-api.example.com"
export HARAKIRI_READINESS_TEMPLATE="your-ready-template"
# HARAKIRI_API_KEY is already set privately.
HARAKIRI_READINESS_ACCEPTANCE=1 \
  node --test tests/conformance/readiness-smoke.mjs
```

The receipt prints the accepted intent key and sandbox ID for recovery. Cleanup
targets only IDs created by the test. If a create response is lost before an ID
is received, inspect/replay that same intent before creating more work. Never
bulk-delete an organization to make the test pass.

## Delivery Boundary

Older SDK/CLI rc.8 still use the old wait semantics. Candidate rc.9 includes
the new contract. API, SDK and CLI must be delivered together;
there is no silent readiness-success fallback against an older API. Harbor
storage verification remains outstanding. Matching candidate publication,
anonymous consumption and upgrades using the actual artifact bundle passed;
the [delivery receipt](../release-notes/0.5.0-rc.9-delivery.md) records the
published SDK/CLI first-task and browser checks, initial failures and cleanup.
The [capacity plan](../exec-plans/active/organization-capacity-admission.md)
remains active for explicit unresolved gates, not unfinished publication.
