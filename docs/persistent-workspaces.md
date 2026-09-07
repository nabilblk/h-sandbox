# Tutorial: Reuse Files Across Sandboxes

Start with [Workspaces](workspaces.md) for the concept, ownership and lifecycle.
Use [Workspace API, SDK and CLI](workspace-reference.md) for the reference contract
and [Persistent storage operations](persistent-workspace-operations.md) for enablement and recovery.

**Availability:** Release candidate `0.5.0-rc.3`. Use matching API, SDK and CLI
versions; stable `0.4.0` does not include this feature. Operators must explicitly
enable a tested storage profile. k0s acceptance is passing; clean restricted
OpenShift storage validation is still pending.

Obtain matching archives from your operator, or verify the exact npm candidate
is published; see the [release notes](release-notes/0.5.0-rc.3.md).
This candidate corrects the renewal/scheduler defect in earlier releases.
Apply migration 036 and deploy matching API/scheduler versions. Following output
alone does not renew TTL; explicitly renew long-running jobs before expiry.

## Choose the Right State

| Need | Contract |
| --- | --- |
| Files reused after replacing a sandbox | Persistent workspace |
| Reconnect to a running sandbox | Sandbox ID; no new sandbox required |
| Shell cwd/environment between commands | Command session |
| Observe a long-running task | Detached tracked command + event stream |
| Recover runtime state | Provider snapshots, without persistent workspace attachment |
| Protect API credentials | Credential Vault, not files in `/workspace` |

Each workspace mounts at `/workspace`. A mount hides files the template image
already contains at that path; initialize a new workspace explicitly. Only one
sandbox can own a workspace, including while paused or provisioning. Check
`client.workspaces.list()` for availability, size and allocation limit.

## SDK

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});
const { workspace } = await client.workspaces.create({ name: "agent-project" });
const { sandbox } = await client.createSandbox({
  template: "python-3.12", workspaceId: workspace.id, ttlSeconds: 600
});
await client.waitForSandbox(sandbox.id);
await client.files.write(sandbox.id, {
  path: "/workspace/checkpoint.json", content: '{"step":1}'
});
const { command } = await client.commands.start(sandbox.id, {
  command: "python -u job.py", cwd: "/workspace", detached: true
});
const controller = new AbortController();
let cursor: string | undefined;
for await (const event of client.commands.stream(sandbox.id, command.id, {
  signal: controller.signal, cursor
})) {
  cursor = event.cursor;
  if (event.type === "output") process.stdout.write(event.stdout);
  if (event.type === "complete" && event.exitCode !== 0) {
    throw new Error(`Command ${event.status}, exit ${event.exitCode}`);
  }
}
```

Upload `job.py` before running the snippet. To resume observation, call
`commands.stream` with the same IDs and the last **consumed** cursor; never call
`commands.start` again. The SDK retries transport interruptions, not revoked
credentials, invalid cursors, or explicit provider stream errors.

After `killSandbox`, wait until `workspaces.get(id).workspace.status` is
`available` before creating the replacement. Release is asynchronous and needs
the scheduler plus provider-confirmed deletion. Do not clear a reservation to
work around 409 responses.

## CLI and Dashboard

```bash
harakiri workspace create --name agent-project --json
harakiri workspace list --json
harakiri create --template python-3.12 --workspace wsp_... --ttl 600
harakiri command run sbx_... --cmd 'python -u job.py' --follow
harakiri command follow sbx_... cmd_... --cursor 'v1:cmd_...:p:12'
harakiri workspace inspect wsp_...
harakiri workspace archive wsp_... --retain-storage
```

Ctrl-C stops viewing and prints the last cursor; it does not kill the command.
JSON output is newline-delimited stream events. Completion propagates the
command exit code. Keep observation credentials in environment/config, not URLs.

The dashboard Workspaces view supports allocation, filtering, reuse and
archive confirmation. New sandbox has a persistent-workspace selector.
Sandbox Commands supports execution, output following and explicit termination.
The bounded browser viewer keeps the latest 200,000 characters.

## Run the Verified Scenario

From the repository, build the SDK and run the
[two-sandbox tutorial](../examples/sdk-persistent-workspace/index.mjs):

```bash
pnpm --filter @h-sandbox/sdk build
export HARAKIRI_API_URL=https://your-api.example.com
export HARAKIRI_API_KEY=hk_live_...
HARAKIRI_TEMPLATE=python-3.12 node examples/sdk-persistent-workspace/index.mjs
```

Assertions check checkpoint reuse, all six output lines exactly once, completion
with exit 0, and a one-execution marker despite reconnecting. Both sandboxes are
terminated; the workspace is archived **but its volume is retained**. Allocate
space for this test and arrange operator cleanup. No paid model or Kubernetes
runtime access is required by the tutorial.

## Limits

- Logical archive is not physical deletion or secure erasure. Archived storage
  continues to consume quota. There is no restore-from-archive UI yet.
- Durability and backup depend on the storage class. A single-node local-path
  PVC is not protection against node/disk loss and is not a backup.
- One-second provider log polling, 60-second observer rotation, up to 16 active
  observers per organization and 256 per API process. Limits multiply across
  replicas; no distributed admission promise is made.
- Detached output currently follows the provider's merged log stream. Exact
  stdout/stderr interleaving is not reconstructible.
- Frames over 1 MiB fail explicitly; logs above the bounded fetch limit are not
  silently discarded. Retrieve a smaller tail through command logs and inspect
  the error before resuming. There is no unlimited replay or exactly-once
  application processing guarantee across client crashes.
- Access revocation/expiry is rechecked while following. Network failures can
  delay detection within the bounded provider request timeout.

See [operator recovery](persistent-workspace-operations.md) and
[ADR 0009](adr/0009-persistent-workspaces-and-command-streams.md).
