# Recovery Without Replaying Work

Prepare [SDK access](../../docs/python-sdk.md), then create an **application-owned**
sandbox with an attached retained workspace and save its public ID. Do not place
this workflow inside a disposable `task` context across workers or approval pauses.

```sh
uv run --project python examples/python-workflow-recovery/worker.py start --sandbox-id "$HARAKIRI_SANDBOX_ID"
uv run --project python examples/python-workflow-recovery/worker.py observe
```

These are separate processes. The first persists an intent in `workflow.sqlite`,
submits one detached command, commits the acknowledged ID and exits. The second
only observes that command and verifies the marker. Repeating `start` fails on the
unique intent, including when the first response was lost. Reconciliation of an
unknown submission is deliberate application work, not automatic agent replay.

`approval.py` uses the real `create_deep_agent`, `interrupt_on={"execute": True}`
and `langgraph-checkpoint-sqlite==3.1.1`. It requires the model setup described in
[the integration guide](../../docs/integrations/deepagents-python.md). Run it once
for the demonstration thread; do not repeatedly submit its initial prompt to
resume a checkpoint. Review pending tools and explicitly supply a LangGraph
resume command in the owning application. The borrowed sandbox survives client
closure, but TTL still applies while paused.

After expiry, wait for the workspace to detach, create a new runtime with its
`workspace_id`, and inspect retained files before choosing any graph continuation.
Sandbox ID, command ID and graph thread ID are different identities. Archive the
workspace explicitly when finished; client closure does not delete retained data.

Both SQLite files are private local application state. This example is single
worker, not a distributed scheduler, tenant-authorization system or exactly-once
guarantee. Back up/check access to checkpoints, since they can contain model and
tool content. Use separate databases for independent experiments.
