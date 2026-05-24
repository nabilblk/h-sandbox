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
- Filesystem and metrics panels are prototype control-plane views; command execution and HTTP/SSE/WebSocket route proxying are live.
- Custom template image-import and Dockerfile records are live in the control
  plane and can be completed by the `harakiri-template-builder` worker. Git
  source builds, production registry credentials, registry blob garbage
  collection, production scanner policy, and non-root workspace ownership for
  custom template images remain pending in the active execution plan.
