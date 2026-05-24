# Template Build Pipeline

Template builds are the control-plane path from a Dockerfile, Git source, or
existing image reference to an immutable template version. The current
implementation includes an image-import worker that resolves existing OCI image
references to immutable digests, plus Dockerfile build context upload from the
CLI/API into PostgreSQL. Dockerfile and Git builds still need the k0s BuildKit
execution infrastructure phase.

## Data Flow

1. CLI or UI creates a template definition with `POST /v1/templates`.
2. CLI or UI creates a build record with `POST /v1/templates/:id/builds`.
3. PostgreSQL stores the build as `queued` with source metadata and requested
   image destination.
4. For Dockerfile builds, the CLI uploads a tar+gzip build context to
   `POST /v1/template-builds/:id/context`; the API verifies size and sha256
   before storing the archive.
5. A builder worker claims supported queued records, marks them `building`, and
   streams logs into `template_build_logs`.
6. For `sourceType=image`, the image-import worker resolves the registry
   manifest digest and creates a digest-pinned runtime version.
7. For future Dockerfile/Git execution, the BuildKit worker will build or import
   the OCI image, push it to the configured registry, and resolve the pushed
   image to an immutable digest.
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
    "imageDestination": "registry.example.com/harakiri/open-agents-dev:dev",
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
harakiri template build --name open-agents-dev . --image registry.example.com/harakiri/open-agents-dev:dev
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template builds --status queued
harakiri template logs bld_...
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
```

## Failure Modes

- `template_not_found`: build was requested for a reference that does not
  resolve in the organization.
- `template_exists`: create attempted to reuse an existing template ID.
- `template_build_not_found`: logs, cancel, retry, or inspect was requested for
  a build outside the organization or for an unknown ID.
- `template_version_not_found`: promote targeted a non-ready or inaccessible
  version.
- Registry push/pull failures: should be stored in `template_builds.error` and
  surfaced by API, CLI, and UI.
- Image digest resolution failure: must keep the build failed or blocked; do not
  promote a mutable tag without a digest.

## Builder Workers

The current `harakiri-template-builder` deployment handles public image imports
only. It claims queued records where `source_type = 'image'`, writes logs,
stores `image_digest`, creates a ready `template_versions` row, and updates the
template's `latest_version_id`.

The k0s Dockerfile/Git builder still needs to provide:


- Rootless BuildKit or another Kubernetes-native builder.
- Per-organization registry credentials.
- Uploaded build-context consumption or Git checkout.
- Secret redaction in logs.
- Image digest resolution after push.
- Cache storage and cleanup policy.
- Concurrency limits per organization.
- Health checks and operator runbook commands.
