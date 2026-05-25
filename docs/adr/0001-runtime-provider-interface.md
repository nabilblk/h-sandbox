# ADR 0001: Runtime Provider Interface

## Status
Accepted

## Context
Harakiri is a control plane on top of OpenSandbox, but the current API code
still calls a concrete OpenSandbox adapter directly from route handlers and the
scheduler. The same module owns lifecycle calls, `execd` transport, files,
logs, metrics, routing, retries, and fallback behavior.

The OSS project needs a stable boundary that keeps OpenSandbox as the default
runtime while preventing provider-specific behavior from leaking into product
services.

## Decision
Introduce a `RuntimeProvider` contract in
`apps/api/src/providers/runtime/provider.ts`. OpenSandbox remains the default
implementation, but route handlers and workers should eventually depend on the
interface rather than on `apps/api/src/opensandbox.ts`.

The runtime contract includes lifecycle, terminal commands, filesystem
listing, runtime logs, metrics, and route exposure. Filesystem results use an
explicit success/unavailable union so callers can distinguish an empty
directory from a provider failure.

Harakiri API must not receive sandbox `pods/exec` or sandbox `pods/log`
permissions. Provider-owned Kubernetes permissions, such as OpenSandbox server
diagnostics, remain isolated to provider service accounts.

## Consequences
- OpenSandbox fallback behavior stays provider-owned.
- The API can gain fake provider tests without booting OpenSandbox.
- New runtime providers can be explored without changing public API routes.
- Phase 2 must migrate call sites to injected providers and add contract tests.
