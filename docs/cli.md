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

Provider-backed lifecycle commands are available when the runtime exposes them:

```bash
harakiri pause sbx_...
harakiri resume sbx_...
harakiri snapshot sbx_... --name before-upgrade --wait
harakiri snapshots list
harakiri snapshots inspect snp_...
harakiri create --snapshot snp_... --name restored-runner
harakiri snapshots delete snp_...
```

Use `harakiri capabilities` to inspect unsupported or degraded capabilities
before showing advanced actions in tools.

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
ephemeral or unavailable sources. Run `harakiri vault rehydrate sbx_...` to
retry encrypted workspace secret rehydration after fixing the source.
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
harakiri vault rehydrate sbx_...
harakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models
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
harakiri vault issuers share dci_...
harakiri vault attach-issuer sbx_... dci_...

harakiri vault inspect sbx_...
harakiri vault refresh sbx_... sca_...
harakiri vault audit --action-prefix credential_ --json
```

Use `--from-stdin` when the value comes from a password manager or CI command:

```bash
pass show providers/openai |
  harakiri vault attach sbx_... \
    --preset openai \
    --from-stdin
```

For private APIs, keep the binding explicit:

```bash
harakiri vault attach sbx_... \
  --name private-api \
  --host api.internal.example \
  --auth api-key \
  --header x-api-key \
  --from-env PRIVATE_API_KEY
```

`harakiri credentials` is an alias for `harakiri vault`. JSON mode is available
on all Vault read/write commands for CI scripts.
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
admins. These commands never accept or print a resolved value. `--member-use`,
`share`, and `restrict` control who may attach a reference. For synchronous
sandbox creation, use `--credential 'reference-id=xsr_...'`; add `slot=llm` or
`slot-preset=openai` when satisfying a template credential slot. The cluster
operator must enable and scope the resolver first.

`harakiri vault issuers` manages GitHub App installation scope and never prints
the platform private key or issued token. The operator configures the App;
admins configure installation ID, repository names, and bounded permissions.
Use `--credential 'issuer-id=dci_...'` during synchronous creation or
`attach-issuer` at runtime. `refresh` renews one dynamic attachment, while
`inspect` compares desired state with sanitized provider state.

`harakiri vault audit` is admin-only. It supports `--target-type`,
`--target-id`, `--action-prefix`, `--limit`, `--offset`, and `--json` without
printing value-bearing metadata.

See the [Credential Vault cookbook](credential-vault-cookbook.md) for model,
private API, GitHub, package, registry, and OpenCode examples.

## Templates

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template init --name open-agents-dev --dockerfile Dockerfile --credential-slot openai --optional-credential-slot github
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template builds --query open-agents-dev
harakiri template logs bld_...
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri create --template open-agents-dev:stable --name stable-runner
```

Dockerfile builds upload a verified tar+gzip context, follow logs by default,
and create digest-pinned template versions. `--credential-slot` and
`--optional-credential-slot` write preset-backed Credential Vault requirements
to `harakiri.toml`; builds snapshot those slot requirements into template
versions without storing real credential values.

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
