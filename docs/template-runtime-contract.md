# Template Runtime Contract

Harakiri templates must produce OCI images that OpenSandbox can pull and run as
normal sandbox runtimes. The control plane adds metadata and routing around the
runtime; the image itself is responsible for exposing useful tools and services.

## Required Image Behavior

- The image must start and stay alive with the configured entrypoint. The default
  is `sleep 3600`.
- The configured `workdir` must exist or be creatable by the runtime user.
- The runtime user must be able to write to the workspace path.
- Long-running servers must bind to `0.0.0.0`, not only `127.0.0.1`.
- Commands should work through Kubernetes `pods/exec` against the sandbox pod.
- Logs should be visible through stdout/stderr or control-plane events.

## Recommended harakiri.toml Fields

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

The API stores resources and ports on both the template definition and immutable
template version. Sandbox creation should use the version values.

## Open Agents Runtime

The planned `open-agents-dev` pilot should include:

- `bun`
- `jq`
- `agent-browser`
- Chromium headless dependencies
- `code-server`
- `git`
- `pnpm`, `yarn`, `npm`
- Python
- Writable `/workspace`
- Default exposed-port candidates: `3000`, `5173`, `4321`, `8000`

The OpenSandbox-native Dockerfile from
`/Users/labs/project/trash/background-agents/opensandbox-template` should be
preferred over an E2B base image because Harakiri runs on OpenSandbox and should
emit normal OCI images.

## Smoke Checks

Run these inside a sandbox created from the template:

```bash
bun --version
jq --version
python --version
node --version
git --version
mkdir -p /workspace/harakiri-smoke
echo ok >/workspace/harakiri-smoke/write.txt
cat /workspace/harakiri-smoke/write.txt
```

For browser and editor surfaces:

```bash
chromium --headless --disable-gpu --dump-dom https://example.com
code-server --bind-addr 0.0.0.0:4321 /workspace
```

For public route exposure:

```bash
python -m http.server 3000 --bind 0.0.0.0
harakiri expose sbx_... --port 3000
curl "$(harakiri routes sbx_... | awk '/3000/ {print $4; exit}')"
```

## OpenSandbox Integration

Before a build-produced template version is marked ready, Harakiri runs runtime
pull preflight with the final digest-pinned image. The preflight creates a
short-lived Pod in the configured namespace and fails the build on image-pull
errors or timeout. This proves the k0s runtime path can pull the image, but it
does not replace the sandbox smoke checks below because an image can pull
successfully and still fail OpenSandbox bootstrap if required userland tools are
missing.

When a sandbox is created, Harakiri should pass:

- Image URI, preferably digest-pinned.
- Default entrypoint.
- CPU and memory.
- Environment variables from `POST /v1/sandboxes.env`.
- Registry image auth when a matching encrypted pull credential exists.
- Workdir metadata for traceability. The current OpenSandbox lifecycle
  specification does not expose a create-time workdir field, so the image's
  Dockerfile `WORKDIR` and template smoke checks remain the runtime contract.
- Labels/metadata: Harakiri sandbox ID, organization ID, template ID, template
  version ID, image digest, and route policy.

Current code passes image, entrypoint, CPU, memory, TTL, name, environment
variables, optional `image.auth`, and Harakiri metadata through the OpenSandbox
adapter. The metadata includes:

- `harakiri.id` and `harakiri.sandbox`
- `harakiri.org` and `harakiri.organization`
- `harakiri.template`
- `harakiri.template_version`
- `harakiri.image_digest`
- `harakiri.workdir`
- `harakiri.runtime_registry_credential` when a matching credential is selected
- `harakiri.route_mode`
- `harakiri.route_base_domain`
- `harakiri.route_public_scheme`
- `harakiri.route_max_per_sandbox`
- `harakiri.route_max_per_org`

Values are normalized to OpenSandbox/Kubernetes label-safe strings. Sandbox
events and audit metadata record env key names, `runtimeWorkdir`, the selected
registry credential ID, and whether OpenSandbox image auth was provided; env
values and registry passwords are not stored in those records.

OpenSandbox injects `execd` and `bootstrap.sh` through an init container and
starts the sandbox command through that bootstrap script. Custom images should
include a normal Linux userland with `/bin/sh`, `/usr/bin/env`, and `bash`
available. Minimal BusyBox-only images can build and pull successfully, but they
may fail at runtime before the sandbox becomes ready.

## Non-Goals For V1

- E2B-specific image dependencies.
- Snapshot-first template creation.
- Requiring a browser/editor in every template.
- Treating mutable tags as production-ready immutable versions.
