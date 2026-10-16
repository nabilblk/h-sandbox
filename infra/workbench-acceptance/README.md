# Native Workbench Acceptance

Only for a fresh GitHub-hosted Ubuntu 24.04 amd64 runner. Never run bootstrap,
the native runner, or cleanup locally or against a live cluster. The existing
`infra/acceptance` bootstrap/context enforce runner identity, loopback
kubeconfig, cluster UID and ownership labels. No custom installer, cluster
selection input, credentials, publication, deployment or model test is added.

## Design

1. Reuse the pinned baseline install, configuration and published browser/SDK
   consumer. Build **both current-checkout API and web Dockerfiles** on the
   runner, label them with the exact checkout SHA, import into its containerd,
   and Helm-upgrade the pinned chart with preserved generated values. Only
   image settings and the builder job image change. `Never` pull policy and
   ready-pod checks prevent fallback to published API/web images. The API's
   current provider large-file fix is installed **before** file checks; the
   pinned rc.9 baseline is only installation infrastructure, not the candidate.
2. Reuse real `operatorSession` OIDC/S256 PKCE onboarding and its scoped key.
   `importAcceptanceTemplate` imports the pinned native image; create one
   owned, expiring sandbox. The template runs sleep, not a model workload.
3. Exercise public UI selectors from `tests/e2e/sandbox-workbench.spec.ts` with
   the installed Chromium. No fixture routes, fake runtime, API fulfillment,
   mocked WebSocket, auth bypass or injected application state:
   - Overview receives real readiness without attaching a terminal.
   - Xterm sends binary input, renders shell output, and changes real `stty
     size` dimensions after viewport resize. Disconnect, reconnect with new
     output, and pane-exit socket closure are required.
   - Upload 1 MiB of deterministic binary bytes through the file input and
     confirmation dialog; download through the browser and compare all bytes
     plus SHA-256. This crosses the old provider argument-size failure.
   - Logs display actual terminal attach/detach control-plane events, filter
     them and follow a real subsequent snapshot. This does not claim container
     stdout coverage for the intentionally quiet sleep entrypoint.
   - Metrics require fresh, advancing native CPU/memory observations, rendered
     values and explicit unavailable disk/network fields, not synthetic zeros.
   - Run one tracked command in the UI, require output, success/exit 0 and an
     independent `sha256sum` of the uploaded file. Click its overview deep link
   and reload it, preserving identity/output without another command POST.
   The receipt calls this `singleSubmission`, not distributed exactly-once.
   - Create a second real key with only `sandboxes:read`. Prove it can read the
     sandbox, then substitute only the exact UI attach-ticket request's auth
     header. Require a real API 403/forbidden, visible UI error, disabled input,
     no socket and no automatic retry during a bounded observation window.
4. `finishReceipt` independently attempts sandbox deletion/capacity release,
   both key revocations (verified by 401), browser closure and forward cleanup.
   The workflow's always-run guarded cleanup removes owned namespaces and all
   private state even after a partial run. Cleanup failures fail qualification.

Only the allowlisted `standalone-acceptance-report.json` is uploaded, retaining
the shared filename for cleanup finalization. It contains source/image IDs,
gate outcomes, sizes/checksums and cleanup results. Raw errors stay in the
private runner directory until cleanup. No screenshots, traces, HARs, browser
state, tokens, identity, file contents or command output are uploaded. Screenshots
are not captured by default (or by this harness), since the UI contains identity.

## Commands

Safe hermetic checks, no browser or cluster:

```sh
node --test infra/acceptance/safety.test.mjs infra/acceptance/browser-session.test.mjs infra/workbench-acceptance/*.test.mjs
git diff --check -- infra/workbench-acceptance .github/workflows/workbench-acceptance.yml
```

CI runs these commands in order on its disposable runner only:

```sh
node infra/acceptance/bootstrap.mjs
node infra/workbench-acceptance/run.mjs
node infra/acceptance/cleanup.mjs # always, including failure
```

The workflow runs on matching same-repository PRs, never fork PRs, or manually:

```sh
gh workflow run workbench-acceptance.yml --ref feat/sandbox-workbench
```

Job timeout is 60 minutes; bootstrap and acceptance have 10/45 minute step
limits to reserve cleanup time. No host pnpm install is needed: source builds
use existing Dockerfiles, and the existing installer provisions the consumer.
A passing receipt qualifies an **unpublished source candidate**, not a release
or a substitute for post-publication verification.

## Implementation Status

- [x] Reuse guarded installation, source API/web import and OIDC fixture.
- [x] Implement real UI gates and independent cleanup with sanitized receipts.
- [x] Add manual/own-PR workflow and hermetic safety/fixture contracts.
- [x] Run hermetic verification (27 checks passed) and review the scoped files.
- [ ] Parent runs native CI after committing; not run locally.
