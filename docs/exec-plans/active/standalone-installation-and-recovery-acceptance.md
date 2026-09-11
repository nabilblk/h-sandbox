# Execution Plan: Standalone Installation and Recovery Acceptance

**Created**: 2026-09-11
**Author**: Codex with the maintainer
**Status**: In Progress; native client workflow and encrypted recovery passed, provider state-loss/rollback qualification running
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

- [x] A fresh native amd64 Kubernetes installation consumes published, verified
  chart/images/packages and generated operator configuration, without private
  source patches or production credentials.
- [x] Browser OIDC onboarding/login/logout, published CLI/SDK first tasks,
  capacity enforcement, protected routes and retained workspace reuse pass.
- [x] A coherent backup of both databases, workspace files, operator settings
  and wrapping keys is restored into an isolated target. Identity, metadata,
  file integrity and a real encrypted Vault source remain usable.
- [x] Missing and incorrect wrapping keys fail closed without printing secret
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
**Status**: Complete; native run 34658975916

- [x] Add a bounded native amd64 workflow and test-owned bootstrap guards.
- [x] Download exact release assets and verify image/chart/package identity
  against the pinned public manifest; offline-render both actual chart archives.
  Published API/web images have also run on the fresh native amd64 node.
- [x] Install dependencies/runtime/control plane using public reference inputs.
- [x] Complete real OIDC onboarding and create an expiring scoped test key.
- [x] Import the published OpenCode image; prove a model-free task, first file
  write/command, protected route, capacity denial and two-runtime persistence.
- [x] Retain redacted failed attempts and clean only owned resources.

### Phase 2: Coherent Encrypted Recovery
**Status**: Complete; native run 34658975916

- [x] Implement distinct PostgreSQL storage, source database shutdown, empty
  replacement workspace storage, encrypted-envelope fingerprints, key-failure
  cases and actual proxy-injection assertions. These are test definitions, not
  successful recovery evidence.

- [x] Create a nonempty encrypted Vault source for the public HTTPS authentication
  fixture. Prove injection with a published example credential, not an account secret.
- [x] Quiesce writers and attachments; back up both databases, a detached
  workspace, settings and the complete key material at one recovery point.
- [x] Restore into isolated databases/storage; verify OIDC, organization/key
  identity, workspace bytes and credential use through the actual runtime proxy.
- [x] Exercise missing/wrong-key cases before restoring the correct material.
- [x] Demonstrate that a backup catalog alone does not satisfy this phase.

### Phase 3: Interruption and Provider-State Recovery
**Status**: In Progress; interruption passed before the state-loss fixture stopped

- [x] Implement guarded provider API interruption, writer restart, SQL/read API
  ownership observations, once-only command markers and owned binding loss.

- [x] Interrupt the test runtime control-plane service and restart Harakiri
  components while a known owned runtime survives.
- [x] Confirm capacity/workspace ownership remains held during uncertainty and
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

The single-key environment wrapping provider and a public HTTPS authentication
fixture do not certify keyring rotation, external secret stores, private-CA trust
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

- [Run 34658975916](https://github.com/nabilblk/h-sandbox/actions/runs/34658975916)
  passed installation (132s), OIDC onboarding, published CLI/SDK workflow (83s)
  and coordinated encrypted recovery (290s). Actual native OpenCode, file reuse,
  protected routes, capacity denial, missing/wrong-key rejection, restored
  identities and recovered credential injection passed. Provider API loss and
  Harakiri restart retained the once-only command and ownership. The next fixture
  incorrectly demanded `OpenSandbox-Ingress-To` on a `use_server_proxy=true`
  endpoint; upstream deliberately removes that header. Correct it to use the
  returned loopback server-proxy path and egress authentication, with tests
  rejecting foreign origins, identities, ports and redirects. State-loss mutation
  was not reached in this run. Both cleanup layers passed.

- [Run 34658393120](https://github.com/nabilblk/h-sandbox/actions/runs/34658393120)
  captured main-container exit 255 and `exec_format_error`. Anonymous registry
  inspection established the root cause: the harness pinned an ARM64-only lab
  template digest. This is a fixture selection error, not evidence that the
  provider timeout needs changing. The already published catalog index
  `089f32fa775f6b5865a277da8bd00a2dc1d2784e55eb27a7072e22cf2ea1577b`
  includes an AMD64 child `9de3016f67d741ceddc30919a844601d3d549317e6d94d5d2ec4816225611ca3`.
  Select that immutable child and verify manifest/config checksums and native
  architecture before installation. No image build, publication, runtime patch,
  privilege change or timeout extension is needed. Cleanup passed.

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
- [Run 34650133480](https://github.com/nabilblk/h-sandbox/actions/runs/34650133480)
  installed the published bundle and reached the authenticated browser account
  view. The harness incorrectly read `membership.role`; the public contract has
  top-level `role` and `capabilities`. Corrected with regression coverage.
  Separately, stopping a k0s kubectl wrapper did not reliably stop its child,
  and a finalizer exception prevented the failed gate from reaching the receipt.
  Native namespace/private-material cleanup still passed. Corrected by giving
  each owned forward a dedicated process group and always finalizing failed
  receipts, with bounded group cleanup and regression coverage. The incomplete
  earlier receipt must not be interpreted as a successful run.
- Source review found that the initial HTTP credential fixture could not match
  Harakiri's HTTPS-only custom profile. It was replaced with Postman's documented
  HTTPS basic-auth test endpoint and published example credential, using a custom
  Authorization header binding. Direct preflight requires 401 for an invalid
  placeholder and 200 for the documented example. TLS verification stays enabled;
  no private CA, real account secret or provider image modification is introduced.
  External fixture downtime remains a visible acceptance failure. Earlier HTTP
  fixture definitions were not evidence of working encrypted recovery.
- [Run 34650726442](https://github.com/nabilblk/h-sandbox/actions/runs/34650726442)
  passed installation and returned from OIDC login, then timed out during the
  onboarding interaction. Both process-group and namespace/private-material
  cleanup passed; the failed gate now survives in the finalized receipt. Added
  per-interaction markers, known-heading visibility and allowlisted account API
  statuses to diagnose the timeout without uploading DOM, tokens or form values.
- Source inspection identified the onboarding navigation mismatch: the harness
  requested `#dashboard/sandboxes` but then expected the onboarding wizard. The
  application preserves requested deep links; Get started uses `#onboarding`.
  Initial acceptance login now requests onboarding explicitly, while recovery
  login retains the dashboard route. This is a harness correction, not a change
  to the application's return-route behavior; native verification is next.
- [Run 34651529367](https://github.com/nabilblk/h-sandbox/actions/runs/34651529367)
  confirmed the earlier navigation mismatch: all known wizard headings were
  absent on the dashboard, with account/capacity API requests returning 200.
- [Run 34651842257](https://github.com/nabilblk/h-sandbox/actions/runs/34651842257)
  completed browser onboarding, saved workspace settings (200), created its key
  (201), persisted completion (200) and opened the dashboard. Harness revocation
  then received 400 because its empty DELETE advertised JSON content. Corrected
  the bodyless-request helper with regression coverage. Both cleanup layers passed.
- [Run 34652450411](https://github.com/nabilblk/h-sandbox/actions/runs/34652450411)
  passed installation, the complete OIDC/scoped-key gate and OpenCode image
  import. The first asynchronous sandbox timed out after ten minutes; there
  were no runtime pods at failure. Both cleanup layers passed. Added allowlisted
  timeout status, database operation/effect states and platform error categories
  to diagnose stalled provisioning without publishing raw logs or credentials.
  Native task execution and recovery have not yet passed.
- Added a real PostgreSQL queue-claim test, because the earlier native capacity
  test manually claimed an operation before executing it. The normal queue path
  passed in [CI 34654255326](https://github.com/nabilblk/h-sandbox/actions/runs/34654255326);
  this does not establish native provider readiness. Startup event reasons and
  provider HTTP status diagnostics also cover failures whose pods were already
  removed by provider cleanup, without exporting event messages or raw responses.
- [Run 34653918829](https://github.com/nabilblk/h-sandbox/actions/runs/34653918829)
  reproduced the pending timeout. The operation was attempted once and failed;
  its dispatched effect stayed unsettled, its reservation uncertain and held,
  and its workspace attached. No duplicate execution or unsafe release was
  introduced to bypass the failure. Controller logs included permission denial;
  scheduler logs also included an earlier missing-relation error, which alone
  does not establish the cause because dispatch subsequently occurred. Added
  static provider codes and denied-resource names for the next diagnosis.
  Both cleanup layers passed. The queued test-only run 34654255332 was superseded
  before a VM started by GitHub's serialized workflow concurrency policy.
- Recovery fixture review found a legacy fallback: deleting `CREDENTIAL_VAULT_KEY`
  would use the still-present control-plane/registry key. The missing-material
  case now supplies an empty value explicitly, preserving unrelated keys and
  preventing false classification of two wrong-key tests as missing/wrong cases.
  Regression coverage checks this without accessing a cluster; native recovery
  remains unexecuted until the first-runtime gate passes.

## Completion Notes

- [Run 34654783311](https://github.com/nabilblk/h-sandbox/actions/runs/34654783311)
  captured a provider HTTP 504 during the first creation, with Kubernetes image
  pulls/container starts and later cleanup. The earlier scheduler and permission
  warnings did not recur. The reference configuration left the provider's default
  60-second startup deadline implicit. A bounded 180-second deadline and read-only
  startup observations are now under test; this is not yet a confirmed fix.
  The failed run cleaned both owned namespaces and private material successfully.
- [Run 34656885037](https://github.com/nabilblk/h-sandbox/actions/runs/34656885037)
  disproved the longer-timeout hypothesis. At 21 seconds the main `sandbox`
  container had terminated with `Error`; egress was healthy by 30 seconds. The
  workload stayed Pending until provider rollback. Both cleanup layers passed.
  Removed the timeout experiment, added exit-code/bootstrap classifications and
  fail-fast SDK wait cancellation on a nonzero main-container exit. This is a
  failing gate, not an alternative successful execution path. Native recovery is
  still unreached; runtime startup is the current investigation.

In progress. Native installation, OIDC, scoped-client workflow and coordinated
encrypted recovery have passed. The current run must still establish provider
state rehydration, configuration rollback and final key revocation. The milestone remains
in `active/` until those acceptance gates and the separately identified
release-compatibility gate are closed or explicitly rescoped by the owner.
