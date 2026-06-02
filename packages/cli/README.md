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
npm install -g ./dist-packages/h-sandbox-cli-0.1.0.tgz
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

## Verify Before Publishing

```bash
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/cli typecheck
pnpm --filter @h-sandbox/cli build
pnpm cli:pack
pnpm publish:local-check
```
