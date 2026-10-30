# Maintaining the OpenWebUI integration

The core owns protected service transport. This directory owns the optional
OpenWebUI protocol adapter. Do not add upstream chat or file API emulation to
Harakiri's core, call Kubernetes exec, or change the runtime provider directly.
See the [design decision](../../docs/protected-services-design.md).

## Module ownership

| Module | Responsibility |
| --- | --- |
| `identity.ts` | Authenticate the calling application before accepting trusted user assertions; confine service paths |
| `bindings.ts` | Versioned, authenticated-encrypted PostgreSQL state and per-user coordination |
| `sessions.ts` | Durable lifecycle intents, public SDK operations, readiness and bounded renewal |
| `app.ts` | HTTP protocol adaptation, discovery, admission and bounded transfers |
| `terminal.ts` | First-message authentication, ordered bounded frames and connection cleanup |
| `recovery.ts`, `operator.ts` | Explicit, generation-checked grant recovery without replaying commands |
| `compatibility.json` | Exact upstream identities and links to qualification evidence |

OpenWebUI's backend is a trusted caller. A leaked adapter key permits trusted
identity assertions. Harakiri's key and route grants must not reach the sandbox
or ordinary chat clients. The administrator configuring OpenWebUI can access its
adapter key. A user can inspect their own Open Terminal service key from inside
their sandbox; this must not grant access to any other binding.

## Local checks

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @harakiri/openwebui-adapter typecheck
pnpm --filter @harakiri/openwebui-adapter test
pnpm --filter @harakiri/openwebui-adapter test:postgres
pnpm --filter @harakiri/openwebui-adapter test:package
node --test infra/openwebui-acceptance/*.test.mjs
pnpm docs:check
```

The PostgreSQL command needs `initdb` and `pg_ctl`. It creates a new private
Unix-socket instance and removes only that instance. Never substitute an existing
application database. Ordinary adapter tests skip the database-dependent
cases; the PostgreSQL command and CI run them explicitly.

The binding lock must cover the configured cold-start deadline, not just a warm
HTTP request. Native OpenWebUI initializes files, processes and ports concurrently.
Keep lock waiting cancellable and bounded; never replay a forwarded mutation to
hide a startup failure.

The production-package test verifies an isolated bundle, not workspace imports.
Image builds/scans and browser acceptance are separate gates. Do not infer native
compatibility from a mock upstream or green local unit tests.

## Native qualification

The [Native OpenWebUI workflow](../../.github/workflows/openwebui-acceptance.yml)
runs on a disposable GitHub-hosted Linux amd64 machine. Changes to the API, SDK,
shared contracts, dependencies, adapter, template or native harness trigger it
for same-repository pull requests. It is
also manually dispatchable after the workflow exists on the default branch.
It has read-only repository permissions and does not publish artifacts to a
package or container registry used by customers.

`infra/openwebui-acceptance/run.mjs` refuses an ambient kubeconfig, a non-owned
cluster and unsupported host profiles. Do not run it on a developer workstation
or remove its guards. It installs a published baseline, builds the exact candidate
API/web/adapter/template, and uses an owned ephemeral TLS registry for the normal
template import and runtime image-pull path. It does not weaken TLS verification.

The browser uses unmodified, pinned OpenWebUI with its normal administrator
settings and Open Terminal integration. A pinned local Ollama model processes
synthetic CSV data and generates JSON, PNG, PDF and HTML artifacts. Native tests
exercise shell frames, previews, transfers, user separation, capacity denial,
restart, retained files and revoked-grant recovery. Failure injection is explicit;
the harness never supplies a fake model response or silently replays a failed
chat to obtain a passing result.

The native failed-upload check injects a browser `ConnectionReset` before
dispatch, then verifies the visible failure and absence of automatic replay. It
does not claim that an already accepted upload is rolled back. A separate core
socket test interrupts multipart data after the upstream receives its first
bytes and checks connection/admission cleanup. OpenWebUI buffers the browser's
body before forwarding, so these are deliberately different evidence levels.

The public receipt contains only allowlisted booleans, hashes, versions and image
identities. Fixed screenshot paths contain synthetic report/preview screens,
never administrator settings. Raw browser traces, database contents, HTTP bodies,
private environment files and exception text are not uploaded. Cleanup runs even
after failure and removes only ownership-checked resources. Download and inspect
the screenshots before claiming visual qualification. Evidence artifacts expire
after 14 days; retain a sanitized release receipt in Git before release.
The compatibility record must reference the retained receipt and its SHA-256.
Local qualification tests reject missing/failed gates, incomplete cleanup and
changed upstream or model identities. Source qualification is not publication
or independent adopter acceptance.

Separate image jobs inventory OS and application vulnerabilities and reject
fixable high/critical findings. Passing that gate does not mean that unfixed OS
findings or upstream application risks do not exist.

## Changes and releases

Update pins only after reviewing upstream licenses, security advisories and the
HTTP/first-message WebSocket contract. Retest the real workflow on every update;
do not copy code from the separately licensed Terminals orchestrator. Keep the
OpenWebUI branding intact.

Core SDKs, the adapter and the template have distinct ownership. No adapter
release may depend on unreleased core capabilities without being clearly labeled
as a source candidate. Publication requires explicit maintainer approval, immutable
versions/digests, provenance/checksums, anonymous installation verification and
release notes describing the tested limits. Keep independent self-service adopter
feedback separate from maintainer-operated CI evidence.
