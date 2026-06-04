# Integration Conformance

Harakiri includes public SDK and CLI conformance smokes for external-app
workflows. They validate the contract an OSS integration can depend on without
using Kubernetes access, OpenSandbox internals, or monorepo-only imports.

The conformance flow covers:

- create sandbox with an idempotency key
- wait for runtime readiness
- blocking command execution with cwd/env/timeout
- filesystem mkdir/write/stat/read/rename/list/upload/download/remove
- artifact upload/download checksum and JSON/base64 transfer metadata
- detached command lifecycle, status, logs, and kill
- token-protected route creation, route listing, and optional HTTP fetch
- metrics and sandbox logs
- outbound access policy update and access test
- renew and kill cleanup

## Public Contract

The SDK smoke copies the test into a temporary consumer project, installs the
packed `@h-sandbox/sdk` tarball, and imports only:

```js
import { HarakiriClient } from "@h-sandbox/sdk";
```

The CLI smoke packs `@h-sandbox/sdk` and `@h-sandbox/cli`, installs both
tarballs into a temporary npm prefix, and calls the installed `harakiri` binary.

## Run Against k0s

```bash
pnpm ports:restart
export HARAKIRI_API_URL=http://127.0.0.1:18082
export HARAKIRI_API_KEY=hk_live_...
export HARAKIRI_CONFORMANCE_ROUTE_BASE_URL=http://127.0.0.1:18082
pnpm conformance
```

If you do not have a test API key, create one with the local helper and revoke
it after the run:

```bash
eval "$(HARAKIRI_API_URL=http://127.0.0.1:18082 infra/scripts/create-test-api-key.sh)"
pnpm conformance
curl -fsS -X DELETE \
  -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
  "${HARAKIRI_API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}"
```

## Run Against The Public API

```bash
export HARAKIRI_API_URL=https://sb-api.harakiri.io
export HARAKIRI_API_KEY=hk_live_...
pnpm conformance
```

Optional settings:

```bash
export HARAKIRI_CONFORMANCE_TEMPLATE=python-3.12-data
export HARAKIRI_CONFORMANCE_ROUTE_PORT=5173
export HARAKIRI_CONFORMANCE_ROUTE_BASE_URL=http://127.0.0.1:18082
```

Set `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1` to require an actual HTTP fetch through
the token-protected route. Leave it unset when running against an environment
where preview DNS is intentionally unavailable.

Set `HARAKIRI_CONFORMANCE_ROUTE_BASE_URL` only for local port-forwarded runs
where route URLs are configured for another external origin. The smoke rewrites
only token route-proxy origins and keeps the returned route path intact. Direct
provider public routes are fetched only when no route-base override is set.

Set `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE=1` only when validating an
environment that is expected to expose the API but not mutable provider egress.

## Expected Output

Successful runs print concise checkpoints similar to:

```text
created sbx_...
sdk conformance passed
created sbx_...
cli conformance passed
```

Failures should include the failing API call, command output, or route fetch
error. Both smokes register cleanup traps for sandbox termination, detached
command kill, and temporary project removal.

## Maintenance

- Run against the local dev provider before release work.
- Run against the k0s/OpenSandbox-backed deployment before claiming runtime
  compatibility.
- Run against `https://sb-api.harakiri.io` before npm publishing when public
  credentials are available.
- Keep the suite focused on public SDK and CLI behavior. Provider-specific
  diagnostics belong in provider tests or operator smoke scripts.
- Update the suite whenever a public package feature becomes a supported
  integration promise.
