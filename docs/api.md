# API

Base path: `/v1`

Authentication:

```http
x-api-key: hk_live_...
```

or:

```http
Authorization: Bearer <keycloak-jwt>
```

Examples use `HARAKIRI_API_URL` so they work against either the local
development API (`http://127.0.0.1:8080`) or a forwarded k0s deployment:

```bash
export HARAKIRI_API_URL=http://127.0.0.1:8080
```

## Contract Sources

The current monorepo contract checkpoint has three layers:

- `packages/shared/src/index.ts` owns shared TypeScript request/response types,
  status unions, and the structured API error envelope used by the API, SDK,
  CLI, and web app.
- `apps/api/src/routes/*.schema.ts` owns the Zod request validation schemas used
  by Fastify route handlers.
- This document provides narrative examples for developers and operators.

For the OSS API surface, TypeScript types and handwritten Markdown are not
enough. ADR 0005 records the accepted direction: publish an OpenAPI 3.1
contract from a single source that composes the request schemas, response
schemas, auth metadata, and examples. The current contract source lives in
`packages/shared/src/openapi.ts`; `packages/shared/src/index.ts` remains the
TypeScript source of truth for client-facing payload types.

The current generated artifact is committed at `docs/openapi.json` and is also
served by the API at `GET /openapi.json` without authentication. Regenerate and
check drift with:

```bash
pnpm openapi:write
pnpm openapi:check
```

## Endpoints

- `GET /v1/me`
- `GET /v1/templates`
- `POST /v1/templates`
- `GET /v1/templates/:id`
- `GET /v1/templates/:id/versions`
- `POST /v1/templates/:id/builds`
- `GET /v1/template-builds`
- `GET /v1/template-builds/:id`
- `GET /v1/template-builds/:id/logs`
- `POST /v1/template-builds/:id/cancel`
- `POST /v1/template-builds/:id/retry`
- `POST /v1/templates/:id/promote`
- `POST /v1/templates/:id/archive`
- `GET /v1/sandboxes`
- `POST /v1/sandboxes`
- `GET /v1/sandboxes/:id`
- `DELETE /v1/sandboxes/:id`
- `GET /v1/runtime/capabilities`
- `POST /v1/sandboxes/:id/run`
- `GET /v1/sandboxes/:id/commands`
- `POST /v1/sandboxes/:id/commands`
- `GET /v1/sandboxes/:id/commands/:commandId`
- `DELETE /v1/sandboxes/:id/commands/:commandId`
- `GET /v1/sandboxes/:id/commands/:commandId/logs`
- `POST /v1/sandboxes/:id/terminal/attach-ticket`
- `GET /v1/sandboxes/:id/terminal/attach` WebSocket upgrade
- `POST /v1/sandboxes/:id/command-sessions`
- `POST /v1/sandboxes/:id/command-sessions/:sessionId/run`
- `DELETE /v1/sandboxes/:id/command-sessions/:sessionId`
- `GET /v1/sandboxes/:id/logs`
- `GET /v1/sandboxes/:id/files`
- `GET /v1/sandboxes/:id/files/stat`
- `GET /v1/sandboxes/:id/files/read`
- `GET /v1/sandboxes/:id/files/download`
- `PUT /v1/sandboxes/:id/files`
- `POST /v1/sandboxes/:id/files/upload`
- `POST /v1/sandboxes/:id/files/mkdir`
- `POST /v1/sandboxes/:id/files/rename`
- `DELETE /v1/sandboxes/:id/files`
- `GET /v1/sandboxes/:id/metrics`
- `POST /v1/sandboxes/:id/renew`
- `GET /v1/sandboxes/:id/routes`
- `POST /v1/sandboxes/:id/routes`
- `DELETE /v1/sandboxes/:id/routes/:port`
- `GET /v1/sandboxes/:id/credentials`
- `POST /v1/sandboxes/:id/credentials`
- `POST /v1/sandboxes/:id/credentials/inspect`
- `POST /v1/sandboxes/:id/credentials/rehydrate`
- `DELETE /v1/sandboxes/:id/credentials/:attachmentId`
- `POST /v1/sandboxes/:id/credentials/:attachmentId/refresh`
- `POST /v1/sandboxes/:id/credentials/:attachmentId/test`
- `GET /v1/credential-presets`
- `GET /v1/credential-presets/:id`
- `GET /v1/credential-secrets`
- `POST /v1/credential-secrets`
- `GET /v1/external-secret-references`
- `POST /v1/external-secret-references`
- `GET /v1/dynamic-credential-issuers`
- `POST /v1/dynamic-credential-issuers`
- `GET /v1/audit-events`
- `POST /v1/templates` with `credentialSlots`
- `GET /v1/templates/:id` returning expanded `credentialSlots`
- `GET /v1/templates/:id/versions` returning snapshotted
  `credentialSlots`
- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/:id`
- `GET /v1/usage`
- `GET /v1/org/settings`
- `PATCH /v1/org/settings`
- `GET /v1/org/members`
- `POST /v1/org/invitations`
- `POST /v1/org/invitations/:id/resend`
- `POST /v1/org/invitations/:id/cancel`
- `POST /v1/org/members`
- `DELETE /v1/org/members/:id`

## Sandbox Runtime Metadata

`POST /v1/sandboxes`, `GET /v1/sandboxes`, and `GET /v1/sandboxes/:id` return
`sandbox.runtimeMetadata`. This is the stable integration contract for resolved
runtime facts:

- workdir, user, shell
- template ID, version ID, image digest, runtime family
- default ports and currently exposed route URLs
- route mode, base domain, public scheme, and default access mode
- egress mode, presets, custom allow/deny lists, and rule count
- file artifact size, command timeout, and terminal attach ticket TTL
- sandbox TTL and lifecycle timestamps
- active provider kind, provider sandbox ID, and capability states

External apps should read those values from the API/SDK instead of deriving
them from template names or OpenSandbox internals.

## Error Envelope

API errors use one flat machine-readable envelope:

```json
{ "error": "sandbox_not_found", "message": "optional operator detail" }
```

Sandbox runtime endpoints publish their stable code vocabulary in the OpenAPI
component `SandboxRuntimeApiErrorCode` and in `@h-sandbox/sdk` as
`sandboxRuntimeApiErrorCodes`. SDK integrations should branch on `error.code`
or the SDK error subclass, not on text messages. See [errors.md](errors.md) for
retry guidance and common fixes.

## Organization Members

Member management is an admin-only organization surface. `GET /v1/me` includes
the current membership role and capability flags:

```json
{
  "role": "admin",
  "capabilities": { "canManageMembers": true }
}
```

Use those flags for navigation and UI affordances, but rely on the API for
authorization. Regular members receive `403 forbidden` from the member and
invitation endpoints.

List active members and pending invitations:

```bash
curl "$HARAKIRI_API_URL/v1/org/members" \
  -H "x-api-key: $HK_KEY"
```

Invite by email:

```bash
curl "$HARAKIRI_API_URL/v1/org/invitations" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"teammate@example.com"}'
```

Harakiri stores invitation intent, delivery state, role, audit events, and
acceptance state. Keycloak owns identity, password setup, email verification,
and login. When SMTP is configured, Harakiri asks Keycloak to send a required
action email. If email delivery fails, the response still includes the saved
invitation with `status: "send_failed"` and a redacted `lastError`; retry after
fixing email delivery:

```bash
curl -X POST "$HARAKIRI_API_URL/v1/org/invitations/inv_.../resend" \
  -H "x-api-key: $HK_KEY"
```

Cancel an outstanding invite or remove an active member:

```bash
curl -X POST "$HARAKIRI_API_URL/v1/org/invitations/inv_.../cancel" \
  -H "x-api-key: $HK_KEY"

curl -X DELETE "$HARAKIRI_API_URL/v1/org/members/mem_..." \
  -H "x-api-key: $HK_KEY"
```

The API prevents self-removal and removing the last organization admin. For
compatibility, `POST /v1/org/members` remains an alias for
`POST /v1/org/invitations`.

## Create Sandbox

```bash
curl $HARAKIRI_API_URL/v1/sandboxes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"python-3.12-data","ttlSeconds":300,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}'
```

The `template` field accepts a template ID, template name, template alias,
qualified template version alias such as `open-agents-dev:stable`, or immutable
template version ID such as `tplv_...`. The sandbox response includes
`templateVersionId` and `templateImageDigest` when the selected version has
those fields.

Use a qualified version alias for human-friendly stable channels and an
immutable version ID for reproducible automation:

```bash
curl $HARAKIRI_API_URL/v1/sandboxes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"open-agents-dev:stable","name":"stable-runner"}'

curl $HARAKIRI_API_URL/v1/sandboxes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"tplv_...","name":"pinned-runner"}'
```

Optional `env` values are passed to OpenSandbox at sandbox creation time. Keys
must match `[A-Za-z_][A-Za-z0-9_]*`, values must be strings, each value is
limited to 32 KiB, and a request can include at most 64 variables. Harakiri
records only sorted env key names in sandbox events and audit metadata, never
the values.

By default, sandbox creation waits for provider provisioning and returns
`201 { "sandbox": ... }` when the sandbox is running. Clients that want an
explicit asynchronous handoff can send `"wait": false` in the JSON body or
`Prefer: respond-async`. Clients that still want the synchronous path but need
a bounded HTTP request can send `waitTimeoutMs`; if provider provisioning is
still running after that budget, the API returns the same pending response. In
both pending cases the API writes the sandbox and durable provision operation,
returns `202`, and includes a `Location` header pointing at
`GET /v1/sandboxes/:id`:

```json
{
  "sandbox": { "id": "sbx_...", "status": "pending" },
  "operation": {
    "id": "op_...",
    "sandboxId": "sbx_...",
    "kind": "provision",
    "state": "queued",
    "error": null,
    "attempts": 0,
    "createdAt": "2026-05-24T00:00:00.000Z",
    "updatedAt": "2026-05-24T00:00:00.000Z"
  },
  "status": "pending",
  "message": "sandbox provision queued"
}
```

Async creation with non-empty `env` requires a configured control-plane secret
key so the worker can replay encrypted env values. Without that key, use the
default synchronous create path or omit `env`.

When the selected template image matches an active `pull` or `push_pull`
registry credential with encrypted username/password material, the
OpenSandbox create request includes `image.auth.username` and
`image.auth.password`. Credentials backed only by Kubernetes Secret references
remain available to BuildKit, the legacy builder, and runtime pull preflight,
but the OpenSandbox lifecycle API does not accept those Secret names directly.

List sandbox history with optional filters:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes?template=open-agents-dev&limit=20" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/sandboxes?templateVersionId=tplv_..." \
  -H "x-api-key: $HK_KEY"
```

Supported list filters are `status`, `q`, `template`, `templateVersionId`, and
`limit`. The dashboard template detail Runs tab uses the `template` filter to
show recent sandboxes created from the selected template.

## Templates

List templates:

```bash
curl $HARAKIRI_API_URL/v1/templates \
  -H "x-api-key: $HK_KEY"
```

Supported filters:

- `q`: template ID, name, or alias search.
- `visibility`: `public`, `private`, `internal`, or `all`.
- `owner`: `team`, `platform`, or `all`. Team templates belong to the current
  organization; platform templates have no organization owner. Platform
  templates are returned only when their visibility is `public` or `internal`.
  Team-owned templates remain scoped to the requesting organization regardless
  of visibility.
- `runtimeFamily`: exact runtime family such as `python`, `python-data`,
  `node`, `browser`, `linux`, or `custom`.
- `status`: template status or `all`.
  If omitted, archived templates are hidden. Use `status=archived` to inspect
  archived templates or `status=all` to include every status.
- `limit`: `1..200`.
- `offset`: pagination offset.

Create a template definition:

```bash
curl $HARAKIRI_API_URL/v1/templates \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "id": "open-agents-dev",
    "name": "open-agents-dev",
    "image": "ubuntu:24.04",
    "aliases": ["open-agents-dev"],
    "visibility": "private",
    "defaultEntrypoint": ["sleep", "3600"],
    "cpuCount": 2,
    "memoryMb": 2048,
    "workdir": "/workspace",
    "defaultPorts": [3000, 5173, 4321, 8000],
    "runtimeFamily": "custom"
  }'
```

Template creation returns a non-runnable definition. Create an image-import or
Dockerfile build next; the template becomes runnable only after a successful
build creates a ready version with an immutable `imageDigest`. Template creation
returns `422 template_resource_limit_exceeded` when `cpuCount`, `memoryMb`, or
`defaultPorts` exceed the configured control-plane policy. It returns `422
template_image_policy_violation` when `image` is denied by registry or prefix
policy.

Inspect a template and its versions:

```bash
curl $HARAKIRI_API_URL/v1/templates/open-agents-dev \
  -H "x-api-key: $HK_KEY"

curl $HARAKIRI_API_URL/v1/templates/open-agents-dev/versions \
  -H "x-api-key: $HK_KEY"
```

Version responses include security metadata: `sbomRef`, `provenance`,
`scanStatus`, and `scanSummary`. Until a vulnerability scanner is configured,
new versions report `scanStatus: "not_scanned"` and a scan summary reason of
`scanner_not_configured`. Build-produced versions also include runtime pull
preflight provenance when enabled, recording the disposable preflight Pod and
node that proved the digest-pinned image was pullable before the version became
ready.

Sandbox creation returns `409 template_not_ready` when the selected template has
no ready version. If an older ready version still stores a mutable image URI,
the API resolves and persists the immutable registry digest before creating the
sandbox; if that lookup fails, sandbox creation returns
`409 template_image_digest_unresolved`.

## Template Builds

Create a build record:

```bash
curl $HARAKIRI_API_URL/v1/templates/open-agents-dev/builds \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "dockerfile",
    "dockerfilePath": "Dockerfile",
    "metadata": { "localPath": "." }
  }'
```

Build creation returns `422 template_resource_limit_exceeded` when the selected
template exceeds the current resource policy, `422
template_image_policy_violation` when an image-import target is denied by
registry or prefix policy, and `429 template_build_concurrency_limit_exceeded`
when the organization already has the maximum number of queued/building
template builds. Shared platform templates are read-only catalog entries;
attempting to build or promote one returns `403 template_not_mutable`.

The CLI uploads Dockerfile build contexts after creating the build record. API
clients can use the same endpoint with a tar+gzip archive encoded as base64:

```bash
curl $HARAKIRI_API_URL/v1/template-builds/bld_.../context \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "format": "tar+gzip",
    "archiveBase64": "...",
    "sha256": "sha256:<archive digest>",
    "sizeBytes": 12345,
    "fileCount": 8
  }'
```

Dockerfile contexts are rejected with `422 template_image_policy_violation` when
a `FROM` image violates the configured registry/prefix policy or uses a dynamic
`${...}` reference that cannot be checked before build execution.

Import an existing public OCI image. The `harakiri-template-builder` worker will
resolve the registry digest, write build logs, create a ready template version,
and update the template's latest version:

```bash
curl $HARAKIRI_API_URL/v1/templates/ubuntu-import/builds \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"sourceType":"image","imageDestination":"ubuntu:24.04"}'
```

List, inspect, and read logs:

```bash
curl "$HARAKIRI_API_URL/v1/template-builds?status=queued&q=open-agents-dev" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/template-builds?template=open-agents-dev&limit=20" \
  -H "x-api-key: $HK_KEY"

curl $HARAKIRI_API_URL/v1/template-builds/bld_... \
  -H "x-api-key: $HK_KEY"

curl $HARAKIRI_API_URL/v1/template-builds/bld_.../logs \
  -H "x-api-key: $HK_KEY"
```

Build inspect responses include redacted `metadata`, the resulting
`resultVersionId` when one exists, and the uploaded context summary. Completed
Dockerfile builds also include builder runtime fields in `metadata`:
`builderJobName`, `builderPodName`, `builderPodUid`, `builderNodeName`, and
`builderNamespace`, plus nested provider details in `builderDetails`.
Successful image-import and Dockerfile builds include `runtimePullPreflight`
metadata when preflight is enabled; its `status` must be `ok` before a ready
version is inserted.
Supported build list filters are `status`, `q`, `template`, and `limit`. The
dashboard template detail Config tab uses `template` to show the latest redacted
build args and metadata for a selected template.

## Registry Credentials

Registry credential records are organization-scoped control-plane metadata for
private registries and future production push/pull integration. Create or update
a credential with:

```bash
curl -X POST "$PUBLIC_API_URL/v1/registry-credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "prod-registry",
    "registryHost": "registry.example.com",
    "username": "robot$harakiri",
    "secret": "token-or-password",
    "purpose": "push_pull",
    "repositoryPrefix": "harakiri/templates/org-prod",
    "pullSecretRef": "prod-registry-pull",
    "pushSecretRef": "prod-registry-push"
  }'
```

Responses never include raw secret material. They include
`hasEncryptedSecret`, external secret references, `purpose`,
`repositoryPrefix`, and `lastUsedAt`. Builder push and runtime pull preflight
lookups update `lastUsedAt` when they select a matching credential. List active
credentials with
`GET /v1/registry-credentials`; include revoked credentials with
`GET /v1/registry-credentials?includeRevoked=1`. Revoke a credential with
`DELETE /v1/registry-credentials/:id`.

`purpose` is one of `pull`, `push`, or `push_pull`. `repositoryPrefix` is the
least-privilege registry namespace the credential is expected to cover. The
local k0s prototype also pushes generated Dockerfile images under
`<TEMPLATE_REGISTRY_REPOSITORY_PREFIX>/org-<organization-id>/<template-id>` so
team images and builder cache repositories do not share one flat namespace.
Sandbox creation also reuses matching `pull`/`push_pull` credentials. If the
record has `username` plus encrypted secret material, Harakiri decrypts it only
long enough to pass OpenSandbox `image.auth`; API responses and audit metadata
still show only the credential ID and whether auth was available.

Cancel, retry, and promote:

```bash
curl -X POST $HARAKIRI_API_URL/v1/template-builds/bld_.../cancel \
  -H "x-api-key: $HK_KEY"

curl -X POST $HARAKIRI_API_URL/v1/template-builds/bld_.../retry \
  -H "x-api-key: $HK_KEY"

curl -X POST $HARAKIRI_API_URL/v1/templates/open-agents-dev/promote \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"versionId":"tplv_...","alias":"stable"}'
```

Archive a custom template:

```bash
curl -X POST $HARAKIRI_API_URL/v1/templates/open-agents-dev/archive \
  -H "x-api-key: $HK_KEY"
```

Archived templates are hidden from default template lists, cannot be resolved
for new sandbox creation, and cancel any queued/building builds for that
template. They remain queryable with `GET /v1/templates?status=archived`.

Current v1 API behavior persists build records, uploaded Dockerfile contexts,
and logs. The deployed template builder consumes queued `sourceType=image`
records by resolving immutable source digests, and consumes
`sourceType=dockerfile` records by running rootless BuildKit in k0s, pushing to
the local registry, running runtime pull preflight, optionally pre-pulling
images for templates tagged `hot`, `prepull`, or `warm`, and writing
digest-pinned ready versions. The legacy Kaniko provider is still selectable
with `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy`. Git source builds are still
tracked in the active custom template execution plan.

## Runtime Capabilities

Use `/v1/runtime/capabilities` before wiring advanced integrations that depend
on provider-backed features:

```bash
curl $HARAKIRI_API_URL/v1/runtime/capabilities \
  -H "x-api-key: $HK_KEY"
```

The response is machine-readable for SDKs and dashboard degraded states:

```json
{
  "provider": "opensandbox",
  "generatedAt": "2026-05-29T00:00:00.000Z",
  "capabilities": [
    {
      "name": "commands",
      "state": "available",
      "contract": "opensandbox_spec",
      "source": "OpenSandbox execd tracked command API",
      "required": true,
      "reason": null
    },
    {
      "name": "terminalAttach",
      "state": "available",
      "contract": "opensandbox_provider",
      "source": "OpenSandbox execd PTY implementation",
      "required": true,
      "reason": null
    }
  ]
}
```

`state` is `available`, `degraded`, or `unavailable`. `contract` explains
whether the feature comes from the formal OpenSandbox API/spec, current
OpenSandbox provider behavior, Harakiri's control-plane overlay, or is
unavailable/unsupported. Treat unavailable required capabilities as integration
blockers and degraded capabilities as features that should show a quieter
fallback path.

## Credential Vault

Credential Vault attaches outbound credentials to sandbox requests without
putting the real value in sandbox environment variables, files, command
arguments, or logs. The current public API supports `inline_ephemeral`
attachments at sandbox creation and on already-running sandboxes: Harakiri sends
the value to the provider-side vault and then forgets it. It also supports
envelope-encrypted workspace custody, Kubernetes-backed external references,
GitHub App dynamic credentials, built-in and custom template slots, provider
inspection, refresh, rehydration, and metadata-only organization audit.

Runtime endpoints:

- `POST /v1/sandboxes` with `credentials`
- `POST /v1/sandboxes` with `credentialMappings`
- `GET /v1/sandboxes/:id/credentials`
- `POST /v1/sandboxes/:id/credentials`
- `POST /v1/sandboxes/:id/credentials/inspect`
- `POST /v1/sandboxes/:id/credentials/rehydrate`
- `DELETE /v1/sandboxes/:id/credentials/:attachmentId`
- `POST /v1/sandboxes/:id/credentials/:attachmentId/refresh`
- `POST /v1/sandboxes/:id/credentials/:attachmentId/test`
- `GET /v1/credential-presets`
- `GET /v1/credential-presets/:id`
- `GET /v1/credential-secrets`
- `GET /v1/credential-secrets/:id`
- `POST /v1/credential-secrets`
- `PATCH /v1/credential-secrets/:id`
- `POST /v1/credential-secrets/:id/rotate`
- `POST /v1/credential-secrets/:id/disable`
- `POST /v1/credential-secrets/:id/enable`
- `DELETE /v1/credential-secrets/:id`
- `GET /v1/external-secret-references`
- `GET /v1/external-secret-references/:id`
- `POST /v1/external-secret-references`
- `PATCH /v1/external-secret-references/:id`
- `POST /v1/external-secret-references/:id/validate`
- `POST /v1/external-secret-references/:id/disable`
- `POST /v1/external-secret-references/:id/enable`
- `DELETE /v1/external-secret-references/:id`
- `GET /v1/dynamic-credential-issuers`
- `GET /v1/dynamic-credential-issuers/:id`
- `POST /v1/dynamic-credential-issuers`
- `PATCH /v1/dynamic-credential-issuers/:id`
- `POST /v1/dynamic-credential-issuers/:id/validate`
- `POST /v1/dynamic-credential-issuers/:id/disable`
- `POST /v1/dynamic-credential-issuers/:id/enable`
- `DELETE /v1/dynamic-credential-issuers/:id`
- `GET /v1/audit-events`

Provider presets expose reusable binding defaults for common services. They
return fake env names, auth shape, binding hosts, egress domains, and a default
test target, but never real credential values.

Credential Vault errors use the same structured envelope as the rest of the
runtime API. Common codes are `credential_vault_unsupported`,
`credential_vault_provider_unavailable`, `credential_vault_invalid_binding`,
`credential_vault_required_slot_missing`, `credential_vault_secret_required`,
`credential_secret_forbidden`, `credential_secret_invalid`,
`credential_secret_disabled`, `credential_secret_decryption_unavailable`, and
`credential_secret_value_required`. External resolver failures use
`external_secret_resolution_not_found`,
`external_secret_resolution_forbidden`,
`external_secret_resolution_invalid`, or
`external_secret_resolver_unavailable`.
Dynamic failures use `dynamic_credential_issuer_*` for source lifecycle and
`dynamic_credential_issue_*` for issuance. Unsafe DNS-only or unavailable
credential egress returns `credential_vault_egress_conflict` before injection.

```bash
curl "$HARAKIRI_API_URL/v1/credential-presets" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/credential-presets/openai" \
  -H "x-api-key: $HK_KEY"
```

Declare preset-backed credential slots on a template:

```bash
curl "$HARAKIRI_API_URL/v1/templates" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "id": "agent-with-models",
    "name": "Agent with models",
    "image": "ubuntu:24.04",
    "credentialSlots": [
      { "providerPresetId": "openai" },
      { "providerPresetId": "github", "required": false }
    ]
  }'
```

The response expands each slot with label, fake env, binding metadata, egress
domains, and a default test target. Template builds copy that metadata to the
immutable template version. No API accepts or returns real credential values in
template slot fields.

Manage encrypted workspace secrets:

```bash
curl "$HARAKIRI_API_URL/v1/credential-secrets" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/credential-secrets" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "openai-prod",
    "providerPresetId": "openai",
    "value": "replace-with-real-value",
    "usePolicy": "admins_only",
    "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" }
  }'

curl -X PATCH "$HARAKIRI_API_URL/v1/credential-secrets/vlt_..." \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"usePolicy":"organization_members"}'

curl "$HARAKIRI_API_URL/v1/credential-secrets/vlt_.../rotate" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"value":"replace-with-new-real-value"}'

curl -X POST "$HARAKIRI_API_URL/v1/credential-secrets/vlt_.../disable" \
  -H "x-api-key: $HK_KEY"

curl -X POST "$HARAKIRI_API_URL/v1/credential-secrets/vlt_.../enable" \
  -H "x-api-key: $HK_KEY"

curl -X DELETE "$HARAKIRI_API_URL/v1/credential-secrets/vlt_..." \
  -H "x-api-key: $HK_KEY"
```

Workspace secret mutations require organization admin role. Admins can list all
records; members can list and attach only secrets explicitly shared through
`usePolicy: "organization_members"`. Responses return sanitized metadata such
as name, preset, status, version, use policy, attachment-derived usage totals,
fake env keys, binding metadata, egress domains, timestamps, and
`hasEncryptedSecret`. The raw value is accepted only on create and rotate, and
is never returned. Delete removes encrypted value custody and preserves a
metadata-only audit record.

Manage an external reference without sending a secret value:

```bash
curl "$HARAKIRI_API_URL/v1/external-secret-references" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "OpenAI from cluster",
    "providerPresetId": "openai",
    "resolverType": "kubernetes_secret",
    "reference": {
      "namespace": "harakiri",
      "name": "harakiri-vault-agents",
      "key": "OPENAI_API_KEY"
    },
    "usePolicy": "organization_members"
  }'

curl -X POST \
  "$HARAKIRI_API_URL/v1/external-secret-references/xsr_.../validate" \
  -H "x-api-key: $HK_KEY"
```

Validation returns `valid`, `not_found`, `forbidden`, `invalid`, or
`unavailable` plus sanitized diagnostics. It never returns the resolved value.
See [External Secret References](external-secret-references.md) for operator
configuration.

Configure a short-lived GitHub App source:

```bash
curl "$HARAKIRI_API_URL/v1/dynamic-credential-issuers" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "agent repositories",
    "issuerType": "github_app_installation",
    "scope": {
      "installationId": "123456",
      "repositories": ["agent-runtime"],
      "permissions": { "contents": "read", "metadata": "read" }
    },
    "usePolicy": "organization_members"
  }'

curl -X POST \
  "$HARAKIRI_API_URL/v1/dynamic-credential-issuers/dci_.../validate" \
  -H "x-api-key: $HK_KEY"
```

The operator-owned GitHub App mints installation tokens. Responses expose
scope, validation, version, usage, issue/expiry timestamps, and sanitized
errors, never the App private key or issued token. Create and attachment source
bodies use `{ "sourceType": "dynamic", "issuerId": "dci_..." }`.
`POST /v1/sandboxes/:id/credentials/:attachmentId/refresh` explicitly renews a
dynamic attachment; other source types return a typed conflict.

Compare desired attachments to sanitized provider state:

```bash
curl -X POST "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials/inspect" \
  -H "x-api-key: $HK_KEY"
```

The response contains provider revision and `present`, `missing`, or `unknown`
state, not provider values. Organization admins can query metadata-only history:

```bash
curl "$HARAKIRI_API_URL/v1/audit-events?actionPrefix=credential_&limit=50&offset=0" \
  -H "x-api-key: $HK_KEY"
```

Audit filters are `targetType`, `targetId`, `actionPrefix`, `limit` (1 to 200),
and zero-based `offset`. The response includes `{ events, page: { limit,
offset, total } }`. Members receive `audit_event_forbidden` because the stream
contains organization-wide actor and custody activity.

Create a sandbox with an ephemeral credential:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "python-3.12-data",
    "credentials": [{
      "displayName": "OpenAI API",
      "credentialName": "openai-runtime",
      "value": "replace-with-real-value",
      "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" },
      "binding": {
        "name": "openai-api",
        "match": {
          "hosts": ["api.openai.com"],
          "schemes": ["https"],
          "methods": ["GET", "POST"],
          "paths": ["/v1/*"]
        },
        "auth": { "type": "bearer" }
      }
    }]
  }'
```

Create a sandbox with an encrypted workspace secret:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "open-agents-dev",
    "credentials": [{
      "sourceType": "harakiri_encrypted",
      "secretId": "vlt_...",
      "displayName": "OpenAI production"
    }]
  }'
```

Create a sandbox by mapping a template credential slot to an encrypted
workspace secret:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "open-agents-dev",
    "credentialMappings": [{
      "slotId": "llm",
      "source": {
        "sourceType": "harakiri_encrypted",
        "secretId": "vlt_...",
        "displayName": "OpenAI production"
      }
    }]
  }'
```

For inline one-time values, the template slot supplies the binding and fake env
defaults:

```json
{
  "credentialMappings": [{
    "providerPresetId": "openai",
    "source": {
      "sourceType": "inline_ephemeral",
      "value": "replace-with-real-value"
    }
  }]
}
```

Attach an encrypted workspace secret to a running sandbox:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "harakiri_encrypted",
    "secretId": "vlt_...",
    "displayName": "OpenAI production"
  }'
```

Create-time `credentials` accepts an `inline_ephemeral` body,
`sourceType: "harakiri_encrypted"` with a workspace secret ID, or
`sourceType: "external_ref"` with an external reference ID, or
`sourceType: "dynamic"` with a dynamic issuer ID. Create-time
`credentialMappings` maps a template slot by `slotId` or `providerPresetId` to
any of those sources. For
mapped sources, the template slot owns the binding, fake env defaults, and
egress hosts. Required template slots must be satisfied through
`credentialMappings`; direct low-level `credentials` do not satisfy a named
template requirement. Running-sandbox attachment accepts the direct source
shapes. Stored-secret attachment requires either an organization admin or a
secret shared for organization-member use and returns sanitized metadata only.

Rehydrate stored credential attachments after resume or provider-side vault
state loss:

```bash
curl -X POST "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials/rehydrate" \
  -H "x-api-key: $HK_KEY"
```

The response returns sanitized attachments plus `rehydrated`, `skipped`, and
`failed` counts. Active encrypted workspace secrets, external references, and
dynamic issuers are resolved and reapplied through the runtime provider.
`inline_ephemeral`
attachments stay `requires_reinjection` because Harakiri intentionally never
stored their real values.

Create-time credentials require synchronous creation. Requests with
`wait:false`, `Prefer: respond-async`, or `waitTimeoutMs` return
`credential_vault_create_requires_sync` because async replay of credential
attachments is not implemented yet.

Attach an API key to selected outbound requests:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "displayName": "OpenAI API",
    "credentialName": "openai-runtime",
    "value": "replace-with-real-value",
    "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" },
    "binding": {
      "match": {
        "hosts": ["api.openai.com"],
        "schemes": ["https"],
        "methods": ["GET", "POST"],
        "paths": ["/v1/*"]
      },
      "auth": { "type": "bearer" }
    }
  }'
```

Responses include sanitized attachment metadata, provider revision, fake env
keys, binding hosts, auth type, status, and timestamps. They never include the
real credential value.

Test a binding from inside the sandbox:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials/$ATTACHMENT_ID/test" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"target":"https://api.openai.com/v1/models","timeoutMs":10000}'
```

The test response is diagnostic, not a secret readback. Status values include
`reachable`, `blocked_or_unreachable`, `binding_mismatch`, `not_injected`,
`sandbox_not_running`, and `provider_unavailable`.

## Run Command

Use `/run` for a blocking command when the caller wants stdout/stderr and exit
status in one response:

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/run \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"command":"python agent.py","stdin":"agent.py","cwd":"/workspace","timeoutMs":30000}'
```

Use command resources for persisted command history and detached/background
processes:

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/commands \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"command":"python -m http.server 3000","cwd":"/workspace","detached":true}'
```

Response shape:

```json
{
  "command": {
    "id": "cmd_...",
    "sandboxId": "sbx_x",
    "provider": "opensandbox",
    "providerCommandId": "execd-command-id",
    "command": "python -m http.server 3000",
    "status": "running",
    "cwd": "/workspace",
    "envKeys": [],
    "timeoutMs": null,
    "detached": true,
    "stdout": "",
    "stderr": "",
    "exitCode": null,
    "finishReason": null,
    "signal": null,
    "error": null,
    "startedAt": "2026-05-29T00:00:00.000Z",
    "finishedAt": null,
    "createdAt": "2026-05-29T00:00:00.000Z",
    "updatedAt": "2026-05-29T00:00:00.000Z"
  }
}
```

List, inspect, read logs, and interrupt a tracked command:

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/commands \
  -H "x-api-key: $HK_KEY"

curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/commands/cmd_... \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_x/commands/cmd_.../logs?cursor=0&tail=200" \
  -H "x-api-key: $HK_KEY"

curl -X DELETE $HARAKIRI_API_URL/v1/sandboxes/sbx_x/commands/cmd_... \
  -H "x-api-key: $HK_KEY"
```

`cursor` asks the runtime provider for logs after a provider cursor when that
provider supports it. `tail` is provider-neutral and trims the returned stdout
and stderr to the last N lines. Responses include `stdoutTruncated` and
`stderrTruncated` when a tail value was applied.

See [processes.md](processes.md) for SDK process aliases, CLI wait/tail
commands, command-ended errors, and the recommended reattach pattern.

## Files And Artifacts

List, read, and write ordinary files:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_x/files?path=/workspace" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_x/files/read?path=/workspace/agent.py" \
  -H "x-api-key: $HK_KEY"

curl -X PUT $HARAKIRI_API_URL/v1/sandboxes/sbx_x/files \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"path":"/workspace/agent.py","content":"print(\"ok\")\n","createParents":true}'
```

Use artifact endpoints for binary payloads. Upload accepts canonical base64,
validates decoded size, and verifies `sha256` when provided. The default
decoded limit is `SANDBOX_FILE_ARTIFACT_MAX_BYTES=16777216`. Upload and
download responses include `transfer.mode=json-base64`,
`transfer.encoding=base64`, and `transfer.maxBytes` so clients can present the
active limit and reject unsupported transfer modes.

```bash
curl -X POST $HARAKIRI_API_URL/v1/sandboxes/sbx_x/files/upload \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "path": "/workspace/input.bin",
    "contentBase64": "aGVsbG8=",
    "sizeBytes": 5,
    "sha256": "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    "createParents": true
  }'

curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_x/files/download?path=/workspace/input.bin" \
  -H "x-api-key: $HK_KEY"
```

See [filesystem-artifacts.md](filesystem-artifacts.md) for path behavior,
checksum rules, provider degraded states, and SDK/CLI examples.

## Expose Port

Routes are explicit and idempotent per sandbox/port. In k0s, Harakiri stores the
route in the control plane and uses OpenSandbox to expose the upstream port.
Route creation validates port `1..65535` and enforces
`SANDBOX_MAX_ROUTES_PER_SANDBOX` plus `SANDBOX_MAX_ROUTES_PER_ORG`.
See [routes.md](routes.md) for adapter cache guidance, CLI wait/open options,
and cleanup behavior.

The default `accessMode` is `public`, which returns the direct OpenSandbox
preview URL. `accessMode: "token"` returns a Harakiri proxy URL and a route
token. The token is only returned on creation, is stored as a hash, and must be
sent as `x-harakiri-route-token` or the `harakiri_route_token` query parameter.
Set `PUBLIC_API_URL` to the externally reachable API origin in deployments where
token-protected routes will be opened outside the local port-forward.

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"port":3000,"protocol":"http","accessMode":"public","labels":["preview","web"]}'
```

Response shape:

```json
{
  "route": {
    "port": 3000,
    "protocol": "http",
    "accessMode": "public",
    "accessHeaderName": null,
    "tokenHint": null,
    "labels": ["preview", "web"],
    "createdByUserId": "user_...",
    "createdByLabel": "agent-runner@example.com",
    "routeKey": "opensandbox-id-3000",
    "host": "opensandbox-id-3000.sandbox.example.com",
    "url": "https://opensandbox-id-3000.sandbox.example.com",
    "targetUrl": "https://opensandbox-id-3000.sandbox.example.com",
    "state": "ready",
    "provider": "opensandbox-gateway",
    "providerRouteId": "opensandbox-id-3000",
    "createdAt": "2026-05-29T00:00:00.000Z",
    "lastCheckedAt": "2026-05-29T00:00:00.000Z",
    "lastUsedAt": null,
    "terminatedAt": null
  }
}
```

Token-protected preview:

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"port":5173,"accessMode":"token"}'
```

```json
{
  "route": {
    "port": 5173,
    "protocol": "http",
    "accessMode": "token",
    "accessHeaderName": "x-harakiri-route-token",
    "tokenHint": "hrt_abcd...wxyz",
    "labels": [],
    "createdByUserId": "user_...",
    "createdByLabel": "agent-runner@example.com",
    "routeKey": "opensandbox-id-5173",
    "host": "sb-api.example.com",
    "url": "https://sb-api.example.com/v1/route-proxy/opensandbox-id-5173/",
    "targetUrl": "https://opensandbox-id-5173.sandbox.example.com",
    "state": "ready",
    "provider": "opensandbox-gateway",
    "providerRouteId": "opensandbox-id-5173",
    "createdAt": "2026-05-29T00:00:00.000Z",
    "lastCheckedAt": "2026-05-29T00:00:00.000Z",
    "lastUsedAt": null,
    "terminatedAt": null
  },
  "accessToken": "hrt_abcd...",
  "accessHeaderName": "x-harakiri-route-token"
}
```

Route records include user-supplied labels, creator metadata, and `lastUsedAt`.
The proxy updates `lastUsedAt` for token-protected access. Public direct
provider routes may not pass through Harakiri, so their `lastUsedAt` is
best-effort.

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY"
```
