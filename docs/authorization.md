# Authorization and API Keys

**Availability:** 0.5.0-rc.4, requiring migration 037 and the matching API/web.
See the [release notes and upgrade order](release-notes/0.5.0-rc.4.md).
Upgrading an SDK alone does not upgrade the server's authorization policy.

## Identity and Organization

Keycloak authenticates people; Harakiri membership determines their organization
and role. JWT validation requires a trusted signature algorithm (RS256 by
default), an allowed issuer, nonempty subject, future expiration and the
`harakiri-api` audience. `azp=harakiri-web` alone is not sufficient. ID tokens
are not API access tokens. Only verified email addresses bind pending invitations.

API keys are separate principals: `apiKeyId` identifies the key, `userId` is
null, and audit/resource labels use `api-key:<id>`. They never impersonate an
organization member. Metadata responses include creator, scopes, expiry and
legacy status, but never the stored hash or secret. The token is returned once.

The organization is derived from authentication, not a request-body tenant ID.
Sandboxes and persistent workspaces are organization resources, not private
per-user or per-key resources. Runtime write access permits arbitrary commands
inside that organization's sandboxes: it is a substantial trust grant.

## Permission Matrix

| Operation | Human member | Human admin | API key |
| --- | --- | --- | --- |
| Sandbox reads, files, logs, command events | Yes | Yes | `sandboxes:read` |
| Create/run/attach, filesystem/route/egress changes, renew, lifecycle | Yes | Yes | `sandboxes:write` |
| Read templates/builds | Yes | Yes | `templates:read` |
| Create/build/promote/archive templates | Yes | Yes | `templates:write` |
| Read persistent workspaces | Yes | Yes | `workspaces:read` |
| Allocate/archive/attach persistent workspaces | Yes | Yes | `workspaces:write` |
| Use reusable credential sources | Shared sources only | All org sources | `credentials:use`, shared sources only |
| Manage reusable credential sources | No | Yes | Explicit `credentials:manage` |
| Manage registry credentials | No | Yes | Explicit `registry:manage` |
| Read audit events | No | Yes | Explicit `audit:read` |
| Read settings/usage | Yes | Yes | `org:read` |
| Change settings, invite/remove members | No | Yes | Never |
| List/create/revoke API keys | Own keys only | All org keys | Never |
| Read `/me`, complete onboarding | Self | Self | Never |

Scopes compose: creating a sandbox with a workspace needs `sandboxes:write`
and `workspaces:write`; adding credentials or template credential mappings
also needs `credentials:use`. Credential inspection/use endpoints require the
corresponding sandbox scope too. `credentials:manage` includes credential use;
other write scopes do not imply read scopes. CLI/SDK workflows that poll after
a write therefore normally need both read and write scopes.

Template visibility, source sharing, runtime capability checks and tenant
ownership checks still apply after the route permission check. Unknown routes
and unknown roles fail closed. A scope is not a bypass of those policies.

## Create and Rotate

In **API keys**, choose Create key, provide a meaningful name, choose permissions
and an expiry. Members only see scopes they may grant and keys they own. Admins
can grant sensitive scopes explicitly. The default profile has the eight
runtime scopes, including shared credential use and organization reads, but
no administration, registry management or audit reads.

New keys expire in 90 days by default. The API accepts a future ISO timestamp
up to 365 days away; the dashboard offers 7, 30, 90 or 365 days. No non-expiring
new key is available. A key requires its creator's current membership, and its
effective scopes are intersected with that creator's current role. Removing the
creator's membership disables the key; demoting an admin removes sensitive
permissions. It remains a key principal, not the creator's login session.

For human-authenticated provisioning, this is the request body:

```json
{
  "name": "artifact-reader",
  "scopes": ["sandboxes:read"]
}
```

Send it to `POST /v1/api-keys` with a human Keycloak access token. Omitted expiry
uses 90 days. Neither an API key nor a route token may provision more keys.
The SDK's existing `listApiKeys()` also requires human OIDC authentication.
Regular runtime CLI/SDK integrations continue to use `x-api-key` unchanged.

Rotation: create a replacement, update the caller's secret store, verify its
required operations, then revoke the old key. A lost token is not recoverable.
Use different keys for CI, interactive development and read-only monitoring.
Keep the Harakiri key on the trusted caller, never in browser bundles, agent
prompts, sandbox environment variables or retained workspace files.

## Legacy Compatibility

Migration 037 identifies pre-existing keys as `legacy=true`, with no inferred
creator. They retain their original expiry (previously none) and a runtime-only
profile. They lose implicit member/admin impersonation, credential management,
registry management, audit reads, member/settings writes and key delegation.
Only human admins see/revoke unowned legacy keys. Rotate them to owned, scoped,
expiring keys; a key used by a Vault or registry administration workflow needs
an explicitly scoped replacement before the API upgrade.

The database default remains legacy-compatible for old API instances during
an ordered upgrade. All new API code inserts `legacy=false` with creator and
expiry. Finish the rollout; do not leave an old API serving traffic indefinitely.
Old JWT terminal tickets without subject/credential-expiry binding and old
borrowed-user key tickets are rejected. Request a new one-time ticket.

## Connections and Revocation

- Every HTTP request authenticates and authorizes independently.
- Command event streams revalidate authentication and `sandboxes:read` before
  polling output. Disconnection does not cancel a detached command.
- Terminal tickets are short-lived, single-use, sandbox-bound and store the
  actual principal, not the secret. Consuming one rechecks current membership,
  key revocation, expiry and `sandboxes:write`.
- Open terminals check permissions every five seconds and close with code 1008
  on failure. A stalled check also closes the observer after five seconds.
  Short-lived JWT expiration additionally closes the connection at its deadline.
  Reconnect with a fresh access token/ticket.
- Offline JWT verification cannot detect a Keycloak logout immediately before
  access-token expiry. Use short access-token lifetimes. Immediate global logout
  enforcement would require introspection or a revocation integration.

Revoking a key blocks subsequent API access; it does **not** stop existing
sandboxes, retract downloaded files, revoke independent preview-route tokens,
or erase tokens an agent has copied. Revoke those separately when required.
Credential scopes control new source use and explicit refresh, not arbitrary
commands using credentials already attached to a shared runtime. Trusted
reconciliation/resume maintains previously authorized bindings; source disable
or deletion is the operation that revokes those bindings.

### Exposed Human Credentials

Handle an exposed bootstrap password in Keycloak, not by deleting the Harakiri
organization or replacing its user record:

1. Verify a separate recovery administrator and identify the exact realm/user.
   Record the user's organization, roles and dependent integrations privately.
2. Store a newly generated password in the operator's secret store, then use
   Keycloak's user password reset operation. Do not reuse a documented fixture
   or put the replacement in source, shell arguments, logs or support reports.
3. Log out that user through the Keycloak Admin API. Verify online sessions and
   separately inspect/remove that user's offline sessions, if any. Do not log
   out the whole realm or change unrelated users under a single-user approval.
4. Test old-password and old-refresh-token rejection, new login with the same
   organization/role, and independent recovery. Leave issuer, audience,
   redirects and SMTP configuration intact.
5. Record the existing access token's expiration and test API denial after it.
   Harakiri's offline JWT validation can still accept it before expiration.
   Changing the password or Keycloak's not-before value does not make an
   immediate JWT-denial guarantee at this API.
6. Review API keys, route tokens and credential sources separately. They are
   independent credentials; password rotation does not revoke them or undo
   prior actions. Preserve evidence and scope any additional revocation.

Use the [Keycloak user administration API](https://www.keycloak.org/docs-api/latest/rest-api/index.html#_users)
for password reset, logout and session inventory. A production incident requiring
immediate containment needs an explicit access-containment decision while
previous tokens remain valid, not a claim that password rotation alone suffices.

## Operator Upgrade

1. Back up PostgreSQL and export the current realm/client configuration. Inventory
   legacy integration keys, including Vault/registry automation. Keep a human
   admin session for migration; do not rely on a legacy key to create replacements.
2. In Keycloak, open the Harakiri frontend client's dedicated client scope and
   add an **Audience** protocol mapper named `harakiri-api-audience`: included
   custom audience `harakiri-api`, Add to access token ON, Add to ID token OFF.
   Apply it to every additional authorized client that calls this API. Leave
   public hostnames, redirect URIs and post-logout URLs unchanged.
3. Obtain a fresh access token and inspect its payload locally: `aud` must contain
   `harakiri-api`, with the expected public `iss`, `sub` and future `exp`.
   Decoding is a configuration check, not signature verification. Never paste
   the token into a public JWT-decoding website. Existing access tokens may need
   refresh or a new sign-in after changing the mapper.
4. Configure the API with the following values and apply migration 037 through
   the normal migration runner, then roll out the matching API, scheduler and web.
   Fresh installations include the mapper in the standalone realm, k0s manifest
   and OCP generator; realm import alone does not update an already-existing
   realm. Complete steps 2 and 3 before running an existing installation's
   deployment script or Helm upgrade.

```yaml
config:
  AUTH_DEV_ALLOW: "0"
  KEYCLOAK_AUDIENCE: "harakiri-api"
  KEYCLOAK_SIGNING_ALGORITHMS: "RS256"
```

5. Verify admin login/settings/key creation, member read-only settings/own-key
   management, an ordinary CLI/SDK workflow, denied key delegation and expired
   or revoked key rejection. Replace sensitive automation keys with explicit
   scopes and remove legacy keys only after their callers have migrated.
6. Test a browser terminal, revoke its key or remove the member in a test org,
   and observe closure. Confirm detached work remains independently controllable.

If login returns 401, check the mapper, obtain a fresh access token, inspect the
public issuer and verify the API can reach JWKS. Do not disable audience checking,
turn on dev auth, or change public redirects to localhost as a workaround.
403 means the identity is valid but insufficiently authorized. Compare scopes,
creator membership, owner and source-sharing rules before retrying.

The schema is additive, but rolling back to the old API restores its weaker
authorization behavior. Prefer a forward configuration fix. Do not claim a
secure rollback just because the old binary still starts.

## Engineering and Verification

`packages/shared/src/authorization.ts` defines scope names/role ceilings.
`apps/api/src/auth.ts` verifies credentials; `auth-context.ts` defines principals.
`authorization.ts` maps exact registered routes to permissions, with extra checks
for create-time attachments. The API-key service enforces owner/admin management.
Vault source services recheck scoped key identity before decrypting or issuing
material. Manual refresh uses caller permissions; only trusted internal callers
select `sourceAccess: "system"`. Null `actorUserId` is never a privilege grant.

Run `pnpm typecheck`, `pnpm test`, `pnpm openapi:check`, `pnpm docs:check` and
`pnpm credential-vault:check`. Run the install-config Node tests. With a disposable
PostgreSQL URL, run `authorization-postgres.test.ts`; it creates and drops only its
own temporary schema and exercises both pre-037 keys and current persistence.
The browser suite `tests/e2e/authorization.spec.ts` uses explicit UI fixtures
against a local Vite server to test controls, errors, focus and mobile layout.
Those fixtures are not evidence of live Keycloak or production deployment.

Primary references: [JWT audience BCP](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.9),
[Keycloak server administration](https://www.keycloak.org/docs/latest/server_admin/).
