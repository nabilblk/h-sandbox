# Harakiri CLI

Command-line client for Harakiri Sandbox.

Read the public [command reference](https://sb.harakiri.io/#docs/cli-reference)
and [error guidance](https://sb.harakiri.io/#docs/errors-troubleshooting).

## Install

The published package installs a normal `harakiri` executable:

```bash
npm install -g @h-sandbox/cli@0.5.0-rc.5
harakiri --version
```

This pins the recorded Developer Preview; confirm the matching server with your
operator. The older stable `latest` channel is `0.4.0`. Source changes after the
rc.5 receipt are unreleased until a new candidate is published.

## Build From Source

Build and install the CLI as a normal executable instead of invoking
`node packages/cli/dist/index.js` directly:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm cli:pack
VERSION="$(node -p 'JSON.parse(require("fs").readFileSync("packages/cli/package.json", "utf8")).version')"
npm install -g "./dist-packages/h-sandbox-cli-${VERSION}.tgz"
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
harakiri vault presets
harakiri vault attach sbx_... --preset openai --from-env OPENAI_API_KEY
harakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models
harakiri vault rehydrate sbx_...
harakiri template init --name open-agents-dev --dockerfile Dockerfile --credential-slot openai
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri registry upsert --name ghcr --registry-host ghcr.io --username robot --secret "$TOKEN" --purpose push_pull
```

Dockerfile builds package the local context as tar+gzip, upload it to the API,
run the configured Kubernetes image builder, and store a digest-pinned ready
template version. `--credential-slot` and `--optional-credential-slot` declare
preset-backed Credential Vault requirements in `harakiri.toml`; no real
credential values are stored in template definitions or versions. The default
OSS builder is rootless BuildKit.

## Lifecycle

Harakiri supports create, reconnect/status, renew, kill, and provider-backed
pause/resume/snapshot operations when the runtime exposes them.

```bash
harakiri create --snapshot snp_... --name restored-runner
harakiri status sbx_...
harakiri status sbx_... --json
harakiri renew sbx_...
harakiri pause sbx_...
harakiri resume sbx_...
harakiri snapshot sbx_... --name before-upgrade --wait
harakiri snapshots list
harakiri snapshots inspect snp_...
harakiri snapshots delete snp_...
harakiri capabilities
harakiri kill sbx_...
```

`status` prints TTL, expiration, provider sandbox ID, and lifecycle capability
states. `capabilities` reports `lifecyclePause`, `lifecycleResume`,
`lifecycleSnapshot`, `snapshotList`, `snapshotDelete`, and `createFromSnapshot`
so integrations can hide unavailable actions.

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

## Credential Vault

Create a sandbox with one-time credentials already attached, without putting
the real value in sandbox env, command history, or command records:

```bash
export OPENAI_API_KEY=placeholder

harakiri vault presets
harakiri vault preset openai

harakiri create \
  --template open-agents-dev \
  --name agent-with-vault \
  --credential 'preset=openai,from-env=OPENAI_API_KEY'

harakiri create \
  --template open-agents-dev \
  --name stored-vault-agent \
  --credential 'secret-id=vlt_...,name=openai-prod'

harakiri create \
  --template open-agents-dev \
  --name slotted-vault-agent \
  --credential 'slot=llm,secret-id=vlt_...,name=openai-prod'
```

`--credential` can be repeated. The value is a comma-separated `key=value`
spec. Use `preset` for built-in inline credentials, `host` for custom/private
inline credentials, `secret-id` for an encrypted workspace secret,
`reference-id` for an external locator, `issuer-id` for a dynamic source, or
`slot` / `slot-preset` to satisfy a template credential slot. Supported keys are
`preset`, `secret-id`, `reference-id`, `issuer-id`, `slot`, `slot-id`, `slot-preset`, `provider-preset`,
`name`, `credential-name`, `binding-name`, `host`, `scheme`, `method`, `path`,
`auth`, `header`, `from-env`, `from-stdin`, `prompt`, and `fake-env`. Stored
direct specs use the secret's provider preset, fake env, binding, and value.
Slot specs use the template slot's binding and fake env defaults; they can use
`secret-id` or an inline value source, but cannot set `host`, `scheme`,
`method`, `path`, `auth`, or `header`. Use `from-stdin=true` when a create-time
inline value comes from stdin, or `prompt=true` for a local hidden prompt.
Templates with required credential slots must be launched with matching
`slot` or `slot-preset` specs; direct low-level credentials do not satisfy
template slot requirements.
After resume, `harakiri vault list` can show `requires_reinjection` for
ephemeral attachments or unavailable stored sources. Encrypted workspace secret
attachments are rehydrated automatically when the source is active and
decryptable; use `harakiri vault rehydrate sbx_...` to retry manually after
fixing a disabled, deleted, or unavailable source.
Create-time credentials require synchronous sandbox creation; do not combine
them with `--no-wait` or `--wait-timeout-ms`.

Attach credentials to an already-running sandbox:

```bash
harakiri vault attach sbx_... \
  --preset openai \
  --from-env OPENAI_API_KEY

harakiri vault attach sbx_... \
  --preset openai \
  --prompt

harakiri vault list sbx_...
harakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models
harakiri vault rehydrate sbx_...
harakiri vault detach sbx_... sca_...

harakiri vault secrets create \
  --name openai-prod \
  --preset openai \
  --from-env OPENAI_API_KEY \
  --member-use

harakiri vault secrets share vlt_...
harakiri vault secrets restrict vlt_...

harakiri vault attach-secret sbx_... vlt_... \
  --name openai-prod

harakiri vault secrets list
harakiri vault secrets get vlt_...
harakiri vault secrets rotate vlt_... --prompt
harakiri vault secrets disable vlt_...
harakiri vault secrets enable vlt_...
harakiri vault secrets delete vlt_...

harakiri vault references create \
  --name "OpenAI from cluster" \
  --preset openai \
  --namespace harakiri \
  --secret-name harakiri-vault-agents \
  --key OPENAI_API_KEY \
  --member-use
harakiri vault references validate xsr_...
harakiri vault references list --json
harakiri vault attach-reference sbx_... xsr_...

harakiri vault issuers create \
  --name agent-repositories \
  --installation-id 123456 \
  --repository agent-runtime \
  --permission contents=read \
  --permission metadata=read
harakiri vault issuers validate dci_...
harakiri vault attach-issuer sbx_... dci_...

harakiri vault inspect sbx_...
harakiri vault refresh sbx_... sca_...
harakiri vault audit --action-prefix credential_ --json
```

Use `--from-stdin` for password-manager or CI secret handoff:

```bash
printf '%s' "$PRIVATE_API_TOKEN" |
  harakiri vault attach sbx_... \
    --name private-api \
    --host api.internal.example \
    --auth api-key \
    --header x-api-key \
    --from-stdin
```

`harakiri credentials` is an alias for `harakiri vault`. JSON mode is available
on all Vault read/write commands for automation.
`--prompt` requires an interactive TTY and fails loudly in CI; use `--from-env`
or `--from-stdin` for non-interactive automation.

`harakiri vault secrets` manages encrypted workspace credential custody for
organization admins. Secrets default to admin-only use. `--member-use` creates
a shared secret, while `share` and `restrict` update who may attach it. Members
never gain read or management access. Values are write-only: create and rotate accept a real
value from `--from-env`, `--from-stdin`, or `--prompt`, but list, get, and JSON
output return sanitized metadata and attachment-derived usage only. Use `harakiri vault attach-secret` to
attach an active stored secret to a running sandbox, or
`--credential 'secret-id=vlt_...'` during synchronous sandbox creation.
Encrypted workspace secret attachments are rehydrated automatically after
resume when the source is active and decryptable. Use
`harakiri vault rehydrate sbx_...` to retry manually.

`harakiri vault references` manages Kubernetes Secret locators for organization
admins and never accepts or prints a resolved value. Use
`--credential 'reference-id=xsr_...'` during synchronous creation, optionally
with `slot=...` or `slot-preset=...` for a template mapping. The cluster
operator must enable and scope the resolver first.

`harakiri vault issuers` manages GitHub App installation scope and never prints
the platform private key or issued token. Use
`--credential 'issuer-id=dci_...'` during synchronous creation or
`attach-issuer` at runtime. `refresh` renews one dynamic attachment, while
`inspect` compares desired state with sanitized provider state.

`harakiri vault audit` is admin-only and supports target/action pagination.
The complete source, lifecycle, and operator contract is in
[`docs/credential-vault.md`](../../docs/credential-vault.md).

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
