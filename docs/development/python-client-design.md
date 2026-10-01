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
test in `packages/python-sdk/tests/test_transport.py`.

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
