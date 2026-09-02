# Harakiri SDK

`@h-sandbox/sdk` is the public integration surface for applications that want to
use Harakiri as an OSS sandbox provider. The SDK speaks to the Harakiri control
plane only; callers should not depend on OpenSandbox or Kubernetes internals.

The full integration guide is in [docs/sdk.md](../../docs/sdk.md), with
capabilities in
[docs/integrations/capabilities-and-limits.md](../../docs/integrations/capabilities-and-limits.md)
and error handling in [docs/errors.md](../../docs/errors.md).

## Install

```bash
pnpm add @h-sandbox/sdk
# or
npm install @h-sandbox/sdk
```

Configure the client with an API URL and an API key issued by Harakiri:

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey: process.env.HARAKIRI_API_KEY!
});
```

The SDK is self-contained. Public applications should import only from
`@h-sandbox/sdk`; internal monorepo packages such as `@harakiri/shared` are not
part of the npm installation contract.

## Sandbox Object

New integrations should prefer the high-level `HarakiriSandbox` object when a
workflow owns one sandbox at a time. It wraps the sandbox ID, keeps the latest
`SandboxSummary`, and binds commands, files, routes, egress, logs, metrics, and
lifecycle methods to that sandbox.

```ts
import { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const sandbox = await harakiri.sandboxes.create({
  template: "python-3.12-data",
  wait: false,
  ttlSeconds: 600,
  idempotencyKey: "job-123"
});

await sandbox.wait();
await sandbox.files.write({
  path: "/workspace/task.py",
  content: "print(2 + 2)\n",
  createParents: true
});

const run = await sandbox.run({
  command: "python /workspace/task.py",
  timeoutMs: 30_000
});

console.log(run.result.stdout);
await sandbox.kill();
```

Use `HarakiriSandbox.connect(harakiri, sandboxId)` or
`harakiri.sandboxes.connect(sandboxId)` when a worker restarts and needs to
reattach to a known sandbox. `refresh()` and `wait()` update the cached summary;
methods such as `run`, `files.*`, and `routes.*` delegate directly to the public
Harakiri API and preserve the same typed errors as `HarakiriClient`.

Lifecycle is explicit: `renew()` extends TTL, `reconnect()` refreshes the
control-plane summary, and `kill()` terminates the runtime. When the configured
runtime provider exposes the native lifecycle API, `pause()`, `resume()`, and
`snapshot()` call Harakiri API endpoints and keep Harakiri IDs stable while
provider IDs remain internal. Read `getRuntimeCapabilities()` before showing
optional lifecycle actions.

```ts
await sandbox.pause();
await sandbox.resume();

const { snapshot } = await sandbox.snapshot({
  name: "before-upgrade",
  wait: true
});

const restored = await harakiri.sandboxes.create({
  snapshotId: snapshot.id,
  name: "restored-runner",
  wait: true
});
```

## Core Workflow

```ts
const { sandbox } = await harakiri.createSandbox({
  template: "python-3.12-data",
  ttlSeconds: 600,
  idempotencyKey: "job-123",
  env: { HARAKIRI_ENV_SMOKE: "env-ok" },
  egress: { mode: "restricted", presets: ["python-package-install"] }
});

await harakiri.waitForSandbox(sandbox.id);

const setup = await harakiri.runSandbox(sandbox.id, {
  command: "python -c 'print(2 + 2)'",
  cwd: "/workspace",
  env: { HARAKIRI_MODE: "smoke" },
  timeoutMs: 30_000
});

if (setup.result.exitCode !== 0) {
  throw new Error(setup.result.stderr || "setup failed");
}

const { command } = await harakiri.commands.start(sandbox.id, {
  command: "python -m http.server 3000 --bind 0.0.0.0",
  cwd: "/workspace",
  detached: true
});

await harakiri.commands.wait(sandbox.id, command.id, {
  statuses: ["running"]
});

const route = await harakiri.routes.expose(sandbox.id, {
  port: 3000,
  accessMode: "token",
  labels: ["preview"]
});

const previewHeaders = harakiri.routes.headers(route);

// Pass previewHeaders when your app fetches or embeds the protected route.

await harakiri.killSandbox(sandbox.id);
```

## Runtime Surface

| Need | SDK surface |
| --- | --- |
| One-sandbox workflow | `harakiri.sandboxes.create`, `harakiri.sandboxes.connect`, `HarakiriSandbox` |
| Create, wait, reconnect, renew, kill | `createSandbox`, `waitForSandbox`, `sandboxes.reconnect`, `renewSandbox`, `killSandbox`, `HarakiriSandbox.reconnect`, `HarakiriSandbox.renew`, `HarakiriSandbox.kill` |
| Blocking commands | `runSandbox` |
| Detached commands | `processes.start`, `processes.get`, `processes.wait`, `processes.logs`, `processes.tail`, `processes.kill`; compatible `commands.*` helpers remain available |
| Files | `files.list`, `files.stat`, `files.read`, `files.write`, `files.mkdir`, `files.remove`, `files.rename` |
| Artifacts | `artifacts.upload`, `artifacts.download`; `files.upload` and `files.download` remain compatible aliases |
| Routes | `routes.expose`, `routes.exposeAndWait`, `routes.list`, `routes.delete`, `routes.getHost`, `routes.getUrl`, `routes.headers`, `routes.fetch`, `routes.waitForHttp` |
| Egress | `getOutboundAccess`, `setOutboundAccess`, `allowDomains`, `denyDomains`, `blockOutboundAccess`, `testOutboundAccess` |
| Git | `git.clone`, `git.status`, `git.branches`, `git.checkout`, `git.createBranch`, `git.deleteBranch`, `git.add`, `git.commit`, `git.pull`, `git.push`, `git.remotes`, `git.configureUser` |
| Observability | `getSandboxLogs`, `getSandboxMetrics` |
| Runtime capability checks | `getRuntimeCapabilities` |
| Templates | `createTemplate`, `createTemplateBuild`, `uploadTemplateBuildContext`, `promoteTemplateVersion` |

Flat compatibility methods remain available, but new integrations should prefer
the namespaced helpers. Use `processes.*` for detached servers/watchers,
`commands.*` for low-level tracked commands, and `files.*` or `routes.*` for
their respective runtime surfaces.

## Detached Processes

Use `processes.*` when the command is a server, watcher, or background agent.
The helper defaults `detached` to `true`, stores a Harakiri command ID, and can
reattach after the SDK process restarts.

```ts
const { command } = await sandbox.processes.start({
  command: "python -m http.server 3000 --bind 0.0.0.0",
  cwd: "/workspace"
});

await sandbox.processes.wait(command.id, { statuses: ["running"] });
const logs = await sandbox.processes.tail(command.id, 100);
await sandbox.processes.kill(command.id);
```

`wait` throws `HarakiriCommandEndedError` when a command reaches `failed` or
`killed` before the requested success status. Use `HarakiriWaitTimeoutError`
for polling timeouts and `HarakiriProviderUnavailableError` for runtime
transport failures.
Adapters generated from or organized around the OpenAPI operation IDs can use
matching aliases such as `runSandboxCommand`, `createSandboxCommand`,
`getSandboxEgress`, and `updateSandboxEgress`.
Command logs accept `{ cursor, tail }`. Use `tail` to bound stdout/stderr lines
in UI and agent loops; responses include truncation flags when earlier output
was omitted.
Routes accept optional labels and return creator metadata plus `lastUsedAt` for
token-protected proxy access.
`getRuntimeCapabilities()` returns provider capability states plus contract
metadata. Use `state` to decide whether a feature is usable, and use
`contract` to understand whether it is backed by a formal OpenSandbox API, a
feature-detected OpenSandbox provider behavior, or a Harakiri control-plane
overlay.

## Git Sources And Repositories

Use `source: { type: "git" }` when a sandbox should start from a repository.
The SDK creates the sandbox through the normal API, waits for it to become
ready, then clones through Harakiri's tracked command API. The `source` object
is sent to `/v1/sandboxes` only as sanitized provenance. Repository credentials
are never sent to the control plane, and the SDK updates the sandbox source
status as `cloning`, `ready`, or `failed`.

```ts
const sandbox = await harakiri.sandboxes.create({
  template: "open-agents-dev",
  ttlSeconds: 1200,
  egress: { mode: "restricted", presets: ["llm-apis"] },
  source: {
    type: "git",
    url: "https://github.com/acme/project.git",
    branch: "main",
    targetPath: "/workspace/project",
    shallow: true
  }
});

const status = await sandbox.git.status({ cwd: "/workspace/project" });
console.log(status.branch, status.clean);
```

Private HTTPS repositories can use a token for a single operation. Pass secrets
through environment variables in your application and into the SDK; Harakiri
puts only environment variable names in tracked command records, not token
values. By default the clone resets `origin` to the credential-free repository
URL after cloning.

```ts
await sandbox.git.clone("https://github.com/acme/private.git", {
  targetPath: "/workspace/private",
  credentials: {
    type: "token",
    token: process.env.GITHUB_TOKEN!,
    username: "x-access-token"
  }
});
```

`credentialPersistence: "dangerously-store-in-remote"` is available only for
workflows that deliberately want credentials persisted in `.git/config`.

`sandbox.summary.source` exposes the sanitized repository URL, ref, target
path, status, clone duration, and redacted failure reason. Use it for UI state,
auditing, and reconnect flows; keep credential handling inside the application
process that starts the clone.

Git helpers send constrained operation metadata with the command request.
Mutating operations such as clone, commit, pull, push, remote changes, and
config updates create `sandbox.git.*` audit entries with sanitized repository
context. Read-only helpers still create structured sandbox events.

Git troubleshooting:

| Symptom | What to check |
| --- | --- |
| `git binary not found in sandbox image` | The SDK throws `HarakiriGitUnsupportedRuntimeError` with `code: "git_runtime_unsupported"`. Use a template that includes Git, such as `open-agents-dev`, `opencode`, or a custom image that installs `git`. |
| Private clone fails with `Authentication failed` | Confirm the token is present in the process environment and has repository read scope. Prefer one-shot credentials over credentialed URLs. |
| Clone or pull cannot reach GitHub | The SDK throws `HarakiriGitNetworkAccessError` with `code: "git_network_access_failed"` for DNS, TCP, proxy, and likely egress failures. If egress is restricted, include the `git-hosting` preset or allow the required Git hostnames. |
| Branch checkout fails | Check `branch`, `commit`, and `targetPath`; tags and branches are passed directly to Git. |
| Commit fails with missing identity | Run `sandbox.git.configureUser({ name, email }, { cwd })` before committing. |
| Push is rejected | Pull/rebase first, verify the token has write scope, and use explicit one-shot credentials for the push operation. |

## Files And Artifacts

Use text-oriented file helpers for source files and configuration:

```ts
await harakiri.files.write(sandbox.id, {
  path: "/workspace/notes.txt",
  content: "ready\n",
  createParents: true
});

const note = await harakiri.files.read(sandbox.id, "/workspace/notes.txt");
```

Use artifact helpers for binary data or generated outputs that should preserve
size and checksum metadata. `files.upload` and `files.download` remain
compatible aliases, but `artifacts.*` is clearer in application integrations:

```ts
await harakiri.artifacts.upload(sandbox.id, {
  path: "/workspace/input.bin",
  contentBase64: "aGVsbG8=",
  sizeBytes: 5,
  createParents: true
});

const artifact = await harakiri.artifacts.download(sandbox.id, "/workspace/input.bin");
console.log(artifact.sha256, artifact.transfer.maxBytes);
```

Artifact transfer is currently JSON/base64 and bounded by the API-configured
artifact size limit. Responses include `transfer.mode`, `transfer.encoding`,
and `transfer.maxBytes`. Use it for small and medium artifacts; large streaming
or signed URL transfer is a planned scale-up path.

## Routes And Agent Servers

Route helpers remove repetitive token-header and readiness-polling code from
agent integrations:

```ts
const route = await harakiri.routes.exposeAndWait(sandbox.id, {
  port: 4096,
  accessMode: "token",
  labels: ["agent-server"]
}, {
  path: "/health",
  timeoutMs: 30_000
});

const headers = harakiri.routes.headers(route);
const routeFetch = harakiri.routes.fetch(route);
await routeFetch("/health");
```

`routes.headers` returns the one-time route token header when the route was just
created. `routes.fetch` injects that token on every request. Both helpers
accept `basicAuth` when the service behind the route also has its own password.

## OpenCode Agent Workflow

The `opencode` template gives applications a coding-agent runtime without
depending on OpenSandbox or Kubernetes internals.

```ts
const { sandbox } = await harakiri.createSandbox({
  template: "opencode",
  wait: true,
  ttlSeconds: 1200,
  egress: { mode: "restricted", presets: ["git-hosting", "llm-apis"] }
});

try {
  await harakiri.runSandbox(sandbox.id, {
    command: "git clone --depth 1 https://github.com/acme/app /workspace/project",
    timeoutMs: 120_000
  });

  const run = await harakiri.runSandbox(sandbox.id, {
    command: 'opencode run --model opencode/deepseek-v4-flash-free "review the project and propose a patch"',
    cwd: "/workspace/project",
    timeoutMs: 300_000
  });

  if (run.result.exitCode !== 0) throw new Error(run.result.stderr || "opencode failed");
  console.log(run.result.stdout);
} finally {
  await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
```

To connect OpenCode's HTTP server through a Harakiri route, start it on
`0.0.0.0`, expose port `4096`, and give OpenCode's generated client a
route-aware fetch implementation:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";

const password = crypto.randomUUID();
const { sandbox } = await harakiri.createSandbox({
  template: "opencode",
  wait: true,
  env: {
    OPENCODE_SERVER_PASSWORD: password
  }
});

const { command } = await harakiri.commands.start(sandbox.id, {
  command: "opencode serve --hostname 0.0.0.0 --port 4096",
  cwd: "/workspace",
  detached: true
});
await harakiri.commands.wait(sandbox.id, command.id, { statuses: ["running"] });

const route = await harakiri.routes.exposeAndWait(sandbox.id, {
  port: 4096,
  accessMode: "token",
  labels: ["opencode"]
}, {
  path: "/global/health",
  basicAuth: { username: "opencode", password },
  expect: async (response) => response.ok && (await response.clone().json()).healthy === true
});

const opencode = createOpencodeClient({
  baseUrl: route.route.url,
  fetch: harakiri.routes.fetch(route, {
    basicAuth: { username: "opencode", password }
  })
});

await opencode.config.get();
```

See `examples/sdk-opencode-headless` and `examples/sdk-opencode-server` for
checked TypeScript examples.

## Errors

API failures throw `HarakiriApiError` subclasses. Use the class, `error.code`,
and `error.retryable` instead of parsing text messages:

```ts
import {
  HarakiriNotFoundError,
  HarakiriProviderUnavailableError,
  HarakiriRateLimitError
} from "@h-sandbox/sdk";

try {
  await harakiri.files.read(sandboxId, "/workspace/result.json");
} catch (error) {
  if (error instanceof HarakiriNotFoundError) return null;
  if (error instanceof HarakiriRateLimitError && error.retryable) {
    // Retry with backoff.
  }
  if (error instanceof HarakiriProviderUnavailableError) {
    // Surface a degraded runtime-provider state to the caller.
  }
  throw error;
}
```

Common subclasses include:

- `HarakiriAuthenticationError`
- `HarakiriAuthorizationError`
- `HarakiriValidationError`
- `HarakiriNotFoundError`
- `HarakiriConflictError`
- `HarakiriRateLimitError`
- `HarakiriUnsupportedCapabilityError`
- `HarakiriProviderUnavailableError`
- `HarakiriTimeoutApiError`
- `HarakiriServerError`
- `HarakiriWaitTimeoutError`

Sandbox runtime error codes are stable machine-readable strings. For exhaustive
runtime-code handling, import `sandboxRuntimeApiErrorCodes` from
`@h-sandbox/sdk`. Common branches are:

| Branch | Codes |
| --- | --- |
| Missing runtime resources | `sandbox_not_found`, `sandbox_command_not_found`, `route_not_found`, `file_not_found` |
| State conflicts | `sandbox_not_running`, `sandbox_terminated` |
| Unsupported capabilities | `runtime_command_unsupported`, `runtime_file_operation_unsupported` |
| Provider unavailable | `sandbox_provision_failed`, `runtime_files_unavailable`, `egress_provider_unavailable`, `route_proxy_upstream_unreachable` |
| Command timeout | `sandbox_command_timeout` |
| Route and egress policy | `route_token_required`, `route_access_mode_conflict`, `egress_policy_invalid`, `egress_rule_limit_exceeded` |

## Integration Guidance

- Use `idempotencyKey` for retried sandbox creation.
- Always set a TTL and renew only while work is active.
- Prefer detached commands for long-running dev servers and background agents.
- Expose previews with `accessMode: "token"` unless the route is intentionally
  public.
- Apply restricted outbound access when the domain set is known.
- Persist important outputs outside the sandbox before killing it.
- Log Harakiri sandbox IDs, command IDs, and route URLs in your app.

More complete examples are available under `examples/`, and runtime contract
documentation is available in `docs/sdk.md`,
`docs/integrations/building-with-harakiri.md`, and
`docs/integrations/capabilities-and-limits.md`.
The `examples/sdk-sandbox-object` example is the recommended starting point for
adapter authors who want the high-level `HarakiriSandbox` object.
