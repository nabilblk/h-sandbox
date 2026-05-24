# Custom Templates

Harakiri templates are named sandbox runtimes backed by PostgreSQL records and
OpenSandbox-compatible OCI images. The model copies the useful parts of E2B's
template workflow while keeping the runtime contract portable.

## Concepts

- Template definition: mutable catalog row with name, aliases, visibility,
  image fallback, CPU, memory, workdir, default entrypoint, default ports, tags,
  and runtime family.
- Template version: immutable runtime selection. A version stores the image URI,
  optional digest, resources, ports, workdir, entrypoint, aliases, build ID, and
  promoted timestamp. Versions also carry SBOM/provenance fields and scan
  status so runtime images can be audited independently from mutable template
  definitions.
- Build record: a control-plane request to build or import an image. Build
  records keep status, source type, Dockerfile path, context hash, build args,
  image destination, digest, error, metadata, and logs.
- Alias: a stable name that resolves to a template or template version. Template
  aliases look like `open-agents-dev`; promoted version aliases should be
  referenced as qualified refs such as `open-agents-dev:stable` or
  `open-agents-dev:latest`.
- Snapshot: a future acceleration primitive. The v1 contract is image-first;
  OpenSandbox snapshots are not required for initial custom templates.

## harakiri.toml

`harakiri template init` writes a config close to E2B's `e2b.toml`:

```toml
name = "open-agents-dev"
id = "open-agents-dev"
dockerfile = "Dockerfile"
visibility = "private"
runtime_family = "custom"
cpu_count = 2
memory_mb = 2048
workdir = "/workspace"
ports = [3000, 5173, 4321, 8000]
tags = ["custom", "hot"]
aliases = ["open-agents-dev"]
start_command = "sleep 3600"
ready_command = "true"
```

Current CLI support reads command flags first, then `harakiri.toml`. The
config supports `id`, `name`, `dockerfile`, `image`, `visibility`, CPU, memory,
workdir, ports, aliases, tags, runtime family, `start_command`, and
`ready_command`. For Dockerfile builds, the CLI archives the local context as
tar+gzip, uploads it to the API, and stores a verified `sha256:` context hash
on the build record.

## CLI Workflow

```bash
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --port 5173 --tag hot
harakiri template build --name open-agents-dev .
harakiri template build --name open-agents-dev examples/templates/open-agents-dev
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template inspect open-agents-dev
harakiri create --template open-agents-dev --name agent-runner
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri create --template open-agents-dev:stable --name stable-runner
harakiri create --template tplv_... --name pinned-runner
harakiri template archive open-agents-dev
```

`template build` creates or reuses the template definition, then enqueues a build
record through `POST /v1/templates/:id/builds`. By default the CLI follows the
build, prints new log lines, and finishes with the build ID, template version
ID, image digest, duration, and next `harakiri create` command. Use
`--no-wait` to enqueue and return immediately, then inspect with
`harakiri template builds --query ...` and `harakiri template logs bld_...`.
Image-import builds resolve an immutable source digest. Dockerfile builds upload
their local context, run a Kaniko Job in k0s, push to the local registry, and
create a digest-pinned ready template version.

Add the `hot`, `prepull`, or `warm` tag when a template should warm the node
image cache after a successful build. The builder still performs runtime pull
preflight for every ready version; the hot-template pre-pull is an optional
startup optimization and does not replace immutable digest recording.

`template archive` hides a custom template from active lists and prevents new
sandbox creation by that template alias or version. Existing sandboxes keep
running, and queued/building builds for the archived template are canceled.

The dashboard Templates List exposes the same workflow for custom templates.
Search is backed by template ID, name, and aliases; filters cover visibility,
owner scope (`team` or `platform`), runtime family, and active/archived status.
The table shows created/updated timestamps, explicit aliases, latest image
version or digest, and the latest build status for the current workspace.
Use creates a sandbox, Build queues an image-import build, Builds opens the
Builds tab filtered to that template, Promote marks the current ready version as
`stable`, and Archive retires the template from active creation.

Open a row to inspect the template detail panel. The Overview tab shows the
canonical `harakiri create` command, SDK snippet, image, digest, workdir,
entrypoint, resources, and default ports. The Versions tab reads
`GET /v1/templates/:id/versions` and lists immutable version IDs, aliases,
image URI/digest, scan state, creation time, and copy actions. The Config tab
generates a `harakiri.toml` view from the control-plane row plus the latest
redacted build args and metadata. The Runs tab uses
`GET /v1/sandboxes?template=<id>&limit=20` to show recent sandboxes created
from that template, including the stored version ID and image digest selected
at create time.

The dashboard New Template flow covers the same user-facing sources as the CLI:

- Dockerfile: paste a Dockerfile or choose a local `Dockerfile` in the browser.
  The web app creates a single-file tar+gzip context, verifies its SHA-256 in
  the browser, uploads it through `POST /v1/template-builds/:id/context`, and
  opens the Builds tab on the queued build.
- Existing OCI image: enter an image reference such as `ubuntu:24.04` or a
  registry-hosted runtime image. The API stores the template definition and
  queues an image-import build so the builder can resolve the immutable digest.
- Clone: select an existing visible template, fork its resources, ports,
  workdir, entrypoint, runtime family, and image into an organization-owned
  template, then queue an image-import build for the fork.

Before submit, the dashboard shows the generated `harakiri.toml` preview. Keep
that preview aligned with CLI examples when adding new template fields. The Hot
image pre-pull checkbox adds the `hot` tag to the preview and template payload.

The API enforces workspace policy before accepting template definitions or
build records. By default custom templates are capped at 8 vCPU, 32768 MiB
memory, 16 default ports, and 3 active queued/building template builds per
organization. Over-limit requests return `template_resource_limit_exceeded` or
`template_build_concurrency_limit_exceeded`.

Image policy is enforced at the same API boundary. Template image references,
image-import targets, and Dockerfile `FROM` lines must use allowed registries or
prefixes. Dynamic Dockerfile bases such as `FROM ${BASE_IMAGE}` are rejected
until the control plane has a safe way to resolve build args before Kaniko runs.

## API Workflow

Create or update a template definition:

```bash
curl "$PUBLIC_API_URL/v1/templates" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "id": "open-agents-dev",
    "name": "open-agents-dev",
    "image": "ubuntu:24.04",
    "aliases": ["open-agents-dev"],
    "visibility": "private",
    "cpuCount": 2,
    "memoryMb": 2048,
    "workdir": "/workspace",
    "defaultPorts": [3000, 5173, 4321, 8000],
    "runtimeFamily": "custom"
  }'
```

Create a sandbox from a template name, template alias, qualified version alias,
or immutable version ID:

```bash
curl "$PUBLIC_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"open-agents-dev","name":"agent-runner","ttlSeconds":300}'

curl "$PUBLIC_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"open-agents-dev:stable","name":"stable-runner","ttlSeconds":300}'

curl "$PUBLIC_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"tplv_...","name":"pinned-runner","ttlSeconds":300}'
```

The sandbox row stores `template_version_id` and `template_image_digest` when
the selected version has those fields.

## Resolution Rules

`resolveTemplate(ref, organizationId)` checks:

1. Qualified version aliases in the form `<template-ref>:<version-alias>`, for
   example `open-agents-dev:stable`. The template side can be a template ID,
   name, or alias, and the version side must be a ready version alias.
2. Templates owned by the requesting organization plus platform templates whose
   visibility is `public` or `internal`. Platform `private` rows are hidden from
   workspaces.
3. Exact template ID.
4. Exact template name.
5. Template alias.
6. Template version ID.
7. Bare template version alias.

This lets `harakiri create --template open-agents-dev` use the current ready
version selected by the template, `harakiri create --template
open-agents-dev:stable` use a promoted stable version, and automation use an
immutable `tplv_...` ID for reproducibility. Bare version aliases are accepted
for compatibility but are ambiguous once multiple templates carry `stable` or
`latest`; prefer the qualified `<template-ref>:<alias>` form in docs, scripts,
and UI examples.
Only organization-owned templates can be built, promoted, or archived by a
workspace; shared platform templates are read-only catalog entries for sandbox
creation.

## Rollout Notes

- Static seed templates remain as fallback bootstrap data.
- New custom definitions are stored in PostgreSQL.
- Build infrastructure must resolve mutable tags to immutable digests before a
  version is considered ready for production use.
- Use `docs/template-builds.md` for build state transitions and
  `docs/template-runtime-contract.md` for image expectations.
