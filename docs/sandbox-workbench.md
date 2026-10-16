# Sandbox Workbench

Requires **0.5.0-rc.13** API, web and CLI. This release candidate targets npm
`next` for the core SDK/CLI; stable `latest` remains `0.4.0`. No database
migration is required. Deploy matching API/web versions for truthful metrics;
`doctor` and enhanced `status` require CLI rc.13.
The public guide is at `/#docs/sandbox-workbench` in matching web versions.
The [release notes](release-notes/0.5.0-rc.13.md) describe the candidate scope;
publication, deployment and completed native qualification are not claimed here.

## Product Contract

The workbench is the dashboard's sandbox detail view, not an IDE or agent
orchestrator. Existing Network, Vault and Snapshots panes retain their contracts.

| Pane | Behavior | Boundary |
| --- | --- | --- |
| Overview | Readiness, expiry, slot state, workspace, capabilities, recent commands, connection links | Execution readiness does not prove application health |
| Terminal | Lazy-loaded xterm.js, raw keys, ANSI, resize, interrupt, disconnect, explicit reconnect | New connection is not a guarantee of recovering the previous PTY |
| Commands | Tracked commands with direct links, selected-ID refresh and final exit/finish metadata | Closing the viewer does not kill or rerun work |
| Filesystem | Navigation, checked inert text preview, confirmed upload, verified download | No editor, deletion UI, streaming transfer or atomic create-only upload |
| Logs | Text/source/event filters; manual refresh or serial 3s follow | Provider-retained snapshots, not durable replay |
| Metrics | Serial 5s observations with provider timestamp and measured fields | Failed observations are unavailable, never replaced by cached values |

Example: run a Python command that writes `report.json`, verify exit 0 in
Commands, inspect it in Filesystem and download it before terminating an
ephemeral sandbox. The [public guide](../apps/web/src/workbench-docs.tsx) contains
the complete sequence and troubleshooting workflow.

Selected commands are refreshed by ID even outside the recent-command list.
Completion refreshes canonical status and exit code, or `finishReason` when no
exit code exists. File refresh reloads the selected preview even if name and
size are unchanged. A deleted file disappears from the preview after the next
successful listing; failed listings hide stale previews. These review fixes
are part of the rc.13 behavior, not separate future work.

## Implementation And Trust Boundary

Focused panes live in `apps/web/src/routes/sandbox-{overview,terminal,files,logs,metrics}.tsx`.
`workbench.ts` owns hash-link parsing, PTY framing and log filtering/bounds.
`workbench-files.ts` owns byte/checksum helpers. `use-workbench-query.ts` performs
serial, cancellable snapshot reads and skips scheduled reads while hidden.
Mutations stay explicit; query retries never submit commands or uploads.

The terminal uses the existing one-time authenticated attach-ticket endpoint
and binary protocol. No pod exec, provider ID, direct provider credentials or
persistent browser bearer token is added. Remote OSC clipboard writes and
escape-sequence hyperlinks are disabled. Terminal content remains untrusted.

File previews render escaped text, not HTML/SVG, and reject invalid UTF-8 or NUL
bytes. Downloads use an octet-stream Blob after size and SHA-256 verification.
Every upload confirms the full remote destination; the API can still race with
another writer because it has no conditional create-only operation. Cancellation
does not roll back a remote write. Inspect after an unknown outcome.

The core candidate also includes the existing OpenSandbox file-transfer fix
first delivered as `api-2026-10-02.1`: native multipart uploads and binary
downloads behind the unchanged public JSON/base64 contract. That earlier
[maintenance receipt](release-notes/2026-10-02-provider-files-delivery.md) is
historical evidence, not qualification of rc.13.

## Bounds

- Terminal: 3,000 scrollback lines, 2 MiB queued output/input congestion limit,
  20s connection deadline; closing or switching the pane disposes its connection.
- Files: 300 displayed directory entries, 256 KiB text preview, decoded transfer
  maximum `min(16 MiB, runtimeMetadata.limits.fileArtifactMaxBytes)`. Missing
  metadata falls back to 16 MiB; the server may reject a lower configured limit.
- Transfer request deadline: 120s. Preview and snapshot reads: 20s.
- Log response: 2 MiB JSON; display keeps the latest whole entries up to 1,000
  rows / 500,000 characters. Oversized responses fail explicitly.
- Command output: existing 200,000-character tail and provider cursor contract.

Limits are not content-safety guarantees. A checksum detects accidental transfer
corruption, not malicious provider content. Buffered transfers need memory beyond
the decoded size; larger transfers remain a separate transport milestone.

## Metrics Contract Change

`GET /v1/sandboxes/:id/metrics` returns `503 sandbox_metrics_unavailable` when
the provider cannot produce current metrics, and 404 when the sandbox is absent
in the caller's organization. It no longer synthesizes a current observation
from persisted CPU/memory values.

Optional `observedAt` and `availableFields` preserve compatibility with older
response readers. `observedAt: null` means unknown provider observation time.
Current OpenSandbox supplies CPU/memory, not disk/network counters. Legacy
numeric placeholders remain in the wire shape, but new UI/CLI readers use
`availableFields` and show missing fields as unavailable. An absent timestamp
produces no time-series sample. A single sample is not historical usage.

Older API responses without metadata are treated conservatively: CPU/memory
only, with their reported final sample timestamp if available. Upgrade API and
web together to eliminate the older server's fabricated fallback behavior.

## CLI Continuity

`harakiri doctor [id] [--json] [--timeout-ms 10000]` checks configuration, capacity
read access (`org:read`), and optional execution readiness (`sandboxes:read`). It
never changes resources. Each request is bounded; timeout maximum is 60s.
Reports redact key values and arbitrary remote error text. HTTPS is required
except HTTP on loopback; embedded credentials, query strings and fragments in
base URLs are rejected. Exit 0 means the requested checks passed, not universal
permissions or workload health. Failures exit 1.

`harakiri status ID --check --web-url https://sandbox.example.com --json` includes
readiness and an explicit workbench URL. `HARAKIRI_WEB_URL` is the optional
fallback. No dashboard origin is inferred. Non-ready checked status exits 1;
existing `status` behavior without new flags is unchanged.

## Verification Boundaries

- Web unit tests: strict routes, framing, binary integrity, bounded JSON/logs,
  unsafe preview content and public documentation/export.
- API tests: provider timestamp/field fidelity, unavailable/missing distinction,
  organization-scoped lookups and no cached fallback.
- CLI mock-API tests: read-only requests, permission/config failures, redaction
  and explicit dashboard URL handling.
- Playwright fixtures: actual xterm keyboard/ANSI/resize behavior, reconnect,
  binary download/upload, confirmation, cancellation, filters, failure states,
  deep links and desktop/mobile screenshots.

The release review reports all 28 browser fixture checks passing for the review
fixes; this documentation preparation has not rerun those browser checks.
Fixture tests do not prove native-provider behavior or independent adoption.
The native acceptance harness is underway. No completed rc.13 CI run, native
acceptance receipt, publication or deployment is asserted by this guide. No
running lab, customer namespace, host process or tunnel is part of these local
documentation checks.
