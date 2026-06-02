# Sandbox Runtime Contract

Harakiri exposes a provider-neutral sandbox contract for applications that need
isolated runtimes. OpenSandbox owns the runtime dataplane. Harakiri owns the
developer-facing control plane: organizations, API keys, templates, lifecycle
records, routing records, outbound access policy, usage, audit events, SDK,
CLI, and dashboard UX.

This document defines the public contract that external integrators should
target. It also records which capabilities are available today and which ones
are planned for the premium OSS integration surface.

## Provider Boundary

- Harakiri APIs and SDK methods are the stable integration point.
- Runtime lifecycle, command execution, filesystem access, logs, metrics,
  routing, and egress enforcement go through the configured runtime provider.
- Normal runtime behavior must not depend on direct Kubernetes pod exec or pod
  filesystem scraping.
- Provider-specific fallback behavior can exist inside a provider
  implementation, but public responses should expose a clear capability state
  instead of leaking provider internals.
- If a runtime feature is unavailable, the API returns an explicit unsupported
  or unavailable error instead of pretending the feature worked.

## Capability Status

`GET /v1/runtime/capabilities` reports both runtime state and contract source.
State values:

- `available`: implemented and exposed through public API/SDK/CLI or dashboard.
- `partial`: implemented for a narrower subset than the target contract.
- `planned`: accepted for the v1 integration contract but not complete.
- `out of scope`: not part of the current Harakiri product contract.

The machine-readable API uses `available`, `degraded`, and `unavailable` for
runtime state. It also includes a `contract` field:

- `opensandbox_spec`: backed by formal OpenSandbox API/spec behavior.
- `opensandbox_provider`: feature-detected current OpenSandbox provider
  behavior that is useful but not treated as a formal spec guarantee.
- `harakiri_control_plane`: Harakiri-owned control-plane behavior layered on
  top of provider primitives.
- `unavailable`: included in Harakiri's contract, but unavailable in the active
  provider.
- `unsupported`: known but outside the active supported contract.

| Capability | Harakiri status | Contract target |
| --- | --- | --- |
| Create sandbox | available | Create from template, env, TTL, outbound access policy, wait/async options. |
| Get/list sandbox | available | Filterable dashboard/API/SDK listing with lifecycle state. |
| Kill sandbox | available | Terminate runtime and mark Harakiri records consistently. |
| Renew TTL | available | Extend active runtime lease from API/SDK/CLI. |
| Blocking command run | available | Command, stdin, cwd, env, timeout, stdout/stderr, exit code, duration. |
| Detached command/process | available | Command ID, status, logs, kill, and SDK/CLI helpers. |
| Persistent command sessions | available | Stateful non-interactive bash sessions with create, run, delete, cwd, timeout, stdout/stderr, exit code, and duration. |
| Interactive terminal/PTY | partial | CLI attach and API WebSocket bridge are available. Browser terminal reuse, richer SDK helpers, and reconnect UX remain planned. |
| Logs | partial | Runtime logs and command-scoped logs are exposed; streaming/tailing UX remains planned. |
| Metrics | available | Current and time-series metrics exposed through API/SDK/CLI/dashboard. |
| File list | available | List path metadata. |
| File read/write/stat/mkdir/remove/rename | available | First-class safe filesystem operations with typed errors. |
| Upload/download artifacts | available | Base64 JSON artifact APIs with checksum and decoded size limits. Streaming or signed URL transfer remains planned. |
| Expose HTTP port | available | Stable route record and public preview URL. |
| Delete route | available | Terminate a route by sandbox and port. |
| Route access policy | partial | Public previews and token-protected Harakiri proxy previews are available. Organization-authenticated previews remain planned. |
| Outbound access policy | available | Open, restricted, blocked, custom modes, presets, allow/deny, diagnostics. |
| Templates/images | available | OCI image backed templates, builds, versions, aliases, promotion. |
| Template init/build UX | partial | Existing CLI/API/dashboard; needs polished examples and docs. |
| Pause/resume sandbox | out of scope | Harakiri v1 uses TTL, renew, and kill semantics. |
| Snapshot running sandbox | planned decision | Not guaranteed until provider support and persistence model are explicit. |

## Public Primitives

### Sandbox Lifecycle

The lifecycle contract is TTL based:

- `createSandbox` provisions a sandbox from a template.
- `getSandbox` returns the current Harakiri lifecycle state.
- `listSandboxes` lists sandbox records within the organization.
- `renewSandbox` extends the active TTL.
- `killSandbox` terminates the runtime and closes active routes.

Pause/resume is not implied by any current UI label or API. If a sandbox needs
longer availability, the caller should renew it.

### Commands

The stable blocking helper is `runSandbox`, which executes a command with
optional stdin, cwd, per-run env, and timeout, then returns stdout, stderr,
exit code, and duration.

For long-running processes, Harakiri exposes persisted command resources:

- `startCommand` creates a command record and can start detached/background
  processes.
- `listCommands` returns recent commands for a sandbox.
- `getCommand` refreshes and returns command status, exit code, timestamps, and
  provider metadata.
- `getCommandLogs` returns command stdout/stderr, with a cursor when the
  provider supports cursor-based log reads.
- `killCommand` interrupts a running command and records the result.

For stateful non-interactive shell workflows, Harakiri exposes persistent
command sessions:

- `createCommandSession` creates a bash session and returns an opaque session
  ID scoped to the Harakiri sandbox and organization.
- `runCommandSession` runs a command in that session and preserves shell state
  such as working directory across runs.
- `deleteCommandSession` terminates the session.

Command sessions are useful for agents and scripts that need `cd`, exported
variables, or setup steps without opening a live terminal. Interactive PTY
attach remains the right choice for a human operator.

Shell selection is present in the public terminal attach options, but the
current OpenSandbox PTY provider launches Bash and returns
`runtime_terminal_unsupported` for non-default shell overrides. Per-attach
environment variables are also part of the public attach contract; with
OpenSandbox today, set env at sandbox/template creation time instead. Output
truncation metadata and richer wait helpers remain planned follow-ups.

### Filesystem

The stable filesystem helpers cover path metadata plus common file mutations:

- `listSandboxFiles`
- `statSandboxFile`
- `readSandboxFile`
- `writeSandboxFile`
- `mkdirSandboxFile`
- `removeSandboxFile`
- `renameSandboxFile`

Artifact upload/download is available for binary payloads that fit within the
configured JSON artifact limit. Streaming or signed URL transfer for larger
payloads remains a planned follow-up.

All path APIs must reject traversal attempts and return typed errors for missing
files, permission failures, unsupported operations, and provider availability.

### Routes

Routes expose a sandbox port through a Harakiri-managed public URL.

Current behavior:

- `exposePort` creates or returns a route for a sandbox port.
- `listRoutes` lists active and historical route records.
- `deleteRoute` terminates a route by port.
- `getHost` is a convenience helper that exposes a port and returns the URL.
- `accessMode: "public"` returns the direct OpenSandbox preview URL.
- `accessMode: "token"` returns a Harakiri proxy URL and a one-time visible
  route token. The token is accepted in the `x-harakiri-route-token` header or
  `harakiri_route_token` query parameter and is stored only as a hash.

Organization-authenticated preview URLs remain planned. Token mode is intended
for external app embedding, webhook callbacks, and quick protected previews
without introducing an application session requirement.

### Outbound Access

Outbound access controls what a sandbox can reach while it is running.

Current behavior:

- open: public internet allowed.
- restricted: allowlist based on presets and explicit domains.
- blocked: deny outbound internet by default.
- custom: explicit allow/deny policy.

The dashboard, CLI, SDK, and API should use this developer vocabulary rather
than exposing low-level network policy details.

### Templates

Templates are OCI image based runtime definitions. The public contract is:

- initialize a template locally
- build a version
- inspect build logs
- promote a version to an alias
- create sandboxes from template IDs or aliases
- document runtime defaults and startup behavior

Template build internals may vary, but the resulting template/version/alias
contract should stay stable for integrators.

## Integration Expectations

External applications should integrate through `@h-sandbox/sdk` or the OpenAPI
contract. They should not depend on:

- OpenSandbox IDs
- Kubernetes pod names
- provider-specific command transports
- provider-specific route implementation details
- private dashboard endpoints

Harakiri guarantees stable typed responses for available capabilities. Partial
and planned capabilities should be guarded by capability checks or treated as
best effort until their API surface is promoted to available.

## Immediate SDK Baseline

The minimal external integration baseline is:

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const { sandbox } = await harakiri.createSandbox({
  template: "python-3.12-data",
  ttlSeconds: 600,
  egress: { mode: "restricted", presets: ["python-package-install"] }
});
await harakiri.waitForSandbox(sandbox.id);

const run = await harakiri.runSandbox(sandbox.id, {
  command: "python -c 'print(2 + 2)'",
  cwd: "/workspace",
  env: { HARAKIRI_MODE: "smoke" },
  timeoutMs: 30_000
});

const { command } = await harakiri.commands.start(sandbox.id, {
  command: "python -m http.server 3000",
  cwd: "/workspace",
  detached: true
});
await harakiri.commands.wait(sandbox.id, command.id, { statuses: ["running"] });

const route = await harakiri.routes.expose(sandbox.id, { port: 3000 });
const logs = await harakiri.commands.logs(sandbox.id, command.id);
const { session } = await harakiri.commands.sessions.create(sandbox.id, {
  cwd: "/workspace"
});
await harakiri.commands.sessions.run(sandbox.id, session.id, {
  command: "cd /tmp && pwd"
});
await harakiri.commands.sessions.run(sandbox.id, session.id, {
  command: "pwd"
});
const files = await harakiri.files.list(sandbox.id, "/");
await harakiri.allowDomains(sandbox.id, ["api.github.com"]);
await harakiri.files.write(sandbox.id, {
  path: "/workspace/notes.txt",
  content: "ready\n",
  createParents: true
});
const note = await harakiri.files.read(sandbox.id, "/workspace/notes.txt");
await harakiri.files.upload(sandbox.id, {
  path: "/workspace/input.bin",
  contentBase64: "aGVsbG8=",
  sizeBytes: 5
});
const artifact = await harakiri.files.download(sandbox.id, "/workspace/input.bin");
const metrics = await harakiri.getSandboxMetrics(sandbox.id);

await harakiri.renewSandbox(sandbox.id);
await harakiri.routes.delete(sandbox.id, 3000);
await harakiri.commands.sessions.delete(sandbox.id, session.id);
await harakiri.commands.kill(sandbox.id, command.id);
await harakiri.killSandbox(sandbox.id);
```

This baseline is intentionally small. Remaining richer surfaces such as
streaming artifact transfer, route access controls, and PTY streams will stay as
separate public resources so the SDK remains readable and modular.
