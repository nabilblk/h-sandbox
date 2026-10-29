# Protected service transport

Status: implementation candidate, not a released OpenWebUI integration.

## Decision

Keep service transport in Harakiri and application integration outside it.
An organization creates a token route through the existing routes API. That
route grants access to one sandbox port, not to the control-plane API. HTTP and
WebSocket requests use the same grant and provider-resolved destination.

The transport does not parse Open Terminal commands, choose chat contexts,
provision sandboxes on a request, or replay failed requests. Native Harakiri PTY
sessions remain a separate contract. Open Terminal execution does not create
Harakiri Commands or imply command-level audit coverage.

## Implementation boundaries

- `services/protected-services/access.ts`: database-backed route grants and
  running/expiry checks, including revalidation of established connections.
- `services/protected-services/target.ts`: fixed destination, confined paths,
  hop-by-hop and credential header filtering, safe response headers.
- `services/protected-services/http.ts`: bounded byte streams with backpressure,
  cancellation and timeouts using Node's HTTP transport. No decompression or
  multipart parsing/re-encoding; byte counts apply to the transferred bytes.
- `services/protected-services/websocket.ts`: bounded application WebSocket
  forwarding using `ws`, independent of the native terminal protocol.
- `routes/protected-services.ts`: scoped Fastify parsers, authorization before
  forwarding/upgrade, per-process admission and connection cleanup.

Dependencies remain the existing Fastify, Node HTTP and `ws` stack. An SDK
service helper is a scoped client, not another lifecycle manager.

## Security contract

The control-plane credential is used only for route CRUD. The route token is
removed before forwarding. Application `Authorization` is deliberately
preserved: it authenticates the application, not Harakiri. Platform API keys,
proxy routing headers and hop-by-hop headers are never forwarded from callers.
The destination comes from trusted persisted provider metadata, never a client
URL. Paths cannot change that destination or escape a provider proxy prefix.

The proxy never follows redirects. Only locations confined to the same service
are rewritten to the public proxy prefix. Connections close on route revocation,
sandbox termination/expiry, revalidation failure, idle timeout or maximum
connection lifetime. Authorization errors and transport diagnostics must not
include tokens, upstream bodies, provider addresses or document contents.

Services share the API origin, so response cookies are not forwarded. Documents
receive an opaque-origin CSP sandbox, `nosniff` and a no-referrer policy. This is
not an unrestricted web-hosting origin. Browser integrations must also sandbox
their preview frames; an adapter that removes these headers owns that risk.

## OpenWebUI protocol candidate

Research versions: OpenWebUI `v0.12.4`, Open Terminal `v0.14.6`. These versions
are not yet an accepted or security-qualified pairing.

The first supported connection model is an administrator-configured Open
Terminal connection, proxied by the OpenWebUI backend. The adapter authenticates
that backend before trusting its asserted user/context. `X-User-Id` alone is
not authentication. Harakiri organization permissions do not become per-user
resource ACLs through this integration.

HTTP carries the configured bearer credential. The terminal WebSocket instead
authenticates with its first JSON frame; it must not allocate a sandbox before
that frame is verified. The adapter translates this credential into a unique
Open Terminal instance credential. Harakiri and adapter credentials must never
enter a sandbox, browser, URL or model prompt.

OpenWebUI buffers HTTP request bodies in this candidate release. Harakiri's
streaming request transport alone cannot promise end-to-end streaming uploads.
Open Terminal's file-browser root is a UI hint, not a filesystem security boundary.

The maintainer requested a reference adapter for standard OpenWebUI because the
colleague's POC is inaccessible. It must be separately distributable, keep durable context bindings and credentials,
and coordinate existing workspace/capacity APIs. It must not copy the separately
licensed Open WebUI Terminals orchestrator or become another runtime scheduler.

## Acceptance scenario

A real model in unmodified OpenWebUI reads a CSV in `/workspace/demo`,
computes totals and creates JSON, PNG, PDF and HTML artifacts. Independently
verify their contents and downloaded hashes. Then exercise native file browsing,
shell input/resize/reconnect and document previews. Test two users, concurrent
first access, quota rejection, interrupted transfers, adapter restart and sandbox
replacement with retained files. Do not equate curl fixtures with this browser
acceptance or retained files with retained processes.

Reference model: Ollama `qwen3:4b-instruct`, digest
`0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`,
with the previously qualified local inference image
`ollama/ollama@sha256:fcf18828940c6919f6b9997d8f7a9730144c8df657589959732a73005a3464a3`.
Use bounded CPU/memory and native OpenWebUI tool calls, not a synthetic model.
This identity is a test candidate, not evidence that the new workflow passed.

## Upstream Security And Licensing Review

Reviewed October 29, 2026. Open Terminal 0.14.6 is newer than the 0.14.0 fix for
[GHSA-7m7w-cmv4-gcq2](https://github.com/open-webui/open-terminal/security/advisories/GHSA-7m7w-cmv4-gcq2);
this template does not start an MCP listener. OpenWebUI 0.12.4 is newer than the
0.11.4 fixes for [terminal session revocation](https://github.com/open-webui/open-webui/security/advisories/GHSA-6g45-8g27-fh8q)
and [community message origin validation](https://github.com/open-webui/open-webui/security/advisories/GHSA-vpq8-f445-hcq7).
These targeted checks are not an exhaustive vulnerability audit. Image/dependency
scans and actual hostile-preview/user-revocation tests remain release gates.

The universal Python dependency lock resolved for Linux amd64/Python 3.12 and
`pip-audit` reported no known dependency vulnerabilities on October 29. The
workspace npm high-severity gate also passes after patched Vite/Zod floors and
retirement of the withdrawn braces exception. These local checks do not qualify
the OpenWebUI image, template OS packages or actual browser preview behavior.

Open Terminal's generated discovery schema retains its MIT notice. Harakiri's
adapter code uses Apache-2.0. OpenWebUI is run unmodified and has its own
[branding-constrained license](https://github.com/open-webui/open-webui/blob/v0.12.4/LICENSE);
do not describe it as Apache-2.0/MIT or strip its branding. No code from the
separate enterprise Terminals orchestrator is used.

## Sources

- [OpenWebUI terminal router](https://github.com/open-webui/open-webui/blob/v0.12.4/backend/open_webui/routers/terminals.py)
- [Open Terminal security boundary](https://github.com/open-webui/open-terminal/blob/main/SECURITY.md)
- [Open Terminal license](https://github.com/open-webui/open-terminal/blob/main/LICENSE)
- [Separate Terminals license](https://github.com/open-webui/terminals/blob/main/LICENSE)
- [Fastify parser encapsulation](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)
- [Fastify WebSocket lifecycle](https://github.com/fastify/fastify-websocket)
- [Node HTTP streams](https://nodejs.org/api/http.html)
- [WebSocket bounds and backpressure](https://github.com/websockets/ws/blob/master/doc/ws.md)
