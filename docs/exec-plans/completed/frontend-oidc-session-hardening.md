# Execution Plan: Frontend OIDC Session Hardening

**Created**: 2026-05-25
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 2-4 days

## Context
The current web frontend has a working prototype login path, but it is not yet a complete OIDC session implementation.

Current code assessment:

- `apps/web/src/auth.ts` manually implements Authorization Code + PKCE. This is a good base choice, but it generates `state` without storing or validating it, does not send or validate `nonce`, and does not validate the returned ID Token.
- `apps/web/src/auth.ts` exchanges the authorization code and only reads `access_token`. If Keycloak returns `refresh_token`, `id_token`, `expires_in`, or `refresh_expires_in`, the web app ignores them. In practice, frontend refresh token handling is not working today.
- `apps/web/src/auth.ts` stores the access token in `localStorage`. That makes reloads easy, but it also makes token theft through XSS more damaging.
- `apps/web/src/auth.ts` `signOut()` is local-only. It removes the local token and profile, then navigates to `#landing`; it does not redirect to Keycloak's OIDC logout endpoint, so the Keycloak SSO session remains active.
- `apps/web/src/api-client/request.ts` synchronously reads `auth.token()` before requests. There is no "refresh before request", single-flight refresh, 401 retry, or session-expired UX.
- `apps/web/src/main.tsx` treats "has a token string" as authenticated. It does not model authentication as `checking`, `authenticated`, `anonymous`, `expired`, or `error`.
- `apps/web/src/routes/dashboard-shell.tsx` makes the avatar button immediately sign out. This is easy to click accidentally and does not communicate whether the action logs out only locally or from Keycloak.

Reference points:

- The current browser-app best practice is Authorization Code + PKCE, not implicit flow. The IETF browser-based apps BCP draft also calls out CSRF protection, browser token-storage risk, and refresh token requirements for browser clients: https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/
- OAuth 2.0 Security BCP requires redirect-flow CSRF protection and says public clients must use PKCE for authorization code protection: https://www.rfc-editor.org/rfc/rfc9700.html
- OIDC Core requires clients to verify `state` when present and verify `nonce` in the ID Token when nonce is used: https://openid.net/specs/openid-connect-core-1_0-final.html
- OIDC RP-Initiated Logout defines the proper logout redirect using the provider's `end_session_endpoint`, with `id_token_hint` and `post_logout_redirect_uri`: https://openid.net/specs/openid-connect-rpinitiated-1_0.html
- The official Keycloak JavaScript adapter provides standard-flow login, `updateToken()`, `logout()`, `clearToken()`, nonce support, and in-memory token storage guidance: https://www.keycloak.org/securing-apps/javascript-adapter

Recommended direction:

For the MVP, keep a browser-based frontend client but stop maintaining hand-written OIDC protocol code. Introduce a small Harakiri `AuthSession` facade backed by Keycloak's official `keycloak-js` adapter. This keeps the frontend aligned with Keycloak, uses the standard flow with PKCE, gets refresh behavior through `updateToken()`, and makes OIDC logout an explicit flow. Keep the facade narrow enough that a future provider-neutral OIDC client or BFF/session-cookie architecture can replace the adapter later.

The stronger long-term architecture is a BFF/session-cookie model where browser JavaScript never sees access or refresh tokens. That is a broader backend architecture change and should not be mixed into this frontend-focused fix unless the product decides to harden beyond the current SPA/API split.

## Success Criteria
- [x] Login uses a dedicated OIDC client layer rather than custom token-exchange code in components.
- [x] The frontend validates authorization transaction state through the OIDC client and no longer carries unmanaged `state` or PKCE verifier logic.
- [x] Refresh is functional: API calls obtain a fresh-enough access token before sending requests, and expired sessions produce clear UX instead of silent failures.
- [x] Tokens are not persisted in `localStorage`; reloads rely on Keycloak SSO/session checks rather than JavaScript-readable long-lived token storage.
- [x] Logout is RP-initiated OIDC logout against Keycloak, with local state cleared and a registered post-logout redirect back to Harakiri.
- [x] The dashboard and landing/docs top nav expose an explicit account menu with "Sign out", not a bare avatar-as-logout shortcut.
- [x] Multi-tab behavior is deterministic: sign-out/session-expired state propagates to other Harakiri tabs.
- [x] Tests cover auth initialization, sign-in return route handling, token refresh before API calls, 401/session-expired handling, and logout URL/redirect behavior.
- [x] Product documentation explains expected login, refresh, and logout behavior for users and operators.

## Phases

### Phase 1: Confirm Frontend OIDC Contract
**Status**: Complete
- [x] Verify the deployed Keycloak client is public, standard flow is enabled, implicit/hybrid flows are disabled, and PKCE S256 is required.
- [x] Verify exact valid redirect URIs for local dev and deployed web, including a dedicated callback path or the current app root callback.
- [x] Verify allowed post-logout redirect URIs for local dev and deployed web.
- [x] Decide callback response mode. Prefer a dedicated callback route that is processed before app routing; if hash routing remains, avoid fragment conflicts by explicitly choosing the safest compatible response mode and stripping callback parameters immediately.
- [x] Document the accepted session behavior after page reload: initialize as `checking`, use Keycloak SSO to restore a session if available, otherwise show anonymous/sign-in state.

### Phase 2: Replace Hand-Written Auth With Session Facade
**Status**: Complete
- [x] Add `keycloak-js` to `apps/web` dependencies.
- [x] Replace `apps/web/src/auth.ts` with an `AuthSession` facade exposing `init()`, `signIn(returnTo)`, `signOut()`, `getAccessToken(minValidity)`, `profile()`, `isAuthenticated()`, `clearLocalSession()`, and `subscribe(listener)`.
- [x] Initialize Keycloak before app route rendering so callback URL mutation is handled before React route decisions.
- [x] Keep access token, refresh token, and ID token in adapter-managed memory only; remove `harakiri_access_token` and `harakiri_profile` persistence from `localStorage`.
- [x] Use adapter profile/ID-token claims for frontend display instead of decoding the access token manually.
- [x] Preserve return-route behavior with a bounded session-scoped value that only allows internal Harakiri routes.

### Phase 3: Implement Refresh And API Request Semantics
**Status**: Complete
- [x] Change `auth.token()` usage to async `auth.getAccessToken({ minValiditySeconds })`.
- [x] Update `apps/web/src/api-client/request.ts` to refresh via `updateToken()` before authenticated API calls.
- [x] Add single-flight refresh so concurrent API calls share one refresh attempt.
- [x] On refresh failure, call `clearToken()`/local cleanup, emit a session-expired event, and show a session-expired screen or banner with a primary "Sign in again" action.
- [x] Retry one request after successful refresh only when the original response is `401`; do not retry non-auth failures.
- [x] Keep API-key behavior for CLI/dev paths separate from web-user OIDC behavior.

### Phase 4: Implement Proper OIDC Logout
**Status**: Complete
- [x] Replace local-only `signOut()` with `keycloak.logout({ redirectUri })` or an equivalent RP-initiated logout URL built from provider metadata.
- [x] Ensure logout sends an ID token hint when available and redirects only to a registered Harakiri post-logout URI.
- [x] Clear local app state before redirect and again after the post-logout callback/landing load.
- [x] Broadcast logout to other tabs with `BroadcastChannel` and a `storage` event fallback.
- [x] Add a "Signing out..." transitional state so users understand that the browser is leaving Harakiri to close the Keycloak session.

### Phase 5: Frontend UX Polish
**Status**: Complete
- [x] Replace avatar-click logout with an account menu containing user email/name, workspace, "Account settings" if available, and "Sign out".
- [x] Update landing/docs authenticated nav to use the same account menu pattern.
- [x] Add a neutral auth callback/loading screen for login return and logout return, with a recoverable error state.
- [x] Add a session-expired state that preserves the intended route and asks the user to sign in again.
- [x] Make auth-related copy precise: "Sign out of Harakiri and Keycloak" when doing RP logout, not just "Sign out".

### Phase 6: Tests And Verification
**Status**: Complete
- [x] Unit-test the `AuthSession` facade with a mocked Keycloak adapter for `init`, `signIn`, `signOut`, `getAccessToken`, refresh failure, and profile derivation.
- [x] Unit-test `request()` with refresh success, refresh failure, one-time 401 retry, and session-expired emission.
- [x] Add route-level tests for signed-out, checking, authenticated, and expired states.
- [x] Run a browser smoke test against local or deployed Keycloak: login, refresh after short token lifetime, dashboard API call, logout, reload, confirm no automatic app session remains unless Keycloak SSO still exists by explicit design.
- [x] Verify multi-tab logout/session-expired propagation.

### Phase 7: Documentation And Operational Notes
**Status**: Complete
- [x] Add developer documentation for the frontend OIDC session model, including why tokens are memory-only.
- [x] Add operator documentation for required Keycloak client settings: redirect URIs, web origins, post-logout redirect URIs, standard flow, PKCE, token lifetimes, and refresh token rotation/session linkage.
- [x] Add product documentation for end users explaining sign-in, session expiration, and sign-out behavior.
- [x] Note that a future BFF/session-cookie architecture remains the preferred higher-security evolution if the OSS platform later wants browser JavaScript to never handle tokens.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-25 | Replace custom OIDC code with a frontend `AuthSession` facade backed by `keycloak-js` for the MVP. | The app is Keycloak-based today; the official adapter handles standard-flow login, refresh, logout, nonce support, and memory token storage, reducing protocol mistakes in frontend code. | Continue custom OIDC code; use provider-neutral `oidc-client-ts`; implement a BFF/session-cookie architecture now. |
| 2026-05-25 | Treat current refresh support as missing, not merely unverified. | The token response parser only consumes `access_token`; no refresh token is stored, refreshed, or used before API calls. | Assume Keycloak refresh works server-side and leave frontend as-is. |
| 2026-05-25 | Defer BFF/session-cookie migration from this frontend-focused plan. | BFF is stronger security but changes backend/API boundaries. The user asked to focus on frontend while backend and Keycloak are working. | Expand this plan into a backend auth architecture migration. |
| 2026-05-25 | Disable Keycloak's session-status iframe in the frontend. | The live smoke hit `Timeout when waiting for 3rd party check iframe message`; modern browser tracking protections make the iframe unreliable. Token refresh failures and Harakiri same-app tab broadcasts now carry logout/session-expired detection. | Keep `checkLoginIframe: true` and accept false auth-init failures; enable silent check-sso by default. |

## Tech Debt Incurred
The main accepted limitation is continuing with a browser-based OAuth client for the MVP. This should be revisited before a security-sensitive production launch.

## Completion Notes
Delivered a Keycloak-backed `AuthSession` facade, async refresh-aware API requests, OIDC provider logout, memory-only browser tokens, route preservation through Keycloak redirects, account-menu logout UX, same-app logout/session-expired broadcast handling, Keycloak realm PKCE/post-logout settings, website product docs, operator docs, and regression tests.

Verification completed:

- `pnpm --filter @harakiri/web test`
- `pnpm --filter @harakiri/web typecheck`
- `pnpm --filter @harakiri/web build`
- `HARAKIRI_WEB_URL=http://127.0.0.1:5174 KEYCLOAK_USER=lyra@k.ai KEYCLOAK_PASSWORD=harakiri-dev pnpm exec playwright test tests/e2e/oidc-session.spec.ts`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm openapi:check`
- `git diff --check`
