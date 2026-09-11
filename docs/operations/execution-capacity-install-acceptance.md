# Capacity Installation and Rollback Acceptance

September 11, 2026. **Safety and compatible rollback evidence, not a new package
release or an unconditional clean-install pass.** The public lab was not changed.

## Safety Gate

[PR #34](https://github.com/nabilblk/h-sandbox/pull/34) merged as
`19790c581a4c5501addf88d2949207c85a8bac7a`. All eight required checks passed in
[PR CI](https://github.com/nabilblk/h-sandbox/actions/runs/34572019340) and
[main CI](https://github.com/nabilblk/h-sandbox/actions/runs/34572358316).
The required PostgreSQL gate now runs 157 checks without optional skipping:
33 existing admission checks, 121 write/commit fault checkpoints, two actual
HTTP-disconnect cases and the enclosing new suite. See the
[fault acceptance receipt](execution-capacity-fault-acceptance.md).

## Isolated Installation

An entirely new operator-owned VM, `harakiri-capacity-acceptance`, used the
[standalone reference instructions](../../infra/preview/README.md): Linux/arm64,
k0s `v1.36.3+k0s.2`, Ubuntu 24.04, 8 CPUs, 16 GiB RAM, 80 GiB disk and local-path
storage. Its explicit kubeconfig used API port 16444; the populated public lab,
default kubecontext and other projects were not modified.

PostgreSQL `16.15-alpine`, Keycloak `26.7.3`, runtime chart
`0.2.2-harakiri.2` and Harakiri chart `0.5.0-rc.8` installed normally. Configuration
was generated once, privately, with random credentials, browser PKCE and an API
audience. Dev authentication and runtime fallback remained disabled. The
[rc.8 public overlay](../release-notes/0.5.0-rc.8-public-values.yaml) selected the
baseline images. No customer package, BackgroundAgent, SCC change, chart rebuild,
or runtime pod exec was involved.

The published SDK and CLI `0.5.0-rc.8` were installed in a separate consumer
directory. Browser sign-in, onboarding, organization settings and one-time scoped
key creation passed. The CLI imported the OpenCode image pinned in the
[rc.8 artifact receipt](../release-notes/0.5.0-rc.8-delivery.md); its runtime image
pull preflight took approximately 94 seconds on this new node.

## Native Results

| Check | Observed result |
| --- | --- |
| Cold asynchronous first task | Failed once after `wait:false` creation and `waitForSandbox`: lifecycle reported `running` before the execd file endpoint accepted connections; first write returned `runtime_files_unavailable` / HTTP 502 |
| Resumed task | A later read-only file listing succeeded. The harness resumed the same owned sandbox, without recreating it; subsequent checks passed |
| OpenCode | `harakiri-opencode-smoke` exited zero, including its server health check; no model or paid account used |
| Files and artifacts | Workspace checkpoint and binary bytes round-tripped through the published SDK |
| Protected route | Anonymous request denied; token-authenticated request reached the native HTTP server; route and server were removed afterward |
| Existing-runtime migration | Migration 038 initially closed admission. Complete provider inventory reported one page, one native runtime and no untracked execution; activation retained exactly one occupied slot |
| Capacity behavior | Limit one survived upgrade; new unique create returned 409; a same-key request returned the already accepted sandbox |
| Workspace replacement | Termination was followed by confirmed release and reattachment to a new sandbox; the original file survived |
| Compatible rollback | Returning to the previous capacity-aware image retained migration 038, the same runtime identity, checkpoint, active reservation and replay behavior |
| UI after upgrade | Existing browser session loaded the updated Settings page with execution limit one and accurate full-capacity state |

The capacity summary was checked through the HTTP API and database, not through
a nonexistent capacity helper in the published rc.8 SDK/CLI. Those new client
methods still require the matching package release. This acceptance harness used
the guide's published artifacts and workflow primitives; it is not a claim that
every guide snippet or supported profile was rerun verbatim.

The cold-start failure is a real product finding, not an acceptable reason to
hide a retry in an installation success claim. Current lifecycle observation and
`waitForSandbox` do not establish execd readiness in this observed case. Resolve
or explicitly triage that boundary before claiming a reliable cold first task.
Do not retry arbitrary commands/writes automatically: their outcome may be
unknown. Retain the accepted sandbox ID instead of creating another execution.

Two later harness assertions initially read the raw API error's `code` field;
the public response uses `error`. Correcting the harness yielded the expected
409/error assertion. The original failures remain in private evidence; no server
contract or data was changed to make them pass.

## Maintenance and Rollback

All old API, scheduler and template-builder writers were stopped before migration.
Both databases, operator Secrets/configuration and the quiescent workspace were
backed up; archive inventories and checksums were verified. The surviving runtime
had no active task writing its files. This exercise did not restore the archives
and is not a new database/volume recovery certification.

| Fixture Helm revision | State |
| --- | --- |
| 1 | Published rc.8 API and docs.2 web; baseline login and native workflow |
| 2 | Capacity-aware image selected; all mutation producers at zero replicas; backups, migration and inventory activation performed with a separate operator pod |
| 3 | Capacity-aware `be8f650` image reopened; legacy hold accounted for, retained workspace reattached and new same-key replay tested |
| 4 | Local-only image from reviewed source `19790c5`; the same runtime, reservation and file verified |
| 5 | `helm rollback harakiri 3`; all three writers returned to the previous capacity-aware image; native checkpoint, replay, 409 denial and database evidence verified again |

The previous API image is
`core.campus.clusterdiali.me/harakiri/harakiri-api:0.5.0-rc.8-capacity.be8f650@sha256:b06ac4319a87dbd4e403e291a7ee5a033d6ebefc03502bdd0ca2321086e622aa`.
The arm64-only local acceptance image manifest is
`sha256:05fb1c790af011b302b17406e1bb0e2d858621bfe0b9d1b7a8bff88b787c6afb`.
It was built in an isolated rootless BuildKit pod and imported into this VM's
containerd. **It was not published to Harbor and is not a release artifact.**
Both builds implement the same capacity protocol; this does not validate rollback
to rc.8 or compatibility with an arbitrary future schema change.

Local port forwards were restarted after pod replacement, as the installation
guide requires. This was not an ingress repair. Sandbox execution, files, routes
and authoritative absence checks used Harakiri/runtime APIs. Platform database
and read-only backup pods were used only for operator work.

## Release Gates Still Open

1. **Harbor physical storage.** API access is available, but host/cluster access
   is not configured. Harbor 2.12.2 returned no usable storage size/free-space
   values from its volumes API. Filesystem/inode headroom and a durable expansion
   or monitoring policy still require operator access. No artifact deletion was
   performed in this work.
2. **Unattended npm publication.** GitHub-to-npm authentication is now verified
   for both packages after the owner configured their trusted publishers.
   Protected verification-only run
   [34599562524](https://github.com/nabilblk/h-sandbox/actions/runs/34599562524)
   successfully exchanged both package-scoped identities from reviewed source
   `ebc8bb1`, workflow `npm-release.yml`, environment `npm`. Publication was
   skipped; no package versions or dist-tags changed. Local `npm trust list`
   still returns 403 with the existing token, which does not invalidate that
   live OIDC proof. Direct publication permission and actual candidate delivery
   remain to be tested. See the [verification procedure](../ci-release.md#verify-trust-without-publishing).
3. **Cold-start readiness.** The failure above needs an explicit outcome before
   presenting the installation's first task as reliably ready.
4. **Coherent candidate and consumption.** No new version/tag was selected or
   published. A matching SDK/CLI/images/chart candidate, anonymous consumption
   and installation of that actual bundle remain unverified. npm `next` stays
   `0.5.0-rc.8`; `latest` stays `0.4.0`.

The local Colima Docker filesystem was also full (98 GiB filesystem, zero
available; inodes 38% used). The first local build failed at apt signature
verification; disk exhaustion is a likely explanation, not an independently
isolated root-cause proof. Other projects use that daemon, so it was neither
pruned nor restarted. The isolated builder completed the image without changing
repository build/security settings.

Native amd64, restricted OpenShift, pause/snapshot execution, encrypted Vault
recovery, HA and public wildcard routing are not certified by this test.

## Cleanup

Both owned runtimes were confirmed absent through the provider API; both ledger
holds were released, capacity returned to zero and the workspace was archived.
The one-time test key was revoked in the dashboard and rejected with HTTP 401;
its local plaintext copy was removed. Browser sign-out returned to the signed-out
landing page. Private operator configuration, failed attempts and backups stay
outside Git. The active
[capacity plan](../exec-plans/active/organization-capacity-admission.md) remains
open for the actual release gates; successful safety tests are not publication.

The operator/backup-reader pods and isolated BuildKit builder were removed. The
disposable PostgreSQL test process and local acceptance forwards were stopped.
The fixture VM is retained, stopped, for the remaining candidate acceptance;
retained Helm/database/PVC state is not described as a complete uninstall. The
public lab VM and unrelated Colima workloads were not stopped or pruned.

Documentation export/link checks and ten focused guide/export tests passed.
The updated guide was inspected at 1440px and 390px with browser screenshots and
no page overflow. Public web, hosted installation Markdown, API health and OIDC
discovery returned HTTP 200; the issuer remained the public sb-auth origin.
These additional guide changes have not been deployed as a new web image.

## npm Authentication Follow-Up, 2026-09-11

PR #36 added a verification-only mode to the existing protected npm workflow;
PR #37 aligned its response validation with npm CLI 11.19.1. Both passed all
eight required CI checks. The first live attempt returned HTTP 201 for the SDK
but the checker incorrectly required auxiliary response metadata. That checker
failure is retained as run 34598935295, not attributed to owner configuration.
The corrected run linked above passed SDK and CLI exchanges without printing,
persisting or using the exchange tokens for package writes. Nine focused tests
cover the verifier and release guards. Both npm channels were checked afterward:
`next=0.5.0-rc.8`, `latest=0.4.0`.

This follow-up changed release tooling/documentation only. Runtime readiness,
Harbor storage and the public platform deployment were not changed. The active
capacity plan remains open for those release gates and actual artifact acceptance.
