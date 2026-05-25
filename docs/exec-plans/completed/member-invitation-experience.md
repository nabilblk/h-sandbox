# Execution Plan: Proper Member Invitation Experience

**Created**: 2026-05-25
**Author**: Codex
**Status**: Completed
**Priority**: P0 - MVP blocker
**Estimated effort**: 3-5 engineering days

## Context
The current MVP member feature proves the basic control-plane idea: an admin can enter an email, Harakiri stores that email in the organization, and a later Keycloak login links the account by email. This works, but it is intentionally thin:

- It creates local placeholder users/memberships before the identity exists in Keycloak.
- It does not create a Keycloak account, trigger a password setup flow, send an invite email, or expose a clear next action.
- The UI says "add member" but the product behavior is really "pre-authorize this email and wait for someone to manually create/reset a Keycloak user".
- Pending members are mixed with real memberships, which makes access semantics ambiguous.
- There are no resend, cancel, remove, role-change, last-admin protection, email delivery status, or invitation audit details.

The proper design should preserve the right ownership boundary:

- Harakiri owns organization membership intent, roles, audit, and product UX.
- Keycloak owns identity, credentials, password setup, email verification, and login.
- Harakiri must never invent or display passwords for real users.

Reference context:

- Current UI: `apps/web/src/routes/members.tsx`
- Current API route: `apps/api/src/routes/account.ts`
- Current account domain logic: `apps/api/src/services/account.ts`
- Current auth linking by email: `apps/api/src/auth.ts`
- Current schema: `db/migrations/001_control_plane.sql`
- Keycloak Admin REST API: https://www.keycloak.org/docs-api/latest/rest-api/index.html
- Keycloak's documented password setup path is `execute-actions-email` with required actions such as `UPDATE_PASSWORD`; `reset-password-email` is deprecated in favor of that flow.

## Success Criteria
- [x] Admins can invite a member by email from a polished dashboard flow with clear copy, loading states, success/failure states, and no internal implementation wording.
- [x] A newly invited person receives a Keycloak-managed setup email when SMTP is configured, sets their password in Keycloak, logs in, and lands directly in the inviting organization.
- [x] Existing Keycloak users can be added to an organization without credential mutation and can access that organization after their next login.
- [x] Harakiri does not create, display, or reset user passwords directly as part of the normal invite flow.
- [x] Pending invitations are modeled separately from active memberships, and the UI distinguishes `pending`, `sent`, `failed`, `expired`, `accepted`, and `canceled` states where applicable.
- [x] Admins can resend an invite, cancel a pending invite, remove a member, and see why an invite could not be sent.
- [x] Regular non-admin members do not see the `Members` navigation tab or management route.
- [x] The API protects membership read/write operations with organization admin permissions and prevents removing/demoting the last admin.
- [x] Every invitation, resend, acceptance, cancel, and removal records an audit event. Role-change audit is deferred with the role-change endpoint.
- [x] Public OpenAPI and shared SDK/CLI types reflect the member and invitation model.
- [x] Docs explain the product flow and the required Keycloak SMTP/admin-client configuration.
- [x] Unit, integration, browser, and deployed k0s smoke tests cover the invitation flow.

## Product Direction
The MVP should feel like a normal team invitation flow:

1. Admin opens `Members`.
2. Admin clicks `Invite member`.
3. Admin enters an email. Role defaults to `Member`; role selection can be hidden or disabled until RBAC needs it.
4. Harakiri creates an invitation record and asks Keycloak to send a setup email.
5. The members table shows the invite as `Pending` or `Email failed`.
6. The invited user follows the Keycloak email, sets their password, signs in, and lands in the org.
7. Harakiri marks the invite accepted and shows the user as `Active`.

The UX must not require the admin to manually create a Keycloak password. If SMTP is not configured, the UI should say that delivery is not configured and expose an operator-facing setup task, not claim that an invitation was sent.

Regular organization members should not see member-management navigation. If a non-admin reaches the route directly, the web app should show a compact access-denied state or redirect to `Sandboxes`; the API must still return `403` for member/invitation management endpoints.

## Proposed Architecture

### Data Ownership
- `users`: local projection of authenticated Keycloak users. No placeholder users for merely invited emails.
- `memberships`: active org access only. Membership means the user can access the organization.
- `organization_invitations`: invite intent and delivery state before a user is active.

### Invitation State Machine
- `pending`: DB invite created, not yet sent.
- `sent`: Keycloak action email request succeeded.
- `send_failed`: Keycloak/user/email action failed; admin can retry.
- `accepted`: invite was consumed by a Keycloak login with matching verified email.
- `canceled`: admin canceled the invite.
- `expired`: invite was not accepted before expiration.

### Keycloak Integration
- Add an API-side Keycloak admin client, configured through Kubernetes secrets.
- Find or create the Keycloak user by normalized email.
- For a newly created local invite, call Keycloak `execute-actions-email` with `UPDATE_PASSWORD` and, if email verification is enabled, `VERIFY_EMAIL`.
- Set `client_id=harakiri-web` and `redirect_uri=https://sb.harakiri.io/#dashboard/sandboxes` or equivalent configured app URL.
- Do not store admin tokens in the database; request short-lived tokens from Keycloak as needed and redact all logs.
- In local/k0s development, use a test SMTP sink such as Mailpit for deterministic email E2E.

### Auth Linking
- On Keycloak login, `authFromJwt` should:
  - upsert the local `users` row by email and Keycloak subject.
  - if active memberships exist, use the selected/default org.
  - else find pending invitations for the email, create memberships for accepted invitations, mark invitations accepted, and route the user to the invited organization.
  - only create a new personal workspace if no membership and no pending invite exists.

### API Surface
Prefer explicit invitation endpoints while keeping compatibility where useful:

- `GET /v1/me`
  - includes the caller's organization role and capability flags such as `canManageMembers`.
- `GET /v1/org/members`
  - returns active memberships, pending invitations, and row actions in one dashboard-friendly shape.
  - admin-only for MVP.
- `POST /v1/org/invitations`
  - body: `{ email, role? }`
  - creates/sends an invite.
- `POST /v1/org/invitations/{id}/resend`
  - retries Keycloak action email.
- `POST /v1/org/invitations/{id}/cancel`
  - cancels a pending invite.
- `DELETE /v1/org/members/{membershipId}`
  - removes an active member, with last-admin protection.
- `PATCH /v1/org/members/{membershipId}`
  - role updates when role management is needed.

Compatibility option:
- Keep `POST /v1/org/members` as an alias for `POST /v1/org/invitations` during the MVP so existing clients do not break.

## Phases

### Phase 1: Product And UX Specification
**Status**: Complete
- [x] Inventory the current `Members` page behavior and list every rough edge observed in the deployed app.
- [x] Define the MVP flows for new Keycloak user, existing Keycloak user, duplicate invite, resend, cancel, remove, and last-admin protection.
- [x] Produce final UX copy for all states: empty, invite sent, existing member, existing invite, email failed, invite expired, accepted, and unauthorized.
- [x] Decide whether role selection is visible in MVP or fixed to `member`.
- [x] Define the row model shown in the table: active users and pending invitations in one list, with stable status labels and actions.
- [x] Define role/capability rules for sidebar visibility, direct-route access, and API authorization.
- [x] Design responsive behavior for desktop, tablet, and mobile.
- [x] Capture browser verification screenshots after implementation: `/tmp/harakiri-admin-members.png` and `/tmp/harakiri-member-access-denied.png`.

### Phase 2: Data Model And Migration
**Status**: Complete
- [x] Add `organization_invitations` migration with at least:
  - `id`
  - `organization_id`
  - `email_normalized`
  - `display_email`
  - `role`
  - `status`
  - `keycloak_user_id`
  - `invited_by_user_id`
  - `accepted_user_id`
  - `expires_at`
  - `sent_at`
  - `accepted_at`
  - `canceled_at`
  - `last_error`
  - `created_at`
  - `updated_at`
- [x] Add a partial unique index so only one active pending/sent invite can exist for the same organization and email.
- [x] Add a migration strategy for existing placeholder pending members:
  - if `users.keycloak_subject IS NULL` and membership was created only as a pending invite, convert it to `organization_invitations`.
  - preserve real active users and the current `nabilblk@gmail.com` active membership.
- [x] Ensure all membership and invitation queries are organization-scoped.
- [x] Verify the migration in deployed k0s through `AUTO_MIGRATE=1`, member smoke tests, and current `lyra-labs` account survival.
- [ ] Add dedicated migration-unit fixtures for placeholder backfill cases.

### Phase 3: Keycloak Admin Integration
**Status**: Complete
- [x] Add a small `KeycloakAdminClient` interface under the API provider layer.
- [x] Configure Keycloak admin access through Kubernetes secrets for dev/k0s.
- [x] Implement:
  - find user by email
  - create user by email
  - optionally update basic profile fields
  - execute required-action email
  - inspect realm SMTP readiness if feasible
- [x] Decide local development email strategy:
  - Mailpit/MailHog in k0s for E2E, or
  - explicit `KEYCLOAK_EMAIL_MODE=disabled` with UI warning.
- [x] Ensure failed Keycloak calls update invitation `last_error` and status without leaving the UI in false-success.
- [x] Avoid logging Keycloak tokens or action links from the integration.

### Phase 4: Invitation Domain Services
**Status**: Complete
- [x] Replace the current placeholder-user `addOrganizationMember` logic with invitation-aware domain services.
- [x] Implement `listOrganizationMembersAndInvitations`.
- [x] Implement `createOrganizationInvitation`.
- [x] Implement `resendOrganizationInvitation`.
- [x] Implement `cancelOrganizationInvitation`.
- [x] Implement `acceptInvitationsForAuthenticatedUser` in the auth login path.
- [x] Implement `removeOrganizationMember` with self/last-admin safeguards.
- [x] Add account capability calculation so `/v1/me` tells the web app whether the current user can manage members.
- [x] Avoid holding DB transactions open across slow external Keycloak calls.
- [x] Record audit events for all invitation and membership mutations in this MVP.
- [x] Define idempotency behavior for repeated invite submissions and retried sends.

### Phase 5: API Contracts, SDK, And CLI
**Status**: Complete
- [x] Add request/response types in `packages/shared`.
- [x] Update OpenAPI with invitation/member endpoints and error responses.
- [x] Update the web API client.
- [x] Decide whether the SDK should expose member administration in this MVP.
- [x] Defer CLI member admin to keep MVP focused on web and API.
- [x] Keep `POST /v1/org/members` compatibility as an alias for invitation creation.
- [x] Add service tests plus deployed smoke coverage for admin, non-admin, existing Keycloak user, send failure, cancel, remove, and member-list access.

### Phase 6: Web UX Implementation
**Status**: Complete
- [x] Replace the always-visible left add card with a tighter dashboard pattern:
  - table/list as the main surface.
  - `Invite member` primary button in the page header.
  - modal or side panel for the email form.
- [x] Make the copy user-facing:
  - "Invite a teammate by email."
  - "They will receive an email to set up their account."
  - Avoid "Keycloak owns sign-in" in normal product copy.
- [x] Add statuses and actions:
  - active member
  - pending invite
  - email failed with retry
  - expired invite with resend
  - canceled hidden by default or available in history.
- [x] Add row actions for retry, cancel invite, and remove member. Role changes are deferred until RBAC grows beyond admin/member.
- [x] Hide `Members` from the sidebar for non-admin users using capability data from `/v1/me`.
- [x] Guard direct navigation to `#dashboard/members` for non-admin users with a compact access-denied state.
- [x] Add confirmation dialogs for destructive actions.
- [x] Add pessimistic loading states that match the existing design tokens.
- [x] Add empty state and error recovery states.
- [x] Preserve the current dashboard visual language: compact tables, restrained cards, crimson accent, Hanken Grotesk/JetBrains Mono tokens, no marketing-style cards.
- [x] Verify deployed desktop layout with Playwright browser screenshots.

### Phase 7: Documentation And Operator Runbook
**Status**: Complete
- [x] Add product docs page: "Team members and invitations".
- [x] Add API docs from OpenAPI.
- [x] Add runbook section for Keycloak invitation setup:
  - admin client/service account secret.
  - SMTP configuration.
  - local Mailpit setup.
  - troubleshooting failed invite emails.
- [x] Add security note that Harakiri does not store passwords and only stores invitation state.
- [x] Add migration/backfill notes for current MVP installations.

### Phase 8: Testing And Verification
**Status**: Complete
- [x] Unit test invitation state transitions.
- [x] Unit test auth login acceptance of pending invites.
- [x] Unit test removal safeguards through service behavior and deployed smoke.
- [x] Unit test role/capability calculation for admin and regular members.
- [ ] Add dedicated Keycloak admin client HTTP mock tests.
- [x] Integration/deployed smoke test API routes with real Keycloak/Mailpit.
- [x] E2E test with deployed k0s stack:
  - admin invites `invite-smoke+timestamp@example.com`.
  - Mailpit captures Keycloak action email.
  - invited user completes password setup.
  - user logs in and lands in the correct org.
  - status changes from pending to active.
- [x] Deployed smoke test cancel and remove flows.
- [x] Deployed smoke test existing Keycloak user added to org.
- [x] Deployed browser/API test regular member login does not show the `Members` tab and cannot access member endpoints.
- [x] Browser visual check Members page at desktop breakpoint.
- [x] Run full regression: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, public e2e, and deployed health checks.

### Phase 9: Deployment And Rollout
**Status**: Complete
- [x] Add new env vars and Kubernetes secrets for Keycloak admin integration.
- [x] Add Mailpit for dev/k0s invitation-email capture.
- [x] Apply DB migrations safely to the existing k0s Postgres.
- [x] Deploy API and web.
- [x] Restart port forwards and verify local/public-forwarded routes.
- [x] Verify current `lyra-labs` admin survives migration.
- [x] Invite disposable test users, verify Mailpit delivery, regular-member access, cancel, and remove, then clean up the active smoke member.
- [x] Leave commit/push for a separate explicit request; implementation, verification, and deployment are complete.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-25 | Use a full execution plan | The work spans UX, backend domain logic, database schema, Keycloak admin integration, email delivery, docs, tests, and deployment. | Lightweight plan |
| 2026-05-25 | Keep Keycloak as the only credential owner | The product requirement says Keycloak manages authentication, and manual/generated passwords are the wrong ownership boundary. | Generate temporary passwords in Harakiri |
| 2026-05-25 | Model invitations separately from active memberships | A membership should mean active org access. Pending invite intent needs its own lifecycle, resend/cancel/error fields, and audit trail. | Continue using placeholder local users and pending memberships |
| 2026-05-25 | Use Keycloak `execute-actions-email` for password setup | This is the standard Keycloak admin flow for user-required actions such as `UPDATE_PASSWORD`; it avoids custom password reset/security logic in Harakiri. | Custom invite tokens, direct password reset, manual admin-created passwords |
| 2026-05-25 | Keep the visible MVP input email-only | The user explicitly wants add-by-email for MVP. The architecture can support role selection later without exposing extra complexity now. | Full member profile form |
| 2026-05-25 | Hide member management from non-admin users | Member invitation/removal is an administrative org function; showing the tab to regular users creates confusion and an avoidable authorization leak in the UX. | Show tab read-only to all members |
| 2026-05-25 | Use Mailpit for k0s development invitation delivery | The stack needs deterministic invite-email verification without requiring a production SMTP account. Mailpit lets Keycloak send real action emails and lets smokes assert delivery. | Disable email in dev; use only manual Keycloak users |
| 2026-05-25 | Keep member admin out of the CLI for this MVP | The urgent product surface is dashboard add-by-email. CLI member administration can be added later without blocking the web/API flow. | Add `harakiri members invite/list/remove` immediately |

## Tech Debt Incurred
- Dev/k0s still uses the Keycloak `admin/admin` account. Production should use a least-privilege Keycloak admin client or external secret.
- Dedicated migration-unit fixtures for placeholder invitation backfill are still worth adding; the deployed migration and smoke tests covered the live path.
- Dedicated Keycloak admin HTTP mock tests are still worth adding; deployed Keycloak/Mailpit smoke covers the integration path.
- Role changes are deferred. When roles expand beyond `admin` and `member`, add `PATCH /v1/org/members/{id}` plus audit coverage.

## Completion Notes
Delivered the proper MVP member invitation flow:

- Added `organization_invitations` and migrated placeholder pending users into invitation records.
- Added an API-side Keycloak admin client using `execute-actions-email`.
- Added invitation domain services for create/resend/cancel/accept/remove plus admin-only authorization and capability flags.
- Updated `/v1/me`, `/v1/org/members`, explicit invitation endpoints, shared types, and OpenAPI.
- Reworked the Members dashboard into an admin-only page with invite modal, status rows, retry/cancel/remove actions, and access-denied direct-route behavior for regular members.
- Added product docs, repo docs, runbook coverage, k0s Keycloak admin env, Mailpit, and a repeatable `pnpm smoke:members` deployed smoke.

Verification completed on 2026-05-25:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm openapi:check`
- `pnpm build`
- `pnpm env:harakiri:deploy-public`
- `pnpm ports:restart && pnpm ports:status`
- `pnpm smoke`
- `pnpm smoke:members`
- `pnpm e2e`
- Deployed browser checks:
  - admin sees Members and invite controls (`/tmp/harakiri-admin-members.png`).
  - regular member does not see Members and receives the access-denied route (`/tmp/harakiri-member-access-denied.png`).
