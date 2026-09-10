# Execution Plan: Visible Kubernetes Installation

**Created**: 2026-09-10
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 1-2 hours

## Context

The owner requested a current North Star assessment and identified that Kubernetes
installation is not visible in the public docs. The only Brain source consulted
is the September 1 Return Report and North Star note; no linked vault notes are
read or edited. Repository source and the live public docs supply current evidence.

The public repository, authorization, persistent workspaces, Credential Vault,
TypeScript SDK/CLI and product tour are delivered within their recorded scope.
The next integration problem is self-service adoption, not restarting those
phases or adopting every provider primitive. Kubernetes instructions exist in
`infra/preview/README.md`, but the website lacks an operator installation page.
The chart README still starts with version 0.1.0 and a legacy credential example.

Recommended sequence: close this bounded documentation gap, then implement atomic
organization capacity admission across create/restore/resume/worker retries;
complete named native distribution/recovery gates and truthful usage observations;
then prioritize Python from adopter demand. Capacity admission remains absent in
`services/usage.ts` and creation paths. This plan does not implement those features.

## Success Criteria

- [x] Public navigation, overview and quickstart expose Kubernetes installation.
- [x] A version-pinned guide covers prerequisites, dependencies, two charts,
  credentials, access, a model-free native task, troubleshooting and cleanup.
- [x] Reference-profile evidence is distinguished from generic Kubernetes,
  restricted OpenShift, HA and production guarantees.
- [x] Repository entry points and generated Markdown/LLM exports agree.
- [x] Documentation tests, shell syntax, chart rendering and desktop/mobile
  browser checks pass without changing an installation.

## Phases

### Phase 1: Assessment
**Status**: Complete
- [x] Read only the permitted Brain note and compare with repository evidence.
- [x] Confirm the public navigation gap using a clean browser session.
- [x] Check published package channels, reference configuration and chart docs.

### Phase 2: Documentation
**Status**: Complete
- [x] Add a first-class Kubernetes page using existing docs components and exports.
- [x] Link it from public and repository starting points; remove stale install advice.
- [x] Keep the private customer bundle out of the OSS installation path.

### Phase 3: Verification
**Status**: Complete
- [x] Add regression checks for discoverability, commands and safety boundaries.
- [x] Run web tests/typecheck/build, docs checks and offline chart validation.
- [x] Inspect desktop/mobile browser behavior and Markdown exports.
- [x] Record actual results and archive this documentation plan.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-10 | Expose the existing versioned native profile; do not create another installer | Reuse tested configuration and ordinary Helm/kubectl steps | New umbrella installer; link-only page |
| 2026-09-10 | Keep exact public origins and credentials explicit | Avoid recurring loopback OIDC and secret-regeneration regressions | Implicit chart defaults |
| 2026-09-10 | No deployment, cluster setup, product feature or Brain edit | This request is assessment plus installation documentation | Restarting historical phases |

## Tech Debt Incurred

No new installation automation. Native amd64, encrypted Vault restore and broader
production acceptance remain existing delivery work, not documentation claims.

## Completion Notes

Delivered `#docs/install-kubernetes` under Self-hosting, linked from overview,
preview and quickstart. The article contains pinned operator inputs, private
configuration, dependency and chart steps, identity/ingress boundaries, a
model-free SDK check and cleanup/recovery guidance. Generated Markdown and LLM
exports reuse the same content. Repository entry points and the stale chart
installation example now point to the complete journey.

Verification: 76 web tests, five configuration/deployment-boundary tests, web
typecheck/build and seven Playwright docs tests passed. Browser coverage includes
1440/390/320px page overflow, operator navigation/search, mobile section selection,
highlighted code and byte-exact Markdown export. Desktop/mobile screenshots were
also reviewed with agent-browser. Both published charts downloaded anonymously
with the expected full OCI digests and passed Helm 4.2.0 lint. Their reference
values rendered 15 control-plane and 20 runtime resources; seven dependency
resources parsed successfully. Checks verified exact issuer/audience, disabled
dev auth/seeding, selected image digests, namespaces and forwarding service ports.

The first browser test launch hit a stopped background preview process and failed
with connection refused. After starting the managed local preview and checking
HTTP 200, the complete suite passed twice. Existing Vite chunk-size and Helm
umbrella-chart warnings remain; no check was waived. See the
[test receipt](../../test-report.md#2026-09-10-kubernetes-installation-documentation).

No Kubernetes resource was read or changed, no fresh native task/installation was
run, and no release/deployment/commit was performed. Published channels were
checked: SDK and CLI `next` are rc.8; `latest` is 0.4.0. This is documentation
delivery in the working tree, not a claim that the new page is live yet.

Next recommendation: publish this discoverable operator path, then implement
database-backed atomic capacity admission and its cross-client error contract.
Continue named native/recovery and usage evidence; keep Python the next focused
integration capability. Do not make customer OpenShift/BackgroundAgent or every
OpenSandbox primitive prerequisites. The permitted North Star note was read
only, and no other Brain file was accessed.
