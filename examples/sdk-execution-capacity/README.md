# Execution Capacity Tutorial

**Requires 0.5.0-rc.9:** use the matching SDK and API with migration 038. Older
0.5.0-rc.8 does not include capacity admission or `client.capacity()`.

Use a dedicated empty organization. A human admin sets **Settings > Execution
slot limit** to **1**. Create a key with `org:read`, `sandboxes:read`,
`sandboxes:write` and `templates:read`. Do not lower a shared organization's limit
just to run this tutorial. An operator must activate preexisting organizations.

```bash
# Configure these privately in your shell, not in a checked-in file:
export HARAKIRI_API_URL=https://your-sandbox-api.example
export HARAKIRI_TEMPLATE=python-3.12
# HARAKIRI_API_KEY must already be set to your scoped test key.

# From the repository root after pnpm install:
pnpm --filter @harakiri/api exec tsx --tsconfig ../../examples/tsconfig.json ../../examples/sdk-execution-capacity/index.ts
```

The example reads capacity before doing anything. It creates one sandbox, retries
the identical intent, asserts a second intent receives 409, requests deletion,
waits for confirmed capacity release, then retries the second intent. Cleanup
targets only IDs returned to this run, including unexpected successes.

Expected final output: `Verified: full-capacity denial, same-key replay, confirmed
release and successful retry; no owned executions remain`.

No model account or credentials inside the sandbox are needed. Keep printed
request keys and accepted IDs if the process is interrupted. A timeout is not
proof of failure: inspect the accepted operation before starting a new intent.

CLI equivalent, with the same dedicated organization and matching source build:

```bash
harakiri capacity --json
harakiri create --template python-3.12 --idempotency-key capacity-demo-first
# Record the returned sandbox ID; this repeat must reuse it:
harakiri create --template python-3.12 --idempotency-key capacity-demo-first
# Expected exit 1 with organization_capacity_exceeded:
harakiri create --template python-3.12 --idempotency-key capacity-demo-second
harakiri kill sbx_YOUR_FIRST_ID
harakiri capacity --json
# Only when available is 1:
harakiri create --template python-3.12 --idempotency-key capacity-demo-second
# Stop the returned second sandbox, then verify inUse is 0.
```

Use fresh intent keys for a new run of the CLI tutorial. See
[the concept](https://sb.harakiri.io/#docs/execution-capacity) and
[operator recovery](../../docs/operations/execution-capacity.md).
