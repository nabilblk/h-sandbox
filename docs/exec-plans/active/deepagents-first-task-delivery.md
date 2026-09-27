# Plan: Deep Agents First-Task Documentation Delivery

**Created**: 2026-09-27
**Status**: In Progress
**Scope**: Commit and publish the reviewed examples/documentation, then deploy only the web image to the existing k0s lab.

## Goal

Make the simpler local-to-sandbox tutorial and corrected comparison layout live.
Use protected-branch checks, an immutable web image and a guarded same-chart Helm
upgrade. No npm version, backend, schema or runtime-provider change is required.

## Steps

- [x] Confirm changed-file scope, protected branch and explicit target identity.
- [ ] Commit and push a dedicated PR; merge only after CI passes.
- [ ] Publish and verify a web-only image from the reviewed merge commit.
- [ ] Capture private rollback state, compare a server-side dry run and deploy.
- [ ] Verify public docs, downloads, desktop/mobile layout and public OIDC URLs.
- [ ] Confirm non-web resources are unchanged; archive the plan and delivery receipt.

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

Pending commit, protected CI, artifact publication and deployment verification.
