# Template Build Pipeline

Template builds are the control-plane path from a Dockerfile, Git source, or
existing image reference to an immutable template version. The current
implementation includes an image-import worker that resolves existing OCI image
references to immutable digests, plus Dockerfile build execution through a
Kaniko Kubernetes Job in k0s. Git builds remain future work.

## Data Flow

1. CLI or UI creates a template definition with `POST /v1/templates`.
2. CLI or UI creates a build record with `POST /v1/templates/:id/builds`.
3. PostgreSQL stores the build as `queued` with source metadata and requested
   image destination.
4. For Dockerfile builds, the CLI uploads a tar+gzip build context to
   `POST /v1/template-builds/:id/context`; the API verifies size and sha256
   before storing the archive.
   The dashboard New Template flow uses the same endpoint for browser-created
   Dockerfile contexts. The browser path currently uploads one `Dockerfile`;
   use the CLI for multi-file build contexts.
5. A builder worker claims supported queued records, marks them `building`, and
   streams logs into `template_build_logs`; the CLI follows those logs by
   polling `GET /v1/template-builds/:id/logs` while the build is active.
6. For `sourceType=image`, the builder resolves the registry
   manifest digest and creates a digest-pinned runtime version.
7. For `sourceType=dockerfile`, the builder creates a Kubernetes Job with a
   context-exporter init container and a Kaniko container. Kaniko builds the OCI
   image, pushes it to the configured registry, and writes the pushed digest to
   the Job termination log.
8. On success, the worker writes a `ready` `template_versions` row, attaches the
   build ID, digest, resources, ports, workdir, metadata, provenance, deferred
   scan status, and promotes the desired alias.
9. Sandbox creation resolves a template reference to the chosen immutable
   version and sends the digest-pinned image to OpenSandbox.

## State Transitions

```text
queued -> building -> success
queued -> canceled
building -> canceled
building -> failed
failed -> queued   # retry creates a new build record
success -> queued  # retry creates a new build record
```

`POST /v1/template-builds/:id/cancel` only changes active `queued` or
`building` records. `POST /v1/template-builds/:id/retry` creates a new queued
record with `metadata.retryOf` pointing at the original build.

## Control-Plane Limits

The API enforces template resource and build concurrency limits before inserting
new build records:

- `TEMPLATE_MAX_CPU_COUNT`, default `8`
- `TEMPLATE_MAX_MEMORY_MB`, default `32768`
- `TEMPLATE_MAX_DEFAULT_PORTS`, default `16`
- `TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG`, default `3`, counting `queued` and
  `building` records for the organization
- `TEMPLATE_IMAGE_ALLOW_REGISTRIES` / `TEMPLATE_IMAGE_DENY_REGISTRIES`
- `TEMPLATE_IMAGE_ALLOW_PREFIXES` / `TEMPLATE_IMAGE_DENY_PREFIXES`

If a template definition or existing template exceeds the resource policy, the
API returns `422 template_resource_limit_exceeded` with field-level violations.
If an organization already has the maximum number of active template builds, the
API returns `429 template_build_concurrency_limit_exceeded` with the active count
and configured limit. The concurrency check runs inside a PostgreSQL advisory
transaction lock so simultaneous requests cannot overrun the per-organization
cap.

Image policy failures return `422 template_image_policy_violation`. Dockerfile
contexts are inspected for literal `FROM` references before the archive is
stored; dynamic `FROM ${...}` references are rejected because they bypass
control-plane policy checks.

## Stored Fields

`template_builds` stores:

- `id`
- `organization_id`
- `template_id`
- `status`
- `source_type`
- `context_hash`
- `dockerfile_path`
- `build_args`
- `image_destination`
- `image_digest`
- `log_ref`
- `error`
- `metadata`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

`template_build_logs` stores ordered line records with `line_no`, `stream`,
`message`, and `created_at`.

`template_build_contexts` stores uploaded Dockerfile contexts:

- `build_id`
- `organization_id`
- `format`, currently `tar+gzip`
- `sha256`
- `size_bytes`
- `file_count`
- `archive` as PostgreSQL `bytea`
- `metadata`
- `created_at`
- `updated_at`

`template_versions` also stores security and audit fields:

- `sbom_ref`
- `provenance`
- `scan_status`
- `scan_summary`

## API

```bash
curl "$PUBLIC_API_URL/v1/templates/open-agents-dev/builds" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "dockerfile",
    "dockerfilePath": "Dockerfile",
    "metadata": { "localPath": "." }
  }'
```

Upload the Dockerfile context:

```bash
curl "$PUBLIC_API_URL/v1/template-builds/bld_.../context" \
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

Import an existing image and let the deployed image-import worker create the
ready version:

```bash
curl "$PUBLIC_API_URL/v1/templates/ubuntu-import/builds" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "image",
    "imageDestination": "ubuntu:24.04"
  }'
```

```bash
curl "$PUBLIC_API_URL/v1/template-builds?status=queued" -H "x-api-key: $HK_KEY"
curl "$PUBLIC_API_URL/v1/template-builds/bld_..." -H "x-api-key: $HK_KEY"
curl "$PUBLIC_API_URL/v1/template-builds/bld_.../logs" -H "x-api-key: $HK_KEY"
```

## CLI

```bash
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template build --name open-agents-dev . --no-wait
harakiri template builds --status queued
harakiri template logs bld_...
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri create --template open-agents-dev:stable --name stable-runner
harakiri create --template tplv_... --name pinned-runner
```

By default, `harakiri template build` waits for completion, prints streamed log
lines, and ends with the build ID, template version ID, image digest, duration,
and the next `harakiri create` command. `--no-wait` preserves the enqueue-only
behavior for CI or custom polling scripts.

After promotion, use the qualified alias form `<template-ref>:stable` for the
human-readable channel. Use the immutable `tplv_...` version ID when the caller
must pin the exact digest chosen at sandbox creation.

## Failure Modes

- `template_not_found`: build was requested for a reference that does not
  resolve in the organization.
- `template_exists`: create attempted to reuse an existing template ID.
- `template_build_not_found`: logs, cancel, retry, or inspect was requested for
  a build outside the organization or for an unknown ID.
- `template_version_not_found`: promote targeted a non-ready or inaccessible
  version.
- `template_resource_limit_exceeded`: template CPU, memory, or default ports
  exceed the configured control-plane policy.
- `template_build_concurrency_limit_exceeded`: the organization already has the
  maximum number of queued/building template builds.
- `template_image_policy_violation`: template image, image-import target, or
  Dockerfile `FROM` reference is denied by registry/prefix policy or uses a
  dynamic base image reference.
- Registry push/pull failures: should be stored in `template_builds.error` and
  surfaced by API, CLI, and UI.
- Secret-bearing messages: build args, metadata, errors, and retained log lines
  are redacted before storage and again before API responses.
- Image digest resolution failure: must keep the build failed or blocked; do not
  promote a mutable tag without a digest.

## Builder Worker

The `harakiri-template-builder` deployment handles public image imports and
Dockerfile builds. It claims queued records, writes logs, stores
`image_digest`, creates a ready `template_versions` row, and updates the
template's `latest_version_id`. Build success and failure are recorded in
`audit_events` as `template.build.success` and `template.build.failed` with the
builder actor label `harakiri-template-builder`.

Build list responses include the resulting template version ID when a build has
produced one. Build detail surfaces the redacted build metadata and uploaded
context summary: context digest, archive size, file count, format, and upload
timestamp. Dockerfile builds also expose the Kubernetes builder runtime
metadata after completion: `builderJobName`, `builderPodName`,
`builderPodUid`, `builderNodeName`, and `builderNamespace`. The context archive
itself is not returned by the API.

The dashboard keeps failed build records actionable. Selecting a failed row
shows a failure panel that classifies image policy, registry digest lookup, and
Dockerfile/Kaniko errors, links to product troubleshooting docs, and keeps Retry
beside the retained error. If logs are still loading or were not recorded before
the failure, the log viewer states that explicitly instead of looking empty.

If a template is archived while a queued or building record exists, the API
marks those active builds `canceled`. If a Kubernetes build job finishes after
the record was canceled, the builder ignores the result instead of promoting it
back onto the archived template.

For Dockerfile builds, the worker creates a short-lived Kubernetes Job in the
`harakiri` namespace. The Job uses the API image as a context-exporter init
container, reads the verified archive from PostgreSQL, expands it into an
emptyDir workspace, and then runs Kaniko against that workspace. Kaniko pushes
to `TEMPLATE_REGISTRY_PUSH_HOST`; Harakiri stores the runtime image using
`TEMPLATE_REGISTRY_RUNTIME_HOST` so OpenSandbox can pull the digest-pinned image
from the node-local registry. The worker stores the Job name, Pod name, Pod UID,
namespace, and Kubernetes node name in the build metadata so operators can
correlate dashboard/API records with cluster logs.
Generated repositories include an organization namespace:
`<TEMPLATE_REGISTRY_REPOSITORY_PREFIX>/org-<organization-id>/<template-id>`.
Kaniko cache repositories use the same organization namespace. This keeps team
images and cache layers separated even when multiple organizations share one
registry host.

Before a successful build inserts the ready `template_versions` row, the worker
also creates a short-lived Pod using the digest-pinned runtime image. This
runtime pull preflight runs in `TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE`,
defaults to the OpenSandbox runtime namespace (`opensandbox` in the local k0s
stack), and is controlled by:

- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED`, default `1`.
- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE`, default `opensandbox`.
- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS`, default `120000`.

The preflight succeeds when Kubernetes proves the image was pulled by starting
the container or reaching a post-pull container state. It fails the build on
`ErrImagePull`, `ImagePullBackOff`, invalid image names, or timeout. Successful
build metadata includes `runtimePullPreflight.status = ok`, the preflight Pod,
node, image ID when available, and duration.

Hot templates can also warm the node image cache after preflight. Enable this
with `TEMPLATE_IMAGE_PREPULL_ENABLED=1` and tag templates with one of
`TEMPLATE_IMAGE_PREPULL_HOT_TAGS` (`hot,prepull,warm` by default). The builder
lists ready Kubernetes nodes, creates one disposable pull Pod per node in
`TEMPLATE_IMAGE_PREPULL_NAMESPACE`, waits for each Pod to prove the image was
pulled, then deletes the Pods. This is deliberately a Kubernetes-native
pre-pull, not an OpenSandbox snapshot or pre-started sandbox pool. By default
pre-pull errors are recorded as `runtimeImagePrepull.status = failed` without
failing the build; set `TEMPLATE_IMAGE_PREPULL_FAIL_ON_ERROR=1` only if cache
warming must become a release gate.

Before a successful build inserts the ready `template_versions` row, the worker
checks `TEMPLATE_SCANNER_WEBHOOK_URL`. When it is empty, the version keeps
`scan_status = not_scanned` and `scan_summary.reason =
scanner_not_configured`. When it is set, the worker posts the digest-pinned
image URI, image digest, build ID, template ID, organization ID, source type,
and provenance JSON to the scanner webhook. A `2xx` response may return any
lowercase-compatible status such as `clean`, `vulnerable`, or `blocked`, plus a
JSON summary; Harakiri redacts secret-shaped fields before storing it. Non-2xx
or unreachable scanner responses persist `scan_failed` by default. Set
`TEMPLATE_SCANNER_FAIL_ON_ERROR=1` only when scanner outages should fail the
template build instead of producing a ready-but-unverified version.

## Retention And Cleanup

The scheduler runs template retention every `TEMPLATE_RETENTION_INTERVAL_MS`
milliseconds, defaulting to one hour. Set `TEMPLATE_RETENTION_ENABLED=0` to
turn the pass off during an incident or forensic investigation.

Default retention policy:

- `TEMPLATE_BUILD_LOG_RETENTION_DAYS=14`: delete `template_build_logs` for
  terminal `success`, `failed`, or `canceled` builds older than the cutoff.
- `TEMPLATE_BUILD_CONTEXT_RETENTION_DAYS=7`: delete uploaded
  `template_build_contexts` archives after the terminal build cutoff. Build rows
  keep the context hash and metadata, but the heavy archive bytes are removed.
- `TEMPLATE_BUILD_RETENTION_DAYS=30`: delete terminal build rows only when no
  `template_versions` row references them. Referenced successful builds remain
  available for version audit.
- `TEMPLATE_VERSION_RETENTION_DAYS=90`: mark old ready versions as `retired`
  when they are not `latest`, not `stable`, not the template's
  `latest_version_id`, and no active sandbox is using them.
- `TEMPLATE_BUILDER_JOB_RETENTION_DAYS=1`: delete completed Kubernetes builder
  Jobs labeled `app=harakiri-template-build`.

Retired template versions are kept as database records for audit. The retention
pass emits `template.version.retired` audit events for organization-owned
versions. Registry blob garbage collection is still operator-owned: do not
delete blobs while any ready or retired `template_versions.image_uri` still
references the digest.

Still pending for production hardening:

- Git source checkout.
- Per-organization registry credentials.
- Registry blob garbage collection after version retirement.
- Production scanner service selection, policy thresholds, and health checks.
