# Harakiri CLI

Command-line client for Harakiri Sandbox.

## Install From This Repository

The published package installs a normal `harakiri` executable:

```bash
npm install -g @h-sandbox/cli
harakiri --version
```

To test local package changes from this repository, build and install a local
tarball:

Build and install the CLI as a normal executable instead of invoking
`node packages/cli/dist/index.js` directly:

```bash
pnpm install
pnpm cli:pack
npm install -g ./dist-packages/h-sandbox-cli-0.3.0.tgz
harakiri --version
```

`pnpm cli:pack` runs the package build first, which compiles the SDK and CLI and
marks `dist/index.js` executable. The installed `harakiri` binary is the same
entrypoint exposed by the published package through the package `bin` field.

For development without a global install:

```bash
pnpm --filter @h-sandbox/cli build
pnpm --filter @h-sandbox/cli exec harakiri --version
```

## Configure

Store the API URL and key once:

```bash
harakiri login --api-url https://sb-api.harakiri.io --api-key hk_live_...
```

The CLI also reads `HARAKIRI_API_URL` and `HARAKIRI_API_KEY`. Local login
settings are written to `~/.config/harakiri/config.json`.

## Common Commands

```bash
harakiri init
harakiri create --template python-3.12-data --env HARAKIRI_ENV_SMOKE=env-ok
harakiri attach sbx_... --cwd /workspace
harakiri run --stdin agent.py
harakiri command run sbx_... --cmd "python -m http.server 3000" --detached
harakiri command session create sbx_... --cwd /workspace
harakiri command session run sbx_... sess_... --cmd "pwd"
harakiri command session delete sbx_... sess_...
harakiri files sbx_... --path /workspace
harakiri logs sbx_...
harakiri expose sbx_... --port 3000
harakiri routes sbx_...
harakiri egress set sbx_... --mode restricted --allow api.github.com
harakiri egress test sbx_... https://api.github.com
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri registry upsert --name ghcr --registry-host ghcr.io --username robot --secret "$TOKEN" --purpose push_pull
```

Dockerfile builds package the local context as tar+gzip, upload it to the API,
run the configured Kubernetes image builder, and store a digest-pinned ready
template version. The default OSS builder is rootless BuildKit.

## OpenCode Template Workflow

Use the `opencode` template when you want a coding-agent sandbox with OpenCode
installed. Attach for the TUI, use `opencode run` for headless automation, or
start the OpenCode server and expose port `4096`.

```bash
harakiri create --template opencode --name opencode-agent --ttl 1200 --env ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
harakiri attach sbx_... --cwd /workspace

harakiri run sbx_... --cwd /workspace --cmd 'opencode run "summarize this project"'

harakiri create \
  --template opencode \
  --name opencode-server \
  --ttl 1200 \
  --env ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --env OPENCODE_SERVER_PASSWORD="$(openssl rand -hex 16)"

harakiri run sbx_... --cwd /workspace --cmd \
  'nohup opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode.log 2>&1 &'

harakiri expose sbx_... --port 4096 --access token --label opencode
harakiri routes sbx_...
harakiri unexpose sbx_... --port 4096
```

If the route is not reachable, confirm the server was started with
`--hostname 0.0.0.0`. Token routes require the `x-harakiri-route-token` header
printed by `harakiri expose` or `harakiri routes`. OpenCode basic auth is
controlled by `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`.

## Verify Before Publishing

```bash
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/cli typecheck
pnpm --filter @h-sandbox/cli build
pnpm cli:pack
pnpm publish:local-check
```
