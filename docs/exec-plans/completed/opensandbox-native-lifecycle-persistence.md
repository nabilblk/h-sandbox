# Execution Plan: OpenSandbox-Native Lifecycle Persistence

**Created**: 2026-09-02
**Completed**: 2026-09-02
**Author**: Codex
**Status**: Completed
**Priority**: P0
**Estimated effort**: 4-7 engineering days

## Context
Phase 2 in the September north-star note is "OpenSandbox-Native Capability
Adoption": Harakiri should become the best OpenSandbox control plane by exposing
provider-native primitives through stable Harakiri API, SDK, CLI, UI, docs, and
tests.

The first Phase 2 slice was lifecycle persistence: pause, resume, snapshot, and
restore/from-snapshot. This was the highest-leverage correction because the
previous Harakiri public contract explicitly marked these features as
unsupported, while current OpenSandbox documentation describes them as lifecycle
resources.

OpenSandbox sources checked on 2026-09-02:

- OpenSandbox architecture: `specs/sandbox-lifecycle.yml` covers sandboxes
  created from image or snapshot; sandbox list/get/delete/pause/resume/renew;
  snapshot create/list/get/delete; resource limits; platform constraints;
  volumes; network policy; and secure access.
  https://open-sandbox.ai/architecture/
- OpenSandbox Go SDK README: lifecycle client examples include
  `PauseSandbox` and `ResumeSandbox`.
  https://github.com/opensandbox-group/OpenSandbox/blob/main/sdks/sandbox/go/README.md
- OpenSandbox Credential Vault docs: pause/resume has important side effects
  because Kubernetes pause deletes the Pod after snapshotting; credential vault
  entries are process-local in the egress sidecar and must be re-injected after
  resume.
  https://open-sandbox.ai/guides/credential-vault

The Phase 1 architecture rule was preserved: Harakiri is the product and
control plane; OpenSandbox owns sandbox lifecycle and data-plane behavior.
Pause, resume, snapshot, and restore were implemented through OpenSandbox
lifecycle APIs, not through Harakiri-owned Kubernetes pod shortcuts.

## Success Criteria
- [x] Harakiri exposes pause, resume, snapshot, list snapshots, get snapshot,
      delete snapshot, and create sandbox from snapshot through stable API
      routes under `/v1`.
- [x] The OpenSandbox provider implements lifecycle persistence only through
      OpenSandbox lifecycle APIs, with no Harakiri-owned Kubernetes runtime
      shortcut.
- [x] PostgreSQL stores Harakiri snapshot records, pause/resume/snapshot
      operations, restore provenance, retention metadata, and provider IDs
      without making OpenSandbox IDs the public integration contract.
- [x] Runtime capabilities report lifecycle persistence accurately with stable
      machine-readable names: `lifecyclePause`, `lifecycleResume`,
      `lifecycleSnapshot`, `snapshotList`, `snapshotDelete`, and
      `createFromSnapshot`.
- [x] SDK and CLI expose premium lifecycle methods with clear errors:
      `sandbox.pause()`, `sandbox.resume()`, `sandbox.snapshot()`,
      `client.snapshots.*`, `harakiri pause`, `harakiri resume`,
      `harakiri snapshot`, and `harakiri snapshots`.
- [x] Dashboard sandbox detail shows lifecycle state, paused state, snapshot
      list, restore actions, retention metadata when available, and
      unsupported/degraded provider states without hiding failures.
- [x] Docs and website no longer claim pause/resume/snapshot are unsupported
      when the OpenSandbox provider supports them.
- [x] Conformance tests cover the supported lifecycle persistence contract
      against the dev provider and real OpenSandbox-backed k0s deployment.
- [x] Credential Vault and egress behavior after resume is documented honestly,
      including the need to re-inject credentials after Kubernetes pause/resume.

## Non-Goals
- Volumes, prewarmed pools, secure access, Credential Vault, metrics watch, SSE
  command streaming, and code-interpreter contexts remain outside this slice.
- No new runtime provider was added.
- Raw OpenSandbox snapshot IDs are not exposed as the main public contract.
- Harakiri snapshot records do not store real credential values, vault payloads,
  or sandbox terminal/file contents.
- Harakiri does not promise memory snapshot behavior beyond the tested
  OpenSandbox Kubernetes persistence behavior.

## Phases

### Phase 1: Provider Contract Research And Spike
**Status**: Complete
- [x] Read current OpenSandbox lifecycle and snapshot documentation.
- [x] Identified request/response needs for pause, resume, snapshot create,
      snapshot list/get/delete, and sandbox create from snapshot.
- [x] Tested the OpenSandbox-backed flow against k0s through Harakiri:
      create sandbox, write marker file, pause, resume, verify marker,
      snapshot, restore from snapshot, verify marker, delete snapshot, and kill
      sandboxes.
- [x] Kept the supported deployment profile focused on Kubernetes/k0s for this
      slice; Docker runtime differences remain provider documentation concerns,
      not Harakiri control-plane behavior.
- [x] Confirmed Harakiri public APIs should wait for pause/resume state to
      settle instead of persisting stale provider states from asynchronous
      OpenSandbox responses.
- [x] Confirmed local snapshot persistence needs a node-reachable registry in
      k0s; `127.0.0.1:5000` is not reachable from OpenSandbox committer pods.
- [x] Documented Credential Vault/egress re-injection caveats after
      Kubernetes pause/resume.

### Phase 2: Harakiri Contract And Data Model
**Status**: Complete
- [x] Added public types for paused lifecycle states, snapshot summaries,
      snapshot detail, snapshot operations, and restore provenance in
      `packages/shared`.
- [x] Added capability names for `snapshotList`, `snapshotDelete`, and
      `createFromSnapshot`.
- [x] Added migration `024_sandbox_snapshots.sql` for snapshot records and
      lifecycle operation kinds.
- [x] Mapped snapshots to organization, source sandbox, template, provider,
      expiration, and metadata.
- [x] Kept Harakiri `snp_...` IDs as the integration contract and stored
      provider snapshot IDs internally.
- [x] Added lifecycle audit/event metadata for pause, resume, snapshot,
      restore, and snapshot delete paths.
- [x] Regenerated and checked `docs/openapi.json`.

### Phase 3: Runtime Provider Implementation
**Status**: Complete
- [x] Extended `RuntimeProvider` with optional pause, resume, snapshot,
      list/get/delete snapshot, and create-from-snapshot methods.
- [x] Implemented OpenSandbox transport functions that call OpenSandbox
      lifecycle/snapshot APIs.
- [x] Mapped OpenSandbox state names into Harakiri states, including `paused`.
- [x] Added typed provider error paths for unsupported/unavailable snapshot and
      lifecycle behavior.
- [x] Updated runtime capability health to reflect lifecycle persistence
      support.
- [x] Preserved strict runtime behavior with `OPEN_SANDBOX_ALLOW_FALLBACK=0`.
- [x] Added deterministic in-memory snapshot semantics to the dev provider for
      CI conformance.

### Phase 4: API Services And Routes
**Status**: Complete
- [x] Added services for pause, resume, snapshot create, snapshot list,
      snapshot detail, snapshot delete, and sandbox create from snapshot.
- [x] Persisted lifecycle operation records and snapshot records around
      provider calls.
- [x] Updated sandbox list/detail mapping for paused lifecycle state.
- [x] Added API routes under `apps/api/src/routes/sandboxes.ts`.
- [x] Added tests for happy paths, provider unavailable/unsupported behavior,
      restore, delete, and API shape.
- [x] Kept route handlers thin; provider-specific behavior stays in service and
      provider modules.

### Phase 5: SDK And CLI
**Status**: Complete
- [x] Replaced SDK unsupported lifecycle throws with real async methods.
- [x] Added high-level SDK methods:
      `sandbox.pause()`, `sandbox.resume()`, `sandbox.snapshot()`,
      `client.snapshots.list()`, `client.snapshots.get()`,
      `client.snapshots.delete()`, `client.snapshots.wait()`, and
      `client.sandboxes.create({ snapshotId })`.
- [x] Added CLI commands with script-friendly output and JSON mode:
      `pause`, `resume`, `snapshot`, `snapshots list`, `snapshots inspect`,
      `snapshots delete`, and `create --snapshot`.
- [x] Added SDK and CLI tests for lifecycle success and API error mapping.

### Phase 6: Dashboard UX
**Status**: Complete
- [x] Added paused-state treatment to sandbox detail and shared status types.
- [x] Added lifecycle actions to sandbox detail: pause, resume, snapshot,
      restore/create from snapshot, and delete snapshot.
- [x] Added a Snapshots tab aligned with existing Harakiri design tokens.
- [x] Showed snapshot provenance: source sandbox, template, created at,
      expiration, provider status message, and provider state.
- [x] Browser-tested direct sandbox detail links, OIDC return routing, terminal
      attach, and snapshot creation against the k0s deployment.
- [x] Fixed a stale return-route risk so authenticated direct deep links win
      over old session-storage return routes unless the current navigation is
      an actual OIDC callback.

### Phase 7: Docs, Website, And Operator Notes
**Status**: Complete
- [x] Updated repository docs: capabilities and limits, lifecycle docs,
      OpenSandbox boundary docs, SDK README, CLI README, integration docs, and
      test report.
- [x] Updated product website docs and release notes.
- [x] Documented lifecycle examples for API, SDK, and CLI.
- [x] Documented operational prerequisites for OpenSandbox snapshot
      persistence.
- [x] Documented credential and egress behavior after resume; specifically,
      Credential Vault entries must be re-created after Kubernetes
      pause/resume.
- [x] Added migration notes that older Harakiri versions reported lifecycle
      persistence as unsupported.

### Phase 8: Verification And Release Readiness
**Status**: Complete
- [x] Ran local checks: `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`,
      `pnpm openapi:check`, `pnpm examples:check`, `pnpm templates:check`,
      `pnpm package:assert`, `pnpm publish:local-check`, and
      `pnpm conformance:dev`.
- [x] Ran source boundary scan to ensure no Kubernetes runtime shortcut was
      added.
- [x] Deployed to k0s.
- [x] Ran real OpenSandbox lifecycle persistence conformance:
      create, write file, pause, resume, verify marker, snapshot,
      create-from-snapshot, verify marker, delete snapshot, and kill sandboxes.
- [x] Ran hosted/public endpoint checks for web, API, and Keycloak through the
      Cloudflare tunnel.
- [x] Ran dashboard lifecycle browser tests through `agent-browser`.
- [x] Updated `docs/test-report.md` with sandbox IDs, snapshot IDs, commands,
      provider version, and known limits.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-02 | Start Phase 2 with lifecycle persistence only. | Pause/resume/snapshot were the clearest mismatch between current Harakiri contract and current OpenSandbox docs, and they set the implementation pattern for later provider-native capabilities. | Implement all Phase 2 features at once; start with Credential Vault or streaming. |
| 2026-09-02 | Keep OpenSandbox as the only lifecycle persistence implementation in this slice. | The product direction is to adopt provider-native primitives and keep Harakiri as the control plane. | Add Kubernetes snapshot/pod operations in Harakiri; add a second runtime provider. |
| 2026-09-02 | Use Harakiri snapshot IDs as the public contract and keep provider snapshot IDs internal. | Integrators should not depend on OpenSandbox identifiers; Harakiri owns org auth, audit, retention, and product state. | Expose OpenSandbox snapshot IDs directly. |
| 2026-09-02 | Wait for provider pause/resume state to settle before returning public success. | OpenSandbox pause/resume can acknowledge asynchronously; returning the stale state makes the UX and CLI look broken. | Return immediately and rely on later reconciliation. |
| 2026-09-02 | Use a node-reachable snapshot registry in k0s deployments. | OpenSandbox snapshot committer pods cannot push to the host's `127.0.0.1:5000`; they need the Lima node-reachable registry endpoint. | Keep localhost registry references and accept snapshot failures. |
| 2026-09-02 | Add a guarded k0s socket compatibility link for the pinned OpenSandbox controller. | The currently pinned OpenSandbox controller expects `/var/run/containerd/containerd.sock`; k0s exposes `/run/k0s/containerd.sock` and the chart value for overriding the socket is not supported by the pinned controller image. | Patch OpenSandbox image arguments; fork the chart; disable snapshot persistence locally. |
| 2026-09-02 | Add deep-linkable sandbox detail routes. | Snapshot restore and browser testing need stable URLs for sandbox details instead of hidden in-memory `detailId` state. | Keep `#detail` plus transient component state. |

## Tech Debt Incurred
- The local k0s snapshot runtime uses a guarded containerd socket compatibility
  link for the pinned OpenSandbox controller image. This is deployment
  compatibility debt, not application runtime coupling. Revisit when
  OpenSandbox exposes a supported chart value or controller flag for the
  containerd socket path.

## Completion Notes
Implemented OpenSandbox-native lifecycle persistence end to end. Public API
routes now expose pause, resume, snapshot create/list/get/delete, and sandbox
restore from Harakiri `snp_...` snapshots. SDK and CLI expose the same contract,
the dashboard has lifecycle actions and a Snapshots tab, and docs now describe
the supported lifecycle model and provider caveats.

Verified on 2026-09-02 against the k0s deployment using OpenSandbox Helm chart
`0.2.2`, `opensandbox/server:v0.2.3`, `opensandbox/controller:v0.2.0`,
`opensandbox/execd:v1.1.0`, `opensandbox/egress:v1.1.7`,
`opensandbox/ingress:v1.0.10`, and image-committer `v0.1.1`.

Final verification after the service cleanup passed `pnpm -w typecheck`,
`pnpm -w test`, `pnpm -w build`, `pnpm openapi:check`,
`pnpm examples:check`, `pnpm templates:check`, `pnpm package:assert`,
`pnpm publish:local-check`, `pnpm conformance:dev`, and `git diff --check`.
The current source was deployed to k0s as Harakiri Helm revision 12. Runtime
pods were healthy with API image ID
`sha256:19e616a13cd8de66115f4bc3bac30bbf52e4cc28013097acdcc73dc4e3237ad3`
and web image ID
`sha256:f2a7c6fa7646dd868e48fa69fa2dcdb497b3f94cbc49fba6495b1365025cd63c`.

Final live persistence smoke created source sandbox `sbx_NFsT1T6F9B`, paused
and resumed it, created snapshot `snp_qZJc_A_2FQ`, restored sandbox
`sbx_-YRnUUKJOv`, verified the marker file in both runtimes, then deleted the
snapshot and both sandboxes. Browser smoke created sandbox `sbx_HHIJscLJ8b`,
loaded it by direct detail URL through hosted Keycloak OIDC, verified the
terminal attach ticket, created ready snapshot `snp_q4evtQhliK`, confirmed
browser API calls used `https://sb-api.harakiri.io`, and cleaned up the
snapshot, sandbox, and temporary API key.
