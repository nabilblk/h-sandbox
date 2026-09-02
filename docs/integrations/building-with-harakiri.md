# Building With Harakiri

Harakiri is an OSS sandbox control plane for applications that need disposable,
isolated runtimes. Integrators should treat Harakiri as the provider contract
and avoid depending on OpenSandbox or Kubernetes internals directly.

## When Harakiri Fits

Harakiri is a good fit for:

- background agent runtimes
- code execution and test runners
- temporary development servers with preview URLs
- CI-like ephemeral tasks
- controlled package installation and outbound access
- template-driven runtime images

It is not a persistence layer. Use TTL, renew, and kill semantics, and persist
important outputs outside the sandbox.

## Integration Shape

Most applications need the same provider adapter shape:

```ts
type SandboxProvider = {
  create(input: { template: string; ttlSeconds?: number }): Promise<{ id: string }>;
  run(id: string, input: { command: string; cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  start(id: string, input: { command: string; cwd?: string }): Promise<{ commandId: string }>;
  logs(id: string, commandId: string): Promise<{ stdout: string; stderr: string }>;
  write(id: string, path: string, content: string): Promise<void>;
  read(id: string, path: string): Promise<string>;
  expose(id: string, port: number): Promise<string>;
  kill(id: string): Promise<void>;
};
```

With Harakiri, implement that adapter through `@h-sandbox/sdk`:

```ts
const { sandbox } = await harakiri.createSandbox({
  template: "node-20",
  ttlSeconds: 900,
  idempotencyKey: runId
});

await harakiri.waitForSandbox(sandbox.id);
await harakiri.files.write(sandbox.id, {
  path: "/workspace/package.json",
  content: JSON.stringify({ scripts: { dev: "vite --host 0.0.0.0" } }),
  createParents: true
});

const install = await harakiri.runSandbox(sandbox.id, {
  command: "npm install",
  cwd: "/workspace",
  timeoutMs: 120_000
});

if (install.result.exitCode !== 0) throw new Error(install.result.stderr);

const { command } = await harakiri.commands.start(sandbox.id, {
  command: "npm run dev",
  cwd: "/workspace",
  detached: true
});

await harakiri.commands.wait(sandbox.id, command.id, { statuses: ["running"] });
const route = await harakiri.routes.expose(sandbox.id, {
  port: 5173,
  accessMode: "token",
  labels: ["preview", "vite"]
});
const previewHeaders = route.accessToken && route.accessHeaderName
  ? { [route.accessHeaderName]: route.accessToken }
  : {};
```

## Capability Checklist

Before integrating a project, verify that the required capabilities are in the
stable Harakiri contract:

| Need | Harakiri surface |
| --- | --- |
| Create isolated runtime | `createSandbox`, `waitForSandbox` |
| Run setup/test command | `runSandbox` |
| Start background server | `commands.start(..., { detached: true })` |
| Poll process state | `commands.wait`, `commands.get` |
| Read process output | `commands.logs` |
| Stop process | `commands.kill` |
| Write project files | `files.write` |
| Read generated output | `files.read` |
| Move binary artifacts | `artifacts.upload`, `artifacts.download` (`files.upload/download` remain aliases) |
| List workspace | `files.list` |
| Expose web preview | `routes.expose` |
| Restrict egress | `setOutboundAccess`, `allowDomains`, `denyDomains` |
| Extend runtime | `renewSandbox` |
| Pause or resume runtime | `sandbox.pause`, `sandbox.resume` |
| Persist and restore runtime state | `sandbox.snapshot`, `snapshots.list`, `createSandbox({ snapshotId })` |
| Cleanup | `routes.delete`, `killSandbox` |

Planned but not stable yet:

- streaming or signed URL artifact transfer above the JSON artifact size limit
- organization-authenticated route access mode
- SDK PTY/interactive terminal streams

## Provider Boundaries

Harakiri stores product state and calls the configured runtime provider for the
runtime dataplane. External integrations must not depend on:

- OpenSandbox sandbox IDs
- Kubernetes pod names
- provider endpoint tokens
- ingress implementation details
- dashboard-only APIs

Use Harakiri sandbox IDs, command IDs, route URLs, and documented API responses
instead.

## Templates

Treat templates as versioned runtime products:

- Use public platform templates for common runtimes.
- Use team templates for project-specific images.
- Promote known-good versions to aliases such as `stable`.
- Pin immutable template version IDs for reproducible automation.

For agent projects, prefer templates that already contain language runtimes,
system packages, browser dependencies, and common package managers. That keeps
sandbox cold-start and setup time predictable.

## Operational Guidance

- Use `idempotencyKey` for retried sandbox creation.
- Always set a TTL and renew only while work is active.
- Use restricted egress presets when package installation or API access is
  known in advance.
- Record sandbox ID, command ID, and route URL in your application logs.
- Kill sandboxes on workflow cancellation and in final cleanup handlers.
- Do not assume sandbox disk state survives termination.
