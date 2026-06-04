# Detached Process Management

Harakiri exposes long-running sandbox work as tracked command resources. Use
these resources for dev servers, background agents, watchers, and any workflow
that must survive SDK or CLI process restarts.

Harakiri does not use Kubernetes pod exec for this contract. The provider path
is OpenSandbox execd command transport, with Harakiri adding command IDs,
organization scoping, audit events, status persistence, and log-tail helpers.

## Command Contract

Command summaries include:

- `id`: Harakiri command ID. Store this when you need to reconnect later.
- `providerCommandId`: OpenSandbox execd command ID when the provider returned
  one.
- `status`: `queued`, `running`, `succeeded`, `failed`, or `killed`.
- `startedAt`, `finishedAt`, `createdAt`, `updatedAt`: lifecycle timestamps.
- `exitCode`: process exit code when known.
- `finishReason`: `exit`, `error`, `killed`, `timeout`, `unknown`, or `null`
  while the command is still active.
- `signal`: currently `SIGINT` for Harakiri-interrupted commands when known.
- `stdout`, `stderr`, `error`: redacted command output and error metadata.

Log reads support `cursor` and `tail`. `cursor` asks the runtime provider for
logs after a provider cursor when supported. `tail` trims stdout and stderr in
Harakiri and returns `stdoutTruncated` and `stderrTruncated` metadata.

## SDK

Use `processes.*` for detached/background work. `commands.*` remains the
compatible low-level name.

```ts
import { HarakiriClient, HarakiriCommandEndedError } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const sandbox = await harakiri.sandboxes.create({
  template: "python-3.12-data",
  wait: true,
  ttlSeconds: 600
});

const { command } = await sandbox.processes.start({
  command: "python -m http.server 3000 --bind 0.0.0.0",
  cwd: "/workspace"
});

await sandbox.processes.wait(command.id, { statuses: ["running"] });

const logs = await sandbox.processes.tail(command.id, 100);
console.log(logs.stdout);

try {
  await sandbox.processes.wait(command.id);
} catch (error) {
  if (error instanceof HarakiriCommandEndedError) {
    console.error(error.status, error.exitCode, error.finishReason);
  }
}

await sandbox.processes.kill(command.id);
```

## CLI

`harakiri process` is an alias for `harakiri command`.

```bash
harakiri process run sbx_... \
  --cmd "python -m http.server 3000 --bind 0.0.0.0" \
  --detached \
  --json

harakiri command wait sbx_... cmd_... --status running
harakiri command status sbx_... cmd_... --json
harakiri command tail sbx_... cmd_... --lines 100
harakiri command logs sbx_... cmd_... --cursor 0 --tail 200
harakiri command kill sbx_... cmd_...
```

## API

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_.../commands" \
  -H "x-api-key: $HARAKIRI_API_KEY" \
  -H "content-type: application/json" \
  -d '{"command":"python -m http.server 3000 --bind 0.0.0.0","cwd":"/workspace","detached":true}'

curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_.../commands/cmd_..." \
  -H "x-api-key: $HARAKIRI_API_KEY"

curl "$HARAKIRI_API_URL/v1/sandboxes/sbx_.../commands/cmd_.../logs?tail=100" \
  -H "x-api-key: $HARAKIRI_API_KEY"

curl -X DELETE "$HARAKIRI_API_URL/v1/sandboxes/sbx_.../commands/cmd_..." \
  -H "x-api-key: $HARAKIRI_API_KEY"
```

## Failure Modes

- Missing sandbox or command: `HarakiriNotFoundError` with
  `sandbox_not_found` or `sandbox_command_not_found`.
- Runtime unavailable: `HarakiriProviderUnavailableError`.
- Unsupported runtime command capability: `HarakiriUnsupportedCapabilityError`.
- Wait timeout: `HarakiriWaitTimeoutError`.
- Command failed or was killed while waiting for success:
  `HarakiriCommandEndedError`.
- Invalid log cursor or tail query: `HarakiriValidationError`.

## Operational Pattern

1. Create or reconnect to a sandbox.
2. Start setup as blocking commands when the caller needs an exit code
   immediately.
3. Start servers and watchers with `processes.start` or
   `command run --detached`.
4. Store the returned command ID alongside the sandbox ID.
5. Reattach later with `processes.get`, `processes.wait`, and
   `processes.tail`.
6. Expose routes only after the process is `running` and bound to `0.0.0.0`.
7. Kill the command or sandbox when the integration owns cleanup.
