# Tutorial: Reuse Files Across Sandboxes

Start with [Workspaces](workspaces.md) for the concept, ownership and lifecycle.
Use [Workspace API, SDK and CLI](workspace-reference.md) for the reference contract
and [Persistent storage operations](persistent-workspace-operations.md) for enablement and recovery.

**Published baseline:** `0.5.0-rc.10`. Use matching API, SDK and CLI versions;
stable `0.4.0` does not include this feature. Operators must explicitly enable a
tested storage profile. k0s acceptance is passing; clean restricted OpenShift
storage validation is still pending.

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.10
npm install -g @h-sandbox/cli@0.5.0-rc.10
```

The renewal/scheduler correction originated in rc.3 (migration 036). For a current
deployment apply all migrations shipped with rc.10 and deploy matching API and
scheduler versions; follow the [installation and upgrade guide](install-kubernetes.md).
Following output alone does not renew TTL. Explicitly renew long-running jobs.

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

Use the complete [published two-sandbox program](https://sb.harakiri.io/#docs/persistent-workspaces).
It retains each accepted sandbox ID before waiting, writes its own checkpoint
and command instead of assuming a pre-existing `job.py`, and validates six
output lines plus a one-execution marker.

The published methods return response envelopes: `client.workspaces.create`
returns `{ workspace }` and `client.commands.start` returns `{ command }`.
Create with `wait: false`, retain the returned ID, then explicitly observe
execution readiness inside your cleanup scope.

To resume observation, call `commands.stream` with the same IDs and the last
**consumed** cursor; never call `commands.start` again. The SDK retries transport
interruptions, not revoked credentials, invalid cursors, or explicit stream errors.
A cancelled observer does not terminate the command.

After `killSandbox`, confirm the sandbox is terminated and its capacity released,
then wait until `workspaces.get(id).workspace.status` is `available` before
creating the replacement. Release needs the scheduler and provider-confirmed
deletion. Do not clear a reservation or repeat an uncertain mutation to work
around a conflict.

The [unreleased handle-based recipe](../examples/sdk-persistent-workspace/index.mjs)
adds `workspaces.connect`, `waitUntilAvailable` and process handles. It requires
a candidate tarball as described in the [example index](../examples/README.md),
not npm rc.10.

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

Set your installation's API URL and scoped key, install the pinned SDK above,
and run the `workspace-demo.mjs` program from the public tutorial:

```bash
export HARAKIRI_API_URL=https://sandbox-api.example.com
export HARAKIRI_API_KEY=hk_your_scoped_key
node workspace-demo.mjs
```

Assertions check checkpoint reuse, all six output lines exactly once, completion
with exit 0, and a one-execution marker despite reconnecting. Success is printed
only after both sandboxes are confirmed terminated and the workspace is archived
**with its volume retained**. Cleanup failures include the affected IDs and do
not hide the original task failure. Allocate space and arrange operator cleanup.

`pnpm --filter @harakiri/web docs:test-sdk` executes the exact displayed program
with npm rc.10 against a local HTTP fixture, including failed readiness and an
uncertain deletion. That is a package/protocol regression check, not live
storage acceptance. The tutorial itself uses no paid model or Kubernetes access.

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
