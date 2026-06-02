# OpenCode Template

This template packages OpenCode as a Harakiri/OpenSandbox runtime. It is a
normal OCI image with a writable `/workspace`, common coding tools, and a
route-ready OpenCode server port.

Runtime surface:

- `opencode` from the pinned `opencode-ai` npm package
- Node 22, `npm`, `pnpm`, and `yarn`
- Python 3, `git`, `jq`, `rg`, `fd`, `curl`, `ssh`, and common Linux tools
- writable `/workspace`
- default ports `4096`, `3000`, and `5173`

## Build

Build it through Harakiri from the repository root:

```bash
harakiri template build --name opencode examples/templates/opencode
```

The CLI reads `harakiri.toml` in this directory, so CPU, memory, workdir,
visibility, aliases, and default ports do not need to be repeated on the
command line. The build follows logs by default and prints the resulting
template version ID, image digest, duration, and next create command.

## Smoke

```bash
harakiri template smoke opencode --cmd "harakiri-opencode-smoke"
```

The smoke script does not require an LLM API key. It verifies the expected
tools, checks that `/workspace` is writable, starts `opencode serve` on
`127.0.0.1:4096`, and calls the OpenCode `/global/health` endpoint.

## Create A Sandbox

```bash
harakiri create --template opencode --name opencode-agent --ttl 1200
harakiri attach sbx_... --cwd /workspace
```

Use `opencode` for the TUI inside an attached terminal, or use `opencode run`
for non-interactive prompts:

```bash
harakiri create \
  --template opencode \
  --name opencode-runner \
  --ttl 1200

harakiri run sbx_... --cwd /workspace --cmd \
  'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"'
```

The example uses an OpenCode Zen free model. For paid or bring-your-own-key
models, pass provider credentials as sandbox environment variables or configure
them inside the sandbox with OpenCode's own auth/config commands.

## Expose The OpenCode Server

OpenCode's server defaults to `127.0.0.1`, so bind to `0.0.0.0` when exposing it
through Harakiri routes. Set a server password before starting it, then prefer a
token-protected Harakiri route:

```bash
harakiri create \
  --template opencode \
  --name opencode-server \
  --ttl 1200 \
  --env OPENCODE_SERVER_PASSWORD="$(openssl rand -hex 16)"

harakiri run sbx_... --cwd /workspace --cmd \
  'nohup opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode.log 2>&1 &'

harakiri expose sbx_... --port 4096 --access token --label opencode
harakiri routes sbx_...
```

The OpenCode username defaults to `opencode`. The Harakiri CLI prints the route
URL and the token header required for token-protected routes.

## Troubleshooting

- If a route opens but OpenCode is unreachable, confirm the server was started
  with `--hostname 0.0.0.0`.
- If `opencode run` fails with provider errors, verify that the selected model
  is available and that any required API keys are present inside the sandbox
  environment.
- If the template is not runnable, run `harakiri template builds --query
  opencode` and inspect the latest build logs.
- If the smoke command fails, run `harakiri run sbx_... --cmd
  "harakiri-opencode-smoke"` on a kept sandbox and inspect
  `/tmp/harakiri-opencode-smoke.log`.
