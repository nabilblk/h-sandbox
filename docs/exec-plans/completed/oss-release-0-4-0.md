# Execution Plan: OSS Release 0.4.0

**Created**: 2026-09-02
**Author**: Codex
**Status**: Completed
**Priority**: P0
**Estimated effort**: 1-2 engineering weeks

## Context
Phase 0 revalidated the September baseline and proved the core Harakiri product
surface is alive: local checks pass, public web/API/auth endpoints are reachable,
the hosted login/logout flow does not use localhost, npm packages install, and
SDK/CLI/runtime conformance passes when the current OpenSandbox egress-sidecar
outage is treated as provider-unavailable.

Phase 1 is therefore an OSS release hardening milestone, not a broad feature
sprint. The goal is to make a new operator or external contributor trust the
project enough to install it, test it, and integrate against it without private
context from this development machine.

2026-09-02 checkpoint: the k0s runtime has been upgraded to the current
OpenSandbox release line, strict SDK/CLI conformance now passes without the
egress waiver, and the token route wait regression found during conformance has
been fixed in the shared SDK URL helper and covered by CLI tests.

The September report defines Phase 1 as "OSS Release 0.4.0":

- upgrade OpenSandbox to current stable components
- remove normal-runtime Kubernetes fallback ambiguity
- add provider capability health metadata
- gate CI on real product tests
- fix the release artifact story
- clean OpenShift one-namespace installation docs
- publish honest release notes for supported and unsupported capabilities

Important Phase 0 findings that this plan must close or explicitly scope:

- k0s is running older OpenSandbox components:
  server `v0.1.14`, execd `v1.0.17`, egress `v1.0.12`, chart `0.1.0`.
- OpenSandbox releases checked on 2026-09-02 show newer stable artifacts:
  server `0.2.3`, Helm chart `0.2.2`, execd `1.1.0`, and egress `1.1.7`.
- Strict mutable egress was unhealthy in the Phase 0 k0s runtime because the
  OpenSandbox egress image pull is stuck; Harakiri stores the policy, but
  `PATCH /v1/sandboxes/:id/egress` returns `egress_provider_unavailable`.
- Phase 0 k0s was running an older kustomize-shaped Harakiri deployment.
  `/config.js` was blank, and the Helm web-runtime ConfigMap shape was not
  deployed.
- OpenShift/CRC was not live-validated in Phase 0 because CRC/OpenShift were
  stopped and `oc` was not available on PATH.
- Several active exec plans were already complete and have been archived to
  reduce backlog noise.

Related active plans:

- `docs/exec-plans/active/opensandbox-control-plane-boundary.md`

Related completed baseline:

- `docs/exec-plans/completed/september-wake-up-validation.md`
- `docs/exec-plans/completed/egress-control-developer-experience.md`
- `docs/exec-plans/completed/opencode-agent-template.md`
- `docs/test-report.md`

## Remaining Active Plan Scope Mapping

`opensandbox-control-plane-boundary.md` is release-critical for 0.4.0. Phase 1
must finish or explicitly defer its boundary test allowlists, RBAC separation
notes, provider capability health metadata, browser terminal attach ticket
checks, documentation checklist, and deployed verification.

`egress-control-developer-experience.md` is now archived as completed. Phase 0's
runtime enforcement failure was closed by the OpenSandbox upgrade plus the
create-time no-op `networkPolicy` fix, and strict conformance now passes without
the egress waiver.

`opencode-agent-template.md` is now archived as completed for the first template
slice. Its deferred platform-catalog decisions belong to a later template-catalog
phase unless the OpenSandbox upgrade breaks the existing template smoke.

## Pre-Implementation Dirty Worktree Ownership

Recorded on 2026-09-02 before continuing Phase 1:

- Phase 0 validation artifacts are owned by the September wake-up work:
  `docs/test-report.md`, `tests/conformance/cli-runtime-smoke.sh`, and
  `docs/exec-plans/completed/september-wake-up-validation.md`.
- Backlog hygiene changes are owned by this 0.4.0 release plan: the archived
  exec-plan moves and this new active plan file.
- Deployment-drift fixes are in scope for 0.4.0 because they address release
  trust directly: Helm web runtime ConfigMap, unprivileged nginx port, k0s Lima
  resource/port updates, and the OpenSandbox no-op egress policy omission.
- OpenShift scratch assets under `OCP-install/` are environment-specific
  working files until converted into the official one-namespace install docs.
  Local chart archives under `OCP-install/charts/` stay ignored.
- `CLAUDE.md` is a local contributor guide candidate, not a release-critical
  artifact unless promoted into the public docs.

## Scope
Phase 1 is complete when Harakiri can be installed and verified from its
documented artifacts as a credible OSS 0.4.0 release candidate.

This means:

- source and runtime boundaries are clear
- CI fails on meaningful product regressions
- install docs match the actual artifact story
- public hosted deployment cannot regress to localhost OIDC URLs
- egress is either working end to end on supported OpenSandbox versions or
  explicitly reported as unavailable with capability metadata
- the release notes explain exactly what is supported, degraded, and planned

## Non-Goals
- Do not add Python SDK, MCP server, OpenAI/LangChain adapters, or framework
  integrations in Phase 1. Those belong to the integration phase after the OSS
  baseline is trustworthy.
- Do not add pause/resume, snapshots, pools, volumes, or credential vault UX
  unless they are needed to validate the OpenSandbox upgrade and are exposed
  only as capability-gated follow-up notes.
- Do not implement Harakiri-owned Kubernetes exec/log/filesystem shortcuts for
  normal sandbox runtime behavior.
- Do not introduce a second runtime provider in this release.
- Do not hide provider failures behind fake success states.

## Success Criteria
- [x] Completed/stale active exec plans are archived; remaining active plans are
      genuinely unfinished and referenced by this release plan.
- [x] OpenSandbox chart and component versions are upgraded or pinned to the
      latest verified stable release, with all image sources documented.
- [x] Runtime egress mutation is live-tested. If working, strict conformance runs
      without `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE=1`; if not
      working, the capability health endpoint and UI/SDK/CLI report it honestly.
- [x] k0s deploy path uses the same Helm/runtime config model expected by the
      chart, and hosted `/config.js` or equivalent runtime config is non-empty
      and public-host correct.
- [x] Public hosted login/logout/onboarding browser smoke confirms no localhost
      OIDC/API calls.
- [x] Normal runtime source paths remain free of direct Kubernetes
      `pods/exec`, `kubectl exec`, direct pod log attach, and pod filesystem
      scraping.
- [x] Provider capability health distinguishes at least `available`,
      `degraded`, `unavailable`, and `unsupported`, with stable machine-readable
      reasons for egress, logs, files, metrics, routes, terminal attach, and
      lifecycle.
- [x] CI runs API tests, web tests, shared tests, SDK tests, CLI tests, OpenAPI
      drift checks, package install smoke, Helm lint/render, and a provider-free
      or provider-backed conformance path.
- [x] Release artifact documentation lists exact npm packages, container images,
      Helm chart coordinates, OpenSandbox mirror strategy, and template image
      coordinates.
- [x] OpenShift one-namespace install documentation is patch-free by default and
      describes unavoidable runtime/security constraints explicitly.
- [x] `docs/test-report.md` contains the 0.4.0 release validation evidence with
      commands, versions, public URLs, smoke sandbox IDs, and known limits.

## Phases

### Phase 1: Backlog Hygiene And Release Baseline
**Status**: Complete
- [x] Archive already-complete active plans:
      `build-harakiri-sandbox-prototype.md`,
      `egress-control-developer-experience.md`,
      `frontend-oidc-session-hardening.md`,
      `opencode-agent-template.md`,
      `premium-integration-03-runtime-metadata.md`,
      `premium-sandbox-integration-offer.md`, and
      `opencode-sdk-premium-parity.md`.
- [x] Re-read the remaining active plans and mark which tasks are in scope for
      0.4.0 versus later phases.
- [x] Record current dirty worktree ownership before implementation continues.
- [x] Decide whether 0.4.0 includes the currently uncommitted OpenShift/Helm
      files or whether they are split into a separate install-hardening commit.
- [x] Add a short `0.4.0` release checklist to the docs or this plan so the
      project has one source of truth during the release pass.

### Phase 2: OpenSandbox Upgrade And Runtime Compatibility
**Status**: Complete
- [x] Verify the latest stable OpenSandbox release artifacts immediately before
      implementation.
- [x] Upgrade local/k0s OpenSandbox chart and component pins from the old
      `0.1.x` generation to the selected stable `0.2.x`/`1.1.x` generation.
- [x] Prefer GHCR or the documented mirrored registry path over the slow/stuck
      Aliyun egress pull path where possible.
- [x] Update k0s, OpenShift, and Harbor mirror values consistently.
- [x] Run OpenSandbox health, create/run, execd files, command sessions, PTY,
      metrics, logs, ingress routes, and egress GET/PATCH smoke tests.
- [x] Record any upstream API contract drift and adjust Harakiri provider code
      only through `RuntimeProvider` and OpenSandbox provider modules.

### Phase 3: Egress Health And Capability Truth
**Status**: Complete
- [x] Reproduce current egress failure on the pre-upgrade baseline and capture
      provider error shape from Phase 0 validation evidence.
- [x] Validate restricted egress at sandbox creation after the OpenSandbox
      upgrade.
- [x] Validate runtime `GET /policy` and `PATCH /policy` through the egress
      sidecar after the OpenSandbox upgrade.
- [x] Add capability health state for egress so Harakiri can distinguish stored
      policy from enforceable runtime policy.
- [x] Make UI/SDK/CLI output explicit when egress is stored but not enforceable.
- [x] Remove the conformance waiver from release validation once strict egress
      works; otherwise keep the waiver only in degraded-mode tests and document
      the limitation.

### Phase 4: Deployment Model Convergence
**Status**: Complete
- [x] Audit k0s deploy scripts, Helm chart values, and public deploy scripts for
      runtime config divergence.
- [x] Make Helm the authoritative install/deploy model for Harakiri where
      practical.
- [x] Fix the web runtime configuration design so the container does not depend
      on writing into immutable nginx document roots at startup.
- [x] Ensure public deploy values always set public web/API/Keycloak URLs and
      issuer allowlists.
- [x] Add a smoke that fails if hosted browser resources call `localhost` or
      `127.0.0.1`.
- [x] Verify local and public deployments after the convergence change.

### Phase 5: Runtime Boundary And Capability Hardening
**Status**: Complete
- [x] Finish `opensandbox-control-plane-boundary.md` tasks that are release
      critical.
- [x] Extend source-level boundary tests with readable allowlists for
      builder/admin Kubernetes usage.
- [x] Keep OpenSandbox provider RBAC separate from Harakiri runtime API RBAC in
      docs and manifests.
- [x] Add capability health metadata to API/shared types/OpenAPI/SDK/CLI/UI.
- [x] Verify browser terminal attach continues to use Harakiri-issued
      short-lived tickets and does not expose provider headers.
- [x] Run boundary scan and include the result in `docs/test-report.md`.

### Phase 6: CI Trust And Release Gates
**Status**: Complete
- [x] Update CI to run shared, API, web, SDK, and CLI tests.
- [x] Run OpenAPI drift checks in CI.
- [x] Run package install smoke for `@h-sandbox/sdk` and `@h-sandbox/cli`.
- [x] Run Helm lint/render with production-like values.
- [x] Add a provider-free conformance path using the explicit dev runtime
      provider, or document why a real-provider nightly job is required.
- [x] Add a release dry-run job that builds images, charts, and npm packages
      without publishing.
- [x] Ensure CI output is understandable to outside contributors.

### Phase 7: Artifact And Install Documentation
**Status**: Complete
- [x] Document all release artifacts:
      Harakiri images, Harakiri Helm chart, npm packages, OpenSandbox chart,
      OpenSandbox images, template images, and optional BackgroundAgent
      integration artifacts.
- [x] Clarify which artifacts are Harakiri-owned and which are mirrored upstream
      OpenSandbox artifacts.
- [x] Clean OpenShift one-namespace docs so the default install path is ordered,
      patch-free, and copy/pasteable.
- [x] Document Harbor/internal-registry mirroring as a repeatable release step.
- [x] Document Keycloak realm/client/email prerequisites without embedding
      environment-specific secrets.
- [x] Document rollback and uninstall commands.

### Phase 8: Release Validation And Notes
**Status**: Complete
- [x] Run local checks:
      `pnpm install --frozen-lockfile`, `pnpm openapi:check`,
      `pnpm templates:check`, `pnpm examples:check`, `pnpm test`,
      `pnpm typecheck`, `pnpm build`, `pnpm package:assert`,
      `pnpm publish:local-check`, `pnpm publish:postcheck`, Helm lint/render,
      and `git diff --check`.
- [x] Deploy the release candidate to k0s.
- [x] Verify public endpoints:
      `sb.harakiri.io`, `sb-api.harakiri.io`, and `sb-auth.harakiri.io`.
- [x] Browser-test hosted login, dashboard redirect, docs, templates, logout,
      and localhost-resource absence.
- [x] Run strict SDK/CLI conformance against k0s; if strict egress is not
      available, run degraded conformance and record the exact capability state.
- [x] Smoke CLI attach, routes, files, logs, metrics, and template use.
- [x] Update `docs/test-report.md`.
- [x] Draft 0.4.0 release notes with supported features, known limitations,
      upgrade notes, artifact URLs, and install verification commands.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-02 | Phase 1 is OSS release hardening, not broad feature expansion. | Phase 0 showed the MVP is alive but still has trust gaps: OpenSandbox drift, egress sidecar outage, deployment-model drift, CI gaps, and install artifact ambiguity. | Start Python SDK/MCP/templates immediately; continue feature work without stabilizing release foundations. |
| 2026-09-02 | Archive completed active plans before implementation. | A noisy active backlog weakens handoff quality and makes it hard to see what still blocks 0.4.0. | Leave all historical plans in active and rely on memory to know which are done. |
| 2026-09-02 | Keep `egress-control-developer-experience.md` active despite V1 status. | Phase 0 found runtime egress mutation is not healthy on the current deployment, so release validation still needs to close or explicitly degrade this area. | Archive it as complete and track egress only inside this release plan. |
| 2026-09-02 | Include Helm web-runtime config and OpenSandbox deploy pin updates in the 0.4.0 release pass. | These changes remove deployment drift that caused localhost/public config regressions and the stale Aliyun egress image pull failure. | Split them into a separate install-hardening commit before release work. |
| 2026-09-02 | Use Docker Hub OpenSandbox images as default install pins and Harbor mirror paths for air-gapped installs. | Docker Hub manifests are public and multi-arch from this machine; GHCR coordinates are listed by upstream for some components but returned unauthorized here, and Aliyun was the source of the stuck egress pull. | Keep Aliyun defaults; use GHCR defaults; require local source builds for ingress. |
| 2026-09-02 | Always send an OpenSandbox `networkPolicy` when Harakiri creates a sandbox with an egress policy, even for `open` mode. | OpenSandbox injects the mutable egress sidecar only when `networkPolicy` exists at creation time; omitting the no-op policy made later open-to-restricted mutation fail. | Keep open-mode create bodies smaller and report runtime mutation as unavailable later. |
| 2026-09-02 | Treat route wait paths as relative to the complete route URL path. | Token routes may be API route-proxy URLs, not origin-root hosts; stripping the proxy path caused `harakiri expose --wait` to probe the API root and return 401. | Require callers to pass full URLs for route-proxy readiness checks. |
| 2026-09-02 | Add `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY` and set it to `0` only in the restricted OpenShift profile. | k0s needs the no-op allow-all policy to keep runtime egress mutable; restricted OpenShift needs open-network sandboxes to avoid the NET_ADMIN egress sidecar when SCC changes are not allowed. | Disable egress entirely in all installs; require SCC changes for every OpenShift sandbox; keep one behavior and document that one platform is broken. |
| 2026-09-02 | Make the k0s Harakiri deploy path install the control plane through the Helm chart. | Contributors and operators should validate the same app artifact shape; the previous kustomize path drifted from the chart and required post-deploy ConfigMap patches. | Keep k0s on raw manifests; adopt existing raw resources into Helm despite immutable selector drift; maintain two parallel deploy models. |
| 2026-09-02 | Add a provider-free `pnpm conformance:dev` lane that starts the API with the explicit dev runtime provider and runs the existing packed SDK/CLI conformance scripts. | CI needs an OSS-friendly public package/API contract check that does not require Kubernetes, OpenSandbox, Cloudflare, or maintainer credentials. Real OpenSandbox compatibility remains covered by k0s/public conformance. | Require every CI run to provision a real OpenSandbox cluster; create a second weaker conformance suite that does not install package tarballs. |
| 2026-09-02 | Send the CLI terminal `connected` frame only after the provider PTY is open. | A live attach smoke exposed a race where piped CLI input could arrive before the OpenSandbox upstream socket registered input listeners, dropping the first commands. Moving readiness to the provider bridge makes `harakiri attach --no-raw` deterministic without adding Kubernetes exec fallback. | Add CLI-side sleeps; buffer stdin in the API service layer; bypass OpenSandbox through Kubernetes exec. |

## Tech Debt Incurred
None from the OpenSandbox upgrade, egress fix, Helm convergence, terminal attach
race fix, or CI conformance additions. Remaining inherited release debt:

- OpenShift one-namespace documentation still needs a clean live verification
  pass before it can be treated as a release artifact.
- Template image publishing is documented but not automated as a first-class
  release workflow yet. `open-agents-dev` is validated by digest, but templates
  still need a dedicated release/mirror pipeline before external handoff.

## Completion Notes
OSS 0.4.0 release hardening is complete as a release-candidate baseline. The
runtime now targets the current OpenSandbox `0.2.x`/`1.1.x` line, strict
egress-capable conformance passes against k0s, Helm is the authoritative
Harakiri deployment model, hosted web runtime config no longer exposes loopback
URLs, and CI has provider-free SDK/CLI conformance plus release dry-run gates.

The deployed k0s/public validation covered local tests, package checks, Helm and
kustomize renders, public API/auth/web endpoints, hosted OIDC login/logout,
strict SDK/CLI conformance, filesystem, routes, tracked processes, template
catalog smoke, and interactive CLI attach through OpenSandbox PTY. Evidence is
recorded in `docs/test-report.md`, and release notes live at
`docs/release-notes/oss-0-4-0.md`.
