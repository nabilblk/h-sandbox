# Provider Adapter Shape

External applications should wrap Harakiri through the public SDK, not through
OpenSandbox IDs, Kubernetes objects, or dashboard-only endpoints.

The following adapter shape is enough for most agent runtimes:

```ts
import {
  HarakiriClient,
  HarakiriSandbox,
  HarakiriApiError,
  HarakiriProviderUnavailableError,
  HarakiriWaitTimeoutError
} from "@h-sandbox/sdk";

export class HarakiriSandboxProvider {
  constructor(private readonly harakiri: HarakiriClient) {}

  async create(input: { template: string; env?: Record<string, string> }) {
    const sandbox = await this.harakiri.sandboxes.create({
      template: input.template,
      env: input.env,
      wait: false,
      idempotencyKey: `agent-${crypto.randomUUID()}`
    });
    await sandbox.wait({ timeoutMs: 90_000 });
    return sandbox;
  }

  connect(id: string) {
    return HarakiriSandbox.connect(this.harakiri, id);
  }

  async run(sandbox: HarakiriSandbox, command: string, cwd = "/workspace") {
    return sandbox.commands.start({
      command,
      cwd,
      detached: false,
      timeoutMs: 60_000
    });
  }

  async writeFile(sandbox: HarakiriSandbox, path: string, content: string) {
    return sandbox.files.write({ path, content, createParents: true });
  }

  async expose(sandbox: HarakiriSandbox, port: number) {
    return sandbox.routes.expose({ port, accessMode: "token" });
  }

  async destroy(sandbox: HarakiriSandbox) {
    await sandbox.kill();
  }
}
```

Persist `sandbox.id` in your application if the work may continue after a
process restart, then call `connect(id)` to rehydrate the object without
creating a new sandbox.

## Error Handling

Use typed SDK errors for policy decisions:

- `HarakiriAuthenticationError`: rotate or reload API credentials.
- `HarakiriAuthorizationError`: surface an organization or role problem.
- `HarakiriNotFoundError`: discard stale sandbox, command, file, or route IDs.
- `HarakiriConflictError`: refresh sandbox state before retrying.
- `HarakiriRateLimitError`: retry later with backoff.
- `HarakiriProviderUnavailableError`: retry if the workflow is idempotent.
- `HarakiriUnsupportedCapabilityError`: hide or disable the feature.
- `HarakiriWaitTimeoutError`: decide whether to keep polling or clean up.

For unknown errors, log `error.message`, `error.code`, `error.status`, and the
Harakiri sandbox ID. Do not log route tokens, API keys, or full environment
values.

The stable sandbox runtime error-code vocabulary is exported from
`@h-sandbox/sdk` as `sandboxRuntimeApiErrorCodes`. Adapter code should branch
on that vocabulary or on the SDK subclasses above, not on provider names or
OpenSandbox transport details.

## Integration Rules

- Keep Harakiri sandbox IDs as the only persistent sandbox identifier.
- Store command IDs when a process may outlive the current request.
- Store token-protected route tokens only in your own secret store; Harakiri
  exposes only a token hint after creation.
- Use `idempotencyKey` for create operations that may be retried.
- Treat TTL as the persistence boundary. Renew active sandboxes and copy
  important artifacts out before killing or allowing TTL expiry.
- Avoid provider-specific assumptions. Capabilities may vary across dev,
  OpenSandbox, and future providers.
