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
- Alias: a stable name that resolves to a template or template version, such as
  `open-agents-dev`, `latest`, or `stable`.
- Snapshot: a future acceleration primitive. The v1 contract is image-first;
  OpenSandbox snapshots are not required for initial custom templates.

## harakiri.toml

`harakiri template init` writes a config close to E2B's `e2b.toml`:

```toml
name = "open-agents-dev"
dockerfile = "Dockerfile"
visibility = "private"
cpu_count = 2
memory_mb = 2048
workdir = "/workspace"
ports = [3000, 5173, 4321, 8000]
start_command = "sleep 3600"
ready_command = "true"
```

Current CLI support reads the command flags first. For Dockerfile builds, it
archives the local context as tar+gzip, uploads it to the API, and stores a
verified `sha256:` context hash on the build record. Full `harakiri.toml`
parsing and validation still belong to a later CLI polish phase.

## CLI Workflow

```bash
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template inspect open-agents-dev
harakiri create --template open-agents-dev --name agent-runner
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

Create a sandbox from a template name, alias, or immutable version ID:

```bash
curl "$PUBLIC_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"open-agents-dev","name":"agent-runner","ttlSeconds":300}'
```

The sandbox row stores `template_version_id` and `template_image_digest` when
the selected version has those fields.

## Resolution Rules

`resolveTemplate(ref, organizationId)` checks:

1. Organization-owned templates before public/internal seed templates.
2. Exact template ID.
3. Exact template name.
4. Template alias.
5. Template version ID.
6. Template version alias.

This lets `harakiri create --template open-agents-dev` use the stable alias,
while automation can use an immutable `tplv_...` ID for reproducibility.

## Rollout Notes

- Static seed templates remain as fallback bootstrap data.
- New custom definitions are stored in PostgreSQL.
- Build infrastructure must resolve mutable tags to immutable digests before a
  version is considered ready for production use.
- Use `docs/template-builds.md` for build state transitions and
  `docs/template-runtime-contract.md` for image expectations.
