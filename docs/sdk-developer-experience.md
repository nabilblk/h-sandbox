# TypeScript: Task-Oriented SDK

**Status: unreleased working-tree changes, 2026-09-13.** These additions are not
in the published `0.5.0-rc.10` package. This guide is for the next SDK candidate.
The existing API baseline is Harakiri `0.5.0-rc.9` or newer with capacity and
execution readiness enabled; workspaces additionally require operator support.
No new provider transport, Kubernetes access or backend migration is introduced.

## Start With One Sandbox Object

Harakiri is the control plane for sandbox execution. Your application owns
Harakiri resource IDs; provider IDs and infrastructure access stay behind the API.
Use a sandbox object for ordinary work, and retain explicit IDs for recovery.

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({ template: "python-3.12", wait: false });
try {
  await sandbox.wait({ timeoutMs: 180_000 });
  await sandbox.files.write("hello.py", "print(2 + 2)\n");
  const result = await sandbox.run("python hello.py", { check: true });
  console.log(result.stdout);
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}
```

The template must exist in your installation. Relative paths in the new file
helpers and command defaults use the runtime's advertised working directory,
not an assumed `/workspace`. Retained workspace files explicitly use `/workspace`.
Retaining the accepted handle before waiting keeps cleanup available if readiness
fails; cancelling observation never implies the runtime stopped.

`fromEnv()` requires `HARAKIRI_API_URL` and `HARAKIRI_API_KEY`. There is no implicit
maintainer URL. Pass `{ env, fetch }` for dependency injection; the explicit
constructor remains supported. Keep control-plane keys in server-side code.
Use scoped, expiring service credentials, never a user password in the SDK.
The control-plane key is a JavaScript private field, excluded from client and
sandbox object serialization and ordinary Node inspection. This is not a reason
to log raw handles: route tokens and workload data can still be sensitive.

## Choose the Execution Lifetime

| Intent | Method | Result |
| --- | --- | --- |
| Finite shell task | `sandbox.run(command, options)` | Output, exit code and duration directly |
| Durable/background work | `sandbox.processes.start({ command })` | Process handle; submission is not completion |
| Reconnect to known work | `sandbox.processes.connect(commandId)` | Read-only process handle |
| Observe success | `task.wait(options)` | Terminal command summary, or typed failure |
| Consume output | `task.events({ cursor, signal })` | Read-only async event iterator |
| Request termination | `task.kill()` | Updated command summary |

```ts
const task = await sandbox.processes.start({
  command: "python -u worker.py",
  timeoutMs: 120_000
});
const reference = task.reference; // { sandboxId, commandId }, no authentication data
// Persist reference in your application's job record before observing long work.

const reconnected = await client.sandboxes.connect(reference.sandboxId);
const observer = await reconnected.processes.connect(reference.commandId);
for await (const event of observer.events()) {
  if (event.type === "output") {
    process.stdout.write(event.stdout);
    process.stderr.write(event.stderr);
  }
}
const completed = await observer.wait({ timeoutMs: 130_000 });
```

`run()` interprets a shell command, not an executable/argv array. `check` defaults
to false; with `check:true`, nonzero exit raises `HarakiriRunError` with the result,
sandbox ID, exit code, stdout and stderr. It never replays a failed command.

Process waits default to success. Failed/killed commands raise
`HarakiriCommandEndedError`; explicit terminal-state targets remain supported.
Waiting for `running` after a command has already ended fails immediately rather
than timing out. A command summary is not a complete output archive: use events
or `logs()` and keep cursor/coverage information. Gaps and expired cursors remain
errors. Closing an event iterator disconnects the observer, not the command.

No SDK can recover an unacknowledged command POST exactly once without a server
deduplication contract. A lost submission response remains ambiguous. Do not
interpret `HarakiriApiError.retryable` as permission to submit work again.

## Move Text and Bytes

```ts
await sandbox.files.write("input.txt", "ordinary text");
await sandbox.files.write("input.bin", new Uint8Array([0, 128, 255]));
const text = await sandbox.files.readText("input.txt");
const bytes = await sandbox.files.readBytes("input.bin");
```

Binary helpers buffer the existing JSON/base64 transfer internally. They validate
the sandbox's advertised artifact limit and verify byte count and SHA-256. This
is not a streaming transfer API. Ordinary binary recipes need no Buffer/base64
conversion. Absolute paths remain available; `createParents` and `mode` remain
explicit options. Legacy `read`, `upload`, `download` and object-input `write`
preserve their wire responses and transfer metadata.

## Expose a Protected Service

Start the listener before creating its route. Execution readiness and application
HTTP readiness are different observations.

```ts
const server = await sandbox.processes.start({
  command: "node server.mjs",
  timeoutMs: 120_000
});
await server.wait({ statuses: ["running"] });
const route = await sandbox.routes.expose({ port: 3000, accessMode: "token" });
const health = await route.waitForHttp({ path: "/health", timeoutMs: 30_000 });
await health.body?.cancel();
const response = await route.fetch("/api/status");
console.log(await response.json());
```

The example assumes your server implements those endpoints. A protected URL
alone is not sufficient in a browser. `route.fetch()` supplies the route token,
not the control-plane API key. Never print raw route credentials in normal logs.
The existing exposure default remains public for compatibility: new code should
always specify its access mode. `getUrl` and `getHost` are legacy exposure
mutations, not read-only lookups; prefer `expose` followed by `route.url`.

`route.createFetch({ basicAuth })` produces an adapter for an HTTP-based agent SDK,
including OpenCode. It preserves standard Request bodies, methods, headers and
cancellation. Only the route's origin and path subtree are accepted. Encoded
traversal is rejected before credentials are attached.

Redirects are **manual**, including when a caller asks for native `follow`.
`redirect:"error"` remains supported. Inspect the Location and make an explicit
scoped request if appropriate. Do not bypass the scope check to follow redirects.
Health waits do not regard a redirect as success by default.

## Retain Files Across Runtime Replacement

```ts
const workspace = await client.workspaces.create({ name: "agent-checkpoints" });
const first = await client.sandboxes.create({ template: "python-3.12", workspaceId: workspace.id });
await first.files.write("/workspace/checkpoint.json", JSON.stringify({ step: 1 }));
await first.kill({ wait: true });
await workspace.wait({ timeoutMs: 90_000 });
const second = await client.sandboxes.create({ template: "python-3.12", workspaceId: workspace.id });
const checkpoint = JSON.parse(await second.files.readText("/workspace/checkpoint.json"));
```

This fragment shows replacement, not full cleanup; the runnable recipe below
cleans up both runtimes. Workspace availability has its own bounded wait.
`recovery_required` and `archived` are explicit outcomes, not reasons to silently
create new storage. Reconnect using `client.workspaces.connect(workspaceId)`.
Archival is separate from termination and does not physically reclaim storage.

## Understand Failure and Recovery

| Budget | Meaning |
| --- | --- |
| `run`/process `timeoutMs` | Remote execution budget |
| Wait `timeoutMs` | Total local observation budget, including requests and delays |
| Wait `intervalMs` | Polling interval within that budget |
| `ttlSeconds` | Sandbox lifetime, not extended by observation |

All polling waits accept a signal. Zero budget sends no requests. Invalid budgets
fail locally. Cancellation stops observation, not remote work. Request cancellation
on the finite-run overload likewise does not prove a command stopped.

`sandbox.creation` retains the creation acknowledgement, operation and attachment
outcomes. `sandbox.readiness` is the last observed execution health; lifecycle
refresh invalidates it rather than claiming a cached ready state is current.
If post-acknowledgement readiness or source setup fails,
`HarakiriSandboxCreationError` retains `sandboxId`, `operation`, `creation`, `stage`
and `cause`. Connect to that sandbox to inspect or clean it up. An error before
acknowledgement is not converted into a claim that a sandbox exists.

`kill()` still acknowledges deletion. `kill({ wait:true })` additionally confirms
this sandbox is terminated and its capacity reservation is released. It never
polls for organization-wide zero usage. A timeout is unconfirmed cleanup, not a
successful deletion. `sandbox.waitForTermination()` resumes read-only observation
without resubmitting DELETE. Retained workspace detachment is still separate.
After a provider outage, connectivity alone cannot resolve an uncertain deletion.
Capacity stays held until authoritative runtime absence is confirmed, for example
after provider-enforced expiry or operator recovery. Neither local elapsed time
nor a second DELETE is evidence that the runtime has stopped.

Creation with Git `source` remains client orchestration. A recorded ready source
is not cloned again; recorded cloning/failed sources require explicit recovery.
This is **not distributed exactly-once bootstrap**: two callers can still race
while the source is requested, and a crashed worker needs operator/application
recovery. A future authoritative API operation claim is required to remove that
limitation. Prefer separate creation plus `sandbox.git.clone()` for recoverable
jobs. Optional source cleanup is not performed for caller-supplied idempotency
keys, because they may resolve an existing sandbox. Cleanup acknowledgements and
failures are exposed separately in the creation error.

## Compatibility

| Existing call | Unchanged behavior | Preferred new call |
| --- | --- | --- |
| `sandbox.run({ command })` | `{ result }` response | `sandbox.run(command, { check })` |
| `sandbox.files.write({ path, content })` | `{ file }` response | `sandbox.files.write(path, textOrBytes)` |
| `client.commands.start/run(id, body)` | Command submission response | `sandbox.processes.start(body)` |
| `sandbox.processes.start(body)` | `.command` remains available | Handle adds `.id`, `.wait`, `.events`, `.reference` |
| `sandbox.routes.expose(body)` | `.route`, access fields remain | Handle adds `.url`, `.fetch`, `.waitForHttp` |
| `client.workspaces.create(body)` | `.workspace` remains available | Handle adds `.id`, `.wait`, `.archive` |
| `client.listSandboxes("?status=running")` | Raw query supported | `client.sandboxes.list({ status: "running" })` |

Domain handles preserve response properties, not plain-object prototypes. The
new client references use private fields and are not serialized with the handle.
Credential-bearing route responses still contain tokens: do not serialize them
into application logs. Use process `reference` for durable job records.

## Runnable Recipes and Verification

Use the working-tree package until a candidate containing these changes is
published. Build and pack it, then install the resulting `.tgz` in your consuming
project. Keep the API URL/key in your environment, not command history.

```bash
pnpm --filter @h-sandbox/sdk build
mkdir -p /tmp/harakiri-sdk-preview
pnpm --filter @h-sandbox/sdk pack --pack-destination /tmp/harakiri-sdk-preview
# In your consuming project, install the resulting .tgz path with npm install.
```

| Recipe | Runtime prerequisites |
| --- | --- |
| [Finite Python task](../examples/sdk-typescript-quickstart/index.ts) | Published Python template |
| [Binary result verification](../examples/sdk-files/index.mjs) | Python and file/artifact access |
| [Background task and observer replacement](../examples/sdk-sandbox-object/index.ts) | Tracked commands and event streaming |
| [Healthy protected Node service](../examples/sdk-dev-server/index.mjs) | Node template, route support; bounded 30-second hold |
| [Git and OpenCode](../examples/sdk-opencode-headless/index.ts) | OpenCode template; explicitly selected available model; provider access |
| [Retained workspace and event reconnect](../examples/sdk-persistent-workspace/index.mjs) | Operator-enabled persistent storage |

Standard tasks, commands, files and route management use `sandboxes:read` and
`sandboxes:write`. Add `workspaces:read` and `workspaces:write` for retained
storage, `templates:read` for template discovery, and `credentials:use` when
attaching credentials. There are no separate command/file/route API-key scopes.
Route application authentication is separate. Select egress presets/domains appropriate to the actual model service.
Free-model availability is external, not a deterministic CI dependency.

Contributors can run:

```bash
pnpm --filter @h-sandbox/sdk test
pnpm --filter @h-sandbox/sdk test:package
pnpm --filter @h-sandbox/sdk test:types
pnpm exec tsc -p examples/tsconfig.json
```

The package check builds a tarball, installs it in a temporary directory and
tests public declarations and synthetic API workflows. It includes real Fetch
against a loopback redirect server. It does not contact a sandbox cluster or
claim that a model executed successfully. Live installed-package recipes on a
disposable runtime remain a separate release acceptance gate.

On 2026-09-13, [native acceptance run 34731829328](https://github.com/nabilblk/h-sandbox/actions/runs/34731829328)
passed all 13 gates against pinned API `0.5.0-rc.9`, using an unpublished candidate
tarball and a disposable GitHub-hosted amd64 cluster. Node 20/22 consumer checks,
provider-outage/expiry recovery, scoped-key revocation and private-material cleanup
passed. This is model-free SDK evidence, not package publication or independent
integration feedback. The [execution checkpoint](exec-plans/active/typescript-sdk-developer-experience.md#native-acceptance-completed-2026-09-13)
records the exact tested source and tarball identities.
