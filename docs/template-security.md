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
4. Run runtime pull preflight against the digest-pinned image before inserting
   the ready version.
5. Store the digest on sandbox creation as `sandboxes.template_image_digest`.
6. Prefer a digest-pinned image reference when calling OpenSandbox.

If digest resolution fails, keep the build non-ready and surface the failure.
If runtime pull preflight fails, keep the build failed so users do not receive a
ready template that OpenSandbox cannot pull.

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

Template versions now keep first-class security fields:

- `sbom_ref`: object-store or registry artifact reference for an SBOM when one
  is produced.
- `provenance`: JSON describing source type, build ID, template ID,
  organization ID, image URI, image digest, builder identity, Dockerfile path,
  and context hash where available.
- Dockerfile build metadata: the completed build record stores the Kubernetes
  Job, Pod, Pod UID, namespace, and node name that handled the Kaniko build so
  operators can correlate persisted records with cluster events and logs.
- Runtime pull preflight metadata: successful builds store the disposable
  preflight Pod, namespace, node, image ID when available, and duration. This
  proves the digest-pinned runtime image was pullable before the version became
  ready.
- `scan_status`: `not_scanned` when no scanner is configured, `scan_failed`
  when the configured scanner cannot be reached or returns a non-2xx response,
  or the normalized status returned by the scanner webhook such as `clean`,
  `vulnerable`, or `blocked`.
- `scan_summary`: redacted JSON summary returned by the scanner webhook. When
  no scanner is configured, builds set
  `{ "status": "not_scanned", "reason": "scanner_not_configured" }`.

Configure `TEMPLATE_SCANNER_WEBHOOK_URL` to enable the hook. The builder posts
the digest-pinned image URI, image digest, build ID, template ID, organization
ID, source type, and provenance JSON before inserting the ready version. Set
`TEMPLATE_SCANNER_FAIL_ON_ERROR=1` only when scanner outages should fail the
template build. Signing integration and production vulnerability policy
thresholds are still deferred, but the persisted version shape is ready for
SBOM artifact references, scanner output, and provenance queries.

## Retention

Template retention is scheduler-owned and keeps auditability ahead of disk
reclamation. The scheduler deletes old terminal build logs, uploaded Dockerfile
context archives, and terminal build rows that are not referenced by a template
version. It marks old unused ready versions as `retired` instead of deleting
them when the version is not latest/stable, is not the template's
`latest_version_id`, and is not used by an active sandbox.

Relevant policy variables:

- `TEMPLATE_RETENTION_ENABLED`
- `TEMPLATE_RETENTION_INTERVAL_MS`
- `TEMPLATE_BUILD_LOG_RETENTION_DAYS`
- `TEMPLATE_BUILD_CONTEXT_RETENTION_DAYS`
- `TEMPLATE_BUILD_RETENTION_DAYS`
- `TEMPLATE_VERSION_RETENTION_DAYS`
- `TEMPLATE_BUILDER_JOB_RETENTION_DAYS`
- `TEMPLATE_RETENTION_DELETE_BUILDER_JOBS`

The retention pass emits `template.version.retired` audit events for
organization-owned versions. Registry blob deletion remains an explicit
operator action because the registry must not delete any digest still referenced
by `template_versions.image_uri`.

## Visibility

Template visibility is product metadata, not a substitute for authorization:

- `private`: visible to the owning organization.
- `internal`: intended for platform-owned defaults and shared internal runtime
  templates.
- `public`: visible as a shared catalog template.

Read access is explicit: a workspace can see its own templates plus platform
templates with `public` or `internal` visibility. Platform `private` templates
are hidden from workspaces. Mutation access is narrower: only organization-owned
templates can be built, promoted, or archived by that workspace. Build records,
uploaded contexts, retained logs, retries, and cancellation stay scoped to the
build's owning organization to avoid exposing private build data across tenants.

## Audit Events

Harakiri records template lifecycle events in `audit_events`:

- `template.create`
- `template.build.create`
- `template.build.cancel`
- `template.build.retry`
- `template.build.success`
- `template.build.failed`
- `template.promote`
- `template.archive`
- `template.version.retired`
- `sandbox.create`

Builder-completion events use the system actor label
`harakiri-template-builder`. Retention events use `harakiri-scheduler`.
User-triggered events use the authenticated Keycloak or API-key actor label.
Audit metadata is redacted before storage.
