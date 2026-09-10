# Execution Plan: Harakiri OSS Developer Preview Launch

**Created**: 2026-09-08
**Author**: Codex
**Status**: In Progress - public launch delivered; operating handoff and adoption follow-up remain
**Priority**: {P0-P3}; owner selected this as the next milestone, numerical priority not assigned
**Estimated effort**: Multiple engineering sessions plus independent evaluation; refine after publication audit

## Current Checkpoint: September 10

The owner reports that the LinkedIn and X announcements are published and
reception is positive. Record this as owner-reported publication, not an agent
post or a measured adoption result. Post URLs, exact publication timestamps,
audience counts and consented second-week outcomes were not supplied. The prior
owner-confirmed independent evaluation stays accepted; do not restart that gate.

Source publication, the named rc.8 native preview, credential handoff,
documentation and the complete-frame UI tour are delivered. Remaining work is
notification/mailbox receipt, the broader live member acceptance matrix and G4
adoption outcomes. Keep this plan active for those items, not for publication
tasks already completed. Atomic admission and actual usage history remain engineering
follow-ups: truthful disclosure shipped, enforcement/metering did not.

See the [current plan inventory](../README.md),
[rc.8 receipt](../../release-notes/0.5.0-rc.8-delivery.md),
[public-source receipt](../../release-notes/2026-09-09-public-launch.md) and
[UI tour/sidebar receipt](../../release-notes/2026-09-09-ui-product-tour-delivery.md).
This documentation update performs no deployment, release, mail test or outreach.

## Context

The owner approved making the OSS launch the next global milestone after
authorization consolidation and rc.4 delivery. Do not make opening the source
depend on completing every production-readiness feature. Equally, a preview
label does not excuse exposed secrets, misleading controls, or an installation
that requires maintainer credentials and private patches.

Launch **Harakiri OSS Developer Preview** around its existing strength: a
sandbox control plane for running agents against private code and data,
with explicit access policy, persistent working files, and coherent API, CLI,
TypeScript SDK and dashboard workflows. This is a self-hosted developer preview,
not a managed-service SLA, a general agent framework, or certified multi-tenant
production support.

September 9 positioning clarification: Harakiri is the product and owns the
sandbox control-plane contract. OpenSandbox is the current runtime adapter,
not the product identity or a permanent runtime dependency. The provider
interface permits future implementations; only the current adapter is supported
for real execution today. Do not advertise unimplemented provider portability.

September 9 credential authorization: rotate the owned Harakiri lab's human
admin, Keycloak recovery, PostgreSQL, runtime connection and Vault wrapping
credentials. Deliver replacements in an owner-only file outside Git and the
Obsidian vault. Preserve identities, API keys, workloads, encrypted data, SMTP
and public OIDC origins. This does not authorize changing personal npm, GitHub
or Harbor accounts. Preflight found that the lab Keycloak H2 database has no
persistent volume; preserve and verify that database before any pod replacement.

The target outcome is three independent teams installing and completing a useful
workflow, with second-week use and support interventions recorded. Source
publication and the public announcement are distinct gates; the three-team
target is a post-launch outcome, not a prerequisite to opening the repository.

### Evidence Baseline

Planning baseline: `3cac386fb4bc0ca2ef9c0f4ce9be8ab4141d75cb`, September 8.
Only unrelated `docs/cot/` was untracked. This planning session read source,
plans, release evidence and GitHub repository metadata; it did not perform a
history/security audit, anonymous image pulls or a fresh cluster installation.

| Area | Observed evidence | Consequence for launch |
| --- | --- | --- |
| Authorization | [rc.4 receipt](../../release-notes/0.5.0-rc.4-delivery.md): scoped principals, migration 037, live Keycloak/OpenSandbox and browser acceptance | Preserve and rerun on the launch candidate; do not implement a second permission system |
| Distribution | Receipt records npm rc.4 on `next`, stable `0.4.0`, Harbor images/chart and k0s revision 28 | Existing packages are real; independent artifact consumption and one coherent launch bundle still need proof |
| Web source | rc.4 API/chart source `398b9ed`; corrected web source `0c4d47c` has a distinct image | Use the [exact overlay](../../release-notes/0.5.0-rc.4-values.yaml) for this baseline; never imply the original rc.4 chart default includes that correction |
| Repository | GitHub reports `nabilblk/h-sandbox` PRIVATE, an empty description and license classification `Other` | Publication is not already done. Review license recognition against the Apache-2.0 text, not an automatic legal conclusion |
| Community files | README, CONTRIBUTING, SECURITY, code of conduct, issue/PR templates and CI exist | Improve them in place, rather than scaffold a second contributor system |
| Contributor friction | CONTRIBUTING names the old `@harakiri/cli` and `@harakiri/sdk` packages; development docs include an old tarball version | Execute and correct the real newcomer path |
| Security reporting | SECURITY says to email maintainers without providing an address, and has a vague supported-version policy | Assign and verify an actual private reporting route and release-support policy |
| Usage/capacity | [Usage](../../../apps/api/src/services/usage.ts) fabricates historical samples; [creation](../../../apps/api/src/services/sandboxes.ts) does not enforce organization `max_concurrency` | Remove misleading output and disclose the capacity boundary before announcing a usable preview |
| Runtime support | k0s evidence exists; restricted OpenShift acceptance remains open; current Vault enforcement requires `NET_ADMIN` | Publish a versioned profile matrix; never describe an SCC exception as compatible with the fixed no-SCC-change constraint |
| Artifacts/automation | rc.4 template uploads hit Harbor storage exhaustion; unattended npm publishing still needs repair; image provenance/SBOM disabled in the release workflow | Verify the flagship artifacts and state verification limits; do not claim all template builds or supply-chain gates passed |
| Product presentation | Public documentation redesign and four real OpenCode demos already exist | Preserve the design and demos; focus on installation, accurate claims and one successful workflow |

The September 8 Obsidian North Star reassessment is the historical product input.
Append an OSS-launch sequencing checkpoint when implementation starts; preserve
its original findings and distinguish delivered authorization from remaining work.

## Launch Contract

### Gate Definitions

| Gate | Required evidence | What it permits |
| --- | --- | --- |
| G1: Safe source publication | Reviewed public material/history, credential remediation, redistribution review, fork-safe CI, actionable private security reporting, owner sign-off | Opening source for contributors, explicitly unfinished where appropriate |
| G2: Usable developer preview | G1 plus one clean, versioned Kubernetes installation, truthful UI/API/docs, published-package workflow and reproducible contributor setup | Recommending the named preview profile to evaluators |
| G3: Public announcement | G2, at least one independent operator/developer evaluation, fixed blocking onboarding defects, reviewed release/announcement copy and maintainer availability | Broad announcement with bounded support claims |
| G4: Adoption outcome | Three independent teams complete the workflow; record second-week return or reasons for non-return, interventions and next priorities | Closing this launch/adoption plan, without declaring stable production readiness |

The default sequence below reaches G2 before the broad launch. The owner may
choose a quieter source opening once G1 passes, without pretending G2/G3 are
complete. No fixed calendar date overrides a failed publication-safety gate.
Partner recruitment may begin once the owner approves outreach; do not require
three successful teams before the first announcement.

### Supported Scope

- Reference installation: one precisely versioned Kubernetes + OpenSandbox
  profile with PostgreSQL and Keycloak. Prefer Linux/amd64 for the initial
  independent path; declare the actual validated architecture. An arm64 receipt
  is not amd64 proof. The exact environment is selected in Phase 2.
- Audience: operators and trusted development teams evaluating self-hosted
  agent execution. Public documentation is anonymous; the lab is not an
  anonymous, unlimited execution service. Do not broaden runtime access during
  a source release.
- Interfaces: current TypeScript SDK, CLI, dashboard and HTTP API. Launch with
  one tested OpenCode template/workflow; further template profiles are not gates
  unless advertised as ready in the launch materials.
- Keycloak remains authentication; Harakiri owns authorization and product
  lifecycle; OpenSandbox owns runtime execution. The consumer owns agent
  orchestration, model choice and task evaluation.
- Persistent workspaces retain files with exclusive attachment, not process
  memory, simultaneous shared mounts or automatic backup. Arbitrary files an
  agent writes are not scrubbed by credential revocation.
- Vault/egress claims require the named native runtime profile and negative
  enforcement tests. On a restricted profile that cannot enforce them, reject
  the operation and show Unsupported. No env-secret or Kubernetes-exec fallback.

### Scope Exclusions and Authority

- Do not modify, install or make acceptance depend on BackgroundAgent.
- No Python SDK, MCP runtime, additional framework adapters, branded-template
  expansion, new runtime, billing system or full usage-metering platform here.
- Preserve existing provider/service/contract boundaries; no Kubernetes runtime
  exec/log/file bypass, SCC changes or bespoke installer repair patches.
- Preserve populated namespaces/PVCs, public OIDC origins, SMTP and existing
  integrations. Validation uses explicit kubeconfig/context and owned resources.
- Plan approval is not authorization to change repository/package visibility,
  force-push history, delete remote logs/artifacts, change npm stable tags, revoke
  shared production credentials or post announcements. Obtain specific approval
  for those actions at the relevant gate, with scope and recovery impact stated.
- Keep `docs/cot/` and private deployment/credential evidence out of Git. An
  ignore rule is not proof that a file never existed in Git history.

## Success Criteria

- [x] Record the current source/distribution baseline and distinguish source
  launch, usable preview, announcement, adoption and production-support gates.
- [x] G1 publication material: no unresolved publication-blocking secret, private-data or rights
  finding; the owner approves the exact publication scope.
- [ ] G1 operational handoff: private report entry point is enabled/verified;
  owner Watch/email notification receipt still needs confirmation.
- [x] G2: An isolated installation uses downloadable artifacts and documented
  operator-owned configuration without maintainer credentials or private edits.
- [x] G2: One declared architecture/profile passes the real OpenSandbox workflow
  with published SDK/CLI; contributor tests work without live service secrets.
- [x] G2: Usage, concurrency, permissions, persistence and runtime limitations
  are represented honestly across API, UI, packages and public documentation.
- [x] G3 evaluation: owner confirms independent evaluation complete; details
  are not available and are not attributed to this agent's runs.
- [x] Public source/access verification: owner-authorized opening and anonymous
  clone, license, release downloads and npm integrity verified September 9.
- [x] G3 publication: owner reports LinkedIn/X announcements complete, confirmed
  September 10. No exact post content, URLs or engagement figures are inferred.
- [ ] G3 operating handoff: verify notification receipt and monitored support;
  publication alone does not establish that these duties were completed.
- [ ] G4: Three independent teams complete the workflow, with opt-in evidence,
  support interventions and follow-up outcomes recorded.
- [x] Record release/support ownership, residual risks, verification receipts
  and a prioritized next milestone; archive only on actual completion or an
  explicitly documented decision to abandon/re-scope.

## Phases

### September 9 Delivery Authorization

The owner approved completing publication safety, releasing/deploying the next
coherent preview, and clean native installation verification (points 1-3 of the
launch assessment). This authorizes reviewed commits/pushes, a new immutable
candidate on `next`, publishing protection, the owned lab upgrade and
isolated acceptance resources. Preserve npm `latest` at `0.4.0`. Repository
visibility, public-source opening and the announcement were initially left as
the final separately approved step. The subsequent Phase 6 approval authorized
source opening and scoped credential rotation, now completed. The owner later
reported LinkedIn/X publication complete; additional assistant-led social posting
still requires approval of its specific text/channel.

The owner confirms independent evaluation is already complete. Record this as
owner-reported acceptance, not a test run performed by this agent; do not make
the release wait for a second independent evaluation or invent its environment,
version or results. Technical clean-install verification in this plan remains
required and will have its own receipt.

- [x] Finish remaining publication-material review and configure verifiable
  publishing protections, documenting any GitHub plan limitations.
- [x] Close scoped platform credential findings: replacements verified and handed
  off privately; all Vault rows were erased tombstones, not live rewrap subjects.
- [ ] Confirm reporting notification/inbox receipt; retain explicit operator
  disposition of residual image advisories before any production deployment.
- [x] Commit and publish matching candidate images, chart, SDK/CLI and release notes;
  deploy the candidate without changing live identity, SMTP, data or origins.
- [x] Run the published-artifact workflow in an isolated native installation,
  including persistence, upgrade/recovery and owned-resource cleanup.
- [x] Independent evaluation confirmed complete by the owner, September 9.
- [x] Final owner decision: source opening explicitly authorized on September 9.
- [x] Execute source opening after credential/material review and verify anonymous access.
- [x] Record owner-reported LinkedIn/X publication after the social-copy work;
  no assistant posting, exact final text or monitored launch window is claimed.

Delivery checkpoint: rc.5 source/tag `792ac9c` and its API/web/chart are published;
SDK/CLI rc.5 were published from a clean tagged checkout after trusted npm CI
returned a publish-permission error. Stable `latest` is still 0.4.0. Template
workflow 34347806269 passed both architectures and both UID checks, including
OpenCode; the earlier amd64 timeout remains recorded. Native rc.4 baseline
login/onboarding, imported OpenCode, commands/files, published CLI, server smoke,
workspace export and termination passed after correcting evaluation resource
requests. A coordinated two-database, Secret and workspace archive is retained.

Full image scans found inherited distribution/npm packages not covered by the
clean workspace audit. rc.6 follows rc.5 without overwriting it, applying available
distribution updates and removing unused runtime package managers. Scan findings
require disposition; a raw severity is not proof of exploitable application
behavior. In particular, Debian marks some remaining glibc/Perl findings as
minor/no-DSA, and one Perl finding requires 32-bit builds.

Historical pre-rotation checkpoint: additional lab-only fixture credentials were discovered in the master recovery,
PostgreSQL and runtime connections. Scoped rotation approval was requested;
these are not covered by the earlier human-password rotation. Do not claim that
publication safety is complete or change these credentials without that approval.

rc.7 checkpoint: matching packages/images/chart published; clean consumer checks,
source CI and Harbor CI passed. Fresh application namespaces with newly generated
operator credentials passed onboarding, OpenCode image import, native commands,
files/artifacts, CLI execution and workspace release. The existing lab reached
revision 29, preserving live secrets and origins. Direct HTTP checks then found
that the Helm-mounted Nginx configuration had not inherited the standalone docs
locations. rc.8 corrects this chart-only behavioral defect with a source regression
test covering both configurations, retaining immutable rc.7 artifacts. No broad
publication or risk acceptance is implied by a successful lab rollout.

Final authorized-delivery checkpoint: rc.8 core artifacts and the distinct docs
web correction are published; source CI, Harbor workflows and npm consumer checks
passed. Native rc.8 conformance and retained-workspace reattachment passed. The
populated lab is at revision 31 with public health, OIDC, 35 Markdown pages,
indexes and 404 behavior verified. Both fixture releases/namespaces and the VM
were removed after evidence retention. The versioned receipt records the lab's
historical Nginx field-conflict/subPath recovery, unavailable free model, scanner
scope and all observed interventions. Independent evaluation is owner-confirmed.
G1 still requires platform credential rotation/rewrap, inbox acknowledgement and
residual-risk review; the final public-opening/announcement decision stays last.

### Phase 0: Scope and Planning Baseline
**Status**: Complete

- [x] Read current code, release receipts, active plans and community files.
- [x] Check GitHub visibility/description/license metadata without modifying it.
- [x] Separate publication blockers from production-support follow-ups; connect
  existing delivery/demo plans instead of declaring their unfinished gates done.
- [x] Persist this plan and update the execution-plan index.

### Phase 1: Publication Safety and Ownership
**Status**: In Progress

September 9 implementation checkpoint: Gitleaks 8.30.1 examined 135 commits,
30 local refs and 904 tracked files, including archive decoding. Both scans
reported 13 findings; these were reviewed as fixtures, route identifiers,
checksums and loopback-only demo data. A custom Harakiri token rule also identified
documented development fixtures. Narrow path-and-value exceptions and positive
controls now produce zero unresolved findings in the tracked tree/history.
This is not a clearance of remote assets, binary material or live credentials.
Private, redacted reports are in
the ignored `docs/artifacts/oss-launch-private/` directory. Remote artifacts,
container layers and media are not covered by this scan. A read-only login
check confirmed the documented development identity still had administrator
access on the public lab. That initial checkpoint did not change credentials.
Following scoped owner approval on September 9, the password was replaced and
the user's sessions invalidated. Old password/refresh rejection, denial of the
old access token after its five-minute expiry, new browser login/logout and
independent recovery passed. Account, membership, key and workspace records,
realm/OIDC/SMTP and deployment configuration were preserved. The owner also
designated the reporting address and initial triage maintainer; recipient
acknowledgement remains pending. See the sanitized launch review for evidence.

The final remote-ref inventory added three previously unavailable dependency
branch objects via a separate audit ref namespace. The extended candidate and
history scans covered 920 intended files, 138 commits and 56 local refs with
zero findings. Existing branch/tag positions were preserved.

Source changes now include pinned Actions, a secret-free browser CI job, a
version-pinned/redacted scanner, loopback-only Compose dependencies and an
explicit local-development seed guard. The canonical Apache-2.0 license text
has been restored consistently in source and public packages. Dependency and
optional Remotion/media redistribution review is recorded in `THIRD_PARTY.md`.
The initial check found unprotected `harbor` and `npm` environments. The approved
September 9 follow-up restricts both to the `main` branch, enables repository
guards, validates source ancestry and immutable versions, and replaces Harbor
release credentials with a project-scoped pull/push robot. Required reviewers
are unavailable on the current private-repository plan (HTTP 422); this is not
a second-person approval rule. A production
dependency audit found 28 advisories (18 high). Compatible updates and bounded
security overrides now pass the full audit with zero known advisories, including
optional demo tooling. No deployed image is claimed patched by a lockfile change.

- [x] Inventory the intended public surface: all relevant Git refs/history,
  historical configuration, vendored sources, docs/screenshots/media, LFS and
  release assets, workflow logs/artifacts, package contents and container layers.
  Check ignored material only for accidental inclusion in an archive/image.
- [x] Run a maintained secret scanner against history and the publishable tree;
  manually review hits and binary/media material the scanner cannot establish.
  Record tool/version, refs examined, exclusions and unresolved findings. Keep
  raw output private and redacted in any shareable receipt.
- [x] Determine whether any documented seed/admin credentials remain valid on
  the owned public lab. Prepare a coordinated replacement/disablement with a
  verified break-glass administrator and regression tests; local-only fixtures
  must not become public-install defaults.
- [x] Rotate/revoke confirmed exposed live secrets through their owning systems
  after scoped approval, then verify integrations and old-credential rejection.
  Removing a string from the latest checkout is not credential revocation.
  Scope: the confirmed development human administrator on the owned public lab.
  Other live secrets remain unchanged; future findings from the remaining
  material review require their own scoped remediation.
- [x] If private material needs history or remote-artifact removal, propose the
  exact objects, backup/coordination steps and effects on immutable release
  references. Do not rewrite or erase evidence automatically. Rescan the final
  proposed public refs and preserve a sanitized remediation record. No history
  rewrite or remote deletion is indicated by reviewed artifact content; live
  credential remediation remains separately open. Expired/410 content is excluded.
- [x] Review Apache-2.0 source/package declarations, vendored OpenSandbox notices,
  dependency redistribution, fonts, demo media and third-party tooling. Resolve
  GitHub's `Other` license classification without inventing replacement terms.
  The maintainer's Remotion eligibility does not establish every contributor's
  rendering rights; distinguish core use from optional demo production.
  GitHub now identifies Apache License 2.0. Scope and retained notices are
  recorded in THIRD_PARTY.md; this is not a legal certification.
- [x] Review public-fork CI: no untrusted contribution receives release secrets,
  privileged environments, unsafe artifact execution or shared cluster access.
  Use least-privilege workflow permissions and reviewed/pinned dependencies;
  required release jobs remain protected independently of public PR validation.
  Main-only environment restrictions are verified; reviewer limitations are
  documented. The new guard tests cover forks, workflow refs, non-main commits,
  version mismatches, unsafe tags, existing artifacts and fail-closed lookup.
- [ ] Assign a real private security contact, verify delivery/notifications and
  document who triages reports. Prepare GitHub private reporting for the public
  repository and test it when available. Do not claim an unmonitored mailbox.
  - [x] September 9: owner designated `nabilblk@gmail.com`; the repository
    maintainer (`@nabilblk`) owns initial security/conduct triage. Policies and
    preview documentation now provide the actual email route, without an SLA.
  - [ ] Send a harmless delivery test and obtain the recipient's acknowledgement.
    The lab currently uses Mailpit, so no external email was sent. The Gmail
    reporting route is independent of application SMTP; an external mailbox
    test is still needed. Do not change SMTP to satisfy a docs-only contact edit.
- [x] Produce a sanitized G1 checklist with remaining risks in
  [the launch review](../../oss-launch-review.md).
- [x] Obtain owner approval of the reviewed publication scope and credential
  remediation, acted on September 9. Notification receipt remains separately
  open; this does not turn the operating handoff into a completed test.

**Exit evidence:** a scoped publication review, not a generic scanner-green claim.
Unresolved usable secrets or confidential material block publication. Public
source is not reversibly recalled merely by making the repository private again.
GitHub documents [visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility),
[secret rotation and history-removal limits](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository),
and [private reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

### Phase 2: One Reproducible Distribution and Install Path
**Status**: Complete for the scoped native preview; upstream scan limits disclosed

An empty registry configuration successfully downloaded the rc.4 Helm chart and
read the API image's multi-architecture manifest. Chart digest matches the rc.4
receipt. Anonymous rc.4 SDK/CLI tarball downloads also matched registry integrity.
That was the initial read-only checkpoint. Final artifact, native install,
upgrade/recovery, cleanup and lab rollout evidence is now recorded in
[the rc.8 receipt](../../release-notes/0.5.0-rc.8-delivery.md). No source visibility
or stable channel change occurred.

- [x] Select one named preview environment and record Kubernetes, OpenSandbox,
  Keycloak, PostgreSQL, chart, API/web/worker and flagship template versions,
  architecture, storage, ingress/TLS, privilege and minimum resource prerequisites.
  Reuse the existing release-manifest/Helm patterns; do not add a second installer.
- [x] Verify image/chart/template pulls in a fresh environment with empty registry
  and npm credential stores. Distinguish public artifact downloads from the
  operator's own database, OIDC and scoped Harakiri credentials.
- [x] Decide the public artifact endpoint from evidence. Retain Harbor for
  internal/customer mirroring. If anonymous Harbor distribution or availability
  is unsuitable, add an owner-approved public OCI mirror through the existing
  workflow, preserving digests and documenting access/retention. Do not silently
  assume Harbor is already public or migrate every consumer to another registry.
- [x] Produce one versioned bill of materials and copyable verification commands
  for images, chart archives, template and npm packages. Inspect tarballs/image
  contents, retain checksums and record source/workflow references. Generate and
  review an SBOM/dependency vulnerability report for the advertised bundle;
  document risk dispositions and any unsigned/provenance limitations explicitly.
  Receipt scope is the selected arm64 API/web SBOMs, with runtime/template and
  amd64 scan coverage explicitly left open; do not infer full-bundle clearance.
- [x] Validate a maintainer-triggered, protected release end to end. Fix unattended
  npm publishing where possible; a reproducible approved manual fallback is
  acceptable for this preview if labeled honestly and tested. Preserve private
  root/shared packages, immutable tags and candidate-versus-stable separation.
- [x] Resolve registry storage headroom before retrying the required OpenCode
  architecture jobs. Publish/promote only verified template artifacts. Complete
  both architecture checks for any multiarch claim, not only a successful build.
- [x] Correct install defaults to the tested bundle, explicit public OIDC
  issuer/audience/redirects and newly generated bootstrap secrets. No development
  identity, localhost public redirect, in-place web image write, hidden source
  chart fallback or rollout-restart repair in the documented operator path.
- [x] Perform fresh install, a documented upgrade with an existing workspace,
  and uninstall of only the test release. Distinguish logical archive from
  physical PVC retention/reclamation; verify admin login and a native runtime.
  A backup catalog check does not prove coherent database/PVC recovery.

**Exit evidence:** downloadable exact coordinates and a repeatable installation
receipt, including failures fixed and required operator privileges. The entire
historical template catalog and restricted OpenShift certification are not gates
for a narrower advertised Kubernetes preview.

### Phase 3: Accurate Preview Behavior
**Status**: Complete for the selected preview profile

- [x] Remove the generated 336-point usage history and false historical peak.
  Show unknown/insufficient-history states, not zero or repeated current values.
  Audit adjacent runtime/compute labels and period definitions before presenting
  them as measurements. Do not manufacture historical observations from mutable
  last-active timestamps.
- [x] Keep the fix bounded: prefer additive availability/coverage metadata and
  explicit empty data over a full metering engine. Update API/shared/OpenAPI,
  SDK protocol and dashboard together; version incompatible changes rather than
  silently putting nulls into fields clients treat as numbers.
- [x] Mark configured-but-unenforced concurrency honestly and stop presenting the
  setting as a protective guarantee. Do not fake enforcement in the browser or
  substitute a per-process counter for multi-replica admission. Document that
  the preview is for trusted, operator-controlled evaluation, not hostile shared
  workloads or unbounded public execution.
- [x] Fix the existing Commands working-directory follow-up from runtime
  metadata and add the non-`/workspace` template regression. Record completion
  in the owning delivery plan rather than maintaining two implementations.
- [x] Verify authorization remains server-enforced: member/admin/key boundaries,
  credential audience, scope composition, revocation, expiry, tenant separation
  and denial behavior. Keep human public redirects and PKCE flow unchanged.
- [x] Reconcile capability states with the selected environment. Disable/reject
  unsupported Vault/egress operations clearly, especially on restricted OpenShift;
  a request for `NET_ADMIN` is not a no-SCC-change solution. Keep storage and
  credential-revocation limitations visible before users depend on them.
- [x] Add focused API/contract and browser tests for changed states, including
  loading/error/empty/unknown history, read-only member settings and mobile
  layouts. Reuse existing UI components; do not redesign the landing page/docs.

**Exit evidence:** no knowingly fictional measurement or implied protective
control in the advertised path. Full atomic capacity admission and usage history
remain required before a later shared-production recommendation, not hidden debt.

### Phase 4: Documentation and Contributor Experience
**Status**: In Progress

The existing docs inventory now exports all 35 pages to canonical Markdown, an
HTTP index and `llms.txt`/`llms-full.txt`, preserving every code-tab language.
The Developer Preview page separates operator/developer paths and deployed rc.4
from unreleased fixes. Browser checks cover navigation, copy/search/keyboard
behavior and 1440/390/320-pixel layouts. Clean contributor setup and local Nginx
HTTP serving are verified; installed-image/hosted serving and remaining
ownership/launch-bundle reconciliation are still open. All 20 browser tests pass.

Use the documentation matrix below as the ownership checklist. This is content
and correctness work on the existing design, not a new docs framework.

- [x] Rework README progression to explain the audience, OpenSandbox relationship,
  Developer Preview boundary and first outcome before repository internals. Put
  published-package usage first; retain a separate source-contributor path.
- [x] Correct obsolete package selectors/tarballs and execute contributor setup
  in a clean checkout without private registry, model-provider or cluster secrets.
  Required core checks must not require paid Remotion rendering or a live LLM.
- [x] Add one navigation path for operators and one for developers. Keep Concepts
  separate from Tutorials and Operations; link the installed-version/support
  matrix, security guidance and downgrade/upgrade caveats near prerequisites.
- [x] Reconcile public site, repository guides, package READMEs and release notes
  against the exact launch bill of materials. Explain the older stable channel
  and recommend an explicit tested preview version, not whichever `latest` wins.
  A new launch fix gets a new candidate; never overwrite rc.4 artifacts.
- [x] Provide an HTTP-readable, real documentation index and canonical Markdown
  access for the launch-critical guides. Generate/validate `llms.txt` from the
  maintained inventory; 200 with an SPA HTML shell is a failure. Preserve hash
  deep links and avoid a second independently maintained documentation corpus.
- [x] Keep existing CLI/UI/SDK/OpenCode demos in the demo/docs library. Match
  excerpts, versions, commands, transcript and source download to runnable
  examples. Label historical recordings and edited timing; do not rerender all
  videos or wait for unattended media refresh unless a launch claim is wrong.
- [ ] Complete SECURITY with a tested contact, named triage responsibility,
  supported-version guidance and confidentiality instructions. Align code of
  conduct reporting and maintenance expectations; no invented response-time SLA.
- [x] Refine existing issue/PR templates and a small contributor backlog with
  reproducible tasks, scope boundaries and tests. Record ownership for runtime
  providers, API/contracts, web/docs and release operations using actual people
  who accept that responsibility, not fabricated maintainers.
- [x] Prepare internal operator/security/support runbooks and a sanitized external
  handoff. Append the Obsidian launch checkpoint and link it to this plan without
  exporting private notes, credentials, customer names or local machine paths.
- [x] Verify docs navigation, search, syntax-highlighted language tabs, exact
  copying, keyboard access and screenshots at 1440, 390 and 320 pixels. Run link,
  schema and executable-example checks; verify canonical content without login.

| Audience | Existing surfaces to update | Required outcome |
| --- | --- | --- |
| First-time developer | README, public quickstart, SDK/CLI READMEs, examples | Published version to verified result and cleanup |
| Operator | Release artifacts/CI docs, chart README, install/upgrade/storage runbooks | Dependencies, privileges, registry/CA handling, secrets, OIDC, exact versions, uninstall/retention and troubleshooting |
| Application integrator | API/OpenAPI, SDK/CLI references, capability/limit guide | Typed errors, authorization, lifecycle/reconnect, workspace and credential boundaries |
| Security reviewer | SECURITY, authorization/security-model and Vault support docs | Actual reporting route, threat boundaries, supported profiles and affected-version guidance |
| Contributor | CONTRIBUTING, development/architecture guides, issue/PR templates | Secret-free core setup, correct commands and reviewable module boundaries |
| Maintainer/internal | Release/incident/triage runbooks and Obsidian checkpoint | Ownership, risk decisions, evidence, recovery caveats and intervention log |
| Public evaluator | Preview support page, release notes, demo/tutorial library, canonical Markdown/index | Accurate availability claims with a runnable flagship example |

### Phase 5: Fresh-Environment and Independent Acceptance
**Status**: Authorized native acceptance complete; broader live member rerun remains open

- [x] Extend existing conformance/examples instead of introducing a generic test
  orchestration product. Use a new HOME/cache/credentials directory and a clean
  checkout or download. Pass the evaluator's own kubeconfig explicitly; do not
  inherit maintainer `.env`, Docker auth, kubeconfig or installed CLI state.
- [x] Prove the following deterministic flow with published SDK/CLI and real
  OpenSandbox: authenticate, discover capabilities, allocate a workspace, create
  a sandbox, seed a small repository fixture, run tests, observe/reconnect output,
  retrieve an artifact or protected preview, terminate, attach the same workspace
  to a second sandbox and verify retained files, then clean up owned resources.
- [ ] Repeat the important paths through the UI and CLI, including member-scoped
  key creation, permission denial, key revocation, public OIDC callback and
  expiry. Check API/UI results agree rather than using screenshots alone.
  This campaign verified live operator onboarding, image import, read-only key
  denial/revocation and native CLI attach. Member ownership/expiry/tenant boundaries
  have automated coverage; a new live human-member browser flow was not repeated.
- [x] Run the flagship OpenCode coding task and independently test its output.
  Check available free-model choices at execution time; do not promise perpetual
  free access. Separate platform failures from unavailable models or poor output.
  Keep deterministic conformance mandatory even when the optional model run fails.
- [x] Test missing prerequisites, unsupported runtime features, failed creates,
  reconnect, nondefault workdir and cleanup. Until admission exists, report
  concurrency as unenforced; do not label a non-test as successful quota rejection.
- [x] Ask one independent operator/developer to follow only the versioned docs.
  Access to an intentionally private preview may be owner-approved, but no
  maintainer credential or unrecorded workaround counts as self-service success.
  The owner reported this evaluation complete on September 9. Its details are
  not available in the repository; this is an accepted owner report, not agent-
  verified fresh-install evidence. No repeat independent evaluation is required
  for the currently approved points 1-3.
- [x] Record every intervention and repeat after fixing blocking instructions or
  code. Measure prerequisite/setup/task times separately; report observations,
  not a predetermined time-to-first-task claim.
- [x] Publish a sanitized G2/G3 receipt with environment, source/artifact digests,
  commands, test outcomes, cleanup and remaining limits. Keep raw credentials,
  organization data and full command output out of public evidence.

**Exit evidence:** reproducible maintainer clean-environment proof plus at least
one independent evaluation of the recommended path. Local dev-provider mocks,
successful Helm rendering and an existing maintained lab are not substitutes.

### Phase 6: Controlled Publication and Announcement
**Status**: Publication complete (owner-reported social posts); notification/support handoff open

The owner explicitly authorized making `nabilblk/h-sandbox` public and asked for
the announcement channel and format. This supersedes the earlier requirement
to leave point 5 unapproved. The owner subsequently approved
rotating all owned lab passwords and platform secrets, with private delivery of
the replacements. Source stayed private until the credential exposure and
publication-material findings were resolved, then opened on September 9.
Personal npm, GitHub and Harbor account credentials are outside this operation.
No social account posting is authorized by a request for channel advice.

Repository metadata and Discussions are configured. The
[announcement kit](../../launch/oss-developer-preview-announcement.md) contains
the recommended sequence, owner-review draft, proof links and channel rules.
Do not post its generated text to Hacker News; that channel requires the owner's
own writing. Stable npm tags, existing release artifacts and application access
remain unchanged.

Credential checkpoint: all owned lab replacements were activated and verified
at 16:13 UTC. New human/recovery logins survive Keycloak restart; old passwords,
the old database password on the application network, and the old runtime API
key are rejected. Vault's 18 rows were already deleted, with no payload to
rewrap. Identity, membership, API-key and workspace inventories are preserved.
Keycloak's previously ephemeral H2 database was recovered and verified in
isolation, then moved to persistent storage. The owner handoff is outside Git.
See the [operations receipt](../../release-notes/2026-09-09-public-launch.md).

Final publication recheck: 939 tracked files and 64 refs pass Gitleaks 8.30.1.
All 26 release assets, 150 non-expired Actions artifacts and 90 available logs
were downloaded. Fifty-six expired artifacts and 53 unavailable logs remain
explicit exclusions. The expanded scanner flagged 21 copies of one immutable
API image tag; exact source-commit matching resolved them as non-secret metadata.
No remote objects were deleted. The populated lab and its 35 documentation pages
passed read-only HTTP checks again. Credential operations have their separate
verification receipt above, not inferred from scanner results.

Public checkpoint: anonymous clone and all rc.8 release checksums/npm integrity
passed at 16:28 UTC. Repository protections were verified at 16:29 UTC: private
reporting, secret scanning/push protection, dependency alerts, strict PR/check
protection for main, approval for all external-contributor workflows, and
owner-reviewed main-only publishing environments. The current token cannot
manage Watch subscriptions. The owner was asked to enable All Activity/email;
notification delivery is not claimed. Source CI passed eight checks, and the
web-only `docs.2` image was published for both architectures and deployed. The
new homepage/vision story is verified in browser and 35 public docs pass HTTP
checks. Original rc.8 release assets and npm channels remain unchanged.

- [x] Review G1/G2/G3 separately with the owner. Confirm repository identity,
  source/media scope, public artifacts, launch candidate, support ownership,
  lab availability statement. Social publication was subsequently owner-reported.
  Rechecked scans after refs/assets changed.
- [x] Commit reviewed launch changes and obtain release/deployment approval for
  a new candidate as needed. Verify code CI, exact package/image/chart outputs,
  fresh installs and hosted public-origin regression; keep stable tags unchanged
  unless independently approved against their production gates.
- [x] After explicit approval, change repository/public artifact visibility and
  verify signed-out clone, source/license access, issue/contribution entry points,
  documentation, release downloads, npm and OCI pulls. Check repository rules
  and public-fork CI behavior after the visibility transition.
- [x] Set approved description/topics and enable/verify private security reporting
  and post-publication protections. Description, homepage, topics and Discussions
  are configured. This does not establish notification delivery.
- [ ] Verify maintainer Watch/email settings and receipt before broader promotion.
- [x] Record the owner's LinkedIn/X publication report and positive reception.
  The launch draft is not asserted to be the exact published text. No invented
  users, performance figures, independent endorsement or production claim.
- [ ] Capture actionable incoming developer/operator feedback with consent and
  sanitized reproduction details. Additional channels require their own review;
  no unsolicited mass outreach or simulated community activity.
- [ ] Keep a monitored launch window and a correction/incident procedure. If an
  artifact or setup fails, pause promotion, publish accurate guidance and fix
  forward with immutable versions. Re-privatizing a repo cannot recall forks.

### Phase 7: Adoption, Learning and Closure
**Status**: Not Started

- [ ] Recruit a consented cohort of three independent teams, without making
  their applications dependencies of Harakiri. Capture environment/workflow fit
  and distinguish operator prerequisites from product defects.
- [ ] Record each team's install and verified task completion, interventions,
  workflow result and cleanup. Use opt-in minimal reports; collect no private
  source, prompts, raw outputs, model reasoning, secrets or customer identifiers
  in public telemetry. Ask separately before using names or testimonials.
- [ ] Follow up in week two and record actual continued use or reasons for
  stopping. Stars, downloads and views are discovery signals, not completed work.
- [ ] Publish a sanitized outcome summary and prioritize the next milestone from
  observed friction. Full admission/accurate historical accounting remains the
  first shared-production trust follow-up; Python follows validated adoption
  demand, not an automatic expansion triggered by announcement day.
- [ ] Keep unresolved delivery/demo gates in their owning plans. Archive this
  plan only after G4, or explicitly record an approved re-scope/abandonment.
  Do not mark adoption complete when only the repository is public.

## Verification Strategy

Run root package builds/tests sequentially: SDK rebuilds can remove files another
process is reading. Use the existing commands before release:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
pnpm docs:check
pnpm credential-vault:check
pnpm examples:check
pnpm publish:local-check
git diff --check
```

Use disposable PostgreSQL with both test database URLs for database-dependent
authorization/lifecycle tests; run `pnpm conformance:dev` separately from native
runtime proof. Run the existing authorization/docs Playwright suites on fixtures
and repeat advertised flows on the real deployment. The scoped secret/history
scan, dependency review, clean image/chart/npm pulls, install/upgrade/uninstall,
independent evaluation and signed-out post-publication checks are additional
gates; a green source CI does not establish them.

Each receipt records **source**, **distributed artifacts**, **tested environment**
and **supported claim** separately. Record planned/manual/failed/skipped checks
as such. Private scanner logs and deployment snapshots stay in ignored local
evidence; commit only sanitized outcome summaries, not a secret-bearing archive.

## Ownership and File Boundaries

| Work | Primary locations | Boundary |
| --- | --- | --- |
| Publication/security/community | `.github/`, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT | Review existing history/settings; no new policy platform |
| Distribution/install | Existing release/npm/template workflows, `infra/charts/`, release manifest and smoke scripts | One tested bundle; preserve Harbor mirroring and the operator's environment |
| Honest usage and limits | Usage/org services, shared/OpenAPI and SDK types, dashboard usage/settings | Small truthful-contract correction, not billing or full admission implementation |
| First-task defect | Dashboard Commands route and its browser regression | Complete the owning delivery-plan item |
| Documentation | README, `docs/`, public docs components, package READMEs | Keep navigation/design and generate machine-readable access from maintained content |
| Real acceptance | `tests/conformance/`, `tests/e2e/`, existing demo/example fixtures | Provider-native behavior, no BackgroundAgent dependency |
| Adoption | Sanitized launch receipt and internal support log | Consent, minimal data and actual outcomes |

No numeric timeline, maintainer identity, contact email, partner commitment or
public registry availability is invented by this plan. Assign an implementation
owner and independent reviewer when each phase starts; the repository owner
retains approval of disclosure, deployment, distribution and announcements.

## Relationship to Existing Plans

| Work | Owning plan or phase | Effect on launch |
| --- | --- | --- |
| Authorization | [Completed release](../completed/authorization-release.md) | Already delivered; regression gate, not duplicate implementation |
| Commands workdir, flagship template artifacts | [Delivery readiness](delivery-readiness-and-persistent-workspaces.md) | Required when on the advertised preview path; update its existing checkboxes |
| Full restricted OpenShift/storage and coherent recovery | Delivery readiness | Not a source-opening gate; remains required before those support claims |
| Registry capacity and unattended publication | Delivery readiness, integrated with Phase 2 here | Required public artifacts must be reliable; tested manual npm fallback may remain disclosed |
| Existing demos and protected unattended refresh | [Real product demos](real-product-demo-remotion.md) | Reuse working media; refresh automation is not a core OSS launch gate |
| Atomic admission and measured usage history | Explicit post-launch trust follow-up | Required before shared-production endorsement; truthful unavailable states required now |
| Python/MCP/adapters/catalog expansion | Deferred pending adopter evidence | Not a launch prerequisite |

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-08 | Made OSS Developer Preview the next umbrella milestone | Owner chose launch rather than completing the entire production roadmap first | Full capacity/metering and all platform certification before public source |
| 2026-09-08 | Separated G1 publication, G2 usability, G3 announcement and G4 adoption | Source access, safe evaluation and independent use are distinct outcomes | One checkbox called "OSS ready" or gating publication on three existing users |
| 2026-09-08 | Kept a narrow Kubernetes/native OpenSandbox workflow and current TypeScript surfaces | Existing capabilities can demonstrate real value without broadening the product | Python, additional templates, a new runtime or BackgroundAgent installation |
| 2026-09-08 | Required truthful usage/capacity presentation, deferred full accounting/admission | Misleading behavior is a launch defect; a complete resource-control system is a separate production milestone | Fabricated metrics under a preview label, or building billing first |
| 2026-09-08 | Preserved existing artifacts and plan ownership | rc.4 and earlier receipts are real historical evidence; incomplete delivery gates must remain visible | Retagging old images, reimplementing shipped features, or archiving unfinished plans |
| 2026-09-08 | Kept disclosure and external actions behind scoped owner approval | A launch plan is not consent to publish sensitive history, alter live credentials or contact third parties | Automatic visibility change or announcements after planning |
| 2026-09-09 | Kept numeric usage compatibility with explicit unavailable metadata | Old clients must not receive unexpected nulls, and the dashboard must not render fabricated observations | Silent incompatible field changes or preserving synthetic charts |
| 2026-09-09 | Used one React docs inventory for web and generated Markdown | All language variants and page order stay aligned without a second maintained corpus | Handwritten duplicate guides or an SPA response at llms.txt |
| 2026-09-09 | Added bounded dependency security floors and preserved existing dependency bots | Known vulnerable transitive versions remained after direct same-major upgrades | Ignoring advisories or taking unrelated major upgrades |
| 2026-09-09 | Left source publication blocked by live development identity and ownership gaps | Recovery access is verified, but shared-credential changes and reporting/release ownership need scoped approval | Uncoordinated credential rotation or claiming scanner success establishes G1 |
| 2026-09-09 | Owner approved the recommended admin credential remediation and designated the reporting contact | Rotate only the confirmed development human administrator, preserve account/data and verify independent recovery; security/conduct triage goes to the repository maintainer at the supplied address | Changing repository visibility, unrelated integration secrets or release settings under this approval |
| 2026-09-09 | Verified credential replacement through expiry and a real browser; preserved existing Mailpit configuration | Old password and refresh rejected immediately, old JWT denied after expiry, new admin login/logout and recovery passed; no false Gmail delivery claim | Treating offline JWT logout as immediate denial or silently switching SMTP to SendGrid |
| 2026-09-09 | Owner approved launch points 1-3 and confirmed independent evaluation, retaining source opening as the last step | Complete safety, rc.5 delivery and isolated native acceptance now; preserve stable tags, live data and explicit visibility approval | Repeating external evaluation, opening the repository early, or treating existing lab health as a clean install |

### Decisions to Resolve During Execution

- Recipient acknowledgement of the designated security contact and separate
  release-review ownership/protection: before G1. The reporting address and
  initial triage maintainer are now assigned; neither establishes release review.
- Exact Linux architecture/Kubernetes profile and clean evaluation environment:
  at Phase 2 start, based on access and reproducible evidence.
- Anonymous Harbor endpoint versus an approved public mirror, and publication
  authority for that namespace: before public artifact distribution.
- New candidate version and an explicit maintenance/security recommendation for
  older releases: before G2; do not silently promote npm `latest`.
- Source opening timing, permitted media/private-history scope and announcement
  channels/text: at G1/G3 owner reviews respectively.
- Always-on evaluation hosting versus the existing explicitly non-SLA lab:
  before announcement; default is not to promise an always-on managed service.
- Partner contacts, consent and availability: before outreach. Lack of a third
  successful evaluator does not invalidate a technically ready source opening.

## Tech Debt Incurred

Legacy numeric usage fields remain zero placeholders for wire compatibility;
availability metadata and the dashboard prevent treating them as observations.
Version-bounded dependency overrides need removal when upstream resolution
includes the fixes naturally. Existing atomic-admission/usage-history work,
restricted OpenShift/recovery acceptance,
unsigned artifact/provenance limits, unattended npm/demo automation and manual
SDK protocol mirroring remain explicit. Any accepted launch exception must name
an owner, supporting evidence, user-facing limit and condition for revisiting it.

## Completion Notes

Not complete. Source-safety tooling, truthful preview behavior, documentation
exports and contributor-path corrections are implemented. A clean credential-free
checkout passed builds/types/package and contract checks. Disposable PostgreSQL
enabled all 572 tests without skips; dev-provider conformance passed. See the
launch review for exact scope and final browser/HTTP verification.

The owner-approved live development password remediation is complete, and
the reporting address/initial triage maintainer are assigned. Source publication
still requires reporting receipt confirmation, protected release settings and
remaining material review, followed by owner approval of publication scope.
Fresh native installation, immutable candidate release, independent evaluation
and adoption remain open. No repository visibility, registry access, Git history,
deployment, release tag or public announcement was changed. Only the approved
human password and its sessions were changed; unrelated integration credentials
and OIDC/SMTP settings were preserved.
