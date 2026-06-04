# CLI Reference

The `@h-sandbox/cli` package installs the `harakiri` executable for local
development, CI scripts, and operator smoke checks. It talks to the same public
API as the SDK and dashboard.

## Install

```bash
npm install -g @h-sandbox/cli
harakiri --version
```

For repository-local testing:

```bash
pnpm cli:pack
npm install -g ./dist-packages/h-sandbox-cli-*.tgz
harakiri --help
```

## Configure

```bash
harakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"
harakiri config
```

The CLI resolves configuration in this order:

1. Explicit command flags.
2. `HARAKIRI_API_URL` and `HARAKIRI_API_KEY`.
3. Saved config at `~/.config/harakiri/config.json`.

Browser sign-in remains a Keycloak concern. CLI automation uses API keys.

## Sandbox Lifecycle

```bash
harakiri create --template python-3.12-data --name agent-runner --ttl 600
harakiri status sbx_...
harakiri status sbx_... --json
harakiri renew sbx_...
harakiri kill sbx_...
```

Create accepts `--wait`, `--no-wait`, `--ttl`, repeated `--env KEY=value`, Git
source flags, and egress flags. `status` prints runtime metadata, provider
capability states, TTL, and source status when available.

Pause, resume, and snapshot are intentionally not working CLI commands for the
current OpenSandbox-backed provider. Use `harakiri capabilities` to inspect
unsupported or degraded capabilities before showing advanced actions in tools.

## Commands And Processes

Use `run` for a blocking command and `process` or `command` for tracked
background work:

```bash
harakiri run sbx_... --cmd "python --version"
harakiri process run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0" --detached --json
harakiri command wait sbx_... cmd_... --status running
harakiri command tail sbx_... cmd_... --lines 100
harakiri command status sbx_... cmd_... --json
harakiri command kill sbx_... cmd_...
```

`command session` creates a provider-owned shell session for non-interactive
stateful automation:

```bash
SESSION_ID="$(harakiri command session create sbx_... --cwd /workspace | head -n1)"
harakiri command session run sbx_... "$SESSION_ID" --cmd "cd /tmp && pwd"
harakiri command session run sbx_... "$SESSION_ID" --cmd "pwd"
harakiri command session delete sbx_... "$SESSION_ID"
```

## Interactive Terminal

```bash
harakiri attach sbx_... --cwd /workspace
```

`attach` uses Harakiri auth and the provider terminal capability. It does not
return raw provider endpoint credentials and does not use Kubernetes exec.

## Files And Artifacts

```bash
harakiri files sbx_... --path /workspace
harakiri file-stat sbx_... --path /workspace/result.bin
harakiri file-write sbx_... --path /workspace/task.txt --content "ready" --parents
harakiri file-read sbx_... --path /workspace/task.txt
harakiri file-upload sbx_... --path /workspace/result.bin --from ./result.bin --parents
harakiri file-download sbx_... --path /workspace/result.bin --to ./result.bin
harakiri file-download sbx_... --path /workspace/result.bin --json --to ./result.bin
```

Upload computes `sha256` and sends it to the API. Download validates the
returned checksum before writing bytes to stdout or disk.

## Routes

```bash
harakiri expose sbx_... --port 5173 --access token --label preview --wait --wait-path /
harakiri routes sbx_... --json
harakiri open sbx_... --port 5173 --token "$HARAKIRI_ROUTE_TOKEN"
harakiri unexpose sbx_... --port 5173
```

Processes behind routes must listen on `0.0.0.0` inside the sandbox. Token
routes print the route token only when created; later route lists show a token
hint.

## Outbound Access

```bash
harakiri create --template python-3.12-data --egress restricted --egress-preset python-package-install
harakiri egress sbx_...
harakiri egress allow sbx_... api.github.com
harakiri egress deny sbx_... example.com
harakiri egress block sbx_...
harakiri egress test sbx_... https://pypi.org/simple
```

The CLI exposes developer-facing modes and presets. It does not require callers
to write provider network-policy JSON.

## Templates

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template builds --query open-agents-dev
harakiri template logs bld_...
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri create --template open-agents-dev:stable --name stable-runner
```

Dockerfile builds upload a verified tar+gzip context, follow logs by default,
and create digest-pinned template versions.

## Git

```bash
harakiri create --template open-agents-dev --git https://github.com/acme/project.git --git-path /workspace/project
harakiri git status sbx_... --cwd /workspace/project
harakiri git user sbx_... --cwd /workspace/project --name "Harakiri" --email "agent@harakiri.local"
harakiri git commit sbx_... --cwd /workspace/project -m "agent update"
```

Private HTTPS tokens should come from environment variables. The CLI keeps
credentials out of stored command text and prints guidance for missing Git,
authentication failures, and restricted egress.

## Exit And Output

Most read/list/status commands support `--json` for automation. Human output is
compact and stable enough for reading, not for parsing. Scripts should prefer
`--json`.

Errors are printed with the stable API error code when available. See
[errors.md](errors.md) for retry and troubleshooting guidance.
