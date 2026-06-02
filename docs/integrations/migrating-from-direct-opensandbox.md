# Migrating From Direct OpenSandbox Usage

Harakiri wraps OpenSandbox with a product control plane. External applications
should move from direct OpenSandbox calls to Harakiri APIs when they need
organization state, API keys, routes, egress policy, template versions,
auditable commands, and a stable SDK contract.

This migration keeps OpenSandbox as the runtime dataplane. It does not require
callers to know Kubernetes pod names, OpenSandbox endpoint tokens, or Harakiri's
internal provider implementation.

## Concept Mapping

| Direct OpenSandbox concern | Harakiri replacement |
| --- | --- |
| Sandbox create/start | `createSandbox` plus `waitForSandbox` |
| Sandbox ID in app state | Harakiri `sandbox.id` |
| Ad hoc exec call | `runSandbox` for blocking commands |
| Long-running process | `commands.start(..., { detached: true })` |
| Process polling | `commands.get` or `commands.wait` |
| Process logs/output | `commands.logs` |
| Files through provider endpoint | `files.*` helpers |
| Provider preview endpoint | `routes.expose` |
| Public/private preview decision | Route `accessMode` |
| Manual DNS/ingress awareness | Harakiri route URL |
| Network restrictions | `setOutboundAccess` and presets |
| Runtime image tag | Template ID, alias, or immutable `tplv_...` |
| Runtime cleanup | `routes.delete`, `commands.kill`, `killSandbox` |

## Recommended Migration Path

1. Put a small adapter around `@h-sandbox/sdk` in the consuming application.
2. Replace direct sandbox creation with `createSandbox` and `waitForSandbox`.
3. Replace blocking OpenSandbox exec calls with `runSandbox`.
4. Replace background command workarounds with persisted Harakiri commands.
5. Replace direct provider filesystem calls with `files.*`.
6. Replace preview endpoint handling with `routes.expose`.
7. Add restricted egress policy if the workflow has known package/API domains.
8. Move runtime image selection to Harakiri templates and promote stable aliases.
9. Add cleanup handlers that kill commands, delete routes, and kill sandboxes.
10. Run the SDK conformance test against the target Harakiri deployment.

## Adapter Skeleton

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

export const createHarakiriSandboxProvider = (harakiri: HarakiriClient) => ({
  async create(input: { template: string; ttlSeconds?: number; runId?: string }) {
    const { sandbox } = await harakiri.createSandbox({
      template: input.template,
      ttlSeconds: input.ttlSeconds,
      idempotencyKey: input.runId
    });
    await harakiri.waitForSandbox(sandbox.id);
    return { id: sandbox.id };
  },

  async run(id: string, command: string, cwd = "/workspace") {
    const { result } = await harakiri.runSandbox(id, {
      command,
      cwd,
      timeoutMs: 120_000
    });
    return result;
  },

  async startServer(id: string, command: string, port: number) {
    const { command: process } = await harakiri.commands.start(id, {
      command,
      cwd: "/workspace",
      detached: true
    });
    await harakiri.commands.wait(id, process.id, { statuses: ["running"] });
    const route = await harakiri.routes.expose(id, {
      port,
      accessMode: "token"
    });
    return { commandId: process.id, route };
  },

  async cleanup(id: string) {
    await harakiri.killSandbox(id);
  }
});
```

## Behavioral Differences To Account For

- Harakiri IDs are the public IDs. Do not store or parse provider IDs.
- Sandbox lifecycle is TTL, renew, and kill. Pause/resume and running-sandbox
  snapshots are not v1 guarantees.
- Token route secrets are returned only when the route is created. Store them in
  the consuming application if they must be reused.
- File artifact transfer is bounded by Harakiri's configured JSON/base64 limit.
- Egress policy is a product-level contract; tests should verify the intended
  domains through `testOutboundAccess`.
- Template tags are resolved to immutable template versions before sandbox
  creation. Use `tplv_...` IDs for reproducibility.

## Readiness Checklist

- [ ] Adapter uses only `@h-sandbox/sdk` and documented API responses.
- [ ] Creation uses `idempotencyKey` for retried jobs.
- [ ] Long-running servers use tracked detached commands.
- [ ] Preview routes use `accessMode: "token"` unless public access is intended.
- [ ] Logs include sandbox ID, command ID, and route URL.
- [ ] Cleanup runs on success, failure, cancellation, and timeout.
- [ ] Template selection uses a promoted alias or immutable version ID.
- [ ] `pnpm conformance:sdk` passes against the target deployment.
