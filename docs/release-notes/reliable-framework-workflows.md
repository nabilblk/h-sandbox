# Reliable Framework Workflows (Unreleased)

This is a source delivery record, not an npm release or deployment receipt.

**September 26 delivery update:** SDK/CLI rc.12 and adapter rc.2 are now published,
and public documentation is deployed. See the
[release delivery receipt](0.5.0-rc.12-delivery.md). The original source-stage
evidence and its unreleased-at-the-time scope below are preserved.

## Changes

- Shared JSON transport deadlines include response bodies, with a configurable
  120-second default, per-call request options and typed timeout failures.
- Framework submissions, polling, logs and transfers propagate cancellation and
  retain references, causes and earlier verified transfer paths. No mutation retry.
- An official PostgresSaver reference application demonstrates separate workers,
  checkpoint-bound approvals, tenant/thread bindings, crash reconciliation and
  explicit recovery of retained files without rebinding old command IDs.
- Clean npm/pnpm minimal and full consumers, Node 22/24 qualification jobs,
  legacy Node 20 checks and an upstream compatibility probe.
- Public guide additions and an executable persistent workflow runbook.

## Evidence

- [PR #59](https://github.com/nabilblk/h-sandbox/pull/59) contains source
  `f1906749a19c17e8e2794b4d4fea20f6de17f227` on the dedicated
  `codex/reliable-framework-workflows` branch. [CI](https://github.com/nabilblk/h-sandbox/actions/runs/36137161697)
  passed all 18 jobs, including PostgreSQL worker recovery, npm/pnpm consumers on
  Node 20/22/24, browser contracts, documentation, release dry run and image builds
  without publication. [Product demo checks](https://github.com/nabilblk/h-sandbox/actions/runs/36137161759)
  also passed.
- SDK: 104 unit/fault tests passed; public declaration checks passed.
- Installed SDK on Node 24.21.0: 35 runtime/request contracts, OpenCode provider
  credential regression and a verified 16 MiB artifact under a 128 MiB heap passed.
- CLI: typecheck and 83 regression tests passed.
- Real isolated PostgreSQL and separate worker processes: six tests passed
  (parent plus five scenarios), including stale-approval rejection and the
  separate lock/query connection pools. Sandbox API responses were synthetic.
- Clean npm and pnpm adapter consumers passed on Node 22.23.3 and 24.21.0,
  including minimal installation, framework behavior and public declarations.
  Final Node 22/npm and Node 24 checks passed 43 contracts; the PostgreSQL suite
  is intentionally skipped in this installed-package job and run separately above.
  The new native-runner program also passed installed-package typechecking.
- Web: typecheck, 105 unit/documentation tests, documentation link validation,
  Markdown export and production build passed. Vite retains its bundle-size warning.
- Published SDK documentation: all 18 scenarios passed against registry rc.11;
  the new source-only controls were not presented as published APIs.
- Browser: both focused guide tests passed at 1440/390/320px, including section
  navigation, code copying and Markdown fidelity. Separate visual inspection of
  the new persistent section passed at 1440/390px with no page errors or overflow.
  After recording the native receipt, all 10 documentation browser tests passed,
  including every public page at those widths; all 105 web tests and typechecking
  passed again. This evidence-only follow-up does not change the qualified SDK,
  adapter, dependency graph or native acceptance harness.
- Native runner safety/receipt tests: 11 passed. Workflow YAML parses. The
  [isolated acceptance run](https://github.com/nabilblk/h-sandbox/actions/runs/36137161754)
  passed installed SDK checks on Node 20/22/24 and all 16 native amd64 gates,
  including the new durable-recovery gate. Cleanup and private-material removal
  passed. The scheduled upstream probe has not run remotely for this milestone.

## Native Qualification

The [sanitized receipt](reliable-framework-workflows.acceptance.json) is retained
in Git so evidence does not depend on GitHub's temporary artifact retention.
It records PR merge candidate `48ef8547761f627412dd6483698968d63b87cf04`, whose
tree `92aff24c4d46a7ecbfdb2faa872cb0d945963ae3` matches implementation commit
`f1906749a19c17e8e2794b4d4fea20f6de17f227`. This was a fresh, isolated Linux
amd64 installation using published API baseline `0.5.0-rc.9` and unpublished
candidate SDK/adapter tarballs on Node `22.23.2`. It is not certification of a
new server release, another provider or restricted OpenShift.

The real-framework durable scenario used real PostgreSQL, separate worker
processes and actual sandbox effects. It verified an approval after worker
restart, cross-tenant refusal, a crash after command acknowledgement, read-only
observation without resubmission, actual server-side TTL cleanup and retained
files in a replacement runtime. Old workflow bindings and command identifiers
were not moved to the replacement. Its model decisions were scripted.

The separate real-model gate used digest-pinned Qwen3 4B Instruct with runner-local
CPU-only Ollama and no paid-model credential. Five responses requested one
listing, two reads and one edit, with no invalid tool calls or truncated responses.
Original tests remained unchanged, independent verification passed, an
implementation diff was retrieved and runtime cleanup was confirmed. This is
one small repair, not a model-quality or production reliability benchmark.

| Qualified artifact | SHA-256 |
| --- | --- |
| Candidate SDK tarball | `653ca077628c258077d6007e25971b44c036ce062bf63e7effb45562b4bba95c` |
| Candidate adapter tarball | `0e3f93da6324dad8565d20308ae5e9c7975ea9fbb12728e5c427aff23f88870c` |
| Native acceptance receipt | `ad6bc466cff7c37e5b12792ee1dbff38185c9f30747bdcea9d748a242f5162dd` |

The completed implementation plan is
[archived](../exec-plans/completed/reliable-framework-workflows.md).

No merge, lab deployment or registry publication was performed. Native checks
use only the explicitly authorized disposable GitHub-hosted runner. The local
temporary PostgreSQL instance, browser session and docs server were stopped;
existing host services and clusters were not modified.

## Release Order

Before publication, assign a new SDK/CLI release version and adapter preview
version; pin the adapter peer to that new SDK. Publish and verify the SDK before
qualifying the adapter against the **published** SDK using `--release-candidate`.
The source package test uses both candidate tarballs and is not proof that the
old registry SDK provides the new RequestOptions exports. Preserve the accepted
npm dist-tags until a separately authorized release changes them.
