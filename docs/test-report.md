# Test Report

Date: 2026-05-23
Last updated: 2026-06-01

Target cluster: `harakiri-k0s` via `infra/k0s/harakiri.kubeconfig`.

## Deployed URLs

- Public Web: `https://sb.harakiri.io`
- Public API: `https://sb-api.harakiri.io`
- Public Keycloak: `https://sb-auth.harakiri.io`
- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`
- OpenSandbox gateway: `http://127.0.0.1:18085`

## Commands Verified

- Public docs and npm integration checkpoint on 2026-06-01:
  `pnpm --filter @harakiri/web test`, `pnpm --filter @harakiri/web
  typecheck`, `pnpm --filter @harakiri/web build`, and `git diff --check`
  passed after correcting the product docs and template detail SDK snippet to
  use the published `@h-sandbox/sdk` and `@h-sandbox/cli` packages.
  `KUBECONFIG=$PWD/infra/k0s/harakiri.kubeconfig pnpm
  env:harakiri:deploy-public` rebuilt and deployed API image
  `sha256:fd3ad1808fcb4bee76f690d0210a822f57b5aae39ac0e0940ae1cf8ab0ca4afa`
  and web image
  `sha256:b076e258cf0deb177b67c6ab77e2af4a5eb2bdb064b6f1cd8e0e9613ede4f221`.
  The public deployment wrapper preserved `https://sb-api.harakiri.io`,
  `https://sb.harakiri.io`, and `https://sb-auth.harakiri.io` build-time
  URLs. `pnpm ports:restart` was required because the Cloudflare tunnel maps
  exact `sb*` hostnames to local forwards; after restart, `pnpm ports:status`
  reported API, web, Keycloak, Mailpit, OpenSandbox, gateway, and ingress HTTPS
  forwards up. Public `GET https://sb-api.harakiri.io/health` returned
  `{"status":"ok"}`, the Keycloak OIDC issuer returned
  `https://sb-auth.harakiri.io/realms/harakiri`, and the deployed web bundle
  `/assets/index-Ck-rm_Li.js` contained `SDK and CLI`, `@h-sandbox/sdk`, and
  `@h-sandbox/cli` with no stale `@harakiri/sdk` or localhost API/Auth URL.
  A browser smoke opened the public landing page, clicked Read the docs, opened
  SDK and CLI, verified the npm package names and `runSandbox`, and saved
  `/tmp/harakiri-sdk-cli-docs-deployed.png`.
- `pnpm deploy:k0s` passed after building the official OpenSandbox ingress component locally as `opensandbox-ingress:local` for the k0s node architecture.
- `pnpm typecheck` passed across the workspace.
- `pnpm test` passed all package tests.
- `pnpm build` passed for shared, API, web, CLI, and SDK packages.
- Template Dockerfile builder checkpoint on 2026-05-24: `pnpm typecheck`,
  `pnpm test`, `pnpm build`, `git diff --check`, and
  `pnpm smoke:template-build` passed after deploying the Kaniko-based k0s
  builder.
- Rootless BuildKit default checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/api build`,
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/sdk test`,
  `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/web test`,
  `pnpm typecheck`,
  `bash -n infra/scripts/template-build-smoke.sh`,
  `git diff --check`,
  and `pnpm smoke:template-build` passed after redeploying API image
  `sha256:3e4ce24870a9f37435ae543f43026401083b6c42fc46a312ad5b5a695c6bb321`.
  The smoke created build `bld_61ukPTP4u_EF`, version
  `tplv_e-Xyjz2FiZEt`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_Vf-5JG5-U8`; the launched sandbox returned
  `harakiri-built`. The smoke also asserted
  `template_builds.metadata.builder = buildkit`,
  `template_builds.metadata.builderDetails.provider = buildkit`, runtime pull
  preflight `status = ok`, and builder Job/Pod/node metadata. Follow-up
  cleanup audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `templates_named_smoke=0`.
- Sandbox renew and OpenSandbox transport-split checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test` reported 133/133 passing, `pnpm --filter
  @harakiri/api typecheck`, `pnpm openapi:check`, `bash -n
  infra/scripts/renew-smoke.sh`, and `git diff --check` passed after aligning
  Harakiri renew with the current OpenSandbox `/renew-expiration` contract and
  splitting the OpenSandbox provider into client, execd, files, logs, metrics,
  routes, types, and facade modules. `deploy-k0s.sh` rolled the API to pod
  `harakiri-api-64f95d457d-dg6l5`; the registry manifest digest was
  `sha256:2092d5d8655daea6a262b4c53f00179a0f3d61fdf7d5007a2ffaee60809da793`
  and the pod image ID was
  `sha256:66847f882e1c4967e81b7f1877b55013c47a5fc7f32074a530084f2d46472ce8`.
  `pnpm smoke:renew` passed with sandbox `sbx_sbvBX7hsBO` and latest renew
  operation `succeeded` with `expiresAt=2026-05-24T22:01:28.361Z`; `pnpm smoke`
  passed with sandbox `sbx_FgPGFJbKgS`; `pnpm smoke:route` passed with sandbox
  `sbx_fCL_SdS6jO` and route
  `https://61469404-5306-4bc4-9a12-d6d307bc5ba4-3000.harakiri.io`; and a live
  runtime-panel API probe passed with sandbox `sbx_RKPnWkAAGV`, reporting
  `files=12 cwd=/`, `logs=15`, and `metrics_cpu=2 metrics_mem=2362`. Follow-up
  cleanup audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `ready_routes=0`.
- Sandbox lifecycle synchronous-interface checkpoint on 2026-05-24: after
  strengthening `tests/e2e/harakiri.spec.ts`, `pnpm --filter @harakiri/cli
  build`, `git diff --check -- tests/e2e/harakiri.spec.ts`, and
  `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright test
  tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox workflows"`
  passed against the deployed k0s stack. The e2e now asserts Web create lands
  on a running detail page, API default create returns `201` with no pending
  operation, CLI default create prints `sealed.` and not `queued.`, and SDK
  default create returns a running sandbox with no pending operation. Cleanup
  audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `running_real_e2e=0`; latest real-flow sandboxes were
  `sbx_1N2qvnovDG` (web), `sbx_RuQeZB0DHn` (CLI), and `sbx_iR508mdojC` (SDK),
  all terminated.
- Authenticated web modularization checkpoint on 2026-05-24: the same deployed
  Web/API/CLI/SDK e2e was extended to cover sandbox detail runtime tabs,
  filesystem/default-root behavior, logs, metrics API data, network empty
  state, templates List/Builds tabs, and docs navigation across Quickstart,
  Template builds, and API reference. The targeted command
  `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright test
  tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox workflows"`
  passed with 1/1 tests. Screenshots were saved at
  `/tmp/harakiri-auth-runtime-tabs.png`,
  `/tmp/harakiri-auth-template-tabs.png`, and
  `/tmp/harakiri-auth-docs.png`; visual review confirmed the extracted routes
  still use the existing centralized design tokens and restrained product UI.
  Follow-up checks passed: `pnpm --filter @harakiri/web test` reported 10/10,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/web
  build`, and `git diff --check`. Cleanup audit reported
  `active_sandboxes=0`, `active_smoke_keys=0`, and `running_real_e2e=0`.
- OSS documentation and governance checkpoint on 2026-05-24: added
  `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `.github/pull_request_template.md`, bug/feature issue templates,
  `docs/README.md`, `docs/development.md`, and `docs/extensions.md`; package
  manifests now declare `Apache-2.0`. `README.md` now leads with the portable
  OSS contributor path, the core runbook links out to
  `infra/scripts/env/harakiri/README.md` for maintainer Cloudflare/DNS details,
  and website docs now show packaged CLI installation plus the published
  `/openapi.json` contract. Verification passed:
  `pnpm --filter @harakiri/web test` (10/10),
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/cli test` (24/24),
  `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/sdk test` (7/7),
  `pnpm --filter @harakiri/api test` (133/133),
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/shared test` (5/5),
  `pnpm openapi:check`, `pnpm build`, and `git diff --check`.
- Phase 10 route portability checkpoint on 2026-05-24: route host/key/url
  generation now lives in `apps/api/src/providers/runtime/route-targets.ts`.
  The OpenSandbox route helper, sandbox runtime fallback path, operation-worker
  fallback path, and development runtime provider all use the configured
  `SANDBOX_ROUTE_BASE_DOMAIN` and `SANDBOX_ROUTE_PUBLIC_SCHEME` instead of
  duplicating `sandbox.localhost`. Verification passed:
  `pnpm --filter @harakiri/api test` (135/135),
  `pnpm --filter @harakiri/api typecheck`, and targeted `git diff --check`.
- Phase 10 legacy-builder reference audit on 2026-05-24: `rg` found no Kaniko
  mentions in `apps/web`, `packages/cli`, `packages/sdk`, or
  `packages/shared`. Remaining references are scoped to the legacy builder
  implementation/tests, compatibility configuration, ADR/plan history,
  legacy-provider documentation, or historical test-report evidence. Corrected
  the BuildKit source path in `docs/extensions.md` to
  `apps/api/src/builders/buildkit-kubernetes-builder.ts`.
- Phase 10 deployed regression checkpoint on 2026-05-24:
  `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm openapi:check`, and
  `git diff --check` passed. k0s redeploy passed with
  `HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS=0 HARAKIRI_INSTALL_INGRESS_NGINX=0
  bash infra/scripts/deploy-k0s.sh`; API image
  `sha256:670f907f96ed4f2070706f9580ec56401c6cae81c9fc1625ff3cd68e7aaf66de`
  and web image
  `sha256:dcb9a80459c7dddb8490a220635715a37e4db807231e48a2c60475c55ff2869e`
  rolled out. `pnpm ports:restart && pnpm ports:status` reported web, API,
  Keycloak, OpenSandbox, gateway, and ingress HTTPS forwards ready. Live
  ConfigMap values were `PUBLIC_API_URL=http://127.0.0.1:18082`,
  `PUBLIC_KEYCLOAK_URL=http://127.0.0.1:18084`,
  `SANDBOX_ROUTE_BASE_DOMAIN=sandbox.localhost`, and
  `SANDBOX_ROUTE_PUBLIC_SCHEME=https`; wildcard ingress host/TLS were
  `*.sandbox.localhost`.
- Phase 10 live product smokes on 2026-05-24:
  `pnpm smoke` created `sbx_ms9bGwboGN`, executed the Python agent command,
  and killed it; `pnpm smoke:templates` passed for `python-3.12`,
  `python-3.12-data`, and `node-20`; `pnpm smoke:route` exposed
  `https://cbc614c8-63df-407c-abdb-ac50375e9402-3000.sandbox.localhost`;
  `pnpm smoke:template-build` passed with build `bld_0GaloDk6IN3h`, version
  `tplv_qu36CRNsUYSv`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_B43UISTgxk`; `pnpm e2e` passed 2/2 tests for the full
  Web/API/CLI/SDK workflow and completed-user onboarding redirect; and
  `pnpm smoke:route-ingress` exposed
  `https://5873bb35-1b4a-4a10-85fb-6086a88bbf5c-3000.sandbox.localhost`
  through local ingress HTTPS. Cleanup audit reported `active_sandboxes=0`,
  `active_smoke_keys=0`, `ready_routes=0`, and `active_template_builds=0`.
- Phase 9 local OSS contributor proof on 2026-05-24: `docker compose config`
  passed after making PostgreSQL and Keycloak host ports overrideable.
  `LOCAL_KEYCLOAK_PORT=18181 docker compose up -d keycloak` started Keycloak
  with the committed realm import, and
  `http://127.0.0.1:18181/realms/harakiri/.well-known/openid-configuration`
  returned the imported realm metadata; the temporary Keycloak service was then
  stopped. `pnpm db:migrate` and `pnpm db:seed` passed against local
  PostgreSQL, seeding `lyra@k.ai`, the `Lyra Labs` workspace, and demo API key
  `hk_live_demo_lyra_labs_0000000000000000000000000000000000`. A local API
  started with `HARAKIRI_RUNTIME_PROVIDER=dev` accepted the seeded key; from a
  clean temporary home the packaged CLI created sandbox `sbx_IaoHRjGptl`, ran
  `echo local-dev-ok`, exposed port 3000 at
  `http://dev-mpkdozdg-ddiwxg-3000.local-dev.test`, listed routes, and killed
  the sandbox. Local cleanup reported `local_active_sandboxes=0` and
  `local_demo_keys=1`.
- Phase 9 docs-audience audit on 2026-05-24: removed the private absolute
  template path from active docs, changed product and CLI examples to local
  OSS defaults (`127.0.0.1:8080`) or `$HARAKIRI_API_URL`, and confirmed active
  product docs/package help no longer contain the removed comparison target,
  the stale database-centered control-plane phrase, or private paths. Remaining
  `127.0.0.1:18082`, `harakiri.io`, Cloudflare, and legacy-builder references
  are historical test evidence, runbook/deployment examples, completed plans,
  legacy-provider docs, or maintainer environment docs.
- Post-update focused verification on 2026-05-24: `pnpm --filter
  @harakiri/web test` passed 10/10, `pnpm --filter @harakiri/web typecheck`
  passed, `pnpm --filter @harakiri/cli test` passed 24/24, `pnpm --filter
  @harakiri/cli typecheck` passed, `pnpm build` passed across shared, API,
  web, SDK, and CLI packages, `docker compose config` passed, and
  `git diff --check` passed.
- OSS architecture refactor closeout on 2026-05-25: `pnpm test`,
  `pnpm typecheck`, `pnpm openapi:check`, `pnpm build`, `pnpm cli:pack`,
  `docker compose config`, and `git diff --check` passed. The current tree was
  redeployed to k0s with API image
  `sha256:61830fb760d6edcbd5187520e57ac37708848e51360c4e3d0a6b8f7f9b173bd3`
  and web image
  `sha256:770e6482c3555a04827e12e5851f9064d7ee418e55dfdca5ed855511b4fc9ac9`;
  `pnpm ports:restart && pnpm ports:status` reported web, API, Keycloak,
  OpenSandbox, gateway, and ingress HTTPS forwards ready. `pnpm smoke` created
  `sbx_aaHbDz1GNn`, ran the Python agent command, and killed it.
  `pnpm smoke:templates` passed for `python-3.12`, `python-3.12-data`, and
  `node-20`. `pnpm smoke:route` exposed
  `https://9c737267-4d96-42a7-8208-cb4c715b8120-3000.sandbox.localhost`.
  `pnpm smoke:template-build` passed with build `bld_8HI6em_S-xzc`, version
  `tplv_a5jCB8lXdOSG`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_kRFu4TEK2M`; the launched sandbox returned
  `harakiri-built`. `pnpm e2e` passed 2/2 tests for Web/API/CLI/SDK workflows
  and completed-user onboarding redirect. `pnpm smoke:route-ingress` exposed
  `https://b6b37639-0944-480d-b043-2301e59de8fd-3000.sandbox.localhost`
  through local ingress HTTPS. Cleanup audit reported `active_sandboxes=0`,
  `active_smoke_keys=0`, `ready_routes=0`, and `active_template_builds=0`.
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
- Template retention checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed after
  adding scheduler-owned template retention. `pnpm deploy:k0s` rolled out the
  API, scheduler, template builder, and web app; `pnpm ports:restart &&
  pnpm ports:status` restored local access.
- Deployed retention smoke on 2026-05-24: temporary PostgreSQL rows older than
  the configured retention windows were inserted for a disposable organization,
  then the deployed API pod ran `cleanupTemplateRetention()` with builder Job
  deletion disabled. The cleanup report was
  `{"logsDeleted":1,"contextsDeleted":1,"buildsDeleted":1,"versionsRetired":1,"builderJobsDeleted":0}`.
  Follow-up SQL verified the old unversioned build, log, and context were gone,
  the superseded version status was `retired`, and one
  `template.version.retired` audit event existed. The disposable organization
  was deleted afterward.
- Product docs retention smoke on 2026-05-24: a Playwright check opened the
  deployed website at `http://127.0.0.1:15173/#docs`, selected "Template
  builds", verified the Retention section text, and saved
  `/tmp/harakiri-retention-docs.png`.
- Post-retention template build smoke on 2026-05-24: `pnpm smoke:template-build`
  passed against the deployed k0s stack, creating build `bld_E0rhiglTbrCx`,
  version `tplv_qnkIri-5FYCJ`, digest
  `sha256:74b5a99102c137e706c8e064199e9894973a3bb51560a028626bcdd0537b4db3`,
  and sandbox `sbx_qHouzeA-Dq`.
- Runtime pull preflight checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/web build`,
  `pnpm typecheck`, `pnpm test`, and `git diff --check` passed after adding
  the builder preflight Pod. `pnpm deploy:k0s` rolled out API, web, scheduler,
  and template builder images plus RBAC for the Harakiri service account to
  create/delete preflight Pods in the OpenSandbox runtime namespace. Deployed
  config reported
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED=1`,
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE=opensandbox`, and
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS=120000`; `kubectl auth can-i`
  returned `yes` for create pods, delete pods, and get pods/status in the
  `opensandbox` namespace, and `no` for create pods in the `harakiri`
  namespace, as `system:serviceaccount:harakiri:default`.
- Post-preflight template build smoke on 2026-05-24:
  `pnpm smoke:template-build` passed with build `bld_VNGckePUvF_i`, version
  `tplv__g0ItmjuEE3z`, digest
  `sha256:3e5084353510446f3a5d550132273f29a728508d1e059a0596b6742fb3581074`,
  and sandbox `sbx_ql4sfPZSmV`. The streamed build logs included
  `runtime image pull preflight ok in 2077ms`, and the smoke asserted
  `template_builds.metadata.runtimePullPreflight.status = ok`,
  `namespace = opensandbox`, and preflight Pod/node metadata.
- Product docs preflight smoke on 2026-05-24: a Playwright check opened
  `http://127.0.0.1:15173/#docs`, clicked the Template builds and Security
  model docs, verified both mention runtime pull preflight, and saved
  `/tmp/harakiri-preflight-docs.png`.
- Sandbox regression smoke on 2026-05-24: after the template preflight
  deployment, `pnpm smoke` created `sbx_ENlDwrI3qj`, executed the Python agent
  command through OpenSandbox, and killed the sandbox. `pnpm smoke:ttl` created
  `sbx_d8LhpQkS8o` with a 10 second TTL and observed it transition to
  `terminated`. `pnpm smoke:route` exposed
  `https://72658c1d-9ca6-40ee-884d-7b178df4a678-3000.harakiri.io` through the
  OpenSandbox gateway. `pnpm smoke:route-ingress` exposed
  `https://94c8c578-af36-4450-a990-e9e14650a224-3000.harakiri.io` through
  ingress HTTPS.
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
- Deployed template API integration smoke on 2026-05-24:
  `pnpm smoke:template-audit` passed with template `audit-smoke-1779603932`,
  build `bld_xIOr1b4m2RiA`, and sandbox `sbx_NileGT1paz`. The smoke verified
  template create/get/versions, sandbox creation by immutable template version
  ID with `sandbox.templateVersionId = tplv_pqARiMBCZ6D4`, build
  create/cancel/get/list/logs, promote alias resolution, archive behavior, and
  audit events.
- Repo docs link audit on 2026-05-24: the README links were expanded to the
  full template contributor/operator doc set, and
  `for path in docs/templates.md docs/template-builds.md docs/template-security.md docs/template-runtime-contract.md docs/api.md docs/architecture.md docs/runbook.md docs/test-report.md; do test -f "$path" || exit 1; done`
  printed `template repo docs links exist`.
- `pnpm smoke:templates` passed after the retention deployment, proving
  `python-3.12`, `python-3.12-data`, and `node-20` catalog templates still
  create, execute a version command, and terminate through the live
  OpenSandbox-backed path.
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
- Template limits checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status`
  passed after adding configurable template resource limits and per-organization
  queued/building build concurrency limits. `pnpm smoke:template-limits`
  verified over-limit CPU returned `422 template_resource_limit_exceeded` with
  limit `8`, three queued Dockerfile builds were accepted, and the fourth build
  returned `429 template_build_concurrency_limit_exceeded` with active count
  `3`.
- Post-limit regression smokes on 2026-05-24: `pnpm smoke:template-redaction`
  passed with build `bld_PYEGkI934RcB`; `pnpm smoke:template-build` passed with
  build `bld_fdydiFPTsvZg`, version `tplv_kfXM0H0snjT3`, digest
  `sha256:66fe5dffdeadfbac577aaef63ef0deb4eecfe6fc85aa931122441530ac973d19`,
  sandbox `sbx_bSLg9hGTt_`, and command output `harakiri-built`.
- Product docs browser checkpoint on 2026-05-24: a Playwright browser smoke
  opened `http://127.0.0.1:15173/#docs`, verified the Template Builds and
  Security Model pages render the new Limits guidance with no console errors,
  and wrote `/tmp/harakiri-template-limits-docs.png`.
- Post-limit cleanup audit on 2026-05-24: PostgreSQL reported no active
  `smoke-*` API keys, no running/pending/idle sandboxes, no `limits-smoke-*`,
  `redaction-smoke-*`, or `kaniko-smoke-*` templates, and no residual
  `runtime-kaniko-smoke-*` sandbox rows.
- Template image policy checkpoint on 2026-05-24: `pnpm test`, `pnpm
  typecheck`, `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm
  ports:status` passed after adding registry/prefix policy for template images,
  image-import targets, and Dockerfile `FROM` references. `pnpm
  smoke:template-policy` verified a disallowed template image and a disallowed
  Dockerfile base image both returned `422 template_image_policy_violation`
  with `registry_not_allowed`; the run used build `bld_RXxlQudffuo0`.
- Post-policy allowed-build regression on 2026-05-24: `pnpm
  smoke:template-build` passed with build `bld_LOP9MXjryOLD`, version
  `tplv_o1T_F2_bs-nW`, digest
  `sha256:a8dcfb032b3a289e7f9fae262c6a1cbd91fd343e6788caf0236a31cfeaedd7af`,
  sandbox `sbx_ECcuvjlpOu`, and command output `harakiri-built`.
- Product docs image-policy browser checkpoint on 2026-05-24: a Playwright
  browser smoke opened `http://127.0.0.1:15173/#docs`, verified the Template
  Builds and Security Model pages render the new image-policy guidance with no
  console errors, and wrote `/tmp/harakiri-template-image-policy-docs.png`.
- Post-policy cleanup audit on 2026-05-24: PostgreSQL reported no active
  `smoke-*` API keys, no running/pending/idle sandboxes, no
  `image-policy-smoke-*` or `kaniko-smoke-*` templates, and no residual
  `runtime-kaniko-smoke-*` sandbox rows.
- Runtime metadata checkpoint on 2026-05-24: `pnpm test`, `pnpm typecheck`,
  `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status`
  passed after expanding OpenSandbox metadata. `pnpm smoke` created
  `sbx_knECzNSYRt`, executed the Python agent command successfully, and killed
  the sandbox. The latest `sandbox.create` audit row stored
  `templateId=python-3.12-data`, `templateVersionId=tplv_python_3_12_data_1`,
  `routePolicy.mode=opensandbox-gateway`, and
  `routePolicy.baseDomain=harakiri.io`. A Playwright docs smoke verified the
  deployed Security Model page renders the runtime metadata guidance with no
  console errors and wrote `/tmp/harakiri-runtime-metadata-docs.png`.
- Post-runtime-metadata cleanup audit on 2026-05-24: PostgreSQL reported no
  active `smoke-*` API keys, no running/pending/idle sandboxes, and no active
  routes.
- Template provenance checkpoint on 2026-05-24: `pnpm test`, `pnpm typecheck`,
  `pnpm build`, `bash -n infra/scripts/template-build-smoke.sh`, and
  `git diff --check` passed after adding SBOM/provenance and scan-status fields
  to `template_versions`. After the final direct-create provenance redaction
  change, API-scoped typecheck, tests, and build also passed. `pnpm deploy:k0s`
  rolled out the migration and final API image, then
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy.
  `pnpm smoke:template-build` produced build `bld_Irc5TpBi26Pr`, version
  `tplv_KXoCKfSfB7KW`, digest
  `sha256:275e67e72da65df11fc9840be2e09f88ca36b38872811f78b144cbf6c5783537`,
  sandbox `sbx_uPuW837AWL`, and command output `harakiri-built`. The smoke also
  verified PostgreSQL stored `scan_status=not_scanned`,
  `provenance.buildId=bld_Irc5TpBi26Pr`, and
  `scan_summary.reason=scanner_not_configured`.
- Template provenance regression checkpoint on 2026-05-24: `pnpm smoke` passed
  after the same deployment, creating `sbx_JIHJDrCu7_`, running the Python agent
  command, and killing the sandbox. A Playwright browser smoke opened
  `http://127.0.0.1:15173/#docs`, selected "Security model", verified the
  deployed product docs include "Provenance" and `scanner_not_configured`, and
  wrote `/tmp/harakiri-version-provenance-docs.png`.
- Post-provenance cleanup audit on 2026-05-24: PostgreSQL reported
  `security_columns=4`, no active smoke API keys, no running/pending/idle
  sandboxes, no `kaniko-smoke-*` templates, no `runtime-kaniko-smoke-*` sandbox
  rows, and `ready_routes=0`.
- Template audit/archive checkpoint on 2026-05-24: `pnpm test`, `pnpm
  typecheck`, `pnpm build`, `bash -n infra/scripts/template-audit-smoke.sh`,
  and `git diff --check` passed after adding shared audit recording, template
  archive lifecycle handling, CLI/SDK archive support, and repo/product docs.
  After the final dashboard Archive gating change, `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, and
  `git diff --check` also passed. `pnpm deploy:k0s` rolled out the changes and
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy.
- Template audit/archive smoke on 2026-05-24: `pnpm smoke:template-audit`
  created template `audit-smoke-1779592676`, version `tplv_LEDIGAz8ZIMP`,
  sandbox `sbx_xakrl7ZAyp`, and build `bld_7cElfT0xdNqG`; it verified
  `template.create`, `sandbox.create`, `template.build.create`,
  `template.build.cancel`, `template.promote`, and `template.archive` audit
  actions, confirmed archived templates are hidden from active lists, and
  confirmed archived aliases cannot create new sandboxes.
- Template builder audit regression on 2026-05-24: `pnpm smoke:template-build`
  created build `bld_OX0O6AhycXhu`, version `tplv_vlbIfShYV_0l`, digest
  `sha256:8df8e8c8192981c9462fa34c50e13d01b9b8b1094756ffcdd154fa3775622de0`,
  and sandbox `sbx_PJOkPeRHEh`; `harakiri run` returned `harakiri-built` and
  the smoke verified the `template.build.success` audit event points at the
  produced version.
- Template archive UI/docs browser checkpoint on 2026-05-24: a Playwright smoke
  created `ui-archive-1779592978983`, verified the deployed Templates List can
  archive a private active template, verified the archived row appears only
  under the Archived filter with Use/Build disabled and no Archive action, and
  wrote `/tmp/harakiri-template-archive-ui.png`. The same browser run verified
  the website docs include the Template Builds archive workflow, Security Model
  audit wording, and API Reference `/v1/templates/:id/archive`, then wrote
  `/tmp/harakiri-template-audit-docs.png`.
- Post-audit/archive cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `smoke_templates=0`,
  `runtime_smoke_rows=0`, and `ready_routes=0`.
- Template List actions checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, and
  `git diff --check` passed after adding deployed dashboard row actions for
  Builds and Promote plus matching repo and website docs. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, and a Playwright browser smoke created `ui-actions-1779593529748`
  with canceled build `bld_kVqM5iyPSoMI`. The smoke verified Builds opens the
  Builds tab filtered to the template, Promote records a `template.promote`
  audit event, and the product docs describe the row actions. Screenshots:
  `/tmp/harakiri-template-list-actions.png` and
  `/tmp/harakiri-template-actions-docs.png`.
- Post-Template-List-actions cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_action_templates=0`, and
  `ready_routes=0`.
- Template List filters checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/shared build`, `pnpm typecheck`, `pnpm --filter @harakiri/web
  build`, `pnpm test`, and `git diff --check` passed after adding API-backed
  owner (`team`/`platform`), runtime family, and active/archived status filters
  to the Templates List. `pnpm deploy:k0s` completed and `pnpm ports:restart &&
  pnpm ports:status` reported every forward healthy. A Playwright browser smoke
  created `ui-filters-1779593948515`, verified `GET /v1/templates` with
  `owner=team&runtimeFamily=custom`, verified the deployed UI filters show the
  team/custom row, hide it under the Platform owner filter, and reveal it again
  under the Archived status after archive. It also verified website docs mention
  visibility, owner, runtime family, and active/archived filtering. Screenshots:
  `/tmp/harakiri-template-list-filters.png` and
  `/tmp/harakiri-template-filters-docs.png`.
- Post-Template-List-filters cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_filter_templates=0`, and
  `ready_routes=0`.
- Template/build metadata table checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/shared build`, `pnpm typecheck`, `pnpm test`, `pnpm --filter
  @harakiri/web build`, and `git diff --check` passed after adding latest build
  status, created timestamp, explicit alias columns, build result version
  fields, and build context summaries. `pnpm deploy:k0s` completed and `pnpm
  ports:restart && pnpm ports:status` reported every forward healthy. A
  Playwright/API smoke created template `ui-meta-1779594902549`, uploaded a
  Dockerfile context for `bld_LjMrhI1CYoDA`, completed image-import build
  `bld_i-8y61uOvxoL`, verified result version `tplv_Tlcw9WJ8AnFD`, validated
  context summary metadata, and verified the deployed Templates List/Builds
  tables plus product docs. Screenshots:
  `/tmp/harakiri-template-metadata-tables.png` and
  `/tmp/harakiri-template-metadata-docs.png`.
- Post-template/build metadata cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_meta_templates=0`, and
  `ready_routes=0`.
- Kubernetes builder runtime metadata checkpoint on 2026-05-24: `pnpm
  typecheck`, `pnpm test`, `pnpm --filter @harakiri/web build`, and `git diff
  --check` passed after persisting Dockerfile builder Job, Pod, Pod UID,
  namespace, and node metadata on successful build records. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, and `pnpm smoke:template-build` passed with build
  `bld_NU6OGPcV7SCW`, version `tplv_QOyx33J2Y_0M`, and sandbox
  `sbx_2WxfrtOc7G`. The smoke now asserts that `template_builds.metadata`
  contains non-empty `builderJobName`, `builderPodName`, and `builderNodeName`.
- Post-builder-runtime-metadata cleanup audit on 2026-05-24: PostgreSQL
  reported `active_smoke_keys=0`, `live_sandboxes=0`,
  `kaniko_smoke_templates=0`, and `ready_routes=0`.
- Template visibility authorization checkpoint on 2026-05-24: `pnpm
  --filter @harakiri/shared build`, `pnpm typecheck`, `pnpm test`, `pnpm
  --filter @harakiri/web build`, and `git diff --check` passed after adding an
  explicit read policy for organization-owned templates plus platform
  `public`/`internal` templates, denying platform `private` templates, and
  blocking build/promote mutations on shared platform templates. `pnpm
  deploy:k0s` completed, `pnpm ports:restart && pnpm ports:status` reported
  every forward healthy, `pnpm smoke:template-visibility` passed with
  `visibility-owned-1779596359` and build `bld_NWrlPdTBm7LY`, and `pnpm
  smoke:templates` passed for `python-3.12`, `python-3.12-data`, and `node-20`.
- Post-template-visibility cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `visibility_templates=0`,
  `ready_routes=0`, and `custom_visibility=internal`.
- Product docs deploy checkpoint on 2026-05-24: `pnpm deploy:k0s` completed,
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy, and
  a Playwright smoke check verified the deployed Docs pages mention
  `--no-wait`, the default build-log follow behavior, and the Template Builds
  status guidance with no console errors.
- Default template catalog checkpoint on 2026-05-24: `pnpm smoke:templates`
  passed against k0s, creating/running/killing `python-3.12`
  (`sbx_5mfgKWOHyk`, `python --version` -> `Python 3.12.13`),
  `python-3.12-data` (`sbx_IDjCpAZASD`, `python --version` ->
  `Python 3.12.13`), and `node-20` (`sbx_-wVMcJAiJV`,
  `node --version` -> `v20.20.2`). A failed intermediate script run had already
  killed its sandbox but left a temporary smoke API key; it was revoked through
  the API. Post-test audit showed no active `smoke-*` API keys, `running_sandboxes=0`,
  and `ready_routes=0`.
- Dashboard New Template checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, `pnpm
  typecheck`, `pnpm test`, and `git diff --check` passed after adding the
  dashboard New Template modal, browser Dockerfile tar+gzip upload, image
  import flow, clone/fork flow, `harakiri.toml` preview, and product/repo docs.
  `pnpm deploy:k0s` completed, `pnpm ports:restart && pnpm ports:status`
  reported every forward healthy, and a Playwright dashboard smoke logged in
  through Keycloak at `http://127.0.0.1:15173`, created templates from
  Dockerfile, existing image, and clone modes, waited for the queued builds,
  created and ran a sandbox from the Dockerfile-created template, verified the
  website docs mention New Template and `harakiri.toml`, and wrote
  `/tmp/harakiri-new-template-dashboard.png`. A subsequent `pnpm
  smoke:templates` rerun passed for `python-3.12`, `python-3.12-data`, and
  `node-20` after an earlier transient `fetch failed` run left a sandbox that
  was explicitly killed.
- Post-dashboard-New-Template cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_new_templates=5`,
  `ui_new_active_templates=0`, and `ready_routes=0`. The `ui_new_templates`
  rows are archived build-history records from the dashboard smoke.
- Template failure UX checkpoint on 2026-05-24: `pnpm --filter @harakiri/web
  typecheck`, `pnpm --filter @harakiri/web build`, `pnpm typecheck`, `pnpm
  test`, `pnpm --filter @harakiri/cli build`, and `git diff --check` passed
  after adding dashboard build/log loading states, classified failed-build
  panels, user-facing template troubleshooting docs, and runbook commands for
  builder health, failed pulls, and local registry cleanup. `pnpm deploy:k0s`
  completed and `pnpm ports:restart && pnpm ports:status` reported every
  forward healthy. A Playwright smoke created a `ui-fail-*` image-import build
  against a nonexistent Docker Hub image, waited for the real builder to mark it
  `failed`, selected it in the deployed Builds tab, verified the dashboard
  showed "Registry lookup failed", retained log text, and linked to "Template
  troubleshooting", then wrote `/tmp/harakiri-build-failure-ui.png`. A CLI smoke
  created `cli-fail-1779598270`, build `bld_ghJk7Vmm_o3i`, streamed the
  retained registry error, and exited non-zero with `template build
  bld_ghJk7Vmm_o3i failed: registry did not return a sha256 digest...`.
  `pnpm smoke:templates` also passed after the deployment for `python-3.12`,
  `python-3.12-data`, and `node-20`.
- Post-template-failure-UX cleanup audit on 2026-05-24: PostgreSQL reported
  `active_failure_keys=0`, `live_sandboxes=0`, `ui_fail_active_templates=0`,
  `cli_fail_active_templates=0`, `failed_smoke_builds=5`, and
  `ready_routes=0`. The failed smoke builds are retained archived history for
  failure inspection.
- Template detail checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed after
  adding the dashboard Template detail panel, `GET /v1/template-builds` exact
  `template` filtering, `GET /v1/sandboxes` `template`/`templateVersionId`
  filtering, repo docs, and website product docs. `pnpm deploy:k0s` completed,
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy,
  and deployed API checks against `open-agents-dev` returned one template,
  3 versions, 3 filtered builds, and 2 filtered sandbox runs. An agent-browser
  smoke logged into `http://127.0.0.1:15173` with the Keycloak token, opened the
  deployed Templates page, selected `open-agents-dev`, and verified the Overview
  tab create command and SDK snippet, the Versions tab immutable version data,
  the Config tab generated `harakiri.toml`/redacted build metadata, the Runs tab
  sandbox history, and the website docs. Screenshots:
  `/tmp/harakiri-template-detail-dashboard.png` and
  `/tmp/harakiri-template-detail-runs.png`.
- CLI command test checkpoint on 2026-05-24: `pnpm --filter @harakiri/cli test`
  passed with command-level coverage for `harakiri template build` payloads
  from `harakiri.toml`, image-import build payloads, Dockerfile context upload
  metadata, retained `harakiri template logs` output, and failed build output
  that streams retained logs before exiting non-zero. No website product docs
  changed in this checkpoint because the user-facing CLI behavior was not
  changed.
- CLI help checkpoint on 2026-05-24: `pnpm --filter @harakiri/cli test`,
  `pnpm typecheck`, and
  `pnpm --filter @harakiri/cli exec tsx src/index.ts template build --help`
  passed after adding `harakiri template --help` and `harakiri template build
  --help` examples for init, Dockerfile builds, image imports, build listing,
  promotion, and detached `--no-wait` builds. The help examples match the
  existing README, dedicated Markdown docs, and website product docs examples.
  No website product docs changed in this checkpoint because the documented
  workflow copy already contained the same command names and flags.
- Template scanner hook checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm
  test`, `pnpm --filter @harakiri/web build`, `pnpm deploy:k0s`, `pnpm
  ports:restart && pnpm ports:status`, and `pnpm smoke:template-build` passed
  after adding the optional `TEMPLATE_SCANNER_WEBHOOK_URL` builder hook. The
  smoke produced build `bld_8EAfbnWbvoV9`, version `tplv_Jl5kCn_xal5b`, digest
  `sha256:5a48302ec1196d01aa6cd6d2c277867c27e5efd0770b76b4370dd43b1dd4928f`,
  sandbox `sbx_oUHwUPAzGR`, command output `harakiri-built`, and verified the
  default `scan_status=not_scanned` / `scanner_not_configured` path still works
  when no scanner webhook is configured. A deployed docs browser smoke opened
  `http://127.0.0.1:15173/#docs`, selected "Security model", verified
  "scanner webhook" and `scan_failed` render with no console errors, and wrote
  `/tmp/harakiri-scanner-docs.png`.
- Template UI screenshot checkpoint on 2026-05-24: `pnpm screenshots` passed
  after adding Playwright coverage for the deployed Templates List, Template
  detail panel, Builds tab, Build details panel, New Template modal, and
  mobile/narrow Templates layouts. New artifacts:
  `docs/artifacts/13-templates-list-desktop.png`,
  `docs/artifacts/14-template-detail-desktop.png`,
  `docs/artifacts/15-template-builds-desktop.png`,
  `docs/artifacts/16-template-build-detail-desktop.png`,
  `docs/artifacts/17-new-template-desktop.png`,
  `docs/artifacts/18-templates-mobile.png`, and
  `docs/artifacts/19-new-template-mobile.png`. No website product docs changed
  in this checkpoint because the product behavior and copy were not changed;
  this was automated visual evidence for the existing Templates UI.
- Template operator-docs checkpoint on 2026-05-24: `docs/runbook.md` now
  documents the current k0s local registry configuration, the intended
  production registry credential split, external registry rollout steps,
  builder cleanup commands, and a troubleshooting matrix for queued builds,
  Kaniko failures, registry digest lookup failures, runtime pulls, and registry
  disk growth. No website product docs changed because this checkpoint is
  operator-only guidance and does not change user-facing behavior.
- Template redaction checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm deploy:k0s`, `pnpm ports:restart && pnpm ports:status`,
  and `pnpm smoke:template-redaction` passed after adding API redaction for
  secret-shaped build args, metadata, retained build logs, and build errors.
  The deployed smoke created build `bld_B7u6wYY8ZjiC` with
  `registry_password=super-secret`, `apiToken=hk_test_should_not_survive`, and
  `x-api-key: hk_test_nested`; API create/get responses and PostgreSQL retained
  only `[redacted]` markers. Cleanup removed the temporary template and API key;
  post-test audit showed no active `smoke-*` keys, no `redaction-smoke-*`
  templates, `running_sandboxes=0`, and `ready_routes=0`.
- Template registry credentials and namespace checkpoint on 2026-05-24:
  documentation: code docs changed in `README.md`, `docs/api.md`,
  `docs/architecture.md`, `docs/runbook.md`, `docs/template-builds.md`, and
  `docs/template-security.md`; product docs changed in the website Docs route
  inside `apps/web/src/main.tsx`. Verification: `pnpm --filter @harakiri/api
  typecheck`, `pnpm --filter @harakiri/api test` (48 tests), `pnpm --filter
  @harakiri/web build`, and `git diff --check` passed. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, the deployed ConfigMap reported
  `TEMPLATE_REGISTRY_REPOSITORY_PREFIX=harakiri/templates` and
  `TEMPLATE_REGISTRY_CREDENTIAL_KEY=harakiri-local-registry-credential-key`,
  and PostgreSQL contained migration
  `012_template_registry_credentials_controls.sql`. `pnpm
  smoke:template-registry-credentials` passed with credential
  `cc0bde8d-8c04-4cac-8620-8ef2884022bf`, verifying encrypted secret storage,
  redacted API responses, list/delete behavior, and registry credential audit
  events. `pnpm smoke:template-build` passed with build `bld_wSmwLpZlJNjq`,
  version `tplv_FkWBYhRSMz6Z`, digest
  `sha256:48772ba2dd5a3b00ed3cc98c2db21f6b1d6376fe4a39917016a746777f6692f9`,
  and sandbox `sbx_7L97fWy7c7`; Kaniko pushed to
  `harakiri/templates/org-20d5e937-4664-4e9e-869c-f12c33e3e46c/...`, runtime
  pull preflight succeeded in 1039ms, and the sandbox returned
  `harakiri-built`. A deployed website docs smoke opened
  `http://127.0.0.1:15173/#docs`, verified "Security model" and "API
  reference" include encrypted registry credential records, the
  organization-scoped registry namespace, `/v1/registry-credentials`,
  `hasEncryptedSecret`, and `lastUsedAt`, then wrote
  `/tmp/harakiri-registry-credentials-docs.png`.
- Runtime env and OpenSandbox image-auth checkpoint on 2026-05-24:
  documentation: code docs changed in `README.md`, `docs/api.md`,
  `docs/architecture.md`, `docs/runbook.md`,
  `docs/template-runtime-contract.md`, `docs/template-security.md`,
  `packages/cli/README.md`, and `packages/sdk/README.md`; product docs changed
  in the website Docs route inside `apps/web/src/main.tsx`. Verification:
  `pnpm --filter @harakiri/api test` passed 49 tests, including OpenSandbox
  request-body coverage for `env` and `image.auth`;
  `pnpm --filter @harakiri/cli test` passed 16 tests, including repeated
  `harakiri create --env KEY=value` payload serialization;
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/sdk typecheck`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/api build`,
  `pnpm --filter @harakiri/cli build`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed.
  `pnpm deploy:k0s` completed and `pnpm ports:restart &&
  pnpm ports:status` reported all forwards healthy. `pnpm smoke:sandbox-env`
  passed with sandbox `sbx_1KmCe5IiBB`, proving
  `HARAKIRI_ENV_SMOKE=env-ok` was available inside the live OpenSandbox
  runtime and that the created event recorded the env key plus runtime workdir
  metadata. `pnpm smoke` passed the existing sandbox create/run/kill regression
  with sandbox `sbx_UsmssVePKC`. A built CLI smoke against the deployed API created
  `sbx_mlfm8D4u7u` with `harakiri create --env
  HARAKIRI_ENV_SMOKE=cli-env`, then `harakiri run ... --cmd "printenv
  HARAKIRI_ENV_SMOKE"` returned `cli-env`. Browser smoke checks verified the
  deployed website docs pages for Create sandbox, Template troubleshooting, and
  SDK usage mention sandbox env and private runtime image pulls, and saved
  `/tmp/harakiri-runtime-env-docs.png`. An authenticated dashboard smoke opened
  New sandbox, filled the Environment field, and saved
  `/tmp/harakiri-create-env-modal.png`.
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
- Hot-template image pre-pull checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/cli test`,
  API/CLI/web typechecks, API/CLI/web builds, and `pnpm deploy:k0s` passed.
  The rollout created `clusterrole/harakiri-template-prepull` and
  `clusterrolebinding/harakiri-template-prepull`, then restarted the API, web,
  scheduler, and template-builder deployments. `pnpm smoke:template-prepull`
  queued hot image-import build `bld_HtRr9_WKsVj8`, which reached `success`
  and reported `runtimeImagePrepull.status = ok`, `namespace = opensandbox`,
  `nodes=1`, and `pods=1`. `pnpm smoke:template-build` then built
  `bld_0_ZOOW9YFY9W`, confirmed normal non-hot templates log
  `runtime image pre-pull skipped: not_hot_template`, created sandbox
  `sbx_rr_ndBw3TR`, and read `harakiri-built` from the built image.
  `pnpm smoke` created `sbx_RpGPQuhVGX` and returned the expected model-output
  fixture. Website/product docs and New Template UI were checked with
  Playwright: screenshots saved to `/tmp/harakiri-prepull-docs.png` and
  `/tmp/harakiri-prepull-modal.png`.
- Template init ergonomics checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/cli test`, `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/cli build`,
  `pnpm --filter @harakiri/web build`, and `pnpm deploy:k0s` passed.
  `pnpm smoke:template-init` generated `harakiri.toml` with `id`, visibility,
  runtime family, CPU, memory, workdir, ports, tags, aliases, start command,
  and ready command; built Dockerfile build `bld_sfuYnrpJxwNO` from that
  generated config; verified hot image pre-pull in the build logs; created
  sandbox `sbx_vGY-peTj7k`; and read `harakiri-init-built` from the image.
  Deployed product docs were verified at `http://127.0.0.1:15173/#docs`, and
  the screenshot was saved to `/tmp/harakiri-template-init-docs.png`.
- Template resolution checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`,
  `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status` passed.
  `pnpm smoke:template-resolution` built/imported template
  `resolution-smoke-1779611825`, produced build `bld_gtxq40lCafPG`, promoted
  version `tplv_E9XIL3SQlb_r` as `stable`, then created sandboxes
  `sbx_OVMEU8K9pj`, `sbx_SFg9SRq7D_`, and `sbx_tp_bQYGkfG` by template name,
  qualified stable alias, and immutable version ID. The smoke asserted all
  three persisted rows used the same `template_id`, `template_version_id`, and
  non-null `template_image_digest`. Deployed product docs were verified at
  `http://127.0.0.1:15173/#docs` for Create sandbox, Create a custom template,
  Template troubleshooting, and SDK usage; screenshot saved to
  `/tmp/harakiri-template-resolution-docs.png`.
- Exact Open Agents template build checkpoint on 2026-05-24:
  `harakiri template build --name open-agents-dev
  examples/templates/open-agents-dev --timeout 1200` passed against the
  deployed k0s control plane. It uploaded context
  `sha256:861aa45def1608cb03b490940711ab7d6c75e103254b4ac33c11fbae212c1918`,
  streamed 1,837 retained build-log rows, created build `bld_jVM724NQnNmB`,
  created version `tplv__Iou2q4mSlAJ`, and recorded image digest
  `sha256:fa85aab0b3528f2c1cee0ca847d8b568eec74d5ddbafb7ac738c86a35957cea1`.
  PostgreSQL verification for that build returned status `success`, CPU `2`,
  memory `2048`, workdir `/workspace`, default ports `3000,5173,4321,8000`,
  builder job `hkbld-bld-jvm724nqnnmb`, and runtime pull preflight status
  `ok`. A sandbox from `open-agents-dev`, `sbx_5JmCr4RTVP`, passed
  `harakiri-open-agents-smoke`, verifying Node/npm, Bun, pnpm, yarn, git, jq,
  Python, Chromium headless, code-server, agent-browser, and writable
  `/workspace`. A Node HTTP server on port `3000` was exposed as
  `https://71a6150f-a59c-4b3e-ae38-0cd28b253c00-3000.harakiri.io`, and the
  k0s HTTPS ingress path returned `open-agents-exact-route`. The updated
  deployed product docs were verified at `http://127.0.0.1:15173/#docs` for
  Create a custom template, Template builds, and Open Agents template; screenshot
  saved to `/tmp/harakiri-open-agents-exact-docs.png`.
- CLI example alignment on 2026-05-24: `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/cli typecheck`, `pnpm --filter @harakiri/cli build`,
  and `pnpm --filter @harakiri/api test` passed after aligning CLI help with
  the exact Open Agents build command used in README, dedicated Markdown docs,
  example docs, and website product docs.
- Template unit-test gate on 2026-05-24: `pnpm --filter @harakiri/api test`
  passed with 56 tests, `pnpm --filter @harakiri/api typecheck` passed,
  `pnpm --filter @harakiri/cli test` passed with 18 tests, and
  `pnpm --filter @harakiri/cli typecheck` passed after adding focused
  regression coverage for template resolution ranking, build state helpers, and
  `harakiri.toml` inline-comment parsing. No README/dedicated Markdown or
  website docs update was required because documented commands, API payloads,
  and product workflows did not change.
- Digest-before-use checkpoint on 2026-05-24: `pnpm --filter @harakiri/api
  test` passed with 57 tests, `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/cli test`,
  and `pnpm build` passed after making template definitions non-runnable until
  a ready digest-pinned version exists. `pnpm deploy:k0s` completed, `pnpm
  ports:restart && pnpm ports:status` showed API, web, Keycloak, OpenSandbox,
  gateway, and HTTPS ingress forwards healthy, `pnpm smoke:templates` passed
  for `python-3.12`, `python-3.12-data`, and `node-20`, and `pnpm
  smoke:template-resolution` passed with build `bld_wVhxf4S6wRPq`, version
  `tplv_KegCr4lbCdJv`, and sandboxes `sbx_cPjesUqjLN`, `sbx_75kl0AKQok`, and
  `sbx_C4pzEc_rN7`. The image-import build resolved `ubuntu:24.04` to
  `docker.io/library/ubuntu@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b`
  before the version became ready. A direct deployed API check created
  `not-ready-1779614241`, confirmed the create response was `building||`, and
  confirmed sandbox creation returned `409 template_not_ready`. PostgreSQL
  showed catalog versions now store digest-pinned image URIs for `python-3.12`,
  `python-3.12-data`, and `node-20`. Product docs were verified in the deployed
  website for ready digest-pinned versions, disabled Use before readiness, and
  `template_not_ready`; screenshot: `/tmp/harakiri-template-digest-docs.png`.
- Documentation example verification on 2026-05-24: the deployed k0s
  documentation path was checked sequentially with `pnpm ports:status`,
  `pnpm smoke:template-init`, `pnpm smoke:template-build`,
  `pnpm smoke:template-resolution`, and `pnpm smoke:route`. The commands cover
  the CLI/API examples repeated in `README.md`, `docs/templates.md`,
  `docs/template-builds.md`, `docs/api.md`, `docs/runbook.md`,
  `examples/templates/open-agents-dev/README.md`, `packages/cli/README.md`,
  and the website product docs. The runs produced `bld_n1NIlOpvAiqY` /
  `tplv_V-WI15BLyvHX` / `sbx_wxY9k-OJJG` for template init,
  `bld_S9NsfBLSoXuR` / `tplv_tStnB58lRiQN` / `sbx_FJhjEVrxvn` for Dockerfile
  build, `bld_R3N_34qo0CI4` / `tplv_y9_dYXlBWyrN` plus sandboxes
  `sbx_H-PVgtFjh7`, `sbx_ySmPIxygBt`, and `sbx_8jC5TzpOZi` for name,
  qualified alias, and immutable version resolution, and route
  `https://fa789b45-a682-44d8-ad0c-19e85dca4294-3000.harakiri.io` from
  `sbx_OgP5i3tPPF`. During the longer sequence OpenSandbox restarted once and
  left runtime CR `93049232-804f-4e27-b2d2-5f3626931a5a` without a Harakiri DB
  row; it was deleted from the `opensandbox` namespace before the final route
  smoke passed. The docs split was audited at the same checkpoint: local
  development, k0s bootstrap, Harakiri.io/Cloudflare checks, local registry
  notes, and production follow-ups live in README/runbook/operator Markdown,
  while website docs remain product-facing.
- Post-test database audit: `running_sandboxes=0`, `ready_routes=0`,
  `resolution_templates=0`; pre-existing active API keys were left untouched.
- Post-digest checkpoint cleanup audit: `active_smoke_keys=0`,
  `live_sandboxes=0`, `resolution_templates=0`, `not_ready_templates=0`, and
  `ready_routes=0`.
- Post-documentation verification cleanup audit: `active_smoke_keys=0`,
  `live_sandboxes=0`, `ready_routes=0`, `resolution_templates=0`,
  `init_templates=0`, `kaniko_templates=0`, and `building_templates=0`.
- OpenSandbox `execd` transport verification on 2026-05-24:
  `pnpm --filter @harakiri/api test` passed with 61 tests,
  `pnpm --filter @harakiri/api typecheck`, `pnpm typecheck`, and
  `git diff --check` passed. `pnpm deploy:k0s` completed and reconfigured
  `harakiri-sandbox-exec` so the live `opensandbox` namespace Role no longer
  grants `pods/exec` or `pods/log`. `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`
  passed with sandbox `sbx_Pv93SLtLHs`; `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm
  smoke:route` passed with route
  `https://96da86f6-ae77-4ceb-86a7-36239ad3685d-3000.harakiri.io`;
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed both deployed browser tests,
  including web terminal, filesystem, logs fallback, CLI run, and SDK run. A
  focused runtime panels probe created `sbx_hzi1DfNZ2-` and passed
  run/files/metrics/logs against the deployed API. Direct OpenSandbox
  diagnostics returned `404 Not Found` for
  `/v1/sandboxes/:id/diagnostics/logs?scope=container`, so Harakiri logs
  currently fall back to real control-plane events.
  Cleanup audit after the verification showed `live_sandboxes=0`,
  `ready_routes=0`, and `active_smoke_keys=0`.
- OpenSandbox runtime upgrade verification on 2026-05-24: the k0s deployment
  was upgraded to OpenSandbox `server:v0.1.14`, `execd:v1.0.17`, and
  `egress:v1.0.12` while keeping the published `opensandbox-0.1.0` chart with
  explicit image/config overrides. The newer server requires `server.api_key`,
  so the k0s values pin it to the local `dev-opensandbox-key`. The stable
  scoped diagnostics endpoint now returns `501 DIAGNOSTICS_NOT_IMPLEMENTED`;
  Harakiri falls back to OpenSandbox's plain-text diagnostics endpoint after a
  supplemental provider-side `pods/log` RoleBinding for
  `opensandbox-system/opensandbox-server`. A focused deployed log probe created
  `sbx_ta1qU8UINb`, confirmed scoped diagnostics `501`, legacy diagnostics
  `200`, and `18` sandbox-source log rows through `GET /v1/sandboxes/:id/logs`.
  `pnpm --filter @harakiri/api test` passed with 63 tests,
  `pnpm --filter @harakiri/api typecheck`, `pnpm typecheck`, and
  `git diff --check` passed. `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`, and
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed against the upgraded k0s
  deployment. Final cleanup audit showed `live_sandboxes=0`, `ready_routes=0`,
  and `active_smoke_keys=0`.
- Filesystem panel regression on 2026-05-24: `open-agents-dev` sandboxes now
  default the filesystem API and UI to the template workdir (`/workspace`) when
  no path is requested. A deployed probe created `sbx_BQXcGz8lq3`, wrote
  `/workspace/visible.txt`, and verified `GET /v1/sandboxes/:id/files` returned
  `cwd=/workspace` with that file. Explicit `path=/` was also verified through
  the OpenSandbox `execd` directory-listing fallback after `/files/search`
  failed on a root recursive search. A browser probe opened the deployed UI for
  `sbx_K7y0PZDLrN`, selected the Filesystem tab, confirmed the toolbar showed
  `/workspace`, and confirmed `visible.txt` was visible. `pnpm --filter
  @harakiri/api test` passed with 64 tests, `pnpm --filter @harakiri/api
  typecheck`, `pnpm --filter @harakiri/web typecheck`, `pnpm typecheck`,
  `git diff --check`, `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`, and
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed. Cleanup audit showed
  `live_sandboxes=0`, `ready_routes=0`, and `active_smoke_keys=0`.

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
- `docs/artifacts/09-onboarding-redirect-desktop.png`
- `docs/artifacts/10-detail-desktop.png`
- `docs/artifacts/11-landing-mobile.png`
- `docs/artifacts/12-dashboard-mobile.png`
- `docs/artifacts/13-templates-list-desktop.png`
- `docs/artifacts/14-template-detail-desktop.png`
- `docs/artifacts/15-template-builds-desktop.png`
- `docs/artifacts/16-template-build-detail-desktop.png`
- `docs/artifacts/17-new-template-desktop.png`
- `docs/artifacts/18-templates-mobile.png`
- `docs/artifacts/19-new-template-mobile.png`
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
- Filesystem and metrics panels call OpenSandbox `execd` through endpoint
  resolution. Filesystem directories are synthesized from `files/search`
  results when possible. For paths where provider search fails, including `/`
  on the current OpenSandbox image because a recursive search hits system files
  with unknown owners, Harakiri falls back to an OpenSandbox `execd`
  directory-listing command rather than Kubernetes pod exec.
- Runtime logs call OpenSandbox diagnostics when the provider exposes them. The
  upgraded OpenSandbox server returns `501` for the stable scoped diagnostics
  endpoint, so Harakiri falls back to OpenSandbox's deprecated plain-text
  diagnostics endpoint. The k0s manifests grant `pods/log` only to the
  OpenSandbox server service account so that provider endpoint can read runtime
  logs; Harakiri's own service account still has no `pods/log`.
- Command execution and HTTP/SSE/WebSocket route proxying are live.
- Custom template image-import and Dockerfile records are live in the control
  plane and can be completed by the `harakiri-template-builder` worker. Git
  source builds, production registry blob garbage collection, production
  scanner policy, and non-root workspace ownership for custom template images
  remain pending in the active execution plan.

## 2026-05-25 Public harakiri.io Deployment Verification

The public deployment was redeployed with maintainer-environment settings
through:

```bash
pnpm env:harakiri:deploy-public
```

The wrapper keeps the generic k0s deployment defaults portable while setting
the public harakiri.io values for the maintainer lab:

- `PUBLIC_API_URL=https://sb-api.harakiri.io`
- `PUBLIC_KEYCLOAK_URL=https://sb-auth.harakiri.io`
- `SANDBOX_ROUTE_BASE_DOMAIN=harakiri.io`
- `SANDBOX_ROUTE_PUBLIC_SCHEME=https`
- `KEYCLOAK_ISSUER_ALLOWLIST` includes the internal Keycloak service issuer,
  the local port-forward issuer, and
  `https://sb-auth.harakiri.io/realms/harakiri`.

This fixed a browser failure where `https://sb.harakiri.io` was trying to call
the local port-forward Keycloak token endpoint at `http://127.0.0.1:18084`.

Public host checks:

- `https://sb-api.harakiri.io/health` returned `{"status":"ok"}`.
- `https://sb-auth.harakiri.io/realms/harakiri/.well-known/openid-configuration`
  returned issuer `https://sb-auth.harakiri.io/realms/harakiri` and token
  endpoint
  `https://sb-auth.harakiri.io/realms/harakiri/protocol/openid-connect/token`.
- A token endpoint CORS preflight from `https://sb.harakiri.io` returned
  `access-control-allow-origin: https://sb.harakiri.io`.
- The deployed web asset `index-D1ZPtM4z.js` had zero loopback API/Auth URL
  references and contained the public `sb-auth.harakiri.io` and
  `sb-api.harakiri.io` references.

Public end-to-end verification:

```bash
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  HARAKIRI_API_URL=https://sb-api.harakiri.io \
  HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js \
  pnpm e2e
```

Result:

```text
2 passed (27.0s)
```

Public sandbox route verification:

```bash
pnpm env:harakiri:route-public
```

Result:

```text
created sbx_mN4vBfJLIs
route https://98a4f1a0-231d-4cb8-b5ff-1346409c1e36-3000.harakiri.io state=ready provider=opensandbox-gateway
resolved 98a4f1a0-231d-4cb8-b5ff-1346409c1e36-3000.harakiri.io -> 104.21.61.132
route public HTTPS smoke passed
```

Cleanup audit:

```text
active_sandboxes=0
ready_routes=0
active_template_builds=0
active_smoke_keys=0
```

All expected k0s pods in `harakiri` and `opensandbox-system` were ready after
the redeploy. The completed test-only BuildKit Job
`hkbkit-bld-u5u0pbhilq0o` was deleted after verification.

Current deployed pod image IDs:

- API:
  `sha256:d9e0324f336004e2ebd6df6d3a51c3967e0aeac0c871f02772f926fc3280658f`
- Web:
  `sha256:7dda0abaf677c081efa9d8a63219862c4b0164f99b6e6820842e96d4bb94a351`
