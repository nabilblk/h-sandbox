# Lightweight Plan: Hands-on User Tutorials

**Created**: 2026-09-04
**Status**: Completed
**Scope**: Add scenario-based, executable user tutorials to the repository guide and public documentation website.
**Estimated**: 1-2 hours

## Goal
Turn the existing feature-oriented documentation into task-oriented tutorials that users can run against a real Harakiri deployment, verify through explicit checkpoints, and clean up safely.

## Steps
- [x] Audit current CLI/SDK examples and select representative end-to-end scenarios.
- [x] Add a source user guide with prerequisites, tested commands, expected results, troubleshooting, and cleanup.
- [x] Add a polished Hands-on tutorials page to the public documentation and index it for users.
- [x] Add focused content tests and run documentation/web validation.
- [x] Execute the represented scenarios against the current k0s deployment, record the outcome, and archive this plan.

## Notes
Tutorials use only the public Harakiri CLI and SDK contracts. Existing deployment smoke scripts may be used as verification evidence, but maintainer-only setup and local cluster details must not leak into the user workflow.

## Outcome
Added six executable, assertion-driven workflows to `docs/tutorials.md`, a
responsive Hands-on tutorials page to the public docs, and a runnable SDK
worker example. The scenarios cover files and commands, private routes,
restricted egress, Git, lifecycle persistence, and application integration.

All scenarios passed against the public k0s-backed deployment. Web tests,
typecheck, production build, documentation links, examples, and diff checks
passed. Browser acceptance covered seven viewport widths with no page-level
overflow. The deployed web container uses image ID
`sha256:b240171b165afafff33e8348128c8f9775f63527307316551f8d55d3ae83f310`;
web, API health, and Keycloak discovery returned HTTP 200 after rollout.

Follow-up: split the public web bundle, which still emits Vite's existing
greater-than-500-kB chunk warning. This does not block the tutorial workflows.
