# Usage Observations Tutorial

Source preview; not included in published 0.5.0-rc.9. Use the corresponding API,
scheduler and SDK build with migration 039. Keep production and shared work out of
the test organization. This script creates one runtime, runs a model-free shell
task and terminates only its own IDs in `finally`.

Prerequisites: an empty dedicated organization, active collection, an approved
ready Linux template, and a privately supplied API key with `org:read`,
`sandboxes:read`, `sandboxes:write` and `templates:read`. No model key is needed.

```bash
# From the source checkout, after pnpm install and the SDK build:
export HARAKIRI_API_URL=https://your-sandbox-api.example
export HARAKIRI_TEMPLATE=your-approved-template
# HARAKIRI_API_KEY must already be set privately.
pnpm --filter @harakiri/api exec tsx --tsconfig ../../examples/tsconfig.json ../../examples/sdk-usage-observations/index.ts
```

Expected: one accepted create despite replay, a peak of one held execution slot,
positive slot-seconds, one independent readiness sample (or explicit unsupported
probe), and zero held slots after cleanup. This is not CPU or billing evidence.
Retain the printed intent and sandbox ID if the process is interrupted. A lost
create response may require inspecting the same intent before another run.

For old servers, 404 means history is unsupported. For large installations,
503 `usage_history_limit_exceeded` means shorten the requested window. A scope
error requires a deliberately scoped key, not a change to the sandbox workload.

Use `harakiri usage --period 24h --json` or the dashboard Usage page to inspect
coverage and exact bucket values. On a fresh installation, earlier history is
unavailable, not zero. Follow the public [concept](https://sb.harakiri.io/#docs/usage-observations)
and [tutorial](https://sb.harakiri.io/#docs/usage-tutorial) for the optional
isolated observer-gap exercise and cleanup. Never stop a populated scheduler to
make a graph demonstrate an outage.
