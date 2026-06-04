# Harakiri SDK

The `@h-sandbox/sdk` package is the recommended integration surface for
external TypeScript and Node.js applications. It wraps the public HTTP API and
keeps callers away from OpenSandbox IDs, Kubernetes objects, route internals,
and provider-specific command transports.

## Configuration

Install the public SDK from npm:

```bash
pnpm add @h-sandbox/sdk
# or
npm install @h-sandbox/sdk
```

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey: process.env.HARAKIRI_API_KEY!
});
```

Use API keys for server-side integrations. Browser applications should use the
Harakiri web app and Keycloak login flow rather than embedding API keys.
The SDK is self-contained; external projects should import only from
`@h-sandbox/sdk`. `@harakiri/shared` is an internal monorepo package and is not
published as part of the public npm contract.

## Sandbox Object

`HarakiriSandbox` is the object-oriented integration surface for code that owns
one sandbox at a time. It wraps a Harakiri sandbox ID, caches the latest
`SandboxSummary`, and binds commands, files, routes, egress, logs, metrics, and
lifecycle operations to that sandbox.

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

await sandbox.wait({ timeoutMs: 90_000 });

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

const reconnected = await HarakiriSandbox.connect(harakiri, sandbox.id);
console.log(reconnected.summary.status);

await sandbox.kill();
```

`refresh()` and `wait()` update the cached summary. Runtime operations delegate
to the same public API methods as `HarakiriClient`, so error subclasses and API
contracts remain identical. Use `harakiri.sandboxes.wrap(summary)` when a list
or create response already returned a `SandboxSummary`.

## Runtime Capabilities

External apps can inspect the active runtime provider before enabling advanced
features:

```ts
const runtime = await harakiri.getRuntimeCapabilities();
const commands = runtime.capabilities.find((capability) => capability.name === "commands");

if (commands?.state !== "available") {
  throw new Error(`Tracked commands unavailable: ${commands?.reason ?? "unknown"}`);
}
```

Capabilities use `available`, `degraded`, and `unavailable` states so
integrations can disable unsupported workflows without parsing provider names.
Each capability also includes `contract` and `source`:

- `opensandbox_spec`: backed by a formal OpenSandbox API/spec.
- `opensandbox_provider`: available through the current OpenSandbox provider
  implementation, but treated as feature-detected behavior.
- `harakiri_control_plane`: implemented by Harakiri on top of provider
  primitives, such as token-protected route proxying.
- `unavailable`: part of Harakiri's surface, but not exposed by this provider.
- `unsupported`: known but outside the current supported contract.

## Core Flow

```ts
const { sandbox } = await harakiri.createSandbox({
  template: "python-3.12-data",
  ttlSeconds: 600,
  egress: { mode: "restricted", presets: ["python-package-install"] },
  env: { APP_ENV: "integration" }
});

await harakiri.waitForSandbox(sandbox.id);

const { result } = await harakiri.runSandbox(sandbox.id, {
  command: "python -c 'print(2 + 2)'",
  cwd: "/workspace",
  timeoutMs: 30_000
});

console.log(result.stdout);
```

`runSandbox` is blocking. It is best for setup commands, tests, short scripts,
and one-shot agent steps.

## Tracked Commands

Use command resources for long-running processes and any workflow that must
survive API client restarts.

```ts
const { command } = await harakiri.commands.start(sandbox.id, {
  command: "python -m http.server 3000",
  cwd: "/workspace",
  detached: true
});

await harakiri.commands.wait(sandbox.id, command.id, {
  statuses: ["running"],
  timeoutMs: 15_000
});

const logs = await harakiri.commands.logs(sandbox.id, command.id, {
  tail: 200
});
await harakiri.commands.kill(sandbox.id, command.id);
```

The flat method names remain available for compatibility:
`startCommand`, `listCommands`, `getCommand`, `getCommandLogs`,
`commandLogs`, `killCommand`, and `waitForCommand`.
OpenAPI-shaped aliases are also available when adapter code wants method names
that mirror operation IDs: `runSandboxCommand`, `createSandboxCommand`,
`getSandboxEgress`, and `updateSandboxEgress`.
Command logs support provider cursors and provider-neutral tailing. When
`tail` is set, the response includes `stdoutTruncated` and `stderrTruncated`
flags so adapters can tell users that earlier output was omitted.

## Git Sources

Use a Git source when a sandbox should start with a repository checkout. This is
implemented on top of Harakiri command resources, so it works through the same
control-plane API as normal commands and does not require Kubernetes access.

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
console.log(status.branch, status.files);
```

When the create request uses `egress.mode: "restricted"` or `custom`, the SDK
adds the `git-hosting` preset unless `source.applyEgressPreset` is set to
`false`. The API receives only sanitized source provenance: repository
credentials are stripped before the request is sent, and the SDK later patches
the sandbox source status to `cloning`, `ready`, or `failed`.

`sandbox.summary.source` exposes the sanitized repository URL, branch, commit,
target path, clone duration, and redacted failure reason. Use it for dashboards,
audit views, and reconnect flows; keep credential handling inside the process
that starts the clone.

For private HTTPS repositories, pass a one-shot token. The tracked command text
contains `$HARAKIRI_GIT_TOKEN` instead of the secret value, and the clone resets
`origin` to the credential-free URL after checkout.

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

Use `credentialPersistence: "dangerously-store-in-remote"` only when the
repository must keep credentials in `.git/config` for later Git operations.

Git troubleshooting:

| Symptom | What to check |
| --- | --- |
| `git binary not found in sandbox image` | The SDK throws `HarakiriGitUnsupportedRuntimeError` with `code: "git_runtime_unsupported"`. Use a template that includes Git, such as `open-agents-dev`, `opencode`, or a custom image that installs `git`. |
| Private clone fails with `Authentication failed` | Confirm the token is present in the process environment and has repository read scope. Prefer one-shot credentials over credentialed URLs. |
| Clone or pull cannot reach GitHub | If egress is restricted, include the `git-hosting` preset or allow the required Git hostnames. |
| Branch checkout fails | Check `branch`, `commit`, and `targetPath`; tags and branches are passed directly to Git. |
| Commit fails with missing identity | Run `sandbox.git.configureUser({ name, email }, { cwd })` before committing. |
| Push is rejected | Pull/rebase first, verify the token has write scope, and use explicit one-shot credentials for the push operation. |

## Files

Filesystem helpers support ordinary agent workflows:

```ts
await harakiri.files.write(sandbox.id, {
  path: "/workspace/task.txt",
  content: "Summarize this file\n",
  createParents: true
});

const file = await harakiri.files.read(sandbox.id, "/workspace/task.txt");
const listing = await harakiri.files.list(sandbox.id, "/workspace");
await harakiri.files.rename(sandbox.id, {
  fromPath: "/workspace/task.txt",
  toPath: "/workspace/input.txt"
});
```

Use artifact helpers when moving binary payloads through JSON:

```ts
await harakiri.files.upload(sandbox.id, {
  path: "/workspace/input.tar.gz",
  contentBase64: archive.toString("base64"),
  sizeBytes: archive.byteLength,
  sha256: "sha256:...",
  createParents: true
});

const artifact = await harakiri.files.download(sandbox.id, "/workspace/input.tar.gz");
```

Artifact upload/download is base64 encoded and limited by
`SANDBOX_FILE_ARTIFACT_MAX_BYTES`, which defaults to 16 MiB. The API validates
decoded size and optional `sha256` before writing.

## Preview Routes

Expose a sandbox port when a command starts a web server:

```ts
const route = await harakiri.routes.expose(sandbox.id, {
  port: 3000,
  protocol: "http",
  accessMode: "public",
  labels: ["preview", "web"]
});

console.log(route.route.url);
await harakiri.routes.delete(sandbox.id, 3000);
```

Use `accessMode: "token"` when a preview should not be directly public. Harakiri
returns a proxy URL plus a route token only on creation:

```ts
const preview = await harakiri.routes.expose(sandbox.id, {
  port: 5173,
  accessMode: "token",
  labels: ["preview"]
});

await fetch(preview.route.url, {
  headers: harakiri.routes.headers(preview)
});

const previewFetch = harakiri.routes.fetch(preview);
await previewFetch("/");
```

Store the token in your application if you need to reuse it. Later `listRoutes`
calls expose only `tokenHint`, not the token itself.
Route summaries also expose `labels`, `createdByUserId`, `createdByLabel`, and
`lastUsedAt`. `lastUsedAt` is updated for token routes served through the
Harakiri proxy; direct public provider routes may not pass through Harakiri.

The SDK includes route helpers that remove the repeated header and polling code
from agent integrations:

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
created. `routes.fetch` injects that token on every request. Both helpers accept
OpenCode-style basic auth options when the service behind the route has its own
credentials.

## OpenCode SDK Integration

The `opencode` template gives external applications a coding-agent runtime
without depending on OpenSandbox or Kubernetes internals. It can use OpenCode
Zen free models such as `opencode/deepseek-v4-flash-free`, or any configured
provider key you pass through the sandbox environment. The core flow is:

1. Create an `opencode` sandbox with restricted egress for Git and model APIs.
2. Use `runSandbox` for `opencode run` when you want a headless result.
3. Use commands plus routes when you want `opencode serve`.
4. Use `routes.fetch` to connect generated clients through Harakiri route-token
   auth.

Headless run:

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
    command: 'opencode run --model opencode/deepseek-v4-flash-free "review the project and summarize the risky files"',
    cwd: "/workspace/project",
    timeoutMs: 300_000
  });
  if (run.result.exitCode !== 0) throw new Error(run.result.stderr || "opencode failed");

  const diff = await harakiri.runSandbox(sandbox.id, {
    command: "git diff -- . ':!node_modules'",
    cwd: "/workspace/project"
  });
  console.log(diff.result.stdout);
} finally {
  await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
```

Server route with `@opencode-ai/sdk`:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";

const password = crypto.randomUUID();
const { sandbox } = await harakiri.createSandbox({
  template: "opencode",
  wait: true,
  ttlSeconds: 1200,
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

Common failures are easy to diagnose: paid or BYOK models fail if their
provider credentials are missing inside the sandbox, `127.0.0.1` server binds
make routes unreachable, missing `x-harakiri-route-token` headers return route
auth errors, and mismatched `OPENCODE_SERVER_PASSWORD` values return OpenCode
basic-auth errors. The checked examples live in `examples/sdk-opencode-headless`
and `examples/sdk-opencode-server`.

## Outbound Access

Harakiri exposes developer-friendly outbound access operations:

```ts
await harakiri.setOutboundAccess(sandbox.id, {
  mode: "restricted",
  presets: ["python-package-install"]
});

await harakiri.allowDomains(sandbox.id, ["api.github.com"]);
const probe = await harakiri.testOutboundAccess(sandbox.id, "https://api.github.com");
```

## Lifecycle

Harakiri v1 uses TTL, renew, and kill semantics:

```ts
await harakiri.renewSandbox(sandbox.id);
await harakiri.killSandbox(sandbox.id);
```

Pause, resume, and running-sandbox snapshots are not guaranteed v1 behavior.
Callers should renew active sandboxes and persist important state explicitly.

## Errors

API failures throw `HarakiriApiError` with:

- `status`: HTTP status code.
- `body`: raw response body.
- `details`: parsed structured error when available.
- `code`: shortcut to `details.error`.
- `category`: stable SDK category for coarse policy decisions.
- `retryable`: `true` when retry with backoff is usually reasonable.

Use `error.code` for product decisions and log `error.message` for operators.
Use subclasses when the application needs broad behavior:

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

Stable sandbox runtime codes are exported from `@h-sandbox/sdk` as
`sandboxRuntimeApiErrorCodes`. The most important integration branches are:

| Scenario | Codes | Typical handling |
| --- | --- | --- |
| Missing resource | `sandbox_not_found`, `sandbox_command_not_found`, `route_not_found`, `file_not_found` | Drop stale IDs, recreate the resource, or show a not-found state. |
| Sandbox state conflict | `sandbox_not_running`, `sandbox_terminated` | Refresh sandbox state; do not retry blindly against the same runtime. |
| Unsupported provider capability | `runtime_command_unsupported`, `runtime_file_operation_unsupported` | Hide or disable the feature; check `getRuntimeCapabilities()` before retrying. |
| Provider unavailable | `sandbox_provision_failed`, `runtime_files_unavailable`, `egress_provider_unavailable`, `route_proxy_upstream_unreachable` | Retry idempotent operations with backoff and show degraded runtime state. |
| Command timeout | `sandbox_command_timeout` | Increase timeout, split the command, or switch to detached command resources. |
| File policy or path failure | `file_permission_denied`, `invalid_file_path`, artifact validation codes | Correct the path, permissions, or artifact metadata before retrying. |
| Route or egress policy failure | `route_token_required`, `route_access_mode_conflict`, `egress_policy_invalid`, egress limit codes | Ask the user to adjust access mode or outbound policy. |

```ts
import { HarakiriApiError, HarakiriProviderUnavailableError } from "@h-sandbox/sdk";

try {
  await harakiri.files.read(sandbox.id, "/missing.txt");
} catch (error) {
  if (error instanceof HarakiriApiError && error.code === "file_not_found") {
    // create the file or choose another path
  }
  if (error instanceof HarakiriProviderUnavailableError && error.retryable) {
    // retry an idempotent operation with backoff
  }
}
```

## Timeouts And Retries

- Set command `timeoutMs` for blocking or foreground work.
- Use `waitForSandbox` after asynchronous sandbox creation.
- Use `commands.wait` for detached process state transitions.
- Prefer `HarakiriSandbox` for adapter code that works with one sandbox at a
  time, and keep `HarakiriClient` for bulk operations or OpenAPI-shaped calls.
- Retry idempotent reads and list operations at the application layer if the
  network fails.
- For sandbox creation, use `idempotencyKey` when the caller may retry the same
  request.
