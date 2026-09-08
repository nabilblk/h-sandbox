# Execution Plan: Authorization Consolidation

**Created**: 2026-09-08
**Author**: Codex
**Status**: Completed (source and local verification; not deployed)
**Priority**: P0 authorization findings from the September 8 assessment
**Estimated effort**: Multi-phase, cross-contract security change

## Context

The maintainer approved authorization consolidation after the September 8 North
Star reassessment. At the start, organization settings accepted member writes,
API keys borrowed the oldest member's identity, and JWT validation lacked an API audience.
Credential use, streamed commands and terminal tickets share those identities.

Scope: authorization and identity across API, credentials, live connections,
API-key management, public contracts, dashboard, deployment configuration and
documentation. Capacity admission, usage, Python, BackgroundAgent, live
deployment and release publication are not part of this change.

## Success Criteria

- [x] Settings/members and sensitive organization operations enforce permissions
      on the server; hidden UI controls are not the security boundary.
- [x] API keys are explicit principals, never impersonate members, have validated
      scopes/expiry/creator metadata, and cannot mint stronger keys.
- [x] Members manage their own keys; admins manage org keys. Legacy key behavior
      and the migration of implicit admin privileges are explicit.
- [x] JWT request and live-session validation enforce issuer, audience, subject,
      signature and expiry. Invalid credentials never fall through to dev auth.
- [x] Credential source use honors sharing and key scopes, including create-time
      mappings. Audit attribution identifies individual keys without human FKs.
- [x] Revoked/expired identities cannot open or retain command streams/terminal
      connections through a previously issued ticket.
- [x] Keycloak realm/chart/runbook updates include safe upgrade ordering without
      changing public OIDC redirects or modifying live realms.
- [x] Negative authorization tests, PostgreSQL migration/identity tests, full
      affected suites, public contracts and browser workflows pass.

## Phases

### Phase 1: Contract and Threat Boundaries
**Status**: Complete
- [x] Inventory API routes, principal consumers, Vault role checks and terminals.
- [x] Verify audience mapper and JWT validation against primary documentation.
- [x] Define scoped API-key permissions, human role ceilings and legacy handling.
- [x] Add migration and shared request/response contracts.

### Phase 2: API Identity and Authorization
**Status**: Complete
- [x] Separate key and user identities; implement issuer/audience validation.
- [x] Enforce an explicit, fail-closed route policy and domain-sensitive checks.
- [x] Implement owner/admin API-key management with scopes and expiration.
- [x] Carry key identity through credential use and audit attribution.

### Phase 3: Live Authorization
**Status**: Complete
- [x] Bind terminal tickets to the actual principal and authentication expiry.
- [x] Recheck permissions, membership, revocation and expiry for streams/terminal.
- [x] Verify observers are closed without killing detached background commands.

### Phase 4: Product and Operator Contracts
**Status**: Complete
- [x] Expose key name/scopes/expiry and ownership in dashboard/API/SDK contracts.
- [x] Keep member onboarding and read-only settings coherent with server policy.
- [x] Add dedicated audience to realm artifacts and generated install config.
- [x] Document permissions, legacy migration, staged upgrade and recovery.

### Phase 5: Verification and Completion
**Status**: Complete
- [x] Exercise admin/member/key/wrong-org/expired/revoked/wrong-audience matrix.
- [x] Validate real PostgreSQL migration and principal persistence.
- [x] Add the PostgreSQL authorization regression to the existing CI database job.
- [x] Run API/web/SDK/CLI tests, typechecks, OpenAPI and documentation checks.
- [x] Browser-test admin/member controls, failures, key creation and revocation.
- [x] Record evidence and remaining deployment requirements; archive only when
      the source/verification work is complete. No live rollout is authorized.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-08 | API keys use their own ID and null human actor ID. | No invented user, oldest-member borrowing or human privilege inheritance. | Synthetic service users, creator impersonation. |
| 2026-09-08 | Members manage their own bounded keys; admins may grant sensitive scopes. | Preserve developer workflows without giving members organization administration. | Admin-only key creation, unrestricted org keys. |
| 2026-09-08 | Existing keys retain a documented runtime-only legacy profile; new keys have bounded expiration. | Avoid a sudden outage while removing implicit administrator authority. | Silently revoke all keys, preserve inherited admin grants. |
| 2026-09-08 | Dedicated `harakiri-api` JWT audience; realm mapper first, API second. | Fail closed on token substitution without changing public login/callback URLs. | Trust `azp` instead of audience, accept generic `account` tokens. |
| 2026-09-08 | Keep admission/usage and deployment outside this plan. | User selected authorization consolidation, not the entire adoption roadmap. | Broad unrelated hardening/release rollout. |
| 2026-09-08 | Manual credential refresh checks source ACLs; trusted resume/reconciliation explicitly selects system resolution of existing bindings. | A null actor cannot implicitly grant access. Preserve background maintenance without allowing new source access through a manual refresh. | Continue sharing one privileged resolver across public and internal callers. |

## Tech Debt Incurred

- Legacy keys retain a runtime-only, potentially non-expiring compatibility
  profile until operators rotate them. The database default remains compatible
  with an ordered rollout; old API instances must not remain in service.
- Offline JWT validation detects provider logout only at token expiry. Immediate
  global logout requires a future introspection/revocation integration, not a
  claim made by this implementation.
- SDK protocol mirrors remain manual, following the existing package boundary.
  Keep future scope/type changes synchronized with shared contracts and OpenAPI.

## Completion Notes

Completed September 8, 2026. Central route policy fails closed; API keys have
their own principal, owner, scopes and expiry. Vault use and maintenance paths
are separated explicitly. Terminal tickets/live observers revalidate identity;
member settings/onboarding and key management match the server policy.

Verification performed locally:

| Gate | Evidence |
| --- | --- |
| Build and types | Root `pnpm build` and `pnpm typecheck` passed; affected API/web checks rerun after final edits. Existing Vite chunk-size warning remains. |
| Workspace tests | `pnpm test`: 548 passed, 3 database-gated skips. |
| API with real PostgreSQL | Entire API suite with both test database URLs set: 331 passed, zero skipped. Includes migration 037, ownership, tenant isolation, creator removal/demotion, expiry, key audit attribution, single-use/revoked tickets and verified-email subject binding. |
| Focused database regression | CI's workspace/lifecycle/authorization PostgreSQL command: 20 passed. Authorization test added to that existing CI job; remote CI itself was not run here. |
| SDK/CLI integration | `pnpm conformance:dev` passed with an isolated local API/PostgreSQL and the dev runtime provider. Packaged CLI create/route/cleanup and SDK integration passed. This is not OpenSandbox or live Keycloak acceptance. |
| Browser | `tests/e2e/authorization.spec.ts`: 7 passed. Admin/member settings, member onboarding without settings writes, scoped key creation, denied requests, one-time clipboard, confirmed revocation, focus/Escape, 1440/390/320px layouts and readable scope names. |
| Visual review | Reviewed local screenshots under `docs/artifacts/authorization/`; agent-browser also inspected public authorization docs at desktop/mobile widths without page errors. UI fixtures are explicit and not production identity evidence. |
| Contracts | OpenAPI, documentation-link and Credential Vault boundary checks passed; install-config tests: 7 passed. Structured YAML/JSON comparison confirmed the embedded k0s mapper matches the standalone realm. |
| Helm and scripts | Harakiri Helm lint and syntax checks on affected smoke/deployment scripts passed. |

Public and technical documentation lives in [Authorization](../../authorization.md).
Vault guides, integration docs, engineering guide and threat model now explain
scoped automation and manual versus system resolution. No version bump, commit,
push, npm publish or live deployment was performed. Existing untracked
`docs/cot/` research is unrelated and untouched.

Before rollout: back up the database/realm, add the API audience mapper to the
existing authorized Keycloak clients, verify a fresh token, then apply migration
037 and deploy matching API/web/workers. Confirm public login/admin/member,
terminal and real OpenSandbox workflows; rotate legacy integrations with
explicit sensitive scopes where needed. Keep login/logout hostnames unchanged.

References: [JWT BCP](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.9),
[Keycloak mapper contract](https://www.keycloak.org/admin-api/protocol-mappers).
