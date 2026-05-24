# Template Security

Custom templates execute code supplied by users or automation. The control plane
must treat template builds and generated images as untrusted until policy,
provenance, and digest checks pass.

## Isolation Boundaries

- Authentication: browser users authenticate with Keycloak; automation uses
  Harakiri API keys.
- Authorization: template rows are scoped by `organization_id`; seed templates
  have `organization_id IS NULL`.
- Runtime: OpenSandbox owns sandbox isolation and process execution.
- Control plane: PostgreSQL stores metadata, API keys, builds, routes, audit
  events, and immutable version selection.

## Registry Credentials

`template_registry_credentials` exists in the schema as the future org-level
registry credential table. Secret material should never be stored directly in
PostgreSQL. Store only a `secret_ref` that points to a Kubernetes Secret or
external secret manager entry.

Minimum requirements:

- Separate push and pull credentials where possible.
- Scope credentials to one registry namespace per organization.
- Rotate credentials without changing template IDs.
- Redact usernames, passwords, tokens, and bearer credentials from logs.
- Never return secret material through API, CLI, or UI responses.

## Digest Pinning

Mutable image tags are acceptable as user input, but they are not a safe runtime
contract. Before a version is marked ready:

1. Push or pull the image.
2. Resolve the manifest digest.
3. Store `template_versions.image_digest`.
4. Store the digest on sandbox creation as `sandboxes.template_image_digest`.
5. Prefer a digest-pinned image reference when calling OpenSandbox.

If digest resolution fails, keep the build non-ready and surface the failure.

## Build Args And Env

Build args, env metadata, registry errors, and builder logs can contain secrets.
The API redacts common secret-shaped keys and values before build args,
metadata, error messages, or log lines are stored or returned:

- keys containing `apiKey`, `token`, `secret`, `password`, `credential`,
  `authorization`, `privateKey`, or similar variants are replaced with
  `[redacted]`.
- log text is scrubbed for Harakiri API keys, bearer tokens, `x-api-key` style
  headers, password/token assignments, and URL user-info passwords.

Remaining production work:

- Size limits for build args and env schema values.
- Audit events that record key names without values.
- Separate secret injection from normal build args.

## Build Contexts

Dockerfile contexts are uploaded as tar+gzip archives and stored in
`template_build_contexts` for the builder worker. The API verifies the declared
archive byte size and `sha256:` digest before accepting the upload.

Current development limits:

- `TEMPLATE_BUILD_CONTEXT_MAX_BYTES` defaults to 25 MiB.
- `TEMPLATE_MAX_CPU_COUNT` defaults to 8 vCPU for custom template definitions
  and builds.
- `TEMPLATE_MAX_MEMORY_MB` defaults to 32768 MiB.
- `TEMPLATE_MAX_DEFAULT_PORTS` defaults to 16 default exposed ports per
  template.
- `TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG` defaults to 3 active queued/building
  template builds per organization.
- The CLI skips heavy local directories such as `.git`, `node_modules`, `dist`,
  `.next`, `coverage`, and `.turbo`.
- The archive digest is copied to `template_builds.context_hash` for audit and
  builder selection.

Production follow-up should add `.harakiriignore`/`.dockerignore` parity,
malware scanning, compressed/uncompressed size accounting, and secret detection
before the context is available to the Kubernetes builder.

## Base Image Policy

The API enforces a configurable image policy before accepting template image
references, image-import builds, or Dockerfile contexts. The policy covers:

- `POST /v1/templates` `image`
- `POST /v1/templates/:id/builds` when `sourceType=image`
- Dockerfile `FROM` references during `POST /v1/template-builds/:id/context`

Current policy variables:

- `TEMPLATE_IMAGE_ALLOW_REGISTRIES`
- `TEMPLATE_IMAGE_DENY_REGISTRIES`
- `TEMPLATE_IMAGE_ALLOW_PREFIXES`
- `TEMPLATE_IMAGE_DENY_PREFIXES`

By default, the development deployment allows Docker Hub, `mcr.microsoft.com`,
`gcr.io`, `ghcr.io`, and the local k0s registry. Dynamic Dockerfile `FROM`
references such as `FROM ${BASE_IMAGE}` are rejected because the API cannot
prove they match policy before Kaniko runs.

Remaining production work:

- Optional internal mirror enforcement.
- Warning or blocking on `latest` base tags.
- Denied known-bad image digests.
- Optional vulnerability scan gate before promotion.

## SBOM, Scanning, And Provenance

The schema should keep room for:

- SBOM object reference.
- Vulnerability scan status and summary.
- Builder identity.
- Source repository and commit.
- Build context hash.
- Image digest and registry.
- Promotion actor and timestamp.

Scanning/signing can be deferred, but the version metadata should not make those
fields impossible to add later.

## Visibility

Template visibility is product metadata, not a substitute for authorization:

- `private`: visible to the owning organization.
- `internal`: intended for platform-owned defaults and shared internal runtime
  templates.
- `public`: visible as a shared catalog template.

Every read and write path must still check organization scope and avoid exposing
private build logs across tenants.

## Audit Events

The plan requires audit events for template create, build, cancel, promote,
archive, and sandbox creation from a template version. Current code records
create, build create, cancel, retry, promote, and sandbox create. Archive and
builder-completion audit events still need to be added with the builder phase.
