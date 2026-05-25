# Organization Members

Harakiri separates organization access from identity credentials.

- Harakiri owns organizations, memberships, invitation state, roles, audit
  events, and dashboard/API workflows.
- Keycloak owns users, passwords, required actions, email verification, and
  login.
- PostgreSQL stores only control-plane state. Harakiri does not create, show, or
  reset real user passwords.

## Data Model

Active access is stored in `memberships`. Pending access is stored in
`organization_invitations`.

Invitation statuses:

- `pending`: invitation created but no setup email has been sent.
- `sent`: Keycloak accepted the required-action email request.
- `send_failed`: delivery setup or Keycloak admin integration failed; retry is
  available after the operator fixes the configuration.
- `accepted`: an authenticated Keycloak user with the invited email logged in
  and the membership was created.
- `canceled`: an admin canceled the invitation.
- `expired`: the invitation passed its configured expiration time.

## API

Admins list members and invitations with:

```bash
curl "$HARAKIRI_API_URL/v1/org/members" -H "x-api-key: $HK_KEY"
```

Invite by email:

```bash
curl "$HARAKIRI_API_URL/v1/org/invitations" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"teammate@example.com"}'
```

Retry, cancel, and remove:

```bash
curl -X POST "$HARAKIRI_API_URL/v1/org/invitations/inv_.../resend" -H "x-api-key: $HK_KEY"
curl -X POST "$HARAKIRI_API_URL/v1/org/invitations/inv_.../cancel" -H "x-api-key: $HK_KEY"
curl -X DELETE "$HARAKIRI_API_URL/v1/org/members/mem_..." -H "x-api-key: $HK_KEY"
```

`POST /v1/org/members` remains a compatibility alias for invite creation.

## Authorization

`GET /v1/me` returns the user's organization role and capability flags. The web
app hides the Members navigation item unless `canManageMembers` is true. The API
still enforces authorization and returns `403` for regular members.

The API prevents:

- removing yourself from the organization.
- removing the last remaining admin.
- managing invitations from outside the current organization.

## Login Acceptance

During Keycloak JWT authentication, Harakiri upserts the local user projection
by Keycloak subject/email, finds matching pending invitations by normalized
email, creates memberships, and marks accepted invitations as `accepted`.

If no membership or matching invite exists, the normal first-user/default
workspace flow applies.

## Development Email

The k0s development deployment installs Mailpit in the `keycloak` namespace and
configures the Keycloak `harakiri` realm SMTP settings to use it. After running:

```bash
pnpm deploy:k0s
pnpm ports:restart
```

open `http://127.0.0.1:18086` to inspect invite emails. Production deployments
should configure real SMTP in Keycloak and provide API-side Keycloak admin
credentials through secrets.
