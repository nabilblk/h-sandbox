# Execution Plan: Standalone Installation and Recovery Acceptance

**Created**: 2026-09-11
**Author**: Codex with the maintainer
**Status**: In Progress; PR 42 native installation passed, browser onboarding under diagnosis
**Priority**: Next owner-approved milestone
**Estimated effort**: Several engineering sessions, bounded by real acceptance evidence

## Context and Authority

The owner selected point 3 of the agreed five-point prioritization: independently
installable and recoverable Harakiri, after discoverable Kubernetes documentation
and real organization execution admission. This scope comes from that conversation
and the North Star, not unfinished checkboxes in older plans. No other active
plan or linked Brain note is an input to this work.

The baseline is published `0.5.0-rc.9`, source
`f626226e4a0a1f2c53274214842dca0e42d2b0cb`. Its
[delivery receipt](../../release-notes/0.5.0-rc.9-delivery.md) establishes
published-client arm64 acceptance and upgrade, not a new native amd64 install or
encrypted Vault recovery. Preserve the narrower earlier evidence; do not repeat
the whole product history or reimplement working capacity/readiness features.

The owner explicitly requires no conflict with the running local k0s cluster or
other machine processes. Destructive tests belong to a disposable remote runner,
never the populated lab, customer cluster, local databases or Docker daemons.
The owner approved a dedicated acceptance branch/PR and native amd64 tests on
an isolated GitHub-hosted runner. This authorizes focused fixes and repeat runs
on that branch, not merging it. No release, stable-tag promotion or public-lab
deployment is part of this milestone without separate authorization.

## Success Criteria

- [ ] A fresh native amd64 Kubernetes installation consumes published, verified
  chart/images/packages and generated operator configuration, without private
  source patches or production credentials.
- [ ] Browser OIDC onboarding/login/logout, published CLI/SDK first tasks,
  capacity enforcement, protected routes and retained workspace reuse pass.
- [ ] A coherent backup of both databases, workspace files, operator settings
  and wrapping keys is restored into an isolated target. Identity, metadata,
  file integrity and a real encrypted Vault source remain usable.
- [ ] Missing and incorrect wrapping keys fail closed without printing secret
  payloads, injecting credentials or silently replacing the encrypted source.
- [ ] Provider interruption/state-loss and control-plane restarts preserve
  execution reservations and workspace ownership; recovery does not duplicate
  workloads or release capacity before authoritative absence.
- [ ] A documented compatible upgrade/rollback path is exercised with existing
  state. No pre-capacity writer is reopened against migration 038.
- [ ] Public operator documentation contains executable procedures, support
  limits and a sanitized receipt. Failures are retained beside corrections.
- [ ] Test resources and credentials are cleaned; the public lab, tunnel and
  unrelated local processes remain untouched and their read-only health checks
  still pass.

## Non-Goals

- Customer OpenShift/BackgroundAgent installation or changes to SCCs.
- A new runtime provider, all template brands, native pause/snapshot claims,
  HA/CSI certification, usage metering or Python implementation.
- Reading other Brain notes, modifying existing active plans, pruning shared
  Docker/Harbor storage or upgrading running local infrastructure.
- Making an unavailable model provider a prerequisite for deterministic tests.
- Publishing packages, replacing existing tags/digests, or deploying changes to
  the public lab merely because acceptance finds a defect.

## Safety and Evidence Contract

1. Linux/amd64 acceptance runs on an ephemeral GitHub-hosted runner. No
   self-hosted runner label, production environment or publishing secret.
2. The bootstrap refuses macOS, ARM, inherited Kubernetes contexts, occupied
   control-plane ports and existing k0s state. Mutation commands always use an
   explicit test kubeconfig and verify a recorded cluster UID/ownership marker.
3. Install one runtime controller in the new cluster. Separate namespace names
   alone do not isolate cluster-wide CRDs/controllers from the public lab.
4. Generate fresh operator/database/runtime/Vault credentials into a private
   directory. Never print Secrets, Helm values containing credentials, raw
   HTTP authorization URLs, encrypted backup payloads or access tokens.
5. Runtime work uses Harakiri/provider APIs only. Kubernetes operator access is
   limited to platform installation, explicit fault injection, backup/restore
   and read-only infrastructure evidence, not sandbox execution/files/logs.
6. Destructive commands require the test cluster identity, recorded owned
   namespace/resource and a coherent backup when appropriate. No broad host
   pruning or cleanup of unidentified resources.
7. Phase steps run sequentially. Tests stop on a failed safety invariant;
   arbitrary create, command and write mutations are not retried to hide failure.
8. CI exports only allowlisted, sanitized summaries. Private recovery material
   is not uploaded as a public Actions artifact. A checksum match is not a claim
   of cryptographic OCI signing or full supply-chain clearance.

## Phases

### Phase 0: Read-Only Isolation Assessment
**Status**: Complete

- [x] Confirm source baseline and preserve unrelated untracked `docs/cot/`.
- [x] Read host CPU, memory pressure, disk, listeners and named VM status without
  stopping or altering any process.
- [x] Verify public web/API/OIDC read-only baseline.
- [x] Select remote native amd64 acceptance to avoid local contention and falsely
  describing emulated execution as native.

At assessment the Mac has 20 CPUs, 128 GiB RAM and approximately 185 GiB disk
available. The public `harakiri-k0s` VM is running (8 CPUs/16 GiB); the older
acceptance VM is stopped. Two Colima profiles and other applications are active.
No local fixture is started. Public web, API health and OIDC discovery returned
200, with the expected public issuer. These readings are a point-in-time safety
baseline, not an availability or resource-capacity guarantee.

### Phase 1: Guarded Fresh Installation and Native Workflow
**Status**: In Progress

- [x] Add a bounded native amd64 workflow and test-owned bootstrap guards.
- [x] Download exact release assets and verify image/chart/package identity
  against the pinned public manifest; offline-render both actual chart archives.
  Application images have not yet been pulled/executed by this harness.
- [ ] Install dependencies/runtime/control plane using public reference inputs.
- [ ] Complete real OIDC onboarding and create an expiring scoped test key.
- [ ] Import the published OpenCode image; prove a model-free task, first file
  write/command, protected route, capacity denial and two-runtime persistence.
- [ ] Retain redacted failed attempts and clean only owned resources.

### Phase 2: Coherent Encrypted Recovery
**Status**: Harness implemented; native acceptance not executed

- [x] Implement distinct PostgreSQL storage, source database shutdown, empty
  replacement workspace storage, encrypted-envelope fingerprints, key-failure
  cases and actual proxy-injection assertions. These are test definitions, not
  successful recovery evidence.

- [ ] Create a nonempty encrypted Vault source and an owned deterministic
  credential-check service. Prove injection without revealing the real secret.
- [ ] Quiesce writers and attachments; back up both databases, a detached
  workspace, settings and the complete key material at one recovery point.
- [ ] Restore into isolated databases/storage; verify OIDC, organization/key
  identity, workspace bytes and credential use through the actual runtime proxy.
- [ ] Exercise missing/wrong-key cases before restoring the correct material.
- [ ] Demonstrate that a backup catalog alone does not satisfy this phase.

### Phase 3: Interruption and Provider-State Recovery
**Status**: Harness implemented; native acceptance not executed

- [x] Implement guarded provider API interruption, writer restart, SQL/read API
  ownership observations, once-only command markers and owned binding loss.

- [ ] Interrupt the test runtime control-plane service and restart Harakiri
  components while a known owned runtime survives.
- [ ] Confirm capacity/workspace ownership remains held during uncertainty and
  no second execution is admitted or silently provisioned.
- [ ] Remove only the owned provider Vault entry via its administrative API,
  then prove normal inspection/rehydration restores the desired binding.
- [ ] Verify native identity, first task and credential use after recovery,
  then confirmed termination and slot release.

### Phase 4: Upgrade, Documentation and Closure
**Status**: Runbook and configuration-rollback harness implemented; release-pair gate open

- [x] Add a genuine Helm resource-request upgrade/rollback check within rc.9,
  explicitly separate from cross-release or schema compatibility evidence.
- [x] Add coordinated recovery documentation and link it from the public
  Kubernetes source article and reference installation guide. Not deployed.

- [ ] Select a genuinely capacity-compatible rollback pair; do not infer
  compatibility from chart revision numbers or use pre-capacity rc.8.
- [ ] Exercise preservation of keys/origins/state and explicit writer ordering.
- [ ] Publish technical/operator procedures and a current supported-profile
  table, with real commands and exact release evidence.
- [ ] Correct defects with focused regression coverage. A changed source build
  is recorded separately from acceptance of published rc.9 artifacts.
- [ ] Verify cleanup, retained evidence and unchanged public-lab health; close
  this new plan only when the criteria pass or the owner explicitly rescope them.

## Implementation Boundaries

Keep the harness under `infra/acceptance/`, separate from shipped runtime code
and ordinary source-unit tests. Use the existing `infra/preview/` configuration
and standard Helm/kubectl commands. Split cluster safety, artifact installation,
browser/operator setup, workload assertions and recovery into readable modules.
Do not turn a test harness into a second installer or runtime adapter.

Use published SDK/CLI packages in a clean consumer directory. SDK method parity
does not justify raw SQL fixture creation for the ordinary onboarding workflow.
Operator backup/restore may inspect structured database state privately; normal
credential use and sandbox lifecycle must remain behind their public contracts.

## Verification

- Local guard/manifest/configuration tests must make no cluster mutations.
- CI runner identity, architecture, cluster UID and artifact versions are part
  of every native receipt. Linux containers on an ARM host are not native amd64.
- Test output uses booleans, counts, statuses, checksums and owned IDs; never
  credential values. No public artifact contains a backup or kubeconfig.
- UI tests use the real deployed browser/API/Keycloak chain, not intercepted auth
  fixtures. Session and key cleanup occurs before the runner is destroyed.
- All expensive work is sequential on the isolated runner. Monitor its disk and
  memory; fail clearly if insufficient, without changing the user's machine.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-11 | Fresh scope from the approved milestone, no older plan inputs | Avoid roadmap drift and redundant implementation | Resuming historical unchecked matrices |
| 2026-09-11 | Prefer a disposable native amd64 hosted runner | Real architecture proof without local k0s/process contention | Another local VM, emulated amd64, testing in populated lab |
| 2026-09-11 | Published application bundle, separate versioned harness | Distinguish install evidence from unpublished code fixes | Rebuilding all images before acceptance |
| 2026-09-11 | Owner authorized the isolated GitHub runner and dedicated branch/PR | Run destructive acceptance without touching the Mac or its services | Local or shared-cluster execution remains excluded |

## Sources

- [Public Kubernetes entry point](../../install-kubernetes.md)
- [Standalone reference profile](../../../infra/preview/README.md)
- [Vault operations](../../credential-vault-operations.md)
- [rc.9 delivery](../../release-notes/0.5.0-rc.9-delivery.md)
- [GitHub-hosted runner isolation and hardware](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [k0s single-node installation](https://docs.k0sproject.io/stable/cli/k0s_install_controller/)

## Tech Debt Incurred

The workflow deliberately leaves `releaseCompatibility` as `not_tested`: rc.8
predates capacity admission and no distinct compatible published pair has been
selected. Same-image Helm rollback must not close that release gate.

The reference catalog is initially empty, while the onboarding first-task
button hardcodes `python-3.12`. The harness exercises identity/key onboarding,
then imports OpenCode and runs CLI/SDK tasks; it does not validate that hardcoded
button. Resolve or explicitly scope this first-install UX gap before declaring
the whole onboarding experience accepted. No runtime/UI fix is claimed here.

The single-key environment wrapping provider and an owned HTTP credential
fixture do not certify keyring rotation, external secret stores, TLS trust
policies, a different CSI driver, restore of live ambiguous inventory, or
automatic timed Vault reconciliation.

After an approved native run, investigate any failure from its allowlisted
receipt and rerun on a fresh runner. Never upload raw Secrets, logs, backups or
browser state to unblock diagnostics.

## Local Verification Checkpoint

- Published rc.9 manifest SHA-256 verified against `versions.json`.
- Both actual GitHub chart archives passed their checksums, Helm lint and
  offline render using an empty kubeconfig: 15 Harakiri and 20 provider objects.
  Exact API/web image references and provider port 8080 checked. No cluster calls.
- Both public npm tarballs passed SHA-512 integrity, installed anonymously in a
  temporary consumer with lifecycle scripts disabled, imported through ESM and
  exposed the required public methods. CLI reported `0.5.0-rc.9`. No sandbox/API
  request or browser process was started; the temporary consumer was removed.
- Local isolation/contract/reference/boundary checks and the public Kubernetes
  documentation tests passed. The scoped harness secret scan is clean.
- Public web/API/OIDC rechecked at the end of preparation: HTTP 200, expected
  public issuer. The five baseline tunnel/forward PIDs are unchanged. The lab
  k0s VM is still running at 8 CPUs/16 GiB; the older acceptance VM stays stopped.
- At the end of local preparation, no commit, remote branch, PR, native workflow,
  publication or deployment had started. The owner subsequently approved the
  dedicated acceptance branch/PR and isolated runner; remote execution is next.

## Native Execution Log

- [PR 42](https://github.com/nabilblk/h-sandbox/pull/42) contains the dedicated
  acceptance branch. No merge, publication or public-lab deployment is requested.
- [Run 34649412463](https://github.com/nabilblk/h-sandbox/actions/runs/34649412463)
  failed before application installation: fresh k0s advertised the hosted VM's
  interface address instead of localhost. The guard refused it, and private
  bootstrap material was removed. No cluster UID was recorded, so cleanup
  refused cluster mutation and left VM disposal to GitHub. No recovery receipt
  exists for this attempt; retain the failed bootstrap log as evidence.
- Correction: localize only the freshly generated kubeconfig after checking its
  advertised address belongs to this runner. Preserve its CA/client identity
  and validate the complete result before any cluster operation. Subsequent
  operations still require localhost plus the recorded cluster UID/owner label.
- [Run 34649588659](https://github.com/nabilblk/h-sandbox/actions/runs/34649588659)
  passed native bootstrap and anonymous published-bundle installation, including
  the web/API/OIDC endpoint checks. Browser onboarding failed immediately with
  an initially withheld exception. All application pods were ready in the
  sanitized diagnostic; cleanup passed and private material was removed. Recovery
  was not reached. Added static browser progress markers and allowlisted failure
  categories, and moved forwards after browser dependency installation. The
  initial report does not establish the browser failure's root cause.

## Completion Notes

In progress. Local preparation is verified, but no native installation or
destructive recovery has been performed. The milestone must remain in `active/`
until real acceptance and the separately identified release-compatibility gate
are closed or explicitly rescoped by the owner.
