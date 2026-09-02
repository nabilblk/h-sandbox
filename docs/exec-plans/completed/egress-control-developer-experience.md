# Execution Plan: Egress Control Developer Experience

**Created**: 2026-05-26
**Author**: Codex
**Status**: Completed
**Priority**: P0
**Estimated effort**: 4-7 engineering days

## Context
Harakiri is a product and control plane on top of OpenSandbox. Egress control should therefore use OpenSandbox's runtime network-policy primitive instead of inventing a separate packet filter in Harakiri.

OpenSandbox currently provides:

- Initial sandbox egress policy through the lifecycle create request as `networkPolicy`.
- A sandbox egress sidecar on port `18080`, resolved through the standard sandbox endpoint API.
- Runtime `GET /policy` and `PATCH /policy` on the egress sidecar.
- FQDN and wildcard-domain rules, with rule actions `allow` and `deny`.
- `defaultAction` values `allow` or `deny`; if a policy is provided without a default, OpenSandbox defaults to deny, while omitted/null/empty policy means allow-all at startup.
- Optional `OPENSANDBOX-EGRESS-AUTH` endpoint headers, which clients must forward when OpenSandbox returns them.
- Enforcement modes:
  - `dns`: DNS filtering only.
  - `dns+nft`: DNS filtering plus nftables dynamic IP allow sets, recommended for stricter default-deny.
- Observability hooks from the egress sidecar: structured stdout logs and OTLP metrics such as denied query count and DNS query latency.

Primary OpenSandbox references:

- OpenSandbox egress component: https://github.com/opensandbox-group/OpenSandbox/blob/main/components/egress/README.md
- OpenSandbox egress API spec: https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/egress-api.yaml
- OpenSandbox lifecycle API `networkPolicy`: https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/sandbox-lifecycle.yml
- OpenSandbox FQDN egress proposal: https://github.com/opensandbox-group/OpenSandbox/blob/main/oseps/0001-fqdn-based-egress-control.md
- OpenSandbox JS SDK egress facade: https://github.com/opensandbox-group/OpenSandbox/blob/main/sdks/sandbox/javascript/src/services/egress.ts
- Current Harakiri/OpenSandbox boundary doc: `docs/opensandbox-boundaries.md`

Current Harakiri state:

- `infra/k8s/opensandbox/opensandbox-values.yaml` configures OpenSandbox egress
  image `v1.1.7` and mode `dns+nft` for the 0.4.0 release line.
- `apps/api/src/providers/runtime/opensandbox-transport.ts` creates sandboxes through OpenSandbox but does not pass `networkPolicy`.
- `apps/api/src/providers/runtime/provider.ts` has provider capabilities for terminal/files/logs/metrics/routes, but no egress policy methods.
- The dashboard has a Network tab focused on inbound route exposure only.
- The CLI and SDK expose sandbox routes but not outbound policy.

The product goal is not to expose raw networking machinery. Harakiri should compress OpenSandbox's low-level `defaultAction` plus ordered rules into developer-friendly presets, reusable profiles, template defaults, sandbox overrides, clear diagnostics, and examples that match common agent workflows.

## Product Shape

Harakiri should expose egress as "Outbound access", not as "networkPolicy".

Recommended user-facing modes:

- `Open`: allow outbound traffic. Good for local prototyping.
- `Restricted`: deny by default; allow a curated list of domains. Good default for agents.
- `Blocked`: deny all outbound traffic. Good for offline evaluation and untrusted code.
- `Custom`: advanced allow/deny domain rules.

Recommended presets:

- `python-package-install`: `pypi.org`, `*.pypi.org`, `files.pythonhosted.org`, `*.pythonhosted.org`, `astral.sh`, `*.astral.sh`.
- `node-package-install`: `registry.npmjs.org`, `*.npmjs.org`, `nodejs.org`, `*.nodejs.org`.
- `git-hosting`: `github.com`, `api.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`, `codeload.github.com`.
- `llm-apis`: provider domains selected by the workspace operator, for example OpenAI, Anthropic, or self-hosted endpoints.
- `browser-basic`: public internet allow mode with denylist guardrails, if the template needs broad browsing.

Recommended developer flows:

- Template author sets default outbound access once.
- Sandbox creator can choose a preset or add one-off domains.
- Dashboard Network tab has two sections: `Inbound routes` and `Outbound access`.
- CLI supports quick flows:
  - `harakiri create --egress restricted --allow github.com --allow api.github.com`
  - `harakiri egress sbx_...`
  - `harakiri egress allow sbx_... pypi.org '*.pythonhosted.org'`
  - `harakiri egress block sbx_...`
  - `harakiri egress test sbx_... https://api.github.com`
- SDK uses clear names:
  - `createSandbox({ egress: { mode: "restricted", allow: ["api.github.com"] } })`
  - `client.getEgressPolicy(id)`
  - `client.allowEgress(id, ["pypi.org"])`
  - `client.testEgress(id, "https://pypi.org/simple")`

## UX Model

Egress should feel like a developer workflow control, not a firewall administration screen. The UI should answer three questions quickly:

1. What can this sandbox reach?
2. Why was a request blocked?
3. What do I add to make my agent work safely?

### Entry Points

- **Create sandbox modal**: show a compact `Outbound access` selector below template/env settings. Default should come from the selected template. Users can expand it only when they need to customize.
- **Template detail/settings**: make outbound access a template default. This is where teams should encode repeatable policy for Python, Node, browser, or agent templates.
- **Sandbox detail, Network tab**: split into two tabs or sections:
  - `Inbound routes`: current expose-port UI.
  - `Outbound access`: egress mode, allowed domains, presets, runtime status, and test tool.
- **Settings**: workspace admins configure allowed presets, custom-domain permission, and max rule counts.

### Primary Screen Shape

The `Outbound access` surface should use a restrained operational layout:

- Top status row:
  - mode pill: `Open`, `Restricted`, `Blocked`, or `Custom`
  - enforcement pill: `dns+nft`, `dns`, `unavailable`, or `degraded`
  - small count: `8 allowed`, `2 denied`, `last updated 3m ago`
- Segmented mode control:
  - `Open`
  - `Restricted`
  - `Blocked`
  - `Custom`
- Preset chips:
  - `Python packages`
  - `Node packages`
  - `GitHub`
  - `LLM APIs`
  - `Browser basic`
- Domain table:
  - action
  - domain
  - source, such as `preset: GitHub`, `template`, or `sandbox override`
  - last result, if tested
  - remove action when editable
- Test bar:
  - input placeholder: `api.github.com or https://pypi.org/simple`
  - button: `Test access`
  - result states: reachable, blocked by policy, DNS failed, provider unavailable.

### Copy And Vocabulary

Prefer:

- `Outbound access`
- `Allowed domains`
- `Blocked by policy`
- `Add domain`
- `Test access`
- `Inherited from template`

Avoid primary UI labels like:

- `egress`
- `networkPolicy`
- `sidecar`
- `nftables`
- `CAP_NET_ADMIN`
- `defaultAction`

Those lower-level terms belong in docs, logs, or an advanced diagnostic drawer.

### Default UX

- Existing templates remain `Open` for backward compatibility unless changed.
- Agent-oriented templates should recommend `Restricted`.
- The create flow should show the effective policy but not require users to configure it.
- When a command fails because a host is blocked, the UI should suggest the exact domain to allow when Harakiri can infer it from logs or a failed test.

### Empty And Error States

- Open mode: "This sandbox can reach the public internet while it is running."
- Restricted mode with no rules: "No outbound domains are allowed."
- Blocked mode: "Outbound network access is off."
- Provider unavailable: "OpenSandbox egress sidecar is not reporting policy. Runtime traffic may not be enforceable."
- Degraded mode: "DNS policy is active, but network-layer enforcement is unavailable."

### Advanced Drawer

An advanced drawer can expose:

- compiled OpenSandbox `networkPolicy`
- sidecar mode
- endpoint health
- raw provider error
- audit event IDs

This keeps the core product simple while preserving operator/debugging depth.

## Success Criteria
- [x] Sandbox creation can pass a validated egress policy to OpenSandbox `networkPolicy`.
- [x] Templates can define default outbound access that new sandboxes inherit.
- [x] Users can override outbound access at sandbox creation without seeing OpenSandbox internals.
- [x] Running sandboxes can inspect and patch egress policy through Harakiri APIs, using OpenSandbox egress sidecar endpoints.
- [x] The Dashboard Network tab clearly separates inbound routes from outbound access.
- [x] CLI and SDK expose ergonomic egress commands/methods with presets and simple allow/block actions.
- [x] Egress policy changes and tests are recorded in Harakiri audit and sandbox event history.
- [x] Product docs explain common developer workflows, limitations, and troubleshooting.
- [x] Smokes verify allowed domains work, denied domains fail, runtime patching works, and terminated sandboxes do not accept policy changes.

## Non-Goals For V1
- [ ] Do not implement Harakiri-owned packet filtering, Kubernetes NetworkPolicy generation, or a custom egress proxy.
- [ ] Do not expose transparent HTTPS MITM in the normal UI; keep it as an operator/experimental future feature.
- [ ] Do not claim full L7 request logging. OpenSandbox's stable egress primitive is FQDN policy, not full HTTP audit.
- [ ] Do not support IP/CIDR rules until OpenSandbox supports them in its egress policy contract.
- [ ] Do not auto-infer every domain an app might need. Provide curated presets plus explicit user control.

## Phases

### Phase 1: Domain Model And Policy Compiler
**Status**: Completed
- [x] Add shared egress types: mode, preset IDs, allow domains, deny domains, compiled `NetworkPolicy`, and policy status.
- [x] Add domain validation for FQDN and wildcard targets; reject schemes, paths, ports, bare `*`, IPs, and private metadata endpoints unless explicitly supported later.
- [x] Implement a compiler from Harakiri UX shape to OpenSandbox `networkPolicy`.
- [x] Define default behavior:
  - No user/template policy means `Open`/allow-all for backward compatibility.
  - `Restricted` compiles to `defaultAction: deny`.
  - `Blocked` compiles to `defaultAction: deny` with no egress rules.
  - Deny rules are supported only in `Open`/allow-default mode or advanced custom mode.
- [x] Add tests for normalization, wildcard handling, duplicate targets, preset expansion, and invalid targets.

### Phase 2: Persistence And Template Defaults
**Status**: Completed
- [x] Add database fields for template default egress policy, template version egress snapshot, sandbox effective egress policy, and optional runtime policy status.
- [x] Store the compiled effective policy on sandbox rows for auditability.
- [x] Extend template create/build/list paths to carry default egress settings.
- [x] Ensure template versions snapshot egress defaults so historical sandboxes can be explained later.
- [x] Add organization settings for allowed presets, max rules per sandbox, whether custom domains are allowed, and default egress mode.

### Phase 3: OpenSandbox Provider Integration
**Status**: Completed
- [x] Extend `RuntimeCreateSandboxInput` with an optional egress policy.
- [x] Pass compiled policy into `openSandboxCreateBody()` as `networkPolicy`.
- [x] Add provider methods `getEgressPolicy`, `setEgressPolicy`, and `patchEgressRules`.
- [x] Resolve OpenSandbox port `18080` through the endpoint API with `use_server_proxy=true` where appropriate.
- [x] Forward endpoint headers, including `OPENSANDBOX-EGRESS-AUTH`, when calling sidecar `/policy`.
- [x] Return provider-unavailable errors clearly when the egress sidecar endpoint is absent or not ready.
- [x] Keep all egress runtime access through OpenSandbox APIs; do not add Harakiri Kubernetes pod exec or pod networking privileges.

### Phase 4: Harakiri API Surface
**Status**: Completed
- [x] Extend `POST /v1/sandboxes` with `egress` in the Harakiri-friendly shape.
- [x] Add `GET /v1/sandboxes/:id/egress` to return effective policy, compiled policy, presets used, and provider status.
- [x] Add `PATCH /v1/sandboxes/:id/egress` for allow/block actions and custom rule patches.
- [x] Add optional `POST /v1/sandboxes/:id/egress/test` to run a provider-backed connectivity probe from inside the sandbox.
- [x] Add API errors:
  - `egress_policy_invalid`
  - `egress_rule_limit_exceeded`
  - `egress_provider_unavailable`
  - `sandbox_terminated`
- [x] Record audit/events for:
  - `sandbox.egress.updated`
  - `sandbox.egress.tested`
- [x] Add workspace-policy errors such as `egress_custom_domains_disabled` and `egress_preset_not_allowed`.
- [x] Add a dedicated `template.egress.updated` event for template default policy changes.

### Phase 5: CLI And SDK Developer Experience
**Status**: Completed
- [x] Add create flags:
  - `--egress open|restricted|blocked|custom`
  - `--egress-preset <preset>`
  - `--allow <domain>`
  - `--deny <domain>`
- [x] Add CLI group:
  - `harakiri egress <sandbox-id>`
  - `harakiri egress allow <sandbox-id> <domain...>`
  - `harakiri egress deny <sandbox-id> <domain...>`
  - `harakiri egress block <sandbox-id>`
  - `harakiri egress test <sandbox-id> <url-or-host>`
- [x] Keep CLI output concise and actionable:
  - `egress restricted. allowed=5. denied_last_5m=2`
  - `ok pypi.org reachable`
  - `blocked example.com by default deny`
- [x] Add SDK egress methods matching the CLI concepts.
- [x] Update CLI/SDK tests and OpenAPI contract.

### Phase 6: Dashboard UX
**Status**: Completed
- [x] Split Network tab into `Inbound routes` and `Outbound access`.
- [x] Show current mode as a compact segmented control: Open, Restricted, Blocked, Custom.
- [x] Show presets as selectable chips with domain preview.
- [x] Add allow-domain input with validation and examples.
- [x] Add a "Test access" input that accepts a host or URL and returns reachable/blocked/error.
- [x] Show provider status: enforcing, DNS-only, DNS+nft, unavailable, or degraded.
- [x] Show recent policy events from control-plane sandbox logs.
- [ ] Show denied count and DNS latency if OpenSandbox metrics are ingested later.
- [x] Keep the UI focused on "what can this sandbox reach?" instead of raw sidecar mechanics.

### Phase 7: Observability And Audit
**Status**: Partially completed; metrics ingestion deferred
- [x] Store Harakiri-side policy changes with policy summaries.
- [x] Surface OpenSandbox egress sidecar mode from `GET /policy` when available.
- [x] Decide whether to ingest sidecar structured logs or expose them only through runtime logs initially.
- [ ] If metrics are available, capture denied query counts and DNS latency into usage/metrics views.
- [x] Add workspace setting for domain redaction preference so future event/metric views can honor sensitive workspaces.
- [x] Add docs explaining that FQDN egress is policy enforcement, not a complete packet capture/audit log.

### Phase 8: Verification Matrix
**Status**: Completed
- [x] Unit-test compiler, validators, route schemas, service methods, and provider transport.
- [x] API-test create with inherited template egress, create with sandbox override, policy get, policy patch, invalid domains, and terminated sandbox behavior.
- [x] k0s smoke:
  - create sandbox with `Restricted` allowing `pypi.org`
  - verify `curl https://pypi.org` works
  - verify `curl https://example.com` fails
  - patch allow `example.com`
  - verify `example.com` works
  - kill sandbox and verify egress endpoints fail cleanly
- [x] CLI smoke for create flags and runtime patch commands.
- [x] Playwright smoke for dashboard Outbound access controls.
- [x] Regression run: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm openapi:check`.

### Phase 9: Documentation
**Status**: Completed for V1
- [x] Add product docs: "Outbound access" with modes, presets, examples, and troubleshooting.
- [x] Add developer docs for API/CLI/SDK examples.
- [x] Add operator docs for OpenSandbox egress image, mode `dns+nft`, CAP_NET_ADMIN sidecar requirement, degraded mode, and metrics.
- [x] Update template docs to explain egress defaults and version snapshotting.
- [x] Add a security note that route exposure is inbound while egress policy is outbound; they are separate controls.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-26 | Build on OpenSandbox `networkPolicy` and egress sidecar APIs | OpenSandbox already owns runtime dataplane behavior and provides create-time plus runtime policy primitives; Harakiri should stay a control/product plane. | Kubernetes NetworkPolicy generation; custom Harakiri egress proxy; direct pod iptables manipulation |
| 2026-05-26 | Expose UX modes and presets instead of raw ordered rules as the primary product surface | The platform's main value is developer experience. Most users need "can this agent reach GitHub/PyPI/LLM APIs?" not a network appliance UI. | Expose raw `defaultAction` and `egress` arrays directly |
| 2026-05-26 | Keep `Open` as the backward-compatible default, but make `Restricted` the recommended template setting for agent runtimes | Existing templates and smokes should not break unexpectedly, while new secure templates can opt into safer defaults. | Make all sandboxes deny-by-default immediately |
| 2026-05-26 | Treat HTTPS MITM as out of scope for v1 | It adds certificate trust, performance, privacy, and UX complexity. FQDN policy is the stable primitive to productize first. | Add transparent HTTP/S inspection controls now |
| 2026-05-26 | Keep `egress test` as a sandbox-executed connectivity probe | It gives developers a direct answer from the sandbox runtime without exposing sidecar internals. The probe uses normal runtime execution and no Kubernetes exec. | Only show static policy; add a separate Harakiri probe proxy |
| 2026-05-26 | Quote the egress test shell script with POSIX single-quote escaping instead of JSON string escaping | `JSON.stringify` turned multiline shell into literal `\n` sequences, which made `sh -lc` parse Python fallback code as shell. Single-quote escaping preserves real newlines. | Base64-encode the script; write a temporary file in the sandbox |
| 2026-05-26 | Present egress as `Outbound access` across Settings, Templates, create flow, and the sandbox Network tab | The product value is compressing network-policy complexity into developer-facing defaults, presets, and a test loop. | Put raw egress JSON only in API/CLI; expose Kubernetes/OpenSandbox terms in primary UI |
| 2026-05-26 | Validate template and sandbox policies against workspace guardrails before calling OpenSandbox | Admins need one place to cap presets, custom domains, and rule counts, while templates and sandboxes stay ergonomic. | Let every template/sandbox define arbitrary domains and rely only on runtime policy rejection |
| 2026-05-26 | Update the latest template version egress snapshot when the editable template default changes | New sandboxes should inherit the visible template default immediately; keeping only the template row updated created a mismatch. | Require a rebuild/promote before egress defaults affect new sandboxes |

## Tech Debt Incurred
- Denied-query counts and DNS latency are not ingested into dashboard metrics yet; the UI shows provider enforcement status and test results only.
- The runtime `Test access` probe depends on the sandbox image having `curl`, `wget`, `python3`, or equivalent tooling. Minimal images can report `no curl, wget, or python3 available` even when the policy itself is active. A provider-native OpenSandbox probe would remove that image dependency if OpenSandbox exposes one later.
- This plan intentionally defers L7 request logging, IP/CIDR policy, and transparent MITM until the base FQDN egress experience is stable.

## Completion Notes
Delivered V1 on 2026-05-26:

- Shared egress model, preset catalog, validation, compiler, OpenAPI schema, and tests.
- PostgreSQL persistence for organization/template/template-version/sandbox egress snapshots.
- OpenSandbox provider integration for create-time `networkPolicy` and runtime sidecar `GET /policy`, `POST /policy`, and `PATCH /policy`.
- Harakiri API endpoints for create-time egress, policy inspect, policy patch, and sandbox-executed test probes.
- CLI create flags plus `harakiri egress` inspect/allow/deny/block/set/test commands.
- SDK egress methods mirroring the CLI concepts.
- Dashboard create-modal egress controls and Network tab `Inbound routes` plus `Outbound access` UX.
- Workspace Settings UI for default mode, enabled presets, custom-domain guardrail, redaction preference, and max expanded rules.
- Template detail `egress` tab and `PATCH /v1/templates/:id/egress` so new sandboxes inherit team template defaults without a rebuild.
- Product/developer/operator docs in `docs/egress-control.md`, docs site content, README, CLI README, OpenAPI, and OpenSandbox boundary docs.

Verification run:

- `pnpm --filter @harakiri/shared typecheck`
- `pnpm --filter @harakiri/api typecheck`
- `pnpm --filter @harakiri/sdk typecheck`
- `pnpm --filter @harakiri/cli typecheck`
- `pnpm --filter @harakiri/web typecheck`
- `pnpm --filter @harakiri/shared test`
- `pnpm --filter @harakiri/api test`
- `pnpm --filter @harakiri/sdk test`
- `pnpm --filter @harakiri/cli test`
- `pnpm --filter @harakiri/web test`
- `pnpm openapi:check`
- `pnpm build`
- `pnpm env:harakiri:deploy-public`
- Deployed k0s PyPI smoke: restricted sandbox with the Python packages preset reaches `https://pypi.org/simple`.
- Deployed k0s smoke: restricted sandbox allows `api.github.com`, blocks `example.com`, runtime patch allows `example.com`, block mode blocks again, and terminated sandbox egress patch returns `409`.
- Deployed k0s smoke: workspace guardrails reject custom domains with `403 egress_custom_domains_disabled` when disabled, and team template egress defaults are inherited by new sandboxes.
- Public dashboard smoke: login, open sandbox detail, Network tab renders inbound/outbound sections, recent policy events render, `dns+nft` provider status is visible, `api.github.com` rule is visible, `Test access` returns Reachable, Settings egress guardrails render, Template egress default editor renders, no relevant console errors, and no horizontal overflow.

Post-upgrade validation on 2026-09-02:

- Phase 0's provider-unavailable egress regression was traced to OpenSandbox
  sidecar injection behavior: no egress sidecar is created unless a sandbox is
  created with `networkPolicy`.
- Harakiri now sends a no-op open `networkPolicy` whenever an effective egress
  policy exists, so open sandboxes can later be changed to restricted or
  blocked at runtime.
- Strict SDK and CLI conformance passed against k0s without
  `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE=1`, including create-time
  egress, runtime `GET`/`PATCH`, and `egress test`.
