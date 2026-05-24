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
   build ID, digest, resources, ports, workdir, and metadata, and promotes the
   desired alias.
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

If a template definition or existing template exceeds the resource policy, the
API returns `422 template_resource_limit_exceeded` with field-level violations.
If an organization already has the maximum number of active template builds, the
API returns `429 template_build_concurrency_limit_exceeded` with the active count
and configured limit. The concurrency check runs inside a PostgreSQL advisory
transaction lock so simultaneous requests cannot overrun the per-organization
cap.

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
```

By default, `harakiri template build` waits for completion, prints streamed log
lines, and ends with the build ID, template version ID, image digest, duration,
and the next `harakiri create` command. `--no-wait` preserves the enqueue-only
behavior for CI or custom polling scripts.

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
template's `latest_version_id`.

For Dockerfile builds, the worker creates a short-lived Kubernetes Job in the
`harakiri` namespace. The Job uses the API image as a context-exporter init
container, reads the verified archive from PostgreSQL, expands it into an
emptyDir workspace, and then runs Kaniko against that workspace. Kaniko pushes
to `TEMPLATE_REGISTRY_PUSH_HOST`; Harakiri stores the runtime image using
`TEMPLATE_REGISTRY_RUNTIME_HOST` so OpenSandbox can pull the digest-pinned image
from the node-local registry.

Still pending for production hardening:

- Git source checkout.
- Per-organization registry credentials.
- Cache retention and cleanup policy.
- Health checks and operator runbook commands.
