# Usage Observations: Unreleased Draft

September 12, 2026. **Local source implementation, not a delivery receipt.**
Baseline: `8f25dfa2f1b9cd3e06db10e3eda87268f686917c`, published rc.9/schema 038.
Candidate version and immutable artifacts are unassigned. npm `latest`/`next`,
running clusters and public origins are unchanged by this work.

## Changes Prepared

- First-run onboarding selects eligible installed templates, including an empty
  catalog handoff. It keeps one creation intent and recovers command submission
  through reads. The finite shell task requires no LLM credential.
- Organization history reports accepted create/restore/resume operations,
  terminal outcomes, held execution-slot time/peak and independently observed
  readiness. Missing coverage is explicit, not synthetic zero or billable compute.
- `GET /v1/usage/history`, `client.usageHistory()` and `harakiri usage --period
  24h --json` preserve the existing usage-summary contract. History requires
  `org:read`; it never accepts another organization's identity from the caller.
- The Usage screen separates current capacity from historical observations,
  with bounded periods, missing-data states and accessible bucket values.
- Optional authenticated private metrics, Helm settings and tested Prometheus
  examples cover collector/maintenance lag, denial attempts and operator-supplied
  storage bytes/inodes. No monitoring stack or public metrics ingress is added.
- Public concepts, tutorial, API/CLI references, exports and operator guidance
  describe definitions, limits, scopes and compatibility as a source preview.

## Migration and Rollback Boundary

Migration 039 adds observation/coverage tables and read indexes. It does not
modify capacity admission rules or prune source reservations/operations. Apply
matching API/scheduler configuration; retain source facts and encrypted backups.
Old rc.9 binaries do not collect history. Their operation must appear as a gap
after re-upgrade, not as a zero-activity interval.

The intended compatible binary target is rc.9 with schema 039 retained. **This
is not qualified rollback advice yet.** Run the source rehearsal and then the
actual published-pair test. Never run pre-capacity rc.8 writers after schema 038.
See [the technical contract](../operations/usage-observations.md) and
[release qualification](../ci-release.md#usage-candidate-qualification).

## Local Verification

- Full workspace tests, typechecks and build passed. Live/database suites stayed
  behind their safety gates; skipped tests are not acceptance evidence.
- 44 Playwright contract tests passed: authorization, capacity, onboarding,
  Usage states and all public documentation at 1440/390/320px. Usage and first-task
  screenshots were visually reviewed. These use isolated browser fixtures.
- SDK/CLI tarballs installed with anonymous npm configuration; the new usage
  example typechecked against the installed SDK. No package was published.
- Examples, generated OpenAPI, targeted changed-document links, default/restricted
  Helm lint, private-monitor rendering, release guards and nine promtool rule
  fixtures passed. No Prometheus daemon, database or cluster was started locally.
- The high-severity dependency audit and Credential Vault boundary check passed.

The plan remains active. Real PostgreSQL concurrency/performance, native runtime
and recovery, live private scraping, storage headroom and actual published-pair
compatibility are still unqualified at this checkpoint. Following local review,
the owner authorized hosted qualification, release and a guarded k0s deployment.

## Delivery Receipt to Complete After Approval

| Evidence | Current state; replace only with actual results |
| --- | --- |
| Candidate version/source/tag | Unassigned; working-tree implementation only |
| Source CI/PR | Authorized after local review; result pending |
| PostgreSQL scale/concurrency | Tests written; no database acceptance executed |
| Native source rehearsal | Harness written; not executed |
| Published image/chart/package identities | Not published; do not reuse rc.9 coordinates |
| npm integrity/provenance and dist-tags | Candidate publication authorized after qualification; preserve stable latest |
| Published rc.9 -> candidate -> rc.9 -> candidate | Not tested; source rehearsal cannot satisfy this row |
| Replacement-database, encrypted and provider recovery | New candidate not tested; older rc.9 evidence remains separately recorded |
| Operator monitoring | Local listener, Helm rendering and Prometheus rule fixtures; no live scrape/headroom proof |
| Harbor physical bytes/inodes/quota/growth | Unverified; storage operator/contact must supply evidence |
| Deployment, public OIDC, adopter confirmation | Guarded k0s application deployment authorized after qualification |
| Stable-channel decision | Separate owner authorization required |

Retain source SHA, workflow run/attempt links, baseline and candidate manifests,
native platform/cluster UID, schema versions, package integrity/provenance,
positive/negative gate results, quantitative timings and cleanup status in the
eventual receipt. Never upload private values, kubeconfigs, tokens, database
backups, command environments or browser sessions to prove a gate.
