# Execution Capacity: Persistence and Disconnect Acceptance

September 11, 2026. Source acceptance supplement to the
[public lab deployment](../release-notes/2026-09-11-capacity-delivery.md), not
a new package release, native Vault certification or production rollback receipt.

## Evidence

The existing PostgreSQL admission suite and the new persistence-fault suite
passed **157 tests, zero failures and zero skips**, using a disposable local
PostgreSQL database. The new suite includes 121 write/commit checkpoints,
two actual HTTP-disconnect cases and its parent test (124 checks). The existing
suite contributes 33 checks, including simultaneous requests from independent
database connections.

| Path | Write/Commit Checkpoints |
| --- | ---: |
| Plain create | 21 |
| Create with encrypted replay input, workspace reservation and credentials | 27 |
| Lost provider create reply | 17 |
| Failed credential injection and cleanup | 40 |
| Explicit deletion | 16 |

The harness records the SQL writes and transaction commits of each successful
or intentionally failed baseline, then repeats the path with a failure after
each checkpoint. This includes successful COMMIT with a lost acknowledgement.
New writes in those paths automatically extend the matrix. It asserts database
state and provider call counts, not just HTTP codes or mocked query responses.

- Execution never exceeds its organization's held reservations or limit.
- Replaying a persisted intent does not dispatch another runtime.
- Admission rollback leaves no sandbox, operation, effect or reservation; the
  workspace trigger rolls back with it.
- Sensitive request values are absent from operation request/result/error data.
- Recovery observes the exact runtime and does not release from an empty list.
- Cleanup confirms no executing fixture runtime, held reservation or unsettled
  runtime effect remains.

For two lost deletion-dispatch acknowledgements, the tests first assert that
the reservation remains held. They then model explicit operator deletion of the
exact recorded provider identity, and require reconciliation to confirm absence.
That is **not** evidence of automatic unknown-delete retries. It demonstrates
the documented conservative recovery boundary without changing ledger counters.

## Real HTTP Disconnects

A loopback Fastify server registers the actual sandbox route and uses the real
catalog, PostgreSQL transactions and stored-secret preparation. The fixture
supplies a test administrator context, not a live Keycloak session. Credential
preparation pauses at a query barrier; the client then destroys its TCP connection.
The server-side socket close is observed before proceeding.

1. With no explicit cancellation, the accepted request finishes, injects the
   credential once, and an identical request reuses its sandbox.
2. With explicit termination during preparation, the reservation is released
   before the barrier opens. Late preparation cannot create a runtime or inject
   credentials; replay cannot resurrect that canceled intent.

Both cases assert that a queue worker cannot claim partially prepared credentials.
The provider is the deterministic in-memory adapter, so this tests control-plane
correctness, not native credential injection or network isolation.

## CI and Reproduction

The required `checks` job now starts a disposable PostgreSQL service and executes
both suites with `CAPACITY_TEST_REQUIRED=1`. Ordinary runtime-free unit tests
remain available. Follow the [operations runbook](execution-capacity.md#implementation-and-verification)
for the exact command and disposable-database requirement.

Run the suite files sequentially: each has its own schema, but migrations create
database-global extensions. An exploratory parallel-file run exposed an extension
visibility race; serial file execution fixes the fixture setup, without reducing
the real concurrent-connection admission tests. The first HTTP fixture omitted
a ready template version; the fixture was corrected before the passing run.

No application implementation, live credentials, production database, public
cluster configuration or npm artifact changed in this acceptance. Compatible
rollback, coherent publication and standalone installation remain separately
tracked in the [active plan](../exec-plans/active/organization-capacity-admission.md).
