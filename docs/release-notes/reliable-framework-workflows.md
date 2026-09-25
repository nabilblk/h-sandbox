# Reliable Framework Workflows (Unreleased)

This is a source delivery record, not an npm release or deployment receipt.

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
- Native runner safety/receipt tests: 11 passed. Workflow YAML parses.
  The new native recovery gate and scheduled upstream probe are configured but
  have not run remotely for this milestone.

**Remaining qualification:** run the dedicated native amd64 acceptance workflow
on an authorized disposable GitHub-hosted runner and record its receipt. Do not
close this as runtime-qualified based on the local protocol fixture. Prior
release receipts do not qualify the new recovery gate.

No k0s deployment, registry publication, push or model inference was performed.
The temporary PostgreSQL instance, browser session and docs server were stopped;
existing host services and clusters were not modified.

## Release Order

Before publication, assign a new SDK/CLI release version and adapter preview
version; pin the adapter peer to that new SDK. Publish and verify the SDK before
qualifying the adapter against the **published** SDK using `--release-candidate`.
The source package test uses both candidate tarballs and is not proof that the
old registry SDK provides the new RequestOptions exports. Preserve the accepted
npm dist-tags until a separately authorized release changes them.
