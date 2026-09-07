# Execution Plan: Delivery Readiness and Persistent Workspaces

**Created**: 2026-09-07
**Author**: Codex
**Status**: In Progress
**Priority**: P0
**Estimated effort**: Multiple engineering sessions; acceptance gates determine completion

## Context

The maintainer approved roadmap recommendation 1 (delivery gaps) and Phase 2B
(persistent workspaces and live execution). Execute sequentially, not as
independent competing implementations. Preserve the provider-neutral control
plane, existing customer data, hosted OIDC configuration, and restricted
OpenShift defaults. The unrelated `docs/cot/` document is outside this work.

The September 1 north-star roadmap remains the umbrella. Lifecycle persistence,
Credential Vault, TypeScript integration, and four real agent demos are already
delivered. This plan does not reimplement them or start Python/MCP work.

**Scope clarification, September 7:** BackgroundAgent is an external consumer,
not a dependency or acceptance gate. Do not install, redeploy, modify, or spend
further implementation time on it. Use Harakiri-owned fixtures and native
OpenSandbox for all remaining acceptance. Optional existing runbook support does
not make that separate project part of this plan.

## Success Criteria

- [ ] A fresh single-namespace OpenShift installation uses versioned registry
      images and local chart archives, without source-chart fallback, SCC
      changes, manual patches, or restart-to-repair steps.
- [ ] Existing template images have a protected build/publish workflow,
      architecture-aware smoke checks, immutable coordinates, and operator docs.
- [ ] The public lab origins recover after process/pod replacement and user
      login; service supervision is documented without claiming availability
      while the host is powered off or asleep.
- [x] Organizations can manage persistent workspace records and reuse their
      storage across sandboxes through Harakiri IDs only.
- [ ] Ownership, concurrent mounts, retention, archive/reclaim, failed create,
      TTL, pause/resume, restore, and credential boundaries are explicit.
- [x] Tracked command output is consumable through a resumable public event
      stream with clear completion, cancellation, error, and disconnect behavior.
- [ ] API, SDK, CLI, dashboard, operator docs, public tutorials, and conformance
      agree. Real two-sandbox persistence and reconnect acceptance pass.

## Baseline and Boundaries

- Starting commit: `b726c3e`; only unrelated `docs/cot/` is untracked.
- k0s is Ready. CRC is stopped at start; starting it for clean-install evidence.
- Existing installer defaults still select Harakiri chart 0.1.2/image 0.1.0,
  requires a BackgroundAgent checkout, and repairs OpenSandbox with restarts.
- GitHub repository visibility remains private. Making source public is a
  separate explicit maintainer decision, not an automatic installation step.
- No deletion/reinstallation of populated namespaces or PVCs without explicit
  approval. Fresh validation must use an empty namespace and distinct hosts.
- No Kubernetes pod exec/files/logs implementation in Harakiri runtime APIs.
- No default SCC modification, privilege bypass, or secret-to-env fallback.
- Releases require maintainer approval; never replace an existing release tag.

## Provider Research

Pinned OpenSandbox `server/v0.2.3` sources, checked September 7:

- Lifecycle schema:
  https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/specs/sandbox-lifecycle.yml
- PVC example:
  https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/docs/examples/kubernetes-pvc-volume-mount.md
- Command/execd schema:
  https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/specs/execd-api.yaml

The pinned lifecycle schema supports PVC mounts and provision-on-first-use with
`createIfNotExists`, storage hints, and retention across sandbox termination.
It does not expose a standalone persistent-volume deletion API. Verify running
provider behavior before advertising availability. Do not invent a destructive
cleanup sandbox or call Kubernetes behind a runtime-provider facade.

The pinned execd contract streams foreground executions over SSE; detached logs
use a cursor-based polling endpoint. A resumable Harakiri tracked-command stream
must label any server-side polling overlay honestly and must not promise replay
beyond the retained provider log data.

## Phases

### Phase 1: Delivery Contract and Clean Installation
**Status**: In Progress

- [x] Inventory installer, workflows, existing host supervision and cluster state.
- [x] Record a declarative release/template manifest and validate artifact inputs.
- [x] Remove stale versions and silent source-chart fallback from customer path.
- [x] Separate preparation, dependency install, OpenSandbox, Harakiri, optional
      BackgroundAgent, and verification; make third-party checkout optional.
- [x] Render complete pull-secret/configuration settings before Helm installs;
      remove rollout-restart repair and permissive health-test failures.
- [x] Keep generated credentials private; bootstrap Keycloak material containing
      credentials must not be stored in a ConfigMap or exposed in process output.
- [ ] Test invalid inputs, missing charts, reruns, restricted manifests and
      fail-closed verification. Run clean local OpenShift acceptance.

### Phase 2: Template Artifacts and Public Recovery
**Status**: In Progress

- [ ] Add protected template release workflow for existing template sources;
      test non-root/arbitrary-UID runtime compatibility without paid model calls.
- [ ] Publish candidate images, capture manifest digests, import and smoke via
      Harakiri. Do not silently promote an untested template alias.
- [x] Add independently supervised named tunnel and individual origin forwards,
      with bounded logs, conflict checks, uninstall and status commands.
- [x] Preserve unrelated launch agents and existing tunnel configuration.
- [x] Test supervised process recovery and origin pod handoff, and verify
      public web/API/OIDC URLs remain public.

### Phase 3: Workspace Architecture and Provider Spike
**Status**: In Progress; k0s native acceptance passed, restricted OpenShift pending

- [x] ADR: workspace is organization-owned persistent storage, not a sandbox,
      snapshot, Git checkout, Keycloak workspace, or credential store.
- [ ] Verify native PVC first-create/reuse on pinned OpenSandbox using two
      sandboxes; measure permission behavior on k0s and restricted OpenShift.
- [x] Choose conservative configured storage profiles, generated private claim
      names, dedicated storage per workspace, and exclusive sandbox attachment.
- [x] Define logical archive/retention and operator physical reclamation where
      upstream has no deletion API; report storage retained, never disk wiped.
- [x] Define unsupported combinations and explicit capability/config opt-in.

### Phase 4: Workspace Domain, API and Lifecycle
**Status**: In Progress

- [x] Add migrations, organization-scoped services, atomic mount reservations,
      audit metadata, quotas, and immutable storage configuration.
- [x] Add create/list/get/archive API and sandbox workspace attachment contract.
- [x] Extend OpenSandbox create through native volumes; keep dev-provider test
      semantics honest and provider references out of public IDs.
- [ ] Handle create retries/failures, kill/TTL cleanup, pause reservations,
      snapshot metadata and restore without unintended storage sharing.
- [ ] Correct stale idle schedules after renewal/activity. Real release testing
      reproduced termination at the original deadline despite a later reported
      expiry. Coordinate the authoritative deadline with renewal and add a real
      PostgreSQL plus beyond-original-deadline runtime regression before stable.
- [x] Preserve Credential Vault custody; clearly state arbitrary agent-created
      files persist and are not magically scrubbed by credential revocation.
- [ ] Test tenant isolation, concurrent create, unavailable storage, failures,
      retained data and unsupported lifecycle combinations.

### Phase 5: Live Tracked Execution
**Status**: In Progress

- [x] Define event/cursor contract and completion semantics in OpenAPI/shared
      types. Reconnection observes the same command; never rerun it.
- [x] Stream authorized provider log cursors with bounded polling/backpressure,
      heartbeat, abort cleanup, explicit terminal state and provider failures.
- [x] Distinguish closing a viewer from killing the underlying command.
- [ ] Test UTF-8/framing, reconnect, missing/invalid cursors, auth expiry,
      cancellation, command failure, sandbox termination and slow consumers.

### Phase 6: SDK, CLI and Dashboard
**Status**: Source delivered in rc.2; acceptance follow-up remains

- [x] Add typed workspace helpers and abortable command async iteration without
      duplicating control-plane behavior in clients.
- [x] Add CLI workspace management/create attachment/live output and explicit
      signal handling. Preserve current attach and run behavior.
- [x] Add compact workspace management and sandbox creation selection, attached
      workspace status, archive warnings and streamed process output.
- [x] Use existing UI components, honest empty/degraded/loading states, and
      browser testing across desktop/mobile. No hidden destructive defaults.
- [ ] Initialize Commands working directory from the sandbox runtime metadata,
      not always `/workspace`. Existing ephemeral Python images may not have
      that directory; explicitly selecting `/` passed the final browser smoke.

### Phase 7: Documentation, Acceptance and Delivery
**Status**: In Progress

- [x] Update architecture ADRs, operator runbooks, storage/security limits,
      release notes, public API/SDK/CLI docs and integration guide.
- [x] Add runnable two-sandbox persistence/live execution tutorial with cleanup.
- [x] Update roadmap notes in Obsidian with shipped versus deferred scope.
- [x] Run full tests/types/build, schema/doc/package gates, Helm checks,
      provider-free conformance and real runtime acceptance.
- [ ] Validate install/upgrade and rollback with existing data, deploy the tested
      candidate, and record exact versions/digests and remaining limitations.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-07 | Delivery gates precede Phase 2B implementation. | Reusable customer installs are part of the north star, not an afterthought. | Add more API features while install defaults remain stale. |
| 2026-09-07 | Use pinned provider source, not only current upstream proposals. | PVC provisioning semantics changed across upstream revisions. | Assume proposal or main-branch behavior matches the deployed image. |
| 2026-09-07 | Keep repository private until separately authorized. | Publishing source is distinct from making release artifacts reliable. | Treat roadmap approval as permission to change visibility. |
| 2026-09-07 | Continue isolated Phase 2B implementation while CRC acceptance awaits approval. | The existing `harakiri-security` namespace contains user data. Destructive clean reinstall has not been authorized. No release gate is waived. | Delete existing applications, or stall independent source validation. |
| 2026-09-07 | Fail closed after an unconfirmed workspace provider request. | Retrying native creates can duplicate runtimes and concurrently mount storage. Durable per-attachment markers require operator recovery for ambiguity. | Blindly retry provision or silently recreate missing storage. |
| 2026-09-07 | Release template manifests only after both native architectures pass. | A successful arm64 build is not evidence for amd64 or arbitrary-UID compatibility. | Publish all tags before acceptance or use an untested alias. |
| 2026-09-07 | BackgroundAgent is outside implementation and acceptance scope. | Maintainer explicitly requested keeping that project's complexity out of sandbox work. | Couple Harakiri delivery to an external application's deployment. |
| 2026-09-07 | Release and deploy a `0.5.0` candidate after explicit maintainer request. | Enable testing on validated k0s without misrepresenting pending clean OpenShift and template gates. Planned npm channel is `next`, not `latest`; source visibility and BackgroundAgent remain unchanged. | Declare stable readiness prematurely or block the independently validated lab deployment. |
| 2026-09-07 | Supersede rc.1 with rc.2 before npm publication; keep stable gates open. | Live CLI checks found JSON/config defects, fixed and retested in rc.2. Final acceptance also exposed an existing TTL renewal/scheduler defect, now explicitly documented as a stable blocker. | Overwrite immutable tags, or describe a candidate as production-ready. |

## Release Candidate Delivery

- [x] Confirm explicit release authorization and reserve new version `0.5.0-rc.1`.
- [x] Align API/web/SDK/CLI, OpenAPI, chart, public changelog and preview docs.
- [x] Include the SDK dependency in the web container build.
- [x] Recheck clean CI and package consumer gates; commit and push source.
- [x] Publish versioned multi-architecture API/web images and Helm chart for `0.5.0-rc.2`.
- [x] Publish the GitHub prerelease with SDK/CLI tarballs, chart, checksums and receipt;
      download all three archives and verify their SHA-256 checksums.
- [ ] Publish matching npm `next` packages; local npm authentication is missing.
- [x] Back up the hosted database and Helm configuration, then upgrade only Harakiri.
- [x] Verify public URLs, OIDC origins and deployed workspace/command workflows.
- [x] Record exact artifacts, restore procedure, and remaining stable-release gates.

### Live Validation Findings

`1241171` passed CI, package checks and multi-architecture image/chart release.
Validation build `0.5.0-rc.1` was deployed through Helm to k0s with migration 035,
public origins preserved, and 1 GiB local-path storage enabled after the API and
scheduler upgrade. The packaged SDK passed two-sandbox checkpoint reuse and
command reconnection through Cloudflare. Real Keycloak browser login, workspace
creation and command output passed on desktop/mobile. The database and original
Helm/configuration were backed up privately; backup archive catalog is readable.

Live CLI verification caught two issues before npm publication: `run --follow
--json` included a progress banner on stdout, and saved configuration overrode
environment credentials contrary to documentation. Both are fixed with three
new regression tests (76 CLI tests passing). `0.5.0-rc.2` supersedes the validation
build; old artifacts/tags are not overwritten. Commit `bf90ff0` passed main CI and
Harbor image/chart publication. Helm revision 22 deploys its digest-pinned images
on k0s. Public web/API/OIDC return 200. Both installed package tarballs passed live
acceptance: checkpoint reuse, reconnect without duplicate output/execution, CLI
JSON framing and environment config precedence. Revoking a temporary observer key
closed its public command stream while the underlying command completed normally.
The final rc.2 UI command returned all eight expected lines with exit 0 on
desktop/mobile. The public changelog and selected workspace tutorial show rc.2;
OIDC logout returned to the public landing page with Sign in restored. Release
test keys were revoked, runtime fixtures terminated, and three archived/detached
workspace PVCs reclaimed by exact name. Archived metadata/quota history remains.

The same test sandbox later terminated at its original idle schedule despite its
successful renewal. Read-only DB evidence and source comparison confirm the
stale schedule also exists in v0.4.0. This is not covered by the successful short
command/reconnect smoke: it is an explicit remaining stable-release blocker.

The rc.2 template workflow passed 11 architecture jobs but its OpenCode amd64
arbitrary-UID runtime check hit its 90-second timeout. No combined template
candidate or alias was promoted. Build/runtime smoke timeouts now bound retries.
This remains a stable-release
gate, independent of the tested control-plane candidate. npm authentication is
currently missing locally and has been requested without asking for a token in chat.

## Tech Debt Incurred

- Physical volume reclamation is operator-only because the pinned runtime has
  no volume deletion API. Archived workspaces continue counting toward quota.
- Detached event streams poll retained provider logs, not a durable event store.
  Replay is limited to provider retention. Snapshot/restore with a persistent
  workspace is rejected. Pause/resume with exclusive ownership passed on k0s;
  restricted OpenShift storage ownership acceptance is still pending.
- Colima has only approximately 2.6 GiB free after removing this session's own
  build artifacts. Existing containers, images and volumes were preserved.
  CI passed 11 template architecture jobs; OpenCode amd64 arbitrary UID and
  combined template publication/import/promotion remain pending.
- Renewal changes the sandbox/provider expiry without updating the original
  idle schedule. The scheduler must coordinate with the authoritative current
  deadline and renewal operations before stable promotion.

## Initial Source Verification Checkpoint

The following evidence predates the release candidate deployment. See
[the rc.2 delivery receipt](../../release-notes/0.5.0-rc.2-delivery.md) for live
public acceptance, current artifact availability and open release gates.

- Public web/API/OIDC returned 200 after independently supervised origins and
  named tunnel were installed. Killing the owned API forward recovered in about
  one second. Replacing only the stateless web pod recovered the public origin
  in about two seconds; its forward PID changed and public bootstrap URLs stayed
  correct. Startup supervision is installed; a host reboot/login test is not run.
- Native OpenSandbox PVC create/write/terminate/reuse/read passed on k0s.
- The real SDK tutorial used two sandboxes, recovered a checkpoint, disconnected
  and resumed command output, and asserted one command execution with no output
  replay. This used an isolated API/database, not the production release.
- PostgreSQL exclusive attachment race, cross-org denial, ambiguous provider
  hold, release, replacement and archived quota tests passed. All 35 migrations
  also applied successfully to a second empty test database.
- Browser checks passed at 1440x900 and 390x844: workspace creation/selection,
  duplicate-name error, archive confirmation, command start/output, stop-viewing,
  reconnect without duplicate lines, dialog Escape and explicit termination.
  Screenshots show no page overflow in the new views. An isolated fixture-key
  harness was used; this is not fresh Keycloak login acceptance.
- Root tests: 514 tests, 513 passed, one optional PostgreSQL test skipped in the
  generic run and passed in the separate DB-enabled run. Thirteen targeted
  workspace/stream tests passed; CLI includes real child-process SIGINT tests.
- Full typecheck/build, OpenAPI/docs/security checks and SDK/CLI dev-provider
  conformance passed. Verification commands now run sequentially because CLI
  scripts rebuild SDK output consumed by the dashboard.
- Base Linux and Python template arm64 smoke tests passed for root and arbitrary
  UID. No candidate template manifest or Phase 2B package has been published.
- Installer input/ownership/rendering tests pass. All three optional handoff
  chart archives downloaded and rendered from Harbor. No BackgroundAgent install,
  redeployment or source change was performed. Further validation is Harakiri-only
  following the maintainer's clarification. Clean CRC installation has not run
  because the existing namespace contains user workloads and PVCs.
- Disposable test sandboxes terminated, three test workspaces archived and their
  detached native PVCs reclaimed by exact name. Isolated test API/scheduler and
  PostgreSQL were stopped; temporary browser authentication harness was removed.
  No application/runtime cleanup was run against BackgroundAgent or customer data.

## Completion Notes

In progress. Phase 2B is deployed to the public k0s lab as `0.5.0-rc.2`, Helm
revision 22, with digest-pinned images and successful public package/runtime
acceptance. SDK/CLI rc.2 tarballs are available with the GitHub prerelease;
registry publication is blocked by local npm authentication. npm `latest` stays
at 0.4.0. The OpenSandbox compatibility chart is separately mirrored in Harbor.
Do not archive this plan while stable acceptance and publishing gates remain.

Next acceptance is Harakiri-only: fix renewal/scheduler deadline coordination,
fresh restricted OpenShift storage/mount checks, complete template architecture
release checks, npm `next` publication, and host/rollback recovery validation. No
BackgroundAgent install is needed to complete these gates. Preserve the existing
populated CRC namespace and its data.

CRC currently runs OpenSandbox server `v0.1.14` and controller `v0.1.0`, while
Phase 2B acceptance targets server `v0.2.3` with the current native volume contract.
Do not count checks against this older installation as proof of the new contract,
or upgrade shared runtime dependencies as a side effect of client-project testing.
