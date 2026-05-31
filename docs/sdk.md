# Harakiri SDK

The `@harakiri/sdk` package is the recommended integration surface for
external TypeScript and Node.js applications. It wraps the public HTTP API and
keeps callers away from OpenSandbox IDs, Kubernetes objects, route internals,
and provider-specific command transports.

## Configuration

Install the public SDK from npm:

```bash
pnpm add @harakiri/sdk
# or
npm install @harakiri/sdk
```

```ts
import { HarakiriClient } from "@harakiri/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey: process.env.HARAKIRI_API_KEY!
});
```

Use API keys for server-side integrations. Browser applications should use the
Harakiri web app and Keycloak login flow rather than embedding API keys.
The SDK is self-contained; external projects should import only from
`@harakiri/sdk`. `@harakiri/shared` is an internal monorepo package and is not
published as part of the public npm contract.

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
  headers: { [preview.accessHeaderName!]: preview.accessToken! }
});
```

Store the token in your application if you need to reuse it. Later `listRoutes`
calls expose only `tokenHint`, not the token itself.
Route summaries also expose `labels`, `createdByUserId`, `createdByLabel`, and
`lastUsedAt`. `lastUsedAt` is updated for token routes served through the
Harakiri proxy; direct public provider routes may not pass through Harakiri.

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

Stable sandbox runtime codes are exported from `@harakiri/sdk` as
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
import { HarakiriApiError, HarakiriProviderUnavailableError } from "@harakiri/sdk";

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
- Retry idempotent reads and list operations at the application layer if the
  network fails.
- For sandbox creation, use `idempotencyKey` when the caller may retry the same
  request.
