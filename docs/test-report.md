# Test Report

Date: 2026-05-22

Target cluster: `harakiri-k0s` via `infra/k0s/harakiri.kubeconfig`.

## Deployed URLs

- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`

## Commands Verified

- `pnpm deploy:k0s` passed.
- `pnpm typecheck` passed across the workspace.
- `pnpm test` passed all package tests.
- `pnpm build` passed for shared, API, web, CLI, and SDK packages.
- `pnpm ports:restart && pnpm ports:status` passed for web, API, Keycloak, and OpenSandbox forwards.
- `pnpm smoke` passed sandbox create, real command execution, and kill through OpenSandbox with adapter fallback disabled.
- `pnpm smoke:ttl` passed scheduler termination of a 10-second Harakiri TTL sandbox while using a provider-safe OpenSandbox lease.
- `pnpm smoke:route` passed exposed-port routing through the OpenSandbox proxy.
- `HARAKIRI_CLI_BIN=harakiri pnpm e2e` passed Keycloak browser login, dashboard API key creation, and real sandbox workflows via Web, API, CLI, and SDK.
- Global CLI install from the local package was verified with `harakiri --version`.
- Post-test database audit: `active_api_keys=0`, `fallback_sandboxes=0`, `running_sandboxes=0`.

## CLI Demo

The installed `harakiri` CLI was tested against the deployed API with a real dashboard-created API key:

```text
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri create --template python-3.12 --name cli-real-... --ttl 90
harakiri run sbx_... --cmd "python -c \"print('cli-ok')\""
harakiri kill sbx_...
```

The run returned `cli-ok`, an `ok runtime=...` line, and the sandbox termination line.

## No Seeded Control Plane Data

- `SEED_ON_BOOT=0`, `AUTH_DEV_ALLOW=0`, and `OPEN_SANDBOX_ALLOW_FALLBACK=0` are deployed in `harakiri-config`.
- The old stable demo API key is no longer present in app, CLI, web, or test fallbacks. It appears only in migration `005_remove_seeded_control_plane_data.sql`, where it is removed.
- Control-plane seed data was removed by migration: users, organizations, API keys, and sandboxes started empty after migration; the template catalog is installed by migration as static runtime metadata.
- Real test records have OpenSandbox UUIDs and no `osbx_` fallback IDs.

## Artifacts

- `docs/artifacts/01-landing-desktop.png`
- `docs/artifacts/02-docs-desktop.png`
- `docs/artifacts/03-signin-desktop.png`
- `docs/artifacts/04-keycloak-login-desktop.png`
- `docs/artifacts/05-keycloak-login-mobile.png`
- `docs/artifacts/06-dashboard-desktop.png`
- `docs/artifacts/07-api-keys-desktop.png`
- `docs/artifacts/08-usage-desktop.png`
- `docs/artifacts/09-onboarding-desktop.png`
- `docs/artifacts/10-detail-desktop.png`
- `docs/artifacts/11-landing-mobile.png`
- `docs/artifacts/12-dashboard-mobile.png`
- `docs/artifacts/playwright-report/index.html`

## Known Prototype Limits

- Routing uses the OpenSandbox server port-forward, not wildcard DNS or an ingress controller.
- Keycloak runs with `start-dev`, a development login fixture user, and the Harakiri login theme mounted from `keycloak-theme-harakiri`.
- PostgreSQL uses local-path storage.
- Filesystem and metrics panels are prototype control-plane views; command execution and HTTP route proxying are live.
