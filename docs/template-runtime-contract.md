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

When a sandbox is created, Harakiri should pass:

- Image URI, preferably digest-pinned.
- Default entrypoint.
- CPU and memory.
- Workdir when OpenSandbox supports it.
- Environment metadata when OpenSandbox supports it.
- Labels/metadata: Harakiri sandbox ID, organization ID, template ID, template
  version ID, image digest, and route policy.

Current code passes image, entrypoint, CPU, memory, TTL, name, and Harakiri
metadata through the OpenSandbox adapter. Workdir/env/registry auth support is
tracked in the runtime integration phase.

## Non-Goals For V1

- E2B-specific image dependencies.
- Snapshot-first template creation.
- Requiring a browser/editor in every template.
- Treating mutable tags as production-ready immutable versions.
