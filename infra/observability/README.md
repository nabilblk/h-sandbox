# Native telemetry qualification

This is a local implementation harness, **not a supported installation profile**.
It validates the ingestion transport in `apps/api/src/services/observability/`
against real, digest-pinned Collector, VictoriaLogs and VictoriaTraces containers.
Application control/ingestion/query routes and a native viewer now exist, but are
disabled by default. The harness itself enables no deployment or public package.
The optional chart profile is experimental, not a qualified installation.

For an interactive preview with real local process telemetry and browser sign-in,
see [Try the observability viewer locally](demo.md). It stays up temporarily for
manual testing. Its optional real local LLM scenario uses controlled tools and
explicit per-invocation callbacks; neither scenario starts a sandbox runtime.

## Run

Requirements: Node 22.15 or newer, pnpm 11, uv, Python 3.11 or newer, and a local
Docker context with a shared home directory, and `initdb` / `pg_ctl` on PATH.
Build the matching shared package and SDK before qualification. Qualification has four containers
(the three product components plus an independent OTLP receiver for fan-out),
each capped at 0.5 CPU and 256 MiB. It does not use the current kubeconfig.

```bash
pnpm --dir infra/observability install --frozen-lockfile
pnpm --dir infra/observability/frameworks install --frozen-lockfile
uv sync --project infra/observability --locked
pnpm --filter @harakiri/shared build
pnpm --filter @h-sandbox/sdk build
pnpm --dir infra/observability test
pnpm --dir infra/observability/frameworks test
pnpm --dir infra/observability/frameworks typecheck
pnpm --filter @harakiri/api exec node --test --import tsx src/telemetry-ingestion.test.ts
pnpm --dir infra/observability qualify
```

The database harness requires `initdb` and `pg_ctl` on PATH. It creates a private
Unix-socket-only cluster, uses unique test schemas, and stops/removes only its
own cluster. It does not consume `DATABASE_URL` or touch a shared database.

```bash
node infra/observability/postgres.mjs
pnpm --filter @harakiri/api exec node --test --import tsx src/observability-routes.test.ts src/telemetry-query.test.ts
uv run --project python pytest -c python/pyproject.toml infra/observability/chart_test.py
HARAKIRI_E2E_MANAGED_SERVER=1 HARAKIRI_E2E_WEB_PORT=15227 \
  pnpm exec playwright test tests/e2e/agent-observability.spec.ts
```

Choose an unused browser-test port. Playwright starts/stops its own Vite server.
`chart_test.py` requires Helm and the existing `python/` dev environment; it
only renders, never applies. Root SDK/web/API tests include focused new tests.

The private, nested pnpm workspace keeps qualification-only exporter versions
out of the public SDK, CLI and Deep Agents dependency graphs. Its lockfile and
Python lockfile must both be committed. It is not an npm publishing target.

Every run generates its own credentials, network, private temporary directory
and loopback-only ports. Containers run with an unprivileged UID, read-only root
filesystem, no Linux capabilities and no privilege escalation. The runner removes
only resources bearing its unique ownership label. Success is printed only
after owned-resource cleanup. No credentials from a live Harakiri installation,
model provider or Kubernetes cluster are used. The full-stack application check
starts in its owned temporary directory with explicit generated settings, so the
application's normal `.env` loader cannot consume developer configuration.

For a forcibly killed runner, inspect the label
`io.harakiri.observability-qualification` with `docker ps -a --filter
label=io.harakiri.observability-qualification`. Remove only the abandoned run's
containers/network and corresponding directory under
`~/.cache/harakiri-observability-qualification/`. Do not prune Docker globally.

## What the checks prove

- Actual API ingestion transport, with an in-memory **test-only grant store**.
  Generated grants are hashed in the fixture, scoped to an org/run/sandbox, and
  cannot be used directly against Collector. API keys, invalid and revoked
  grants are rejected. The separate PostgreSQL harness exercises production grant
  lifecycle, role/key revocation, atomic budgets and exact expiry timestamps.
- An additional full-stack gate uses the built public SDK, real HTTP route and
  API-key authentication, PostgreSQL migrations and grants, actual exporters,
  Collector and Victoria queries together. It proves two-tenant isolation with
  colliding trace IDs, content permission enforcement, key/grant revocation,
  retained query access after termination and explicit expiry. Sandbox rows are
  fixtures; it does not create a runtime or validate command execution.
- Official TypeScript JSON/protobuf and Python protobuf exporters. Python's
  exporter does not provide the JSON path tested by TypeScript.
- Two tenants can use the same trace and span IDs without mixing their records.
  Forged headers/resource attributes do not change trusted identity or capture.
- Metadata-only sensitive fields are removed before a durable queue. Both the
  queue files and query responses are checked for synthetic secret canaries.
  Credentials are absent from the persisted request metadata.
- A forcibly killed Collector recovers persisted, already-batched records to
  their original tenants. This is not proof that every HTTP acknowledgement is
  durable: the preceding in-memory batch window can still lose data.
- Explicit content opt-in, nested exception/link values and UTF-8 content.
  Map log bodies are serialized so they cannot shadow identity fields. Run and
  sandbox IDs are not used as VictoriaLogs stream labels.
- Generation parameters, finish reasons, token detail and tool-call IDs survive
  the allowlist. Long message strings are bounded to 32,768 characters and marked
  as truncated, while system instructions/tool definitions are removed in metadata
  mode before queueing. The clipping check uses the actual Collector and storage.
- Asynchronous deletion stays in its requested tenant; expired timestamps are
  rejected by retention; duplicate IDs remain duplicated in raw storage.
- The actual query adapter checks trusted identities/schema, exact nanoseconds,
  content permissions, deduplication/conflicts and explicit bounded-read limits.
- Real TS/Python Deep Agents callbacks, driven by deterministic model decisions,
  produce nested model/tool spans in two concurrently isolated tenants. No paid
  model or sandbox is used; these are framework callback tests, not tool execution.
- API unit tests additionally bound compressed/decompressed payloads and upstream
  responses, reject unsupported formats, recheck expiry and sanitize failures.

The controlled profile reduces VictoriaTraces' default 20-second index flush and
30-second search offset to 1 and 3 seconds respectively, with 1-second storage
flushes. That improves interactive visibility but increases I/O. The receipt
reports elapsed checks, **not a production latency or throughput guarantee**.

## Still Not Qualified

No real sandbox-backed execution, quota fairness under load,
signal pagination, OpenShift installation,
backup restoration, secure erasure of backups, or production sizing is implied.
Retention rejection of an old record is not proof of timed physical reclamation.
Local non-root containers are not native restricted-OpenShift evidence.

The twelve browser fixture tests are separate: 1,000 spans, a bounded 500-row read of a
10,000-log dataset, desktop/tablet/mobile, text contrast, keyboard/resize, root-first
selection, collapsed-parent reveal, error navigation, searchable logs, exact copy,
formatted JSON, role-labelled conversations, tool drill-down, token accounting,
hostile content and denied refresh. They use the real viewer with labelled
synthetic data, not live agent evidence. The component harness passes fourteen gates.
The [latest receipt](../../docs/operations/evidence/agent-observability-pipeline-2026-11-10.json)
adds authenticated post-filter OTLP fan-out and exercises the optional public SDK
helper through actual API/grant/storage boundaries, including producer clipping.
The [local receipt](../../docs/operations/evidence/agent-observability-local-2026-11-09.json)
records a successful run on macOS arm64, including image digests and owned cleanup.
The [LLM revision pipeline receipt](../../docs/operations/evidence/agent-observability-llm-pipeline-2026-11-09.json)
adds the actual clipping gate. [Real local model evidence](../../docs/operations/evidence/agent-observability-real-llm-2026-11-09.md)
records separately executed Qwen workflows and authenticated browser inspection;
these are not part of the default, model-free component command.
`HARAKIRI_QUALIFICATION_RECEIPT` optionally writes a sanitized JSON receipt after
successful owned-resource cleanup; use an absolute path to avoid pnpm's working
directory changing the destination. The manually dispatched
`observability-qualification.yml` workflow runs these checks on a disposable
GitHub runner; it has no publishing or cluster credentials. Preparing that
workflow does not mean it has been dispatched or passed remotely.

The TS instrumentation is intentionally private. Background callbacks must be
disabled before setup; the default callback queue lost tenant async context in
a reproduced test. Its manual ESM patch cannot be undone through the public
upstream API. It refuses an existing instrumentor and does not replace global
OTel providers, but remains process-lifetime qualification, not a product helper.

`frameworks/langchain-trace.ts` is an additional, private callback recipe for the
real-model scenario. It is attached only to an explicit agent invocation. It does
not use the OpenInference patch or register a global provider. Its separate tests
check actual framework topology and tool-call IDs, metadata-only capture, reported
usage, first-text-token callbacks and closing unfinished operations. Pin upgrades
must rerun these tests: Core 1.2.12's chain callback dispatcher and declarations
differ in argument order. This is not yet a released framework integration.

Names and allowlisted metadata are producer-controlled labels. They must not
contain secrets. Opted-in content can contain secrets; this profile does not
claim universal redaction. Unknown attributes are dropped, not automatically
made into an unbounded custom-attribute index. Metadata-only capture currently
drops events and links rather than risking sensitive nested attributes.

## Optional SDK and Image Checks

The public core packages remain lightweight. Their optional telemetry subpath/extra
have separate dependencies and installed-consumer tests, including real protobuf
exports to loopback and ownership/privacy/cancellation regressions:

```sh
node scripts/test-sdk-package.mjs
uv run --project python python python/check_packages.py \
  --dist-dir docs/artifacts/observability-python-consumer
node infra/observability/scan-images.mjs --platform linux/amd64
node infra/observability/scan-images.mjs --platform linux/arm64 \
  --output docs/artifacts/observability-image-audit-arm64
```

Use an empty distribution directory: packaging checks reject mixed historical
artifacts rather than deleting them. Grype must be installed locally; the manual
CI workflow pins and checksum-verifies its scanner. The image check exits nonzero
on high/critical findings and preserves a receipt and full JSON inventory.

**Current result: security gate failed on both architectures.** The pinned
Victoria images have unresolved high/critical dependency findings. See the
[audit decision](../../docs/operations/evidence/agent-observability-image-audit-2026-11-10.md).
Do not turn a passing functional run into a release claim or add an unreviewed
exception. Component tests use disposable private resources, not production data.

See [the architecture decision](../../docs/adr/0010-native-agent-observability.md)
and [the active execution plan](../../docs/exec-plans/active/native-agent-observability.md).
