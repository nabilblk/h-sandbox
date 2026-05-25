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
- `POST /v1/sandboxes/:id/run`
- `GET /v1/sandboxes/:id/logs`
- `GET /v1/sandboxes/:id/files`
- `GET /v1/sandboxes/:id/metrics`
- `POST /v1/sandboxes/:id/renew`
- `GET /v1/sandboxes/:id/routes`
- `POST /v1/sandboxes/:id/routes`
- `DELETE /v1/sandboxes/:id/routes/:port`
- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/:id`
- `GET /v1/usage`
- `GET /v1/org/settings`
- `PATCH /v1/org/settings`

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

## Run Command

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/run \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"command":"python agent.py","stdin":"agent.py"}'
```

## Expose Port

Routes are explicit and idempotent per sandbox/port. In k0s, Harakiri stores the route in PostgreSQL and uses the OpenSandbox ingress gateway host format. Route creation validates port `1..65535` and enforces `SANDBOX_MAX_ROUTES_PER_SANDBOX` plus `SANDBOX_MAX_ROUTES_PER_ORG`.

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"port":3000,"protocol":"http"}'
```

Response shape:

```json
{
  "route": {
    "port": 3000,
    "protocol": "http",
    "routeKey": "opensandbox-id-3000",
    "host": "opensandbox-id-3000.sandbox.example.com",
    "url": "https://opensandbox-id-3000.sandbox.example.com",
    "targetUrl": "https://opensandbox-id-3000.sandbox.example.com",
    "state": "ready",
    "provider": "opensandbox-gateway",
    "providerRouteId": "opensandbox-id-3000"
  }
}
```

```bash
curl $HARAKIRI_API_URL/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY"
```
