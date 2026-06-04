# Harakiri CLI

Command-line client for Harakiri Sandbox.

Full command documentation lives in [docs/cli.md](../../docs/cli.md), with
error handling guidance in [docs/errors.md](../../docs/errors.md).

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
harakiri create --template open-agents-dev --git https://github.com/acme/project.git --git-path /workspace/project
harakiri git status sbx_... --cwd /workspace/project
harakiri attach sbx_... --cwd /workspace
harakiri run --stdin agent.py
harakiri process run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0" --detached
harakiri command wait sbx_... cmd_... --status running
harakiri command tail sbx_... cmd_... --lines 100
harakiri command session create sbx_... --cwd /workspace
harakiri command session run sbx_... sess_... --cmd "pwd"
harakiri command session delete sbx_... sess_...
harakiri files sbx_... --path /workspace
harakiri file-upload sbx_... --path /workspace/out.bin --from ./out.bin --parents
harakiri file-download sbx_... --path /workspace/out.bin --to ./out.bin
harakiri logs sbx_...
harakiri expose sbx_... --port 3000 --wait --wait-path /
harakiri routes sbx_...
harakiri open sbx_... --port 3000
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

## Lifecycle

Harakiri supports create, reconnect/status, renew, and kill for the current
OpenSandbox-backed lifecycle. It does not expose pause, resume, or snapshot as
working operations.

```bash
harakiri status sbx_...
harakiri status sbx_... --json
harakiri renew sbx_...
harakiri capabilities
harakiri kill sbx_...
```

`status` prints TTL, expiration, provider sandbox ID, and lifecycle capability
states. `capabilities` reports `lifecyclePause`, `lifecycleResume`, and
`lifecycleSnapshot` as unsupported so integrations can hide unavailable actions.

## Files And Artifacts

Use `files`, `file-stat`, `file-read`, `file-write`, `file-mkdir`,
`file-rename`, and `file-rm` for normal filesystem work. Use upload/download
for binary artifacts:

```bash
harakiri files sbx_... --path /workspace
harakiri file-write sbx_... --path /workspace/task.txt --content "ready" --parents
harakiri file-upload sbx_... --path /workspace/result.bin --from ./result.bin --parents
harakiri file-download sbx_... --path /workspace/result.bin --to ./result.bin
harakiri file-download sbx_... --path /workspace/result.bin --json --to ./result.bin
```

`file-upload` computes and sends `sha256`. `file-download` verifies the returned
checksum before writing to stdout or disk. The API currently advertises
`transfer.mode=json-base64` with a configured decoded byte limit.

## Git Workflow

Clone repositories through Harakiri's command API. Tokens are read from
environment variables so they do not appear in command-line history.

```bash
harakiri create \
  --template open-agents-dev \
  --name repo-runner \
  --git https://github.com/acme/project.git \
  --git-branch main \
  --git-path /workspace/project

harakiri git status sbx_... --cwd /workspace/project
harakiri git add sbx_... . --cwd /workspace/project
harakiri git branch sbx_... agent/change --cwd /workspace/project
harakiri git branch-delete sbx_... agent/change --cwd /workspace/project
harakiri git user sbx_... --cwd /workspace/project --name "Harakiri" --email "agent@harakiri.local"
harakiri git commit sbx_... --cwd /workspace/project -m "agent update"

export GITHUB_TOKEN=ghp_...
harakiri git clone sbx_... https://github.com/acme/private.git \
  --path /workspace/private \
  --token-env GITHUB_TOKEN
```

The default credential mode is one-shot. The CLI resets `origin` to a
credential-free URL after clone. Use `--preserve-credentials` only when the
repository must keep credentials in `.git/config`.

`harakiri create --git ...` sends only sanitized repository provenance to the
API. The CLI/SDK then patches the sandbox source status through `cloning`,
`ready`, or `failed`, so the dashboard can show bootstrap state without storing
repository credentials.

Git commands attach constrained operation metadata to the command request.
Mutating operations such as clone, commit, pull, push, remote changes, and
config updates create `sandbox.git.*` audit entries with sanitized repository
context.

Git troubleshooting:

| Symptom | What to check |
| --- | --- |
| `git binary not found in sandbox image` | The CLI prints template guidance from `HarakiriGitUnsupportedRuntimeError`. Use a template that includes Git, such as `open-agents-dev`, `opencode`, or a custom image that installs `git`. |
| Private clone fails | Export the token env var before running the command and pass its name with `--token-env`. |
| Clone or pull is blocked | The CLI prints `HarakiriGitNetworkAccessError` guidance for DNS, TCP, proxy, and likely egress failures. Add the `git-hosting` egress preset, or allow the required Git hostnames in the sandbox/template policy. |
| Branch command fails | Run `harakiri git branches sbx_... --cwd /workspace/project` and verify the target branch or checkout ref. |
| Commit fails | Configure identity with `harakiri git user sbx_... --name ... --email ...`. |
| Push is rejected | Pull/rebase first, verify write scope, and pass one-shot credentials to `harakiri git push`. |

## OpenCode Template Workflow

Use the `opencode` template when you want a coding-agent sandbox with OpenCode
installed. Attach for the TUI, use `opencode run` for headless automation, or
start the OpenCode server and expose port `4096`.

```bash
harakiri create --template opencode --name opencode-agent --ttl 1200
harakiri attach sbx_... --cwd /workspace

harakiri run sbx_... --cwd /workspace --cmd \
  'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"'

harakiri create \
  --template opencode \
  --name opencode-server \
  --ttl 1200 \
  --env OPENCODE_SERVER_PASSWORD="$(openssl rand -hex 16)"

harakiri run sbx_... --cwd /workspace --cmd \
  'nohup opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode.log 2>&1 &'

harakiri expose sbx_... --port 4096 --access token --label opencode --wait --wait-path /global/health
harakiri routes sbx_...
harakiri unexpose sbx_... --port 4096
```

If the route is not reachable, confirm the server was started with
`--hostname 0.0.0.0`. Token routes require the `x-harakiri-route-token` header
printed once by `harakiri expose`; `harakiri routes` shows only `tokenHint`.
OpenCode basic auth is controlled by `OPENCODE_SERVER_USERNAME` and
`OPENCODE_SERVER_PASSWORD`.

For browser previews of token routes, pass `harakiri open sbx_... --port 4096
--token "$HARAKIRI_ROUTE_TOKEN"` only when putting the token in the URL query
string is acceptable for that environment. SDK and server integrations should
prefer the route-token header.

## Verify Before Publishing

```bash
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/cli typecheck
pnpm --filter @h-sandbox/cli build
pnpm cli:pack
pnpm publish:local-check
```
