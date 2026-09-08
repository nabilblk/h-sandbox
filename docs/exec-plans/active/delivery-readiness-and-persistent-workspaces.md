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
- [x] Correct stale idle schedules after renewal/activity. Real release testing
      reproduced termination at the original deadline despite a later reported
      expiry. Coordinate the authoritative deadline with renewal and add a real
      PostgreSQL plus beyond-original-deadline runtime regression before stable.
- [x] Trace the renewal defect across the API, retry worker, command/terminal
      activity and scheduler. All currently advance deadlines independently.
- [x] Serialize native renewal and expiration with connection-affine PostgreSQL
      row locks; persist confirmed expiry and schedules together. Preserve
      activity renewal, reject inactive runtimes, and prevent idempotent replay.
- [x] Exercise both renewal/expiration race orders, provider failure and recovery,
      duplicate workers, and a real native runtime past its original deadline.
- [x] Release and deploy migration 036 with the corrected API and scheduler;
      rc.3 is on k0s revision 25. The old scheduler was stopped before migration
      and was not restarted alongside the corrected API.
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

#### Workspace Documentation Structure Follow-Up

- [x] Check the workspace API, SDK, CLI, lifecycle and operator contracts against source.
- [x] Add separate public Concepts, Tutorials, Reference and Operations pages with
      first-party cross-links; distinguish organization membership from storage.
- [x] Add shareable public documentation URLs, backward-compatible selection,
      mobile navigation and working section navigation.
- [x] Add current prerelease/distribution/TTL caveats to the public pages, and
      make the walkthrough runnable without a private repository checkout.
- [x] Test documentation contracts, deep links/history and desktop/mobile
      rendering; record local verification and deployment status accurately.

Verification on 2026-09-07: 51 web tests pass, including all documentation page
and section targets, safe public deep links and legacy selection. Web typecheck,
production build, documentation link check and `git diff --check` pass. Vite
still reports the existing large-bundle warning; this change does not introduce
a new runtime dependency. Browser checks at 1440, 768, 390 and 320 pixels confirm
readable layouts without page-level horizontal overflow. Direct entry is public
without Keycloak requests; cross-links, back/forward, reload, mobile selection,
section focus and missing-page recovery work. Screenshots are retained locally
under `docs/artifacts/workspace-*.png`.

The inline SDK tutorial is syntax-checked and includes assertions and cleanup;
its real-runtime scenario was not rerun for this documentation-only follow-up.
Initial verification used `http://127.0.0.1:19474/#docs/workspaces`; no deployment
was made during the documentation implementation. The maintainer subsequently
requested commit and deployment. The parent plan stays active for its remaining
release gates.

Documentation deployment follow-up:

- [x] Commit the tested documentation and navigation changes (`fa483d3`, pushed).
- [x] Publish a commit-specific web image for the arm64 k0s lab without replacing
      the published `0.5.0-rc.2` artifacts.
- [x] Preserve the installed chart and values; verify that only the web image
      changes before applying the Helm upgrade.
- [x] Verify public documentation, API health and the public Keycloak origin;
      record the deployed source, image digest and Helm revision.

Deployed on 2026-09-07: Helm revision **23**, existing chart `0.5.0-rc.2`, web
source `fa483d3ef60aeeb2440a47be5e6860b242c10fd3`. The new arm64 web image is
`core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.2-docs.fa483d3`, digest
`sha256:a667ca50d1b6d0b6cd99d5dcb4e806b6b6c02455e59eab5f4f395f58125569cb`.
The Helm preflight and post-deployment comparison confirmed only the web image
changed: all other deployment specs and shared/web runtime ConfigMaps are intact.
The web port-forward recovered automatically after a brief 502 during pod handoff.

All four public pages render; desktop/mobile navigation and browser history pass.
Sign-in uses `sb-auth.harakiri.io`, client `harakiri-web`, PKCE S256 and the public
web callback. Web, API health and OIDC discovery return 200. Main CI for the
source commit passed. No backend, Keycloak, provider, npm or published release
artifact was changed. See the [deployment receipt](../../release-notes/0.5.0-rc.2-delivery.md#workspace-documentation-update).

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-07 | Coordinate lease changes under a sandbox row lock and retain the last confirmed provider deadline (migration 036). | Native renewal and control-plane expiry must agree, without extending Harakiri's 10-second TTL to OpenSandbox's longer minimum create lease. An observed native deadline change recovers a renewal whose database commit failed. | Timestamp-only schedule repair (race remains); a new general-purpose lease ownership engine (unnecessary complexity). |
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
- [x] Publish matching npm `next` packages; SDK and CLI rc.3 are published and
      fresh registry-installed consumers passed verification.
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
This remains a stable-release gate, independent of the tested control-plane
candidate. npm authentication was missing at this rc.2 checkpoint; the rc.3
publication checkpoint below records its resolution.

## Tech Debt Incurred

- During rc.4 delivery on September 8, Harbor's health endpoint stayed healthy
  while its storage returned filesystem ENOSPC on uploads. Conservative GC
  recovered 9573 MB of unreferenced data, with untagged artifact/tag deletion
  disabled. Add storage/inode headroom alerts and a reviewed retention/GC policy;
  read-only health is not evidence of publish readiness. The release-triggered
  template workflow had eight upload failures and needs a separate retry after
  capacity planning; no runtime template aliases were promoted.
- Unattended npm trusted publishing still fails its OIDC token exchange. rc.3
  was published using restored local authentication and verified release
  archives; configure and validate CI authorization separately for future releases.
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

### TTL Correction Checkpoint: 2026-09-07

Source implementation and isolated acceptance passed. API renewals, worker
retries, command/session activity and terminal keepalive share one confirmed
lease path. Scheduler selections are rechecked under the sandbox row lock;
stale pause completions and late worker failures cannot resurrect/overwrite
completed state. Migration 036 distinguishes product expiry from the native
minimum create lease and adds an active-deadline index.

Real PostgreSQL acceptance covers 14 lease scenarios plus the existing workspace
reservation suite. Native OpenSandbox acceptance used an isolated database/API/
scheduler and the repository SDK, not BackgroundAgent or Kubernetes exec:

- `sbx_YjCAxjcfx_`: original expiry `18:12:47.151Z`, explicit renewal
  `18:13:22.207Z`; execution after the original expiry succeeded and activity
  renewed it to `18:13:59.213Z`. It then expired without more activity.
- `sbx_FnT_kZ2ijh`: 10-second product TTL expired while the longer native
  creation lease would otherwise still have been active.
- `sbx_PffHzgp563`: a terminal kept a 10-second sandbox alive beyond its
  original expiry, then it expired after detach. All three native runtime IDs
  returned 404 after cleanup.

The reusable `smoke:renew` now crosses the original deadline and verifies final
expiry, instead of only checking a timestamp two seconds after renewal. Public
lifecycle docs, OpenAPI and an operator upgrade/rollback runbook describe the
unreleased correction. Private receipts are in the ignored
`docs/artifacts/ttl-regression-private/` directory. No deployed release is
claimed fixed by these isolated tests.

Final checks: `pnpm test` passed 526 tests; its two PostgreSQL-gated tests were
run separately with the migrated database (19 tests passed). Root typecheck,
production build, documentation links, OpenAPI generation checks, Credential
Vault boundary checks and smoke script syntax passed. The existing web bundle
size warning remains. The isolated PostgreSQL container and temporary forwards
were removed. Public web, API health and Keycloak discovery still returned 200.

### rc.3 Release Execution: 2026-09-07

- [x] Recheck git, cluster and publishing access; only this release's temporary
      resources may be cleaned. Unrelated research documents remain untouched.
- [x] Prepare rc.3 versions and accurate current documentation; retain historical
      receipts. This is a prerelease because the stable gates below remain open.
- [x] Commit and push the TTL correction, pass release CI and publish immutable
      multi-architecture images, Helm chart and matching SDK/CLI archives.
- [x] Publish SDK then CLI to npm `next` after authentication was restored;
      registry bytes match the tested release and fresh consumer checks passed.
- [x] Back up current state, stop the old scheduler, migrate and deploy matching
      binaries while preserving public OIDC origins and existing data.
- [x] Verify the deployed candidate past the original deadline, confirm public
      endpoints/login, clean owned smoke resources and record a delivery receipt.
- [x] Review plan folder placement; archive only plans with all required work
      complete, leaving delivery and unattended-demo acceptance visible.

Delivery evidence: source `3ab3f63`, CI/Harbor passed, immutable tag rc.3 and
matching archives published. Public k0s revision 25 passed packaged SDK renewal
beyond the original deadline, final/short-TTL expiry, terminal keepalive and
packaged CLI JSON output. All three native test runtimes are absent; the test
key is revoked, temporary forwards/browser/consumer removed, and all four
pre-existing workspace records preserved. The full receipt records digests and
the brief API 502 during automatic origin handoff. No zero-downtime claim.

The npm workflow's detached-tag failure was corrected in `6ab8fb5`. A subsequent
run verified packages from the exact release tag but failed npm OIDC exchange
(404). The maintainer then restored local npm authentication as `nabilblk`;
the exact checksum-verified release archives were published SDK first, then CLI.
Both `next` tags now resolve to `0.5.0-rc.3`, while `latest` remains `0.4.0`.
Registry downloads match the archives byte-for-byte; TypeScript/SDK imports and
fresh CLI version/help/dependency checks passed. This release-execution checklist
is complete. CI trusted publishing remains operational debt, not a distribution
blocker, and the parent plan stays active for the stable acceptance below.

#### Stable Acceptance Still Open

In progress. Phase 2B is deployed to the public k0s lab as `0.5.0-rc.3`, Helm
revision 25, with migration 036 and matching digest-pinned images. Source CI and
Harbor release passed. Matching SDK/CLI archives are attached to the GitHub
prerelease and published to npm `next` with registry consumer verification.
npm `latest` stays
at 0.4.0. The OpenSandbox compatibility chart is separately mirrored in Harbor.
Do not archive this plan while stable acceptance gates remain.

Next acceptance is Harakiri-only: Commands default working-directory correction,
fresh restricted OpenShift storage/mount checks, complete template architecture
release checks, and host/rollback recovery validation. No
BackgroundAgent install is needed to complete these gates. Preserve the existing
populated CRC namespace and its data.

CRC currently runs OpenSandbox server `v0.1.14` and controller `v0.1.0`, while
Phase 2B acceptance targets server `v0.2.3` with the current native volume contract.
Do not count checks against this older installation as proof of the new contract,
or upgrade shared runtime dependencies as a side effect of client-project testing.

See the [rc.3 delivery receipt](../../release-notes/0.5.0-rc.3-delivery.md) and
[plan inventory](../README.md). Both active plans still contain required work;
the existing 28 completed/abandoned plans are already in the correct archive.
