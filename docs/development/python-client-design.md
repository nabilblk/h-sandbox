# Python Client Design

Status: implementation in progress, not a published or native-qualified release.

## Boundaries

`h-sandbox` talks to Harakiri's HTTP API. `h-sandbox-deepagents` adapts the public
Python SDK to the actual Python Deep Agents backend protocol. Neither bypasses
the control plane, imports Kubernetes, calls a provider directly or invokes Node.

Models and wire errors are shared by both client modes. Resource modules own
their endpoint mapping. The synchronous methods are ordinary typed facades over
the async resources, not generated code or a second implementation of the wire
protocol. Python 3.11 is the language floor.

## ADR: Total Deadlines and Sync Calls

Date: 2026-10-01. Decision: HTTPX async transport under an AnyIO total deadline,
with a single lazy client-owned blocking portal for the synchronous facade.

HTTPX connect/read/write/pool timeouts alone do not bound a whole response. The
transport applies a total deadline to headers and bounded body consumption.
Parsing happens within the same budget, with an elapsed-time check after parsing;
bounded JSON parsing is synchronous and cannot be preempted mid-instruction.

The proof test sends one JSON fragment then stalls. Async and sync calls expire
at 30ms, close the response stream and leave a caller-supplied HTTP client open.
This is transport evidence, not live sandbox acceptance. Keep it as a regression
test in `packages/python-sdk/tests/test_transport.py`. A second suite in
`test_network_deadlines.py` uses real, ephemeral loopback sockets to stall headers
or bodies and disconnect mid-response. It verifies both facades, async
cancellation, peer-observed connection closure and teardown of test-owned threads.

The sync portal is lazy, reused, explicitly closed and never runs on the caller's
event loop. Calling the sync API inside an event loop raises an error directing
the caller to `AsyncHarakiriClient`. Native async support currently targets
asyncio, as does the framework adapter. No Trio support is claimed.

Rejected alternatives: duplicated sync/async transports, per-request background
threads that survive cancellation, private HTTPX internals and inactivity limits
described as total deadlines. Application callbacks run on the caller thread in
sync mode so caller-owned SQLite/checkpoint resources retain thread affinity.

Injected `http_client` resources are borrowed and never closed by the SDK. They
must obey HTTPX's event-loop affinity: do not share an async client between the
sync portal and another event loop. Concurrent client closure is not supported;
finish its operations before closing it. SDK-owned connections are the default.

Synchronous task contexts keep async entry and exit in one portal task. The
bridge uses [AnyIO's cancellable portal tasks](https://anyio.readthedocs.io/en/stable/threads.html#spawning-tasks)
and a separate completion future: cancelling the task handle alone does not prove
that owned cleanup finished. If the caller interrupts entry or exit, the bridge
cancels and drains the context before allowing HTTP closure. It retains the
original interrupt and any cleanup failure. Tests inject interruption both while
readiness is pending and after entry succeeds but before delivery; isolated POSIX
subprocesses also exercise real SIGINT, repeated interruption and cleanup failure.

## Ownership and Uncertainty

Client closure releases local connections only. `connect()` is read-only;
`create()` transfers the acknowledged runtime to the application. `task()` owns
only its new runtime, rejects a supplied replay key through its explicit signature,
waits for readiness before yielding, and confirms termination plus per-sandbox
capacity release on exit. It never archives an attached workspace.

Cleanup has an independent bounded task, shielded from the caller's cancellation.
Primary and cleanup failures remain distinguishable in an exception group. A lost
create acknowledgement, 404 or timed-out deletion is not proof of cleanup.

Tracked commands submit once. Persist their acknowledgement before observation.
Local timeout/cancellation does not kill the remote command. A checkpoint and a
remote effect have no shared transaction; uncertain graph invocations are not
automatically replayed. Retained files do not restore process memory or command IDs.

## Wire Compatibility

Read routes/types in `packages/shared/src/index.ts` and authorization in
`apps/api/src/authorization.ts`. Resource sizing comes from installed templates;
the create route does not accept arbitrary CPU/memory overrides. Do not advertise
resource arguments absent from that schema. Unknown response fields are ignored,
but unknown lifecycle states do not become success.

Errors expose status/code and typed capacity data without rendering untrusted
response bodies. Credentials, stdout and file contents stay out of default repr.
TLS verification is mandatory; custom CA bundles and explicit proxy-environment
opt-in support private installations. Redirects are not followed.

Binary files use bounded base64 JSON with size/SHA-256 checks, not streaming.
The response budget accounts for encoding overhead; file limits remain bounded
by the runtime's advertised contract. File paths are remote POSIX paths, not a jail.
Nonrecursive removal omits the `recursive` query parameter because the supported
server coerces the nonempty string `"false"` to true. This is a client compatibility
fix, not a server parser change. The adapter validates the original path before
normalization, so an empty delete request cannot become its working directory.

## Endpoint and Permission Map

The Python layer does not add permissions or impersonate an organization member.
Every request is authorized by the server. The table below is the preview surface,
not an inventory of all server features.

| Python surface | API route | Required scope |
| --- | --- | --- |
| `templates.list/get` | `GET /v1/templates[/{id}]` | `templates:read` |
| `runtime.capabilities` | `GET /v1/runtime/capabilities` | `sandboxes:read` |
| `capacity.get` | `GET /v1/org/capacity` | `org:read` |
| `sandboxes.list/connect`, `refresh`, readiness and logs | `GET /v1/sandboxes[/{id}[/readiness\|/logs]]` | `sandboxes:read` |
| `sandboxes.create/task` | `POST /v1/sandboxes` | `sandboxes:write`; additionally `workspaces:write` for attachment |
| `renew`, `kill` | `POST /v1/sandboxes/{id}/renew`, `DELETE /v1/sandboxes/{id}` | `sandboxes:write` |
| `run`, `processes.start/kill` | Sandbox `/run`, `/commands[/{commandId}]` writes | `sandboxes:write` |
| `processes.list/connect`, command refresh/logs | Sandbox `/commands[/{commandId}[/logs]]` reads | `sandboxes:read` |
| File list/stat/read/download | Sandbox `/files` read routes | `sandboxes:read` |
| File write/upload/mkdir/rename/remove | Sandbox `/files` write routes | `sandboxes:write` |
| `workspaces.list/get` | `GET /v1/workspaces[/{id}]` | `workspaces:read` |
| `workspaces.create/archive` | `POST /v1/workspaces`, `POST /v1/workspaces/{id}/archive` | `workspaces:write` |

Creation never fetches organization capacity as a hidden prerequisite. A rejected
admission uses the original structured error, even if the key lacks `org:read`.
Cross-organization IDs and access denials remain server errors; the adapter must
not relabel an authorization failure as a missing file.
