# Interactive Terminals

Harakiri exposes interactive sandbox terminals through the OpenSandbox runtime
plane. The CLI and dashboard should use Harakiri authentication and
authorization, then Harakiri bridges the connection to OpenSandbox `execd`.

Harakiri must not use Kubernetes pod exec for normal sandbox terminal access.

## CLI

Create or choose a running sandbox, then attach when you need a live terminal:

```bash
harakiri attach sbx_example
```

Useful options:

```bash
harakiri attach sbx_example --cwd /workspace
harakiri attach sbx_example --no-raw
harakiri attach sbx_example --cols 120 --rows 36
harakiri attach sbx_example --session-name incident-debug
```

The CLI puts the local terminal into raw mode when stdin is a TTY, forwards
stdin to the sandbox PTY, writes sandbox stdout/stderr frames to the local
terminal, and restores the local terminal when the connection closes.

The public attach contract includes `--shell` and repeated `--env KEY=value`
flags so clients do not need a breaking change when providers support those
fields. The current OpenSandbox PTY implementation launches Bash and only
accepts a `cwd` on `POST /pty`; Harakiri returns
`runtime_terminal_unsupported` for non-default shell or per-attach env requests
instead of silently ignoring them. Set environment variables when creating the
sandbox or template for now.

Use persistent command sessions when you need stateful shell behavior from
scripts, CI, or agents without taking over the local terminal:

```bash
SESSION_ID=$(harakiri command session create sbx_example --cwd /workspace | head -n1)
harakiri command session run sbx_example "$SESSION_ID" --cmd "cd /tmp && pwd"
harakiri command session run sbx_example "$SESSION_ID" --cmd "pwd"
harakiri command session delete sbx_example "$SESSION_ID"
```

Use the simpler command helpers when state is not needed:

```bash
harakiri run sbx_example --cmd "python --version"
harakiri command run sbx_example --cmd "python -m http.server 3000" --detached
harakiri command logs sbx_example cmd_...
```

## API

The attach endpoint is a WebSocket upgrade route:

```text
GET /v1/sandboxes/:id/terminal/attach
```

Query parameters:

| Parameter | Description |
| --- | --- |
| `cwd` | Working directory for the PTY session. Defaults to the template workdir. |
| `shell` | Requested shell path. Current OpenSandbox support is Bash-only; non-default values return `runtime_terminal_unsupported`. |
| `env` | Repeatable `KEY=value` attach environment entry. Current OpenSandbox PTY does not support per-attach env, so non-empty values return `runtime_terminal_unsupported`. |
| `sessionName` | Client-visible session label recorded in Harakiri metadata. |
| `cols` | Initial terminal columns. |
| `rows` | Initial terminal rows. |
| `since` | Optional OpenSandbox PTY output offset for replay. |
| `pty` | Set to `false` or `0` for OpenSandbox pipe mode. Defaults to PTY mode. |

The route accepts API-key or short-lived ticket authentication. API-key CLI and
Node clients should send `x-api-key`.

Node SDK clients can use `client.terminal.attachRequest(...)` to build a
WebSocket URL plus the `x-api-key` header expected by Harakiri. Browser clients
cannot set WebSocket authorization headers and should never place API keys in
JavaScript or query strings. The dashboard first calls:

```http
POST /v1/sandboxes/:id/terminal/attach-ticket
```

with normal Keycloak-backed bearer authentication, then opens the returned
`attachUrl`. Tickets are scoped to one sandbox, expire quickly, and are consumed
on first use.

Persistent command sessions use ordinary authenticated HTTP:

```http
POST /v1/sandboxes/:id/command-sessions
POST /v1/sandboxes/:id/command-sessions/:sessionId/run
DELETE /v1/sandboxes/:id/command-sessions/:sessionId
```

`POST /command-sessions` accepts an optional `cwd`. `run` accepts `command`,
optional `cwd`, and optional `timeoutMs`. The response shape is the same
`RunResult` used by one-shot command execution.

The session ID is scoped by the Harakiri sandbox and organization. Clients
should treat it as opaque.

## Capabilities

Check runtime support before showing attach UI:

```bash
harakiri capabilities
```

Relevant capabilities:

| Capability | Meaning |
| --- | --- |
| `terminalAttach` | Provider can create and bridge an interactive PTY session. |
| `terminalResize` | Provider accepts terminal resize frames. |
| `shellSessions` | Provider exposes PTY session create/status/delete lifecycle. |
| `sessionCommands` | Provider exposes persistent non-interactive command sessions. |

If attach is unavailable, Harakiri returns `runtime_terminal_unsupported` or
`runtime_terminal_unavailable` instead of falling back to Kubernetes exec or a
fake shell.

## Runtime Boundary

For OpenSandbox, Harakiri resolves `execd` on port `44772`, creates an
OpenSandbox PTY session with `POST /pty`, then bridges WebSocket frames to
`/pty/:sessionId/ws`. Harakiri records attach start, end, and failure events
with metadata such as user, sandbox, cwd, dimensions, and duration. It does not
record terminal input or output by default.

OpenSandbox currently creates PTY sessions with `{"cwd": "..."}` only, starts
`bash --norc --noprofile` when the WebSocket attaches, and handles terminal
resize through WebSocket JSON frames. Harakiri keeps shell/env in its public
attach contract but does not emulate those fields with terminal input hacks.

Persistent command sessions use OpenSandbox's formal `execd` contract:
`POST /session`, `POST /session/:sessionId/run`, and
`DELETE /session/:sessionId`. Harakiri owns authentication, authorization, TTL
renewal, session lifecycle events, and error mapping; OpenSandbox owns the
actual in-sandbox bash session.
