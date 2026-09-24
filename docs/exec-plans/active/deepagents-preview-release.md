# Execution Plan: Deep Agents Preview Release

**Created**: 2026-09-23
**Author**: Codex
**Status**: In Progress
**Priority**: P1
**Estimated effort**: One release session plus external npm setup

## Context

Publish the reviewed framework-first integration and its required TypeScript
SDK improvements. SDK/CLI rc.11 was published during the first delivery; the
new adapter has never been published. Source, public documentation, installed
packages and release notes must describe the same availability and limitations.

## Current Checkpoint

As of September 24, local web login and separate npm security approval both
succeed. The SDK publisher is readable and points to `nabilblk/h-sandbox`,
`npm-release.yml`, environment `npm`, with direct publish permission. Core
trust-only CI also passes. Do not repeat account setup or replace core publishers.

PR #54 merged as 7511609752f5cc06cc282efb3532c140103c544b after required CI
36008399126 passed. Native run 36007730164 passed all 15 gates, including the
digest-pinned Qwen3 4B Instruct repair, key revocation and confirmed cleanup.
Shared installation/recovery run 36007730084 passed all 11 gates and cleanup.
The adapter pins published SDK 0.5.0-rc.11. A clean merged checkout passed the
anonymous release-candidate contracts again. The local bootstrap's separate npm
browser approval expired at 14:15 UTC without publication; local identity remains
valid. Reopen publication only when the account owner is present. Remaining gates:
registry verification, adapter-specific trust, actual OIDC publication and
anonymous Node 20/22 verification. The first publish attempt was cancelled
before approval while verifying archive metadata; no package existed afterward.
No running lab services or private research files are part of this work.

## Success Criteria

- [x] Reviewed source and documentation merged after CI.
- [x] Native adapter and real-model repair evidence from a disposable runner.
- [x] Matching SDK/CLI prerelease available anonymously, without changing latest.
- [ ] Adapter preview available anonymously with a compatible SDK peer.
- [x] Core GitHub release, repository receipt and public changelog report actual evidence.
- [ ] Adapter GitHub release and public changelog record verified npm publication.
- [x] Private research, customer installations and running local services untouched.

## Phases

### Phase 1: Qualification
**Status**: Complete
- [x] Inspect release guards and current package availability.
- [x] Confirm SDK/CLI trusted publishing exists; new adapter requires npm bootstrap.
- [x] Verify refreshed local web login, account 2FA and separate security approval.
- [x] Commit framework integration and run isolated CI/native acceptance.
- [x] Verify real shell/files/search and reconnect through the installed adapter.
- [x] Record real-model repair and confirmed cleanup evidence (36004058904).
- [x] Requalify the full suite after fixing expired operator-token capture.
- [x] Retain bounded exit/TAP/model-call diagnostics to diagnose the failed repair.

### Phase 2: Coordinated Publication
**Status**: In Progress
- [x] Select unused versions and align manifests, installation guides and checks.
- [x] Verify SDK/CLI npm trust without publishing (run 35906616877).
- [x] Test public programs against the packed SDK before publication and registry after publication.
- [ ] Bootstrap adapter publication and configure its package-specific publisher after full native CI.
- [x] Add a separately versioned adapter target to the existing protected npm workflow and its guards.
- [ ] Verify both local bootstrap and the first OIDC adapter release, including anonymous Node 20/22 consumers.
- [x] Merge source and create immutable release tag.
- [x] Publish and anonymously verify core packages and release artifacts.

### Phase 3: Documentation and Closure
**Status**: Core delivery and adapter qualification complete; adapter publication remains open
- [x] Publish factual GitHub notes, public changelog and repository delivery receipt.
- [x] Record remaining external blockers explicitly, without announcing unpublished packages.
- [ ] Archive only after the requested delivery is complete.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-23 | Native checks on disposable GitHub-hosted runners only | Preserve running k0s and host processes | Local live acceptance rejected |
| 2026-09-23 | Keep stable npm latest unchanged | This is a developer preview with an exact framework compatibility target | Premature stable promotion rejected |
| 2026-09-23 | No cluster deployment implied | User requests commit, push, release and documentation, not production rollout | Reusing old deployment permissions rejected |
| 2026-09-23 | Core rc.11 and adapter availability documented separately | Existing SDK/CLI OIDC works; new-package npm authentication returned 401 | Advertising an unavailable adapter package rejected |
| 2026-09-23 | Release verified core clients; keep adapter a source-only preview | Native tools passed, but Qwen3 4B repair failed at independent final verification; adapter npm access also unresolved | Weakening verification or claiming a successful repair rejected |
| 2026-09-24 | Extend the existing npm workflow with an independent adapter target | Reuse protected OIDC, without republishing immutable SDK/CLI or coupling framework versions to server/chart releases | Duplicating a release workflow or bumping all products rejected |
| 2026-09-24 | Pin the explicit Qwen3 4B Instruct artifact for bounded model acceptance | The hybrid template opens a thinking block and produced token-limited, tool-free responses; the instruction-only artifact does not depend on reasoning suppression | Raising output limits, accepting an unverified model claim, or hard-coding the repair rejected |

## Tech Debt Incurred

The disposable Ollama harness normalizes text-only tool blocks for the pinned
provider, which rejects them. Remove this tested compatibility class when the
upstream integration supports blocks. It is not part of the published adapter.
New-package npm credentials/trust are an external release dependency, not grounds
to bypass qualification or publish misleading installation steps.

## Completion Notes

Core delivery complete. PR #52 merged as 55940e1, tagged v0.5.0-rc.11.
SDK/CLI publication 35910822977 passed via OIDC, including post-publication
installed-package and 18 public-program checks. Stable latest remains 0.4.0.
Harbor publication 35910819414 passed for both architectures and the chart.
The GitHub prerelease contains seven anonymously verified assets; the delivery
receipt records digests and provenance-metadata checks. No live deployment.
The implementation and rc.11 documentation passed all 105 web
tests, 18 exact documentation scenarios and 10 browser tests passed locally;
Node 20/22 installed framework/documentation checks passed in CI. Initial native
run 35905669810 passed the SDK/runtime and framework tool gates, but failed the
real-model repair gate. Owned runtime and private-material cleanup passed. A
replacement run 35907737905 passed native tools and cleanup but failed with
HarakiriRunError at the final independent test command (run-repair.ts:67).
The sanitized evidence does not establish the underlying cause. No successful
model-driven repair is claimed; qualification remains open for the adapter.
Local npm authentication returned 401; user asked to refresh credentials locally
without sharing secrets. SDK/CLI trusted publishing verified successfully.

The plan remains active, not complete. To release the optional adapter: diagnose
the failed independent model-repair verification, obtain a passing receipt
without weakening its checks, bootstrap the new npm package, configure its own
trusted publisher and extend the guarded release/installed-consumer workflow.

September 24 continuation: local npm authentication now succeeds as nabilblk,
and npm reports owner access to h-sandbox. GitHub authentication is available.
Work continues on release/deepagents-publication. No cluster access, global
tooling changes, publication or trust mutation occurred during initial diagnosis.

PR #54 starts with sanitized diagnostics and reruns native acceptance on a fresh
GitHub-hosted runner (35996978520). The local release guard suite passes 15 tests;
38 anonymous installed-adapter contracts and strict declarations pass. The npm
workflow now has an independent adapter target, exact published SDK peer check
and read-only registry verification on Node 20/22. These workflow changes still
need merge and real CI publication evidence. Local authentication was refreshed,
but npm reports account 2FA disabled and rejects trust administration (403).
The account owner must enable 2FA privately; no credentials are requested in chat.

Run 35996978520 completed with 13 passing gates and confirmed private-material
cleanup. The new diagnostics identify one model response ending at the token
limit, zero tool calls, and unchanged failing tests (1 pass / 2 fail). Inspection
of @langchain/ollama 1.3.0 found the harness used Python's unsupported `reasoning`
field instead of JavaScript's `think`. Corrected that setting and added an
actual invocation-parameter assertion; model, budget and outcome checks unchanged.
Replacement native qualification is required. Core SDK/CLI trust-only run
35998089098 succeeded; stable latest remains 0.4.0 and next remains rc.11.

The corrected native run is 35999003913 on 0ea7863; general CI 35999004042
passed. A separate anonymous installation of @langchain/ollama 1.3.0 confirmed,
without inference, that `reasoning: false` leaves request `think` undefined and
`think: false` sends false. The account owner enabled npm auth-and-writes 2FA;
an interactive CLI login is being refreshed before package-settings operations.
The adapter remains unpublished/private until the native gate passes. Read-only
registry verification now explicitly allowlists the new package; unknown names
fail before any request. Source/channel/OIDC/registry tests: 16 passed locally.

Run 35999003913 passed the 13 native/tool gates and cleanup, but the model run
now fails after a read_file request (one non-truncated response). Added bounded
framework-error categories and deeper cause traversal to diagnose the actual
failure without exporting tool arguments, model content or credentials. The
refreshed npm login succeeds; security administration now requests interactive
2FA rather than the previous permission denial. No adapter publication yet.

Offline reproduction identified the post-tool failure: @langchain/ollama 1.3.0
rejects Deep Agents' text-block ToolMessage before network access. Added a
strict text-only normalization at the acceptance model transport, with no
changes to the published adapter, canonical repair or independent verification.
Three offline contracts cover identity preservation, rejection of non-text
content, and actual invoke/stream/event transport paths. Interactive npm security
approval succeeded: SDK trust lists the expected repository/workflow/environment
with publish permission. No token or 2FA code was copied into the repository.

General CI 36001593735 on d8d216d passed all eight required checks. The corrected
native run is 36001593931. Diagnostic run 36001115538 was superseded after the
offline transport reproduction; its owned cleanup passed and private material
was removed. Its receipt also records a token-limited first response with no
tool calls, so fixing transport alone is not a real-model success guarantee.
The qualification gate remains mandatory. Public guidance now names the pinned
Ollama limitation rather than suggesting it works unchanged. A separate clean
publication worktree is prepared under an owned temporary directory; private
research and local services remain untouched. No adapter has been published.

The official Ollama registry metadata was inspected without downloading weights
or running inference locally. The old pinned template unconditionally opens
`<think>`; qwen3:4b-instruct has a non-thinking template and independently verified
manifest digest 0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0.
Pin that explicit instruction variant with unchanged CPU/memory/context/output
limits and all outcome checks. Sources: https://ollama.com/library/qwen3:4b-instruct
and https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507. A full passing native receipt
is still required for this exact setup before publication.

Run 36004058904 completed the documented repair successfully: five model
responses, no invalid tool calls or truncated responses, two reads and one edit.
Original tests and the independent patch/test checks passed; cleanup removed
owned resources and private material. Only the final API-key revocation gate
failed (operator HTTP 401). Captured browser credentials now have a conservative
expiry check and are renewed through the real SSO flow before a mutation, never
retried afterward. Four focused session tests and 40 existing safety/contracts
pass. The rc.0 candidate now pins npm SDK 0.5.0-rc.11; anonymous candidate install,
38 framework/example contracts and strict declarations pass with that published
SDK. Required CI and a fully passing native rerun still precede merge/publication.

Final qualification passed in 36007730164 (15 SDK/framework gates) and
36007730084 (11 shared installation/recovery gates); both confirmed cleanup
and private-material removal. CI 36008399126 passed all required checks and all
46 browser tests. The only change after the native-tested commit was one browser
assertion matching current documentation, so queued duplicate native runs were
cancelled before provisioning. PR #54 merged normally, without protection bypass.
The clean merged worktree passed all 38 release-candidate contracts and strict
declarations against the registry SDK. Packing with Node 22.23.2 yields payload
identical to the native archive: changing only gzip's OS header byte in memory
reproduces the native SHA-256. Publish the unmodified Mac archive; record its
distinct compressed digest rather than claiming byte-identical gzip wrappers.
