# Execution Capacity: Public Lab Deployment

September 11, 2026. Organization execution admission is deployed on the public
k0s lab. This is a source-commit deployment, **not** a new versioned product,
npm package or chart release. Published `0.5.0-rc.8` packages remain unchanged.

## Source and Artifacts

- Implementation commit: `15dafcb`, merged through
  [PR #32](https://github.com/nabilblk/h-sandbox/pull/32).
- Deployed source: `be8f650118aba757c3e0a87c9046779420f7bac4`.
- All eight required PR checks passed, plus product-demo checks. Main-branch
  [CI](https://github.com/nabilblk/h-sandbox/actions/runs/34548434975) also passed.
- [API publication](https://github.com/nabilblk/h-sandbox/actions/runs/34548677721)
  and [web publication, attempt 2](https://github.com/nabilblk/h-sandbox/actions/runs/34548679993)
  passed through the protected Harbor environment.
- Both images use tag `0.5.0-rc.8-capacity.be8f650` under
  `core.campus.clusterdiali.me/harakiri/`. Their amd64 and arm64 manifests have
  the exact source revision label above. Version labels remain `0.5.0-rc.8`;
  use the deployment tag/digest, not that label alone, to identify this build.

| Image | Immutable Multi-platform Digest |
| --- | --- |
| `harakiri-api` | `sha256:b06ac4319a87dbd4e403e291a7ee5a033d6ebefc03502bdd0ca2321086e622aa` |
| `harakiri-web` | `sha256:24dfe7799ca09a599d5f3fa11773a8a4fb4fef66d11c2786efadcfddff6905a5` |

The installed chart remains `harakiri-0.5.0-rc.8.tgz`, archive SHA-256
`e91b7c6c2dce7d0f36a696a2233b430cb9e73cda1be801d75457a8d73549e5b3`.
Neither npm channels nor existing versioned image/chart tags were replaced.
The workflow still disables SBOM/provenance attestations for Harbor compatibility;
this is not a signed-provenance claim.

## What Is Live

- Atomic organization admission for new execution, with durable reservations,
  runtime-effect ownership, stable retries and evidence-based slot release.
- `GET /v1/org/capacity`, structured capacity conflicts and conflict-aware admin
  limit changes. The existing organizations' limits were preserved.
- Dashboard capacity displays, input-preserving create errors and settings that
  send only changed fields. Human admin permissions remain required for limits.
- First-class [Execution capacity](https://sb.harakiri.io/#docs/execution-capacity)
  documentation and [Markdown export](https://sb.harakiri.io/docs/execution-capacity.md).
  The availability notice intentionally distinguishes this implementation from
  the still-published rc.8 SDK/CLI packages.

The source SDK/CLI support this protocol. They were built and tested against the
deployed API, but were **not republished to npm** in this delivery. Execution
slots do not implement CPU/RAM/storage quotas, billing or historical usage.

## Maintenance and Activation

The previous release was `harakiri/harakiri`, revision 36, at migration 037.
Ordinary mixed-version rolling deployment was deliberately not used.

1. Confirmed the native provider's complete empty inventory, zero pending
   BatchSandbox resources and zero runtime pods. All old sandbox operations were
   terminal. No local API/worker process was running against the deployment.
2. Stopped API, scheduler and template-builder writers. Verified no writer pods,
   jobs, cronjobs or other PostgreSQL client connections remained.
3. Backed up PostgreSQL in custom format and validated its catalog. Captured
   current configuration, the application Secret and volume identities privately.
   Archived all five retained, unmounted workspace volumes and checked each
   archive. This delivery did not perform a full live backup restore.
4. Installed revision 37 with matching images and **zero writer replicas**. The
   Helm render permitted only four application image changes, writer replica
   changes and the matching `TEMPLATE_BUILDER_JOB_IMAGE` reference/checksums.
5. Applied migration 038 once. Dry-ran and applied operator inventory for all
   seven existing organizations. Verified 178 stored native identities with
   authoritative provider absence; the one no-ID failed create from September 4
   had complete operator absence evidence after all old producers were stopped.
   A stale locally paused record also had authoritative native absence.
6. All 179 records were reconciled, with zero unresolved records. All seven
   organizations became enforced without changing either the 200-slot limits
   or the five existing 2-slot limits.
7. Installed revision 38, starting only matching API/scheduler/builder writers.
   All six namespace deployments became ready; the four new application pods
   had zero restarts.

Writer shutdown started at **01:10:22 UTC**; deployment verification completed
at **01:11:47 UTC**, 86 seconds later. Public web/API returned transient 502s
during the supervised port-forward handoff, then returned 200 without restarting
the tunnel. This is not a zero-downtime claim. Keycloak discovery remained 200.

Configuration comparisons confirmed unchanged public origins, browser runtime
configuration and application Secret data. Existing key permissions/expiry,
organization limits and workspace attachment/archive state were unchanged.
PostgreSQL, registry, Keycloak/SMTP and the runtime provider were not redeployed.
No customer installation, Brain file or unrelated `docs/cot/` material was touched.

## Acceptance

- Pre-delivery evidence: 631 workspace tests, 33 mandatory real-PostgreSQL checks,
  eight native runtime checks and 29 source-browser checks passed. Build,
  typecheck, OpenAPI, examples and documentation checks passed; see the
  [implementation receipt](../operations/execution-capacity-acceptance.md).
- The actual [limit-one SDK tutorial](../../examples/sdk-execution-capacity/README.md)
  passed against `https://sb-api.harakiri.io` using a dedicated organization and
  an expiring scoped key: same-key replay, expected 409 at the limit, confirmed
  release and successful subsequent admission. No existing organization was
  used or reduced to a one-slot limit for this test.
- Additional live async create/replay, native command execution and built CLI
  `capacity --json` passed. The first command assertion expected no final newline;
  the provider returned the expected marker with a newline. The harness was
  corrected to compare the marker, its workload was cleaned, and the test reran.
- All four test runtimes were confirmed absent through provider GET. The test
  key was revoked and returned 401; its membership was removed and local token
  material deleted. Non-executing test organization/key/operation/ledger audit
  records are retained. The temporary operator pod was removed.
- Final database check: migration 038 applied once, zero held reservations,
  zero unsettled effects, all eight organizations enforced including the test
  organization. Existing limits remained unchanged.
- Real public administrator OIDC sign-in, authenticated capacity/settings reads
  and sign-out passed. PKCE used `S256`, the public Keycloak issuer and the public
  web callback. Browser runtime configuration contained no localhost origin.
  SMTP/password-reset delivery and the entire refresh-token matrix were not rerun.
- Authenticated settings and capacity documentation screenshots were inspected
  at desktop/mobile sizes. No document-level horizontal overflow was observed.
- All seven documentation browser tests passed against the public image,
  including all docs/diagrams at 1440, 390 and 320px, navigation, search and copying.
  Markdown, inventory and LLM exports exactly matched the generated source.
- Demo-media MIME types, revalidation, range requests and missing-media 404s
  passed on the public site.

An initial attempt to run Vite-module authentication fixtures against the bundled
production site was stopped after two failures and one interrupted test. Those
fixtures intercept `/src/auth.ts`, which production does not load. They passed
in their intended source/CI environment, not as production-auth acceptance.
The public documentation suite and real signed-in checks above are separate.

## Registry Incident and Remaining Work

The initial web upload failed with Harbor filesystem `Err 28` despite its health
endpoint being green. Dry-run GC 1296 found 10 unreferenced blobs and zero
manifests. GC 1297 reclaimed **124 MB**, with `delete_untagged=false` and
`delete_tag=false`. No tagged image or manifest was deleted. A successful empty
upload probe was cancelled; retrying the same web job then succeeded.

Registry disk headroom still needs monitoring and durable expansion/planning.
The recovery above is not proof of sufficient space for future releases.
Extended fault/lifecycle acceptance, compatible rollback rehearsal, matching
npm/chart release and broader platform support remain in the
[active capacity plan](../exec-plans/active/organization-capacity-admission.md).
This deployment does not certify native amd64, optional pause/snapshot/Vault
matrices, restricted OpenShift, HA, or complete encrypted recovery.

## Recovery Boundary

Revision **37** is the matching-image, admission-closed maintenance state, not a
previous feature version. A rollback to it would stop API/scheduler/builder
writers; it would not undo migration 038. That rollback was not exercised here.
Review later release changes before selecting a revision. Never automatically
roll back to revision 36/pre-capacity binaries with mutations open against this
database. Follow the [operations runbook](../operations/execution-capacity.md).

Owner-only backups, guarded deployment scripts, inventory evidence and screenshots
remain in ignored `docs/artifacts/capacity-deploy-private/`. Do not publish that
directory or restore its database/configuration independently of runtime inventory.
