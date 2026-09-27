# Plan: Deep Agents First-Task Documentation Delivery

**Created**: 2026-09-27
**Status**: Completed
**Scope**: Commit and publish the reviewed examples/documentation, then deploy only the web image to the existing k0s lab.

## Goal

Make the simpler local-to-sandbox tutorial and corrected comparison layout live.
Use protected-branch checks, an immutable web image and a guarded same-chart Helm
upgrade. No npm version, backend, schema or runtime-provider change is required.

## Steps

- [x] Confirm changed-file scope, protected branch and explicit target identity.
- [x] Commit and push a dedicated PR; merge only after required CI passes.
- [x] Publish and verify a web-only image from the reviewed merge commit.
- [x] Capture private rollback state without changing the running cluster.
- [x] Compare a server-side dry run and deploy only the web image.
- [x] Verify public docs, downloads, desktop/mobile layout and public OIDC URLs.
- [x] Confirm non-web resources are unchanged; archive the plan and delivery receipt.

## Boundaries

- Use only `infra/k0s/harakiri.kubeconfig`, namespace/release `harakiri`, node UID
  `942b7e9d-e271-42a5-9fb1-0c6fbb045a61`. Never use the default customer context.
- Starting Helm revision: 46, installed chart `0.5.0-rc.10`; web currently rc.12.
- Reuse the installed chart and all operator values. Permit only its web image
  reference to change. Preserve public origins, credentials and non-web workloads.
- Never print raw Secrets, Helm values or private deployment snapshots.
- Do not run legacy bootstrap scripts, change credentials, publish npm packages,
  access Brain, touch customer installations or include untracked `docs/cot/`.
- Local qualification already passed: 105 web tests, typecheck/build and 11
  documentation browser tests, with comparison checks at ten viewport widths.

## Outcome

PR #62 merged as `475199033a5a79faffcc7921f20dd09269504621`. The merge tree
matches the reviewed source exactly. All required checks and 22 total checks
passed before merge; the additional isolated native check was still running.
The shared PostgreSQL timing budget failed once and passed on an unchanged
rerun. No thresholds, API source or workflow gates were modified.

The native run subsequently passed all 16 gates and cleanup, bringing PR #62
to 23 passing checks. Its candidate `b4a7b841aa2f15eb9fcebb0fc230874f170db713`
has the same tree as the deployed merge. The native workload, including a small
model-driven repair, ran only on the disposable GitHub-hosted amd64 runner.

Web-only publication passed in Actions `36341547268`, using tag
`0.5.0-rc.12-deepagents-docs.4751990` and index digest
`sha256:21919e0988dd97be84768f2a82e63e5be9d8a3fa8476116381b2b33a5901160f`.
Both platforms' manifest/configuration digests and source labels were verified.

The guarded same-chart upgrade advanced the lab to revision 47. Exactly one
rendered field changed: the web container image. All 22 checked non-web resources,
10 running non-web pod identities, operator values other than the image tag and
the public browser configuration were preserved. All 11 live documentation
browser scenarios passed; desktop/mobile screenshots and public OIDC form/PKCE
checks passed. Monitoring recorded 56 HTTP 200 responses and one HTTP 502 during
the handoff, followed by recovery. No zero-downtime claim is made.

Revision-46 rollback values, manifests, resources and the rc.10 chart archive
remain in an owner-only ignored directory. The initial snapshot comparison
mistook omitted JSON fields for changes; normalization corrected the private
guard, then the full comparison passed before any cluster mutation.

The [delivery receipt](../../release-notes/2026-09-27-deepagents-first-task-delivery.md)
records source, artifacts, verification and scoped rollback. No npm publication,
chart upgrade, backend rollout, credentials change, Brain access or customer
environment work was performed. Temporary browser sessions were closed.
