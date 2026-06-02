# SDK Conformance

Harakiri includes a public SDK conformance test for external-app workflows. The
test uses only `@h-sandbox/sdk` and validates the contract an OSS integration can
depend on.

The conformance flow covers:

- create sandbox with an idempotency key
- wait for runtime readiness
- blocking command execution with cwd/env/timeout
- filesystem mkdir/write/stat/read/rename/list/upload/download/remove
- detached command lifecycle, status, logs, and kill
- token-protected route creation and route listing
- metrics and sandbox logs
- outbound access policy update and access test
- renew and kill cleanup

## Run

```bash
export HARAKIRI_API_URL=http://127.0.0.1:18082
export HARAKIRI_API_KEY=hk_live_...
pnpm conformance:sdk
```

The CLI conformance smoke uses the packaged CLI and the same public API key:

```bash
pnpm conformance:cli
```

Optional settings:

```bash
export HARAKIRI_CONFORMANCE_TEMPLATE=python-3.12-data
export HARAKIRI_CONFORMANCE_ROUTE_PORT=5173
```

Set `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1` to require an actual HTTP fetch through
the token-protected route. Leave it unset when running against the in-memory dev
provider or an environment where preview DNS is intentionally unavailable.

Set `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE=1` only when validating an
environment that is expected to expose the API but not mutable provider egress.

## Expected Use

- Run against the local dev provider before release work.
- Run against the k0s/OpenSandbox-backed deployment before claiming runtime
  compatibility.
- Keep the suite focused on public SDK behavior. Provider-specific diagnostics
  belong in provider tests or operator smoke scripts.
