# Test Report

Date: 2026-05-23
Last updated: 2026-05-24

Target cluster: `harakiri-k0s` via `infra/k0s/harakiri.kubeconfig`.

## Deployed URLs

- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`
- OpenSandbox gateway: `http://127.0.0.1:18085`

## Commands Verified

- `pnpm deploy:k0s` passed after building the official OpenSandbox ingress component locally as `opensandbox-ingress:local` for the k0s node architecture.
- `pnpm typecheck` passed across the workspace.
- `pnpm test` passed all package tests.
- `pnpm build` passed for shared, API, web, CLI, and SDK packages.
- Template Dockerfile builder checkpoint on 2026-05-24: `pnpm typecheck`,
  `pnpm test`, `pnpm build`, `git diff --check`, and
  `pnpm smoke:template-build` passed after deploying the Kaniko-based k0s
  builder.
- Documentation checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`, and
  `pnpm build` passed after adding custom template docs. A Playwright docs
  navigation smoke check opened the product docs and verified "Create a custom
  template", "Template builds", "Using templates from SDKs", "Open Agents
  template", "Security model", and "API reference" render with no console
  errors.
- Open Agents documentation checkpoint on 2026-05-24: after redeploying with
  `pnpm deploy:k0s` and restarting port-forwards, a Playwright smoke check
  opened `http://127.0.0.1:15173/#docs`, selected "Open Agents template", and
  verified the deployed product docs include the build command, the
  `harakiri-open-agents-smoke` command, and the route exposure section with no
  console errors.
- `pnpm ports:restart && pnpm ports:status` passed for web, API, Keycloak, OpenSandbox server, and OpenSandbox gateway forwards.
- `pnpm smoke` passed sandbox create, real command execution, and kill through OpenSandbox with adapter fallback disabled.
- `pnpm smoke:ttl` passed scheduler termination of a 10-second Harakiri TTL sandbox while using a provider-safe OpenSandbox lease.
- `pnpm smoke:route` passed exposed-port routing through the OpenSandbox gateway host route.
- `pnpm route:tls-dev` created `opensandbox-system/harakiri-sandbox-wildcard-tls` as a k0s-local wildcard TLS secret.
- `pnpm smoke:route-ingress` passed HTTPS termination through `ingress-nginx` and forwarding to OpenSandbox gateway.
- `pnpm cert-manager:install` installed cert-manager v1.20.2 and rolled out `cert-manager`, `cert-manager-cainjector`, and `cert-manager-webhook`.
- `pnpm env:harakiri:route-preflight` passed for `preflight-3000.harakiri.io`, proving Cloudflare DNS/TLS reaches k0s/OpenSandbox.
- `pnpm env:harakiri:route-public` passed with a real generated route such as `https://0e3a7657-b7a2-426c-9806-ba477796ae30-3000.harakiri.io`.
- `pnpm e2e` passed Keycloak browser login, dashboard API key creation, and real sandbox workflows via Web, API, CLI, and SDK.
- CLI route exposure passed with `harakiri expose <sandbox-id> --port 3000` and `harakiri routes <sandbox-id>`.
- Dashboard Network tab route creation passed in Playwright; screenshot: `/tmp/harakiri-network-tab.png`.
- API route lifecycle passed: repeated `POST /routes` was idempotent and sandbox kill changed the persisted route state to `terminated`.
- Route limit smoke passed: the ninth active route on one sandbox returned `429 sandbox_route_limit_exceeded` with limit `8`.
- Protocol route smoke passed through OpenSandbox gateway for HTTP, SSE, and WebSocket.
- Global CLI install from the local package was verified with `harakiri --version`.
- Template control-plane smoke was verified locally: template create, queued
  build creation, build list, build logs, retry/cancel/promote endpoints, SDK
  methods, and CLI `template init/list/build/builds/logs/promote/inspect`.
- Template image-import builder smoke was verified locally on 2026-05-24:
  `processNextImageImportBuild()` claimed a queued `source_type='image'` record,
  resolved `hello-world:latest` to a `sha256:` digest, marked the build
  `success`, created a ready `template_versions` row, updated
  `templates.latest_version_id`, and cleaned up the temporary organization.
- k0s deployment checkpoint on 2026-05-24: `pnpm deploy:k0s` rolled out
  `harakiri-api`, `harakiri-web`, `harakiri-scheduler`, and the new
  `harakiri-template-builder` deployment. A cluster smoke inserted a temporary
  `source_type='image'` build for `hello-world:latest`; the deployed builder
  marked it `success`, stored digest
  `sha256:0e760fdfbc48ba8041e7c6db999bb40bfca508b4be580ac75d32c4e29d202ce1`,
  created a `tplv_...` latest version, and the temp organization was deleted.
- Dockerfile context upload smoke was verified against k0s on 2026-05-24:
  the built `packages/cli/dist/index.js` executable created a temporary
  `source_type='dockerfile'` build, uploaded a tar+gzip context, and PostgreSQL
  stored `template_build_contexts.sha256` as
  `sha256:e39205a9786b61c16fc7ef809abdd07a53d17cf64f1a5c94d5575b9033063d90`,
  with `size_bytes = 188`, `file_count = 2`, and matching
  `template_builds.context_hash`. The build log contained the received-context
  line. The temporary template was deleted and temporary smoke API keys were
  revoked.
- Dockerfile builder execution smoke was verified against k0s on 2026-05-24:
  `harakiri template build` uploaded a tiny Ubuntu Dockerfile context, the
  deployed `harakiri-template-builder` created Kaniko Job
  `hkbld-bld-1c-zku8jjbwt`, Kaniko pushed
  `127.0.0.1:5000/harakiri/templates/kaniko-ubuntu-1779584493@sha256:d9a1f930a7bc244afb17b0ea7b3767bb68117a050e5ee60a476686e0e8d0134c`,
  Harakiri created ready version `tplv_zaEUAKxJoZtB`, and `harakiri create`
  started `sbx_av-gq_64Tk` from that template. `harakiri run
  sbx_av-gq_64Tk --cmd "cat /harakiri-built.txt"` returned
  `harakiri-built`, then the sandbox was killed. A BusyBox variant also proved
  registry pull worked, but failed OpenSandbox bootstrap because the image did
  not provide the expected shell userland.
- `pnpm smoke:template-build` passed against k0s on 2026-05-24, repeating the
  Dockerfile build, digest-pinned ready version, sandbox creation, command run,
  sandbox kill, and temporary API-key cleanup flow. The run produced
  `bld_sUnEbjLxNoSv`, `sbx_C4pV_pBSUF`, and command output
  `harakiri-built`.
- Post-redeploy `pnpm smoke:template-build` passed on 2026-05-24 after updating
  the CLI config parser, Open Agents docs, and website product docs. The run
  produced `bld_yb6B4nHTIwbO`, `sbx_B4m1LnRZaw`, command output
  `harakiri-built`, and left `running_sandboxes=0` and `ready_routes=0`.
- CLI build-follow checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, and `pnpm smoke:template-build` passed after changing
  `harakiri template build` to wait by default, stream build-log lines, and
  print the final build ID, template version ID, image digest, duration, and
  next create command. The k0s smoke produced `bld_0fWVYnUctnhu`,
  `tplv_D61gc5TeRzLe`,
  `sha256:fe1704f4798a46f18499978c6a6b21e30f1ff6fb5849b846e6ec2a33b705a107`,
  `sbx_kQmOmE8_Pt`, command output `harakiri-built`, and left
  `running_sandboxes=0` and `ready_routes=0`.
- Product docs deploy checkpoint on 2026-05-24: `pnpm deploy:k0s` completed,
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy, and
  a Playwright smoke check verified the deployed Docs pages mention
  `--no-wait`, the default build-log follow behavior, and the Template Builds
  status guidance with no console errors.
- Open Agents template pilot was verified against k0s on 2026-05-24:
  `harakiri template build examples/templates/open-agents-dev` produced build
  `bld_Tv1jbVKB4TAD` and digest
  `sha256:cd9d020b6842019ccdb55abe2c9f2a63562758158f1ff9221193b269d856317b`.
  `harakiri create --template open-agents-dev --name open-agents-pilot`
  started `sbx_L9XXhArLsj`. `harakiri run sbx_L9XXhArLsj --cmd
  "harakiri-open-agents-smoke"` verified Node/npm, Bun, pnpm, yarn, git, jq,
  Python, Chromium headless, code-server, agent-browser, and `/workspace`
  write access, ending with `harakiri open-agents smoke passed`. A Node HTTP
  server on port `3000` was exposed with `harakiri expose`; the public route
  `https://f9eb0cbc-8a2a-493f-bcb7-6f55c662f32c-3000.harakiri.io` returned
  `open-agents-route`.
- Post-test database audit: `running_sandboxes=0`, `ready_routes=0`; pre-existing active API keys were left untouched.

## CLI Demo

The installed `harakiri` CLI was tested against the deployed API with a real dashboard-created API key:

```text
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri create --template python-3.12 --name cli-real-... --ttl 90
harakiri run sbx_... --cmd "python -c \"print('cli-ok')\""
harakiri expose sbx_... --port 3000
harakiri routes sbx_...
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

## Route Evidence

- OpenSandbox Helm config is `[ingress] mode = "gateway"` with `gateway.address = "harakiri.io"` and header routing.
- `ingress-nginx` is installed, and `opensandbox-sandbox-routes` maps `*.harakiri.io` to `opensandbox-ingress-gateway`.
- k0s contains TLS secret `opensandbox-system/harakiri-sandbox-wildcard-tls` for local HTTPS ingress verification.
- cert-manager v1.20.2 is installed; `pnpm env:harakiri:route-tls-letsencrypt` can request the wildcard origin certificate once `CLOUDFLARE_API_TOKEN` is available.
- Cloudflare DNS for concrete `*.harakiri.io` names resolves to Cloudflare anycast, TLS is covered by the existing `*.harakiri.io` edge certificate, and the tunnel reaches k0s ingress.

## Known Prototype Limits

- Public sandbox routes are intentionally placed directly under `*.harakiri.io` to use the existing Cloudflare wildcard edge certificate. Exact host rules in Cloudflare Tunnel still take precedence for app/auth/service subdomains.
- Keycloak runs with `start-dev`, a development login fixture user, and the Harakiri login theme mounted from `keycloak-theme-harakiri`.
- PostgreSQL uses local-path storage.
- Filesystem and metrics panels are prototype control-plane views; command execution and HTTP/SSE/WebSocket route proxying are live.
- Custom template image-import and Dockerfile records are live in the control
  plane and can be completed by the `harakiri-template-builder` worker. Git
  source builds, production registry credentials, retention/scanning policy, and
  non-root workspace ownership for custom template images remain pending in the
  active execution plan.
