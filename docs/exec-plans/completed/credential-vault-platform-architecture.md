# Execution Plan: Credential Vault Platform Architecture

**Created**: 2026-09-03
**Author**: Codex
**Status**: Completed
**Completed**: 2026-09-04
**Priority**: P1
**Estimated effort**: 3-5 engineering weeks

## Context
Harakiri Sandbox needs a first-class Credential Vault because serious agent
workflows require access to model providers, Git hosting, package registries,
artifact stores, private APIs, and cloud services without placing real secrets
inside the sandbox process.

This work should not be built as a chain of isolated features. The product
needs one durable architecture where early support for ephemeral credentials is
only the first `SecretSource` implementation, and later encrypted workspace
secrets, external secret-manager references, and dynamic credentials extend the
same model.

The plan is intentionally global. Each implementation slice should be small
enough to review, test, and ship, but every shipped API, SDK method, CLI command,
UI term, database table, and documentation page must fit the same long-term
domain model. The goal is to avoid a quick MVP path that is erased by the next
credential feature.

OpenSandbox already provides the low-level runtime primitive through Credential
Vault:

- OpenSandbox Credential Vault guide:
  https://open-sandbox.ai/guides/credential-vault
- OpenSandbox project:
  https://github.com/opensandbox-group/OpenSandbox

OpenSandbox behavior that shapes the Harakiri design:

- Real credential values are written by a trusted host-side client/control plane
  into the OpenSandbox egress sidecar.
- The sandbox workload only receives fake or empty values through environment
  variables or placeholders.
- The egress sidecar injects auth headers or scoped substitutions only when an
  outbound HTTPS request matches a configured binding.
- Credential Vault requires OpenSandbox egress mode `dns+nft`; DNS-only mode is
  not safe enough because direct-IP traffic can bypass DNS policy.
- Sandboxes must be created with `credentialProxy.enabled` and an outbound
  network policy.
- Credential-bearing sandboxes should use default-deny outbound policy and
  explicitly allow every destination host used by a binding.
- Active vault state is in-memory inside the egress sidecar. Kubernetes
  pause/resume recreates the pod and starts with an empty vault, so credentials
  must be re-injected by Harakiri or another trusted client after resume.
- Credential Vault is incompatible with another transparent service-mesh sidecar
  in the same network namespace.

Current Harakiri strengths that this plan should reuse:

- Keycloak-backed user authentication and organization membership.
- PostgreSQL-backed control-plane state.
- Runtime provider boundary that keeps OpenSandbox responsible for sandbox
  lifecycle and dataplane behavior.
- Existing egress-control UX, policy compiler, provider integration, audit
  events, SDK/CLI helpers, and dashboard Network view.
- Template system with versions, aliases, build history, and runtime contracts.
- Lifecycle persistence through OpenSandbox-native pause/resume/snapshot, with
  documented caveats around Credential Vault rehydration.

The product goal is to expose a high-trust developer experience:

> This sandbox can use this credential only for these outbound destinations,
> without the sandbox ever seeing the real value.

## Architecture Model

The final architecture should be built around stable Harakiri-owned concepts:

- `SecretSource`: where the real credential value comes from.
- `WorkspaceSecret`: a reusable secret owned by an organization or workspace.
- `ExternalSecretReference`: a pointer to a secret manager controlled outside
  Harakiri.
- `DynamicCredential`: a short-lived credential minted just in time.
- `CredentialProviderPreset`: a reusable mapping for providers such as OpenAI,
  Anthropic, OpenRouter, GitHub, GitLab, npm, PyPI, container registries, or
  private APIs.
- `CredentialBinding`: how a secret maps to outbound request injection.
- `TemplateCredentialSlot`: a template-declared requirement without a real
  value.
- `SandboxCredentialAttachment`: the association between a running sandbox and
  one or more credential sources/bindings.
- `VaultInjection`: the provider-specific operation that applies the compiled
  bindings into OpenSandbox Credential Vault.
- `VaultRehydration`: the control-plane operation that re-applies credentials
  after provider events such as resume or sidecar replacement.
- `CredentialAuditEvent`: metadata-only audit record for creation, update,
  attach, detach, inject, test, rotation, and deletion.

Initial source types:

- `inline_ephemeral`: value supplied for one sandbox operation and never stored.
- `harakiri_encrypted`: value stored by Harakiri with envelope encryption.
- `external_ref`: reference to Kubernetes Secret, External Secrets Operator,
  HashiCorp Vault, or cloud secret managers.
- `dynamic`: token minted from OAuth, GitHub App, OIDC, or cloud STS flows.

The OpenSandbox provider implementation should be one adapter behind the
Harakiri runtime provider interface. Harakiri API, SDK, CLI, and UI must not
expose OpenSandbox sidecar URLs, provider headers, pod names, or Kubernetes
implementation details as the main integration contract.

## Capability Workstreams

This plan is intentionally organized as platform workstreams, not as a backlog
of disconnected features. Individual pull requests can still be small, but each
one must advance one of these durable capability areas and keep the public model
compatible with the others.

### 1. Source And Custody Model

Scope:

- Source adapter contract for `inline_ephemeral`, `harakiri_encrypted`,
  `external_ref`, and `dynamic`.
- Encryption, write-only behavior, rotation, deletion, disabled state,
  redaction, usage metadata, and audit records.
- Explicit source capabilities:
  reusable, rehydratable, rotatable, externally owned, short-lived, and
  launch-only.

Acceptance:

- A new source type plugs into the source adapter boundary without changing
  sandbox creation, runtime attachment, SDK, CLI, or UI vocabulary.
- Secret values are never returned after write and never become template,
  sandbox, route, command, log, event, or snapshot metadata.

### 2. Template And Launch Contract

Scope:

- Template credential slots, provider presets, required/optional slot state,
  fake env defaults, binding scope, egress defaults, and version snapshots.
- Launch-time mapping from template slots to a supported `SecretSource`.
- Validation that required slots are satisfied before sandbox creation unless a
  documented operator mode deliberately permits missing slots.

Acceptance:

- A template can declare "this runtime needs a GitHub token" or "this runtime
  can optionally use an OpenAI-compatible key" without storing a value.
- A sandbox launch can bind those slots to one-time credentials, workspace
  secrets, external references, or dynamic issuers through the same public
  contract.

### 3. Runtime Injection And Lifecycle

Scope:

- Runtime provider capabilities for apply, patch, detach, sanitized read,
  test, and rehydrate.
- OpenSandbox Credential Vault adapter and provider conformance tests.
- Pause, resume, restore, sidecar replacement, provider failure, and stale
  injection handling.

Acceptance:

- Credential-bearing sandboxes fail clearly when the runtime cannot inject,
  patch, detach, test, or rehydrate the requested attachment.
- Stored, external, and dynamic sources are rehydrated when source material can
  be resolved; ephemeral sources become `requires_reinjection` instead of
  silently pretending to work.

### 4. Policy, Governance, And Audit

Scope:

- Credential-aware egress compilation, restricted defaults, provider preset
  domain rules, and custom/private API validation.
- Organization RBAC, admin-managed custody, member-use permissions, audit
  events, and usage reporting.
- Security review artifacts and explicit unsupported profiles.

Acceptance:

- Credential injection and outbound access are presented as one policy surface:
  the product explains which domains are reachable because of which
  credential bindings.
- Admins can answer who created, rotated, attached, detached, tested,
  rehydrated, disabled, or deleted a credential without exposing the value.

### 5. Developer Experience Surface

Scope:

- Public API, TypeScript SDK, CLI, dashboard, template authoring, create flow,
  sandbox detail, Network view, and examples.
- Provider-first workflows for model APIs, Git hosting, package registries,
  private APIs, OpenCode-style templates, and CI automation.
- Typed errors and script-friendly output.

Acceptance:

- Users can complete the common workflows without learning OpenSandbox
  internals or hand-authoring low-level sidecar payloads.
- SDK and CLI examples avoid shell history leakage, process-list leakage, local
  storage leakage, and accidental value readback.

### 6. Documentation, Operations, And OSS Adoption

Scope:

- Public docs, technical docs, internal docs, external integration docs,
  operator docs, security docs, examples, release notes, migration notes, and
  verification reports.
- k0s, Kubernetes, OpenShift, registry mirroring, runtime support matrix,
  degraded profiles, troubleshooting, and install runbooks.

Acceptance:

- A developer can adopt Credential Vault from the public website and package
  docs.
- An operator can decide whether their cluster supports the feature before
  enabling it.
- A maintainer can continue the architecture without private session context.

## Evolution Safety Rules

These rules protect the plan from being invalidated by future source types:

- Public creation and attachment APIs accept a `SecretSource` reference plus a
  `CredentialBinding` intent. They must not require callers to know whether the
  runtime implementation is OpenSandbox today or another provider later.
- Template slots model requirements and defaults. They must never model
  customer-specific values, provider tokens, or one-off runtime state.
- Every stored or resolvable source carries capability metadata:
  `canRehydrate`, `canRotate`, `canDisable`, `canDeleteValue`,
  `isExternallyOwned`, and `expiresAt` where applicable.
- Each provider adapter reports runtime capabilities before accepting a
  credential operation. Unsupported operations fail before creating misleading
  control-plane state.
- UI, SDK, CLI, OpenAPI, and docs must distinguish shipped, preview, planned,
  degraded, unsupported, and operator-action-required behavior.
- Any shortcut taken for an early source type must be recorded as tech debt in
  this plan before the slice is closed.

## Design Guardrails

These guardrails are the stability contract for the plan:

- Public surfaces model `SecretSource`, `CredentialBinding`,
  `CredentialProviderPreset`, `TemplateCredentialSlot`, and
  `SandboxCredentialAttachment`. They do not model OpenSandbox sidecars,
  Kubernetes pods, provider sockets, or low-level network-policy resources.
- `inline_ephemeral` is the first source adapter, not a temporary API. Its
  request and response shapes must remain compatible with
  `harakiri_encrypted`, `external_ref`, and `dynamic` sources.
- Provider presets are catalog data plus validation rules. They should not
  become provider-specific branches spread across API routes, SDK code, CLI
  commands, and UI components.
- Template slots declare requirements and defaults. They never contain real
  secret values and must version with template releases.
- Rehydration is explicit. A sandbox can be `injected`, `detached`,
  `failed`, or `requires_reinjection`; the product must not hide sidecar state
  loss after pause, resume, restore, or provider replacement.
- Egress policy and Credential Vault are designed together. Credential-bearing
  sandboxes should default to restricted outbound access with binding hosts
  allowed unless an operator explicitly chooses a weaker profile.
- Documentation, examples, OpenAPI, SDK docs, CLI docs, operator notes, and
  security notes are acceptance criteria for every shipped slice, not optional
  cleanup.
- Future enterprise integrations must extend source or provider adapters rather
  than replacing public APIs that OSS users have already adopted.

## Execution Quality Contract

This plan must be implemented as platform architecture, not as a pile of
feature-specific shortcuts. Every implementation slice must satisfy these
engineering rules before it is considered complete:

- Keep the smallest public contract that can survive the next source type.
  Avoid temporary endpoint names, one-off request shapes, and UI terms that will
  become wrong when encrypted, external-reference, or dynamic credentials ship.
- Keep modules split by responsibility:
  routes validate and authorize, services own control-plane state, source
  adapters resolve trusted material, provider adapters talk to runtimes, and UI
  components render product state.
- Fail loudly when a runtime capability is missing. Do not silently create a
  sandbox without requested credential injection, egress rules, rehydration, or
  audit metadata.
- Never make a secret readable after write. Tests must prove values are not
  returned by API, SDK, CLI, UI, logs, audit events, OpenAPI examples, or
  generated docs.
- Prefer explicit state over inferred state:
  `injected`, `detached`, `failed`, `disabled`, `requires_reinjection`, and
  `provider_unsupported` should be visible in APIs and product surfaces.
- Keep provider details behind the provider boundary. OpenSandbox sidecar URLs,
  pod names, Kubernetes implementation details, and raw provider payloads must
  stay out of public API, SDK, CLI, and normal UI vocabulary.
- Ship tests with every slice. At minimum, cover unit behavior, API shape,
  SDK/CLI redaction, and one provider-boundary path. Broaden to browser,
  lifecycle, k0s, and OpenShift checks when the slice touches those surfaces.
- Re-read the diff before closing each slice and simplify naming, branching,
  module boundaries, and docs while the context is fresh.

## Success Criteria
- [x] Harakiri has one durable Credential Vault domain model that supports
      ephemeral, encrypted, external-reference, and dynamic secret sources
      without separate public feature paths.
- [x] Sandboxes can be created with credential slots, fake env values, compiled
      egress allow rules, and OpenSandbox `credentialProxy.enabled`.
- [x] Runtime credential injection uses OpenSandbox Credential Vault and does
      not use Kubernetes exec, mounted Kubernetes Secrets, command-line secrets,
      real sandbox env vars, or filesystem writes as the normal mechanism.
- [x] Harakiri can attach, detach, inspect sanitized metadata for, and test
      credential bindings on a running sandbox.
- [x] Credential-bearing sandboxes use default-deny outbound policy unless an
      explicit operator-controlled exception is documented and surfaced.
- [x] Pause/resume and restore flows rehydrate vault bindings when Harakiri owns
      enough trusted source material to do so, and otherwise expose a clear
      `requires_reinjection` state.
- [x] Templates can declare required and optional credential slots with provider
      presets, fake env names, binding scope, and launch-time mapping rules.
- [x] Workspace admins can create, rotate, disable, delete, and audit encrypted
      workspace secrets with RBAC and redaction.
- [x] Enterprise installs can reference external secrets without forcing
      Harakiri to store plaintext credential values.
- [x] SDK and CLI expose premium workflows for sandbox creation, secret
      attachment, provider presets, tests, and script-friendly error handling.
- [x] Dashboard UX makes credential status, provider presets, egress coupling,
      template slots, and audit history understandable without exposing low-level
      OpenSandbox internals.
- [x] API docs, SDK docs, CLI docs, product docs, operator docs, security docs,
      internal design notes, examples, and migration docs are complete enough
      for OSS users and external integration teams.
- [x] Local, CI, k0s, and OpenShift-oriented verification prove the behavior and
      clearly document runtime profiles where OpenSandbox Credential Vault is
      unavailable.

## Non-Goals
- Do not build Harakiri-owned outbound MITM, packet filtering, or custom
  credential injection outside the runtime provider boundary.
- Do not inject real secrets into sandbox environment variables, command
  arguments, files, logs, snapshots, metadata, or template definitions.
- Do not make OpenSandbox sidecar endpoints part of the public Harakiri API.
- Do not rely on Kubernetes exec or direct pod access for normal vault
  operations.
- Do not store provider API keys in frontend state, local storage, browser logs,
  or public route metadata.
- Do not claim Credential Vault support in OpenShift profiles where the required
  OpenSandbox egress sidecar capabilities cannot run.
- Do not implement every possible secret manager in the first release. Build the
  adapter boundary first and ship a narrow supported set.

## Product Shape

Credential Vault should appear in the product as "Vault" or "Credentials", not
as "sidecar credentials".

Recommended surfaces:

- Workspace Settings: encrypted secrets, external references, provider
  presets, rotation status, usage, and audit.
- Template Detail: required and optional credential slots, provider presets,
  fake env names, and default binding scopes.
- Create Sandbox: map template slots to workspace secrets, external refs, or
  one-time ephemeral values.
- Sandbox Detail: attached credentials, sanitized binding metadata, injection
  status, test access, last rehydration, and audit events.
- Network View: show when outbound policy is credential-driven and which
  domains are allowed because of vault bindings.
- CLI/SDK: provider-first workflows that stay scriptable and do not leak
  secrets into shell history by default.

Recommended vocabulary:

- `Credential`
- `Vault`
- `Secret source`
- `Provider preset`
- `Required by template`
- `Attached to sandbox`
- `Injected by runtime`
- `Needs reinjection`
- `Test access`

Avoid primary UI vocabulary:

- `egress sidecar`
- `mitmproxy`
- `nftables`
- `networkPolicy`
- `credentialProxy`
- `sidecar socket`

Those terms belong in advanced diagnostics and operator docs.

## Documentation Strategy

Documentation is a core deliverable for this feature, not a final cleanup task.
Every shipped slice must update the relevant public, technical, internal, and
operator-facing docs before it is considered complete.

The documentation phase has two responsibilities:

1. Cross-cutting documentation for every implementation slice, shipped in the
   same pull request as behavior changes.
2. A dedicated consolidation pass before release that makes the public,
   internal, operator, security, integration, and verification story coherent
   end to end.

The consolidation pass is required because Credential Vault cuts across
security, runtime behavior, cluster installation, SDK/CLI usage, and template
authoring. A feature can work technically and still fail as an OSS capability if
users cannot understand the custody boundary, cluster prerequisites, and
supported workflows from the documentation alone.

Documentation work follows the same delivery gates as code:

- Each phase must list the docs it changes before implementation starts.
- Each phase must update public docs, internal docs, and verification notes in
  the same pull request as the behavior when those surfaces are affected.
- Each phase must mark planned, preview, degraded, unsupported, and
  operator-action-required behavior explicitly. The docs must not imply that a
  future source adapter or runtime profile is already shipped.
- Each phase must include at least one runnable example or test report when it
  exposes a user-facing workflow.
- Documentation review is part of the acceptance gate for API, SDK, CLI, UI,
  operator, and security work.

Required documentation tracks:

- Public product docs: explain the Vault concept, supported source types,
  provider presets, template credential slots, create-time mapping, running
  sandbox attachment, rehydration behavior, and user-facing limitations.
- Public website docs: make Credential Vault discoverable from the product
  documentation navigation with quickstarts, screenshots where useful,
  workflows, examples, and honest runtime support states.
- Public API docs: document endpoints, request/response schemas, OpenAPI,
  examples, typed errors, compatibility guarantees, and redaction rules.
- SDK docs: document install, authentication, create-time credentials,
  sandbox credential helpers, template-slot mapping, workspace secrets,
  external refs, dynamic credentials, and error handling.
- CLI docs: document install, login, safe secret input, create-time credentials,
  attach/list/detach/test, workspace-secret automation, JSON output, and CI
  usage.
- Technical architecture docs: describe domain model, source adapters,
  provider boundary, OpenSandbox adapter, egress coupling, rehydration, audit
  model, encryption model, and failure modes.
- Internal engineering docs: record module ownership, invariants, code layout,
  implementation notes, test strategy, decision log, and known limitations.
- Operator docs: cover Kubernetes/k0s/OpenShift requirements, OpenSandbox
  version compatibility, `dns+nft`, Credential Proxy, environment variables,
  encryption key setup, backup/restore, upgrade, and service-mesh caveats.
- Security docs: include threat model, secret custody choices, redaction,
  RBAC, auditability, rotation, incident response, external secret-manager
  policies, and explicit non-goals.
- External integration docs: show how third-party projects consume Harakiri
  Vault through API/SDK/CLI without depending on OpenSandbox internals.
- Example docs: include model provider calls, private Git clone, package
  registry access, private API access, private registry pulls, and
  OpenCode-style agent templates.
- Release and migration docs: update README, changelog/release notes, upgrade
  notes, feature matrix, runtime contract, OpenShift install guide, and
  troubleshooting runbooks.
- Verification docs: publish test reports with commands, runtime versions,
  sandbox IDs where useful, profile support matrix, known limitations, and
  regression coverage.
- Source-level code documentation: add focused module comments only where a
  maintainer needs invariants that are not obvious from types, such as
  redaction, no-readback, source adapter boundaries, provider conformance, or
  rehydration state transitions.

Required final documentation set:

- Website product docs:
  - `apps/web/src/docs-content.tsx` must expose the public Vault guide in the
    product documentation surface.
  - Add or update website sections for Overview, quickstart, source types,
    provider presets, template slots, running sandbox attachment, rehydration,
    Git/private package/model provider examples, security model, and
    troubleshooting.
- Repository public docs:
  - `docs/credential-vault.md` for the user-facing concept and workflows.
  - `docs/api.md` and `docs/openapi.json` for public API contracts.
  - `docs/sdk.md` and `packages/sdk/README.md` for TypeScript SDK usage.
  - `docs/cli.md` and `packages/cli/README.md` for CLI installation,
    authentication, safe secret input, JSON output, and CI usage.
  - `docs/templates.md` for template credential slots and launch-time mapping.
  - `docs/egress-control.md` for egress and Vault coupling.
  - `docs/lifecycle.md` for pause/resume and reinjection behavior.
  - `docs/errors.md` for typed error codes and recovery advice.
- Technical architecture docs:
  - `docs/credential-vault-internals.md` for domain model, source adapters,
    provider boundary, OpenSandbox adapter, egress compiler integration,
    rehydration, audit, encryption, and failure modes.
  - Add ADRs for durable decisions that affect the public contract:
    source model, provider boundary, encryption custody, external references,
    and dynamic credential issuance.
- Internal engineering docs:
  - Add `docs/internal/credential-vault-engineering.md` or equivalent for code
    ownership, module map, invariants, migration rules, redaction rules,
    provider adapter test contracts, and maintenance checklist.
  - Keep the exec plan decision log and tech debt section current as the
    implementation evolves.
- Operator and deployment docs:
  - `docs/install-openshift.md`, `docs/runbook.md`, and a dedicated runtime
    support matrix must document OpenSandbox version compatibility, `dns+nft`,
    Credential Proxy, required environment variables, encryption key setup,
    backup and restore, upgrades, service-mesh caveats, OpenShift limitations,
    and degraded/unsupported profiles.
- Security docs:
  - Add a Credential Vault threat model that covers secret custody, no-value
    readback, redaction, RBAC, audit records, rotation, rehydration, external
    secret-manager trust boundaries, snapshot/log risks, and incident response.
- External integration docs:
  - Add a third-party integration guide under `docs/integrations/` showing how
    projects consume Vault through API, SDK, CLI, and templates without using
    OpenSandbox internals.
  - Include a migration guide for projects that currently use direct
    OpenSandbox or another sandbox provider.
- Examples and cookbooks:
  - Add runnable examples for OpenAI-compatible APIs, Anthropic, private Git,
    npm/PyPI, private registry pulls, private API headers, and OpenCode-style
    agent templates.
- Release, migration, and verification docs:
  - Update README, release notes, feature matrix, upgrade notes,
    troubleshooting runbooks, and `docs/test-report.md`.
  - Capture local, CI, k0s, and OpenShift verification commands and results.

Documentation acceptance criteria:

- A new user can understand what Credential Vault does and run one safe
  end-to-end example without reading source code.
- An integration team can use the SDK or CLI without learning OpenSandbox
  sidecar implementation details.
- An operator can decide whether their cluster supports Credential Vault before
  installing it.
- A maintainer can change one source adapter or provider adapter without
  reverse-engineering the whole feature.
- A security reviewer can verify where secrets are held, where they are never
  stored, how redaction is enforced, and what is audited.

### Documentation Deliverable Matrix

| Track | Required artifacts | Acceptance gate |
|-------|--------------------|-----------------|
| Public product docs | Website Vault guide, source-type matrix, provider preset guide, template-slot guide, examples, limitations. | A developer can run a safe end-to-end provider example without reading source code. |
| Public API docs | `docs/api.md`, OpenAPI schemas, examples, typed errors, redaction guarantees, compatibility notes. | API consumers can integrate without depending on OpenSandbox implementation details. |
| SDK docs | `docs/sdk.md`, package README, typed examples for create-time credentials, sandbox attachment, slots, rehydration, and errors. | A TypeScript user can implement the flow with discoverable methods and typed responses. |
| CLI docs | `docs/cli.md`, package README, CI examples, JSON output contracts, safe secret input, troubleshooting. | A shell user can avoid putting raw secrets in command history or process listings. |
| Technical architecture docs | Domain model, source adapters, provider boundary, OpenSandbox adapter, egress coupling, rehydration, audit, encryption. | A maintainer can modify one adapter without reverse-engineering the whole feature. |
| Internal engineering docs | Code ownership, invariants, module layout, test strategy, decision log, known limitations, maintenance checklist. | Future contributors understand where changes belong and which invariants must hold. |
| External integration docs | Third-party integration guide for API, SDK, CLI, templates, and operational requirements. | Integration teams can add Harakiri as a sandbox provider without private implementation knowledge. |
| Operator docs | k0s, Kubernetes, OpenShift, OpenSandbox versions, `dns+nft`, Credential Proxy, env vars, encryption keys, backup/restore. | Operators can decide whether their cluster profile supports Credential Vault before enabling it. |
| Security docs | Threat model, secret custody, RBAC, redaction, audit, rotation, incident response, external secret policies. | A security reviewer can verify custody boundaries and non-goals. |
| Release and verification docs | Changelog, migration notes, feature matrix, test report, runtime support matrix, troubleshooting runbook. | OSS users know what is supported, degraded, or not available in the release. |

## Delivery Gates

Each gate must leave the product usable and documented without pretending that
later gates are already complete.

1. Foundation gate: stable domain model, OpenAPI types, provider boundary, and
   documented OpenSandbox compatibility.
2. Runtime MVP gate: `inline_ephemeral` credentials can be attached at creation
   time and to running sandboxes, tested from inside the sandbox, detached, and
   listed as sanitized metadata.
3. Presets and slots gate: provider presets and template credential slots make
   common model, Git, package registry, and private API workflows easy without
   custom binding hand-authoring.
4. Stored-source gate: encrypted workspace secrets and external references
   support rehydration and reusable team workflows.
5. Dynamic-source gate: short-lived provider-issued credentials support GitHub
   App, OAuth, OIDC, or cloud STS patterns without expanding static secret
   custody.
6. Premium DX gate: UI, SDK, CLI, examples, docs, and browser-tested flows feel
   coherent enough for a top-tier OSS sandbox project.
7. Release gate: k0s and OpenShift support profiles, security review,
   migration notes, and public documentation are complete.

## Execution Cadence

The plan should be executed in architecture slices, not isolated feature
tickets. A slice is acceptable when it crosses the layers needed for one stable
capability and leaves the codebase simpler or equally simple.

Every implementation slice should declare:

- Public contract affected: API, SDK, CLI, UI, docs, or no public change.
- Domain model affected: source, secret, slot, binding, attachment, injection,
  rehydration, audit, or policy.
- Runtime/provider impact: dev provider only, OpenSandbox provider, lifecycle,
  k0s, OpenShift, or no provider change.
- Persistence impact: migrations, encryption, audit, state transitions, or no
  persistence change.
- Documentation impact: public docs, technical docs, internal docs, operator
  docs, security docs, integration docs, examples, release notes, or
  verification report.
- Verification impact: unit, API, SDK, CLI, browser, OpenAPI, k0s,
  OpenShift, security/redaction, or docs checks.

Minimum slice gate:

- The public vocabulary remains aligned with the Architecture Model.
- The source adapter and provider adapter responsibilities stay separated.
- Secret values are not exposed by API, SDK, CLI, UI, logs, docs, tests, or
  generated schemas.
- Runtime unsupported states fail clearly before misleading product state is
  recorded.
- Tests and docs land with the behavior they describe.
- The plan decision log or tech debt section is updated when a meaningful
  tradeoff is accepted.

Preferred sequence:

1. Stabilize contracts and compatibility promises.
2. Complete template-slot launch mapping for existing source types.
3. Complete stored-source rehydration and usage metadata.
4. Add workspace Vault UI and create-sandbox slot mapping UX.
5. Add external references for OSS/operator-friendly deployments.
6. Add dynamic credentials for high-value short-lived integrations.
7. Finish docs, verification, security review, and OSS release packaging.

## Phases

### Phase 0: Architecture Alignment And Future-Proofing
**Status**: Complete
- [x] Create one umbrella exec plan for Credential Vault instead of separate
      short-lived feature plans.
- [x] Define the durable vocabulary:
      `SecretSource`, `WorkspaceSecret`, `ExternalSecretReference`,
      `DynamicCredential`, `CredentialProviderPreset`,
      `CredentialBinding`, `TemplateCredentialSlot`,
      `SandboxCredentialAttachment`, `VaultInjection`,
      `VaultRehydration`, and `CredentialAuditEvent`.
- [x] Capture OpenSandbox as the runtime injection provider while keeping the
      Harakiri API, SDK, CLI, and UI provider-neutral.
- [x] Add a documentation strategy that covers public, technical, internal,
      external integration, operator, security, release, and verification docs.
- [x] Add capability workstreams and execution cadence so the work advances as
      platform architecture instead of isolated feature tickets.
- [x] Audit current shipped Credential Vault work against the guardrails and
      remove any public contract that cannot survive encrypted, external, or
      dynamic source support.
- [x] Define the first stable API compatibility promise for the
      `inline_ephemeral` source, sanitized attachment metadata, test access,
      and error codes.
- [x] Define a release feature matrix that separates shipped, preview,
      planned, degraded, unsupported, and operator-action-required behavior.

Foundation audit evidence on 2026-09-03:

- Added `docs/credential-vault-support.md` as the authoritative public contract
  promise and runtime/source feature matrix.
- Confirmed the shipped request unions are source-discriminated, template slot
  mappings remain source-neutral, response DTOs are sanitized, and provider
  internals stay outside public contracts.
- Used the matrix to keep later external, dynamic, reconciliation, and
  member-use work out of the initial compatibility promise. Those capabilities
  are now shipped; restricted OpenShift remains explicitly
  operator-action-required.

### Phase 1: Provider Research And Compatibility Spike
**Status**: Complete
- [x] Re-read current OpenSandbox Credential Vault, egress, lifecycle, and SDK
      docs immediately before implementation.
- [x] Confirm deployed OpenSandbox server and egress image versions meet the
      documented minimums.
- [x] Verify Credential Vault in k0s with one API-key provider flow:
      create sandbox with `credentialProxy.enabled`, default-deny egress, fake
      env, vault binding, command inside sandbox, and successful outbound auth.
- [x] Verify negative cases: destination not allowed, binding mismatch,
      ambiguous binding, DNS-only mode, missing credential proxy, and terminated
      sandbox.
- [x] Verify lifecycle behavior: create credential-bearing sandbox, pause,
      resume, prove vault state is empty, rehydrate, then prove access works.
- [x] Verify route/log redaction does not expose raw values or placeholders that
      could be used for exfiltration.
- [x] Classify runtime support as `supported`, `degraded`, `unsupported`, or
      `operator_action_required` for k0s and OpenShift profiles.
- [x] Document OpenShift constraints, especially whether required egress
      sidecar/network capabilities conflict with restricted SCC expectations.

Evidence recorded on 2026-09-03:

- OpenSandbox deployment in k0s is healthy on `server:v0.2.3`.
- OpenSandbox egress sidecar image is `opensandbox/egress:v1.1.7`.
- Server config has `[egress] mode = "dns+nft"` and
  `image = "opensandbox/egress:v1.1.7"`.
- A live sandbox was created with `credentialProxy.enabled`, default-deny
  egress, an explicit allow rule for `httpbin.org`, and a fake env value.
- `POST /credential-vault` on the egress sidecar returned sanitized metadata
  for one credential and one binding.
- A command inside the sandbox verified that the fake env value was visible in
  the process and that the outbound HTTPS request received the injected
  `X-Api-Key` header from the vault.
- The smoke sandbox was deleted after verification.

### Phase 2: Domain Model, Database, And Security Boundary
**Status**: Complete
- [x] Add shared types for secret sources, provider presets, credential slots,
      bindings, attachments, injection state, sanitized metadata, and audit
      events.
- [x] Add database tables for sandbox credential attachments, template
      credential slots, and encrypted workspace credential secret custody.
- [x] Add a database table for external secret references with sanitized
      locator, access-policy, validation-state, and lifecycle metadata.
- [x] Add database tables for dynamic credential issuers, vault injection
      records, and full rotation/audit metadata.
- [x] Store secret values only for `harakiri_encrypted` sources, never for
      ephemeral sources or provider-side active vault state.
- [x] Add envelope encryption design with configurable key source:
      local development key, Kubernetes Secret, and future KMS/provider key
      adapters.
- [x] Add secret versioning and rotation metadata so templates/sandboxes can
      refer to stable logical secrets while values rotate.
- [x] Add initial workspace secret version and rotation metadata for
      `harakiri_encrypted` custody records.
- [x] Define redaction helpers shared by API logs, audit events, provider
      responses, test output, CLI output, and dashboard rendering.
- [x] Define RBAC rules:
      admins manage workspace secrets, members can use permitted secrets, and
      regular users cannot read secret values.
- [x] Define deletion semantics:
      soft-disable for audit, hard-delete encrypted value, detach from running
      sandboxes, and preserve metadata-only audit history.
- [x] Define workspace secret deletion semantics:
      clear encrypted value custody, mark deleted, and preserve metadata-only
      history.
- [x] Add migrations and focused migration contract tests for shipped source
      types.

Implementation evidence on 2026-09-03:

- Added `CredentialVault*` shared protocol types, OpenAPI schemas, and typed
  API errors.
- Added `sandbox_credential_attachments` as the first durable metadata table.
- Added `credential_slots` metadata columns on `templates` and
  `template_versions` so templates can declare provider-backed requirements and
  immutable versions can snapshot those declarations.
- The first migration intentionally stores attachment metadata, fake env
  values, provider revisions, and audit-oriented state, but not ephemeral secret
  values.
- Added `workspace_credential_secrets` for encrypted workspace secret custody.
  The table stores ciphertext, IV, tag, provider preset, fake env metadata,
  binding metadata, egress domains, version, rotation timestamp, disabled state,
  deleted state, creator metadata, and sanitized metadata.
- Workspace secret values are encrypted through the existing control-plane
  secret-box helper and are never selected into response DTOs.
- Added `external_secret_references` for source-neutral external locators,
  member-use policy, lifecycle state, and sanitized validation metadata. The
  migration and schema tests prohibit plaintext credential columns.
- Dynamic issuer state, attachment injection/refresh/provider state, versioned
  encrypted custody, and metadata-only audit records are persisted. Credential
  values remain confined to trusted resolution and provider-apply calls.

### Phase 3: Harakiri API Contract
**Status**: Complete
- [x] Add workspace secret APIs:
      create, list, inspect sanitized metadata, rotate, disable, enable, delete,
      and audit.
- [x] Add external secret reference APIs:
      create, validate, list, inspect sanitized metadata, update, disable, and
      delete.
- [x] Add provider preset APIs:
      list built-in presets, inspect required fields, inspect generated egress
      domains, and expose default test targets.
- [x] Add custom private API preset validation once template slots can capture
      user-supplied host requirements safely.
- [x] Add template credential slot APIs:
      create/update/list slots, mark required/optional, set fake env names, bind
      provider presets, and define scope.
- [x] Extend sandbox create API to accept credential mappings from template
      slots to the implemented source types: `inline_ephemeral` and
      `harakiri_encrypted`.
- [x] Extend sandbox create API and template-slot mappings to accept
      `external_ref` sources.
- [x] Extend sandbox create API and template-slot mappings to accept `dynamic`
      sources after that adapter exists.
- [x] Add running sandbox credential APIs for attach, detach, list sanitized
      attachments, and test access.
- [x] Add running sandbox credential API for stored-source rehydrate.
- [x] Add deeper running-sandbox injection state inspection.
- [x] Add OpenAPI schemas and examples for every public shape.
- [x] Ensure all APIs return typed error codes for unavailable provider support,
      missing permissions, invalid binding, unresolved external secret,
      rehydration required, and policy conflicts.

Completed API scope:

- `POST /v1/sandboxes` accepts direct credentials and template-slot mappings
  for `inline_ephemeral`, `harakiri_encrypted`, `external_ref`, and `dynamic`
  sources. Required slots, source/profile compatibility, duplicate bindings,
  credential limits, fake env conflicts, and safe egress are validated before
  provider creation; a failed post-create attachment rolls the sandbox back.
- Running-sandbox endpoints list, attach, detach, test, inspect, refresh, and
  rehydrate credentials while returning only sanitized attachment metadata.
- Admin APIs manage encrypted workspace sources, Kubernetes external
  references, GitHub App dynamic issuers, custom exact-host API profiles, and
  metadata-only audit history. Explicit use policy controls which sources are
  discoverable and attachable by members.
- Template APIs persist required/optional value-free slots and snapshot them in
  immutable versions without source selections or credential values.
- Stable typed failures and OpenAPI examples cover permissions, source
  resolution, provider capability, binding, policy, refresh, and lifecycle
  errors. Synchronous creation is required when credentials are supplied
  because inline values are deliberately not persisted for replay.

### Phase 4: Provider Boundary And OpenSandbox Vault Adapter
**Status**: Complete
- [x] Extend the runtime provider interface with capability-gated Credential
      Vault methods instead of adding OpenSandbox-specific service calls.
- [x] Implement an OpenSandbox adapter that compiles Harakiri bindings into
      OpenSandbox Credential Vault create/patch requests.
- [x] Ensure sandbox creation enables OpenSandbox Credential Proxy only when at
      least one credential attachment requires vault injection.
- [x] Compose credential-driven egress rules with the existing Harakiri outbound
      access policy compiler.
- [x] Require or strongly default credential-bearing sandboxes to default-deny
      outbound policy.
- [x] Store provider operation IDs and sanitized provider metadata, not raw
      provider payloads with values.
- [x] Add provider health/capability detection for `credentialVault`,
      `credentialVaultPatch`, `credentialVaultSanitizedRead`, and
      `credentialVaultRequiresRehydration`.
- [x] Add structured provider errors that separate user mistakes from operator
      misconfiguration.
- [x] Add conformance tests for the provider boundary using the dev provider and
      real OpenSandbox-backed k0s deployment.

Completed provider-boundary scope:

- Create-time `inline_ephemeral` credentials merge their binding hosts into the
  launch egress policy and default the sandbox to restricted outbound access
  unless the caller uses a custom policy.
- Running-sandbox attachment compiles and applies required allow rules before
  provider injection. A blocked policy or provider-side egress failure returns
  `credential_vault_egress_conflict` and does not create misleading injected
  state.
- Source material resolution, provider apply/read/delete, and scheduler
  reconciliation remain separate responsibilities. Neither the API nor the
  control-plane services use Kubernetes exec or provider-specific pod details.

### Phase 5: Ephemeral Source MVP
**Status**: Complete
- [x] Implement `inline_ephemeral` as the first source adapter using the final
      domain model and API shape.
- [x] Support passing one-time credentials at sandbox creation without storing
      plaintext in the database.
- [x] Support applying one-time credentials to a running sandbox through an API
      that immediately writes to OpenSandbox Credential Vault and then forgets
      the value.
- [x] Return sanitized attachment and injection metadata after successful apply.
- [x] Mark resumed sandboxes with ephemeral credentials as
      `requires_reinjection` because Harakiri cannot rehydrate values it does
      not store.
- [x] Add CLI flows that avoid shell-history leakage for `--from-env` and
      `--from-stdin`.
- [x] Add interactive hidden prompt for local manual credential entry.
- [x] Add SDK examples for Anthropic, OpenAI-compatible APIs, GitHub, and
      private API headers.

### Phase 6: Template Credential Slots And Provider Presets
**Status**: Complete
- [x] Define built-in provider presets for model APIs, Git hosting, and package
      registries.
- [x] For each built-in preset, define fake env variables, binding shape, allowed
      domains, methods, paths, auth type, and test URL/command.
- [x] Add custom/private API preset validation after template slots define a
      safe way to require user-supplied hosts.
- [x] Add `harakiri.toml` support for declaring template credential slots.
- [x] Add template UI for required and optional slots, preset selection, fake
      env names, and binding previews.
- [x] Add create-sandbox UI for mapping required slots before launch.
- [x] Add validation that required template slots are satisfied before sandbox
      creation unless explicitly skipped by an operator-supported mode.
- [x] Add examples for `open-agents-dev`, OpenCode-style templates, Git-backed
      agents, and package-installing agents.
- [x] Add tests proving template versions snapshot credential-slot definitions
      without copying secret values.

Completed provider preset scope:

- Added static built-in presets for `openai`, `anthropic`, `openrouter`,
  `github`, `gitlab`, `npm`, and `pypi-publish`.
- Presets contain no real values; they expose fake env defaults, credential and
  binding names, binding match rules, auth type, egress domains, and default
  test targets.
- `harakiri.toml` supports `credential_slots = [...]` and
  `optional_credential_slots = [...]` using built-in provider preset IDs.
- `harakiri template init` can write required and optional slot declarations,
  and `harakiri template build` sends them through the public template API.
- Template creation expands preset declarations into sanitized slot metadata,
  and template builds snapshot those declarations into immutable versions.
- Custom profiles safely model one exact HTTPS host, bounded methods and paths,
  explicit header or bearer auth, fake env, test target, and egress scope.
  Stored, external, dynamic, and inline sources must match the slot profile at
  launch and rehydration time.

### Phase 7: Encrypted Workspace Vault
**Status**: Complete
- [x] Implement `harakiri_encrypted` workspace custody with control-plane
      encryption.
- [x] Implement running-sandbox runtime attachment from `harakiri_encrypted`
      sources.
- [x] Implement synchronous sandbox creation with explicit
      `harakiri_encrypted` source references.
- [x] Add workspace secret create/list/inspect/rotate/disable/enable/delete
      flows in API, SDK, and CLI.
- [x] Add workspace secret management UI.
- [x] Add secret value write-only behavior: values can be set or rotated but
      never read back.
- [x] Add attachment-derived usage metadata showing active sandbox count, total
      attachments, and last attachment time. Templates declare slots and never
      persist workspace-secret IDs, so template-to-secret usage is intentionally
      not modeled.
- [x] Add automatic vault rehydration after resume for active encrypted
      workspace secret attachments when source material is available.
- [x] Keep snapshot artifacts credential-free; require explicit resolvable
      credential mappings on restore, and automatically reconcile provider
      sidecar replacement when source material is available.
- [x] Add background reconciliation for sandboxes whose injection state is stale
      or requires rehydration.
- [x] Add metadata-only audit events for workspace secret creation, rotation,
      disable, enable, and deletion.
- [x] Add audit events for stored-source attachment.
- [x] Add audit events for stored-source detachment, rehydration, and test.
- [x] Add API and service permission checks: admins manage all workspace
      secrets, while members can discover and attach only secrets explicitly
      shared for organization-member use.
- [x] Add browser/component authorization coverage and live browser acceptance
      for forbidden secret management actions and permitted member launch
      attachment.

### Phase 8: External Secret References
**Status**: Complete
- [x] Add adapter interface for external secret resolution.
- [x] Implement Kubernetes Secret reference support for cluster-installed OSS
      deployments.
- [x] Add a documented integration path for External Secrets Operator without
      hard-coding one vendor into the Harakiri domain model.
- [x] Add design hooks for HashiCorp Vault and cloud secret-manager adapters.
- [x] Add operator configuration for allowed reference namespaces, names,
      prefixes, and service accounts.
- [x] Add test flows where Harakiri stores only references and resolves values
      server-side at injection time.
- [x] Add clear error states for missing secret, denied reference, malformed
      value, unavailable resolver, and stale reference.
- [x] Document the security boundary for customer clusters where Harakiri is not
      allowed to custody plaintext secrets at rest.

Implementation evidence on 2026-09-03:

- Added the source-neutral external resolver contract and registry. The first
  resolver reads Kubernetes Secrets through the Kubernetes API and never uses
  pod exec or exposes resolved values through Harakiri responses.
- Added admin-managed external-reference CRUD, validation, enable/disable, and
  deletion APIs. Members discover and attach only references explicitly shared
  with organization members.
- Added `external_ref` material resolution to synchronous sandbox creation,
  template-slot launch mapping, running-sandbox attachment, and lifecycle
  rehydration through the same credential-source dispatcher as encrypted
  workspace secrets.
- Added Kubernetes namespace/name/prefix allowlists and least-privilege Helm
  RBAC. Exact allowed names render as `resourceNames`; prefix policies require
  broader Kubernetes `get` permission and remain enforced in application code.
- Added dashboard, SDK, and CLI management and launch flows with sanitized
  output and typed resolution failures.
- Added `docs/external-secret-references.md`, operator Helm documentation,
  public product/API/SDK/CLI docs, internal architecture notes, support matrix,
  OpenAPI schemas, and central troubleshooting entries. External Secrets
  Operator is documented as one way to materialize an approved Kubernetes
  Secret, not as a Harakiri domain dependency.
- Focused API route/service/schema tests, SDK tests, CLI tests, web docs tests,
  Helm lint/render checks, OpenAPI drift checks, and `git diff --check` pass.

### Phase 9: Dynamic And JIT Credentials
**Status**: Complete
- [x] Define the `dynamic` source contract without tying it to one provider.
- [x] Start with one high-value implementation candidate, such as GitHub App
      installation tokens or OAuth refresh-token exchange.
- [x] Add expiry, refresh, revocation, and rehydration semantics.
- [x] Ensure dynamic credentials are short-lived and scoped to the sandbox,
      template slot, route, or command workflow where possible.
- [x] Add audit events that record issuer, scope, expiry, and attachment without
      recording token values.
- [x] Add UI states for expiring, expired, refreshed, failed refresh, and
      revoked credentials.
- [x] Document why this is optional premium hardening and not required for the
      first usable vault release.

### Phase 10: Dashboard UX
**Status**: Complete
- [x] Add a workspace Vault screen using Harakiri design tokens and compact
      operational layout.
- [x] Add provider preset cards or rows that show purpose, required field,
      injected header/env behavior, allowed domains, and last test result.
- [x] Add template credential-slot authoring with a readable binding preview.
- [x] Add create-sandbox slot mapping with clear required/optional states.
- [x] Add sandbox detail Vault view with attachments, injection status, test
      access, rehydration actions, and audit timeline.
- [x] Add explicit states for provider unsupported, egress unavailable,
      `dns+nft` missing, service mesh conflict, no permission, secret disabled,
      and reinjection required.
- [x] Ensure the shipped workspace Vault screen never displays real values and
      never offers a copy action for
      secret values after creation.
- [x] Use the same segmented controls and visual language already used in the
      Network view for related policy choices.
- [x] Browser-test the UX at desktop and mobile widths for no overlap, no
      unwanted horizontal scrolling, readable tables, and clear empty states.

Completed dashboard UX scope:

- Added an admin-only Dashboard Vault navigation item that is hidden from
  regular members through the account capability model.
- Added a workspace Vault screen for encrypted workspace secrets. The screen
  lists sanitized metadata, provider preset, status, fake env keys, egress
  destinations, and update time.
- Added create, rotate, disable, enable, and delete actions for workspace
  secrets. Create and rotate inputs use write-only password fields; existing
  values are never displayed and there is no copy action for secret values.
- Added new-sandbox template slot mapping for preset-backed required and
  optional slots. The UI can map a slot to an active matching workspace secret
  or a one-time value, then sends the stable `credentialMappings` contract to
  the API without exposing secret values after launch.
- Added external-reference and dynamic-issuer management, template slot
  authoring, sandbox attachment inspection/test/refresh/rehydrate/detach,
  Network-policy coupling, and filtered audit history. Live desktop/mobile and
  member-launch acceptance found no value disclosure or horizontal overflow.

### Phase 11: SDK And CLI Premium Experience
**Status**: Complete
- [x] Add SDK workspace secret methods with write-only value handling.
- [x] Add SDK sandbox creation support for inline ephemeral and explicit
      encrypted workspace secret credential sources.
- [x] Add SDK sandbox creation support for template slot mapping.
- [x] Add SDK sandbox methods:
      `credentials.list()`, `credentials.attach()`, `credentials.detach()`,
      and `credentials.test()`.
- [x] Add SDK sandbox and client helpers for attaching stored workspace secrets
      to running sandboxes.
- [x] Add SDK sandbox method `credentials.rehydrate()`.
- [x] Add SDK `credentials.testAccess()` alias if the final public vocabulary
      needs that spelling.
- [x] Add typed SDK errors for credential unavailable, provider unsupported,
      missing secret, policy conflict, permission denied, and reinjection
      required.
- [x] Add CLI commands:
      `vault attach`, `vault list`, `vault detach`, and `vault test`.
- [x] Add CLI commands:
      `vault secrets list/get/create/rotate/disable/enable/delete`.
- [x] Add CLI command for stored-source runtime attach.
- [x] Add CLI command for `vault rehydrate`.
- [x] Add CLI support for `--from-env`, `--from-stdin`, JSON output, and
      CI-friendly non-interactive mode for running sandbox attachments.
- [x] Add CLI hidden prompt for local manual credential entry.
- [x] Ensure CLI examples do not encourage putting secrets directly in shell
      history or process listings.
- [x] Add SDK and CLI tests around redaction, scriptable errors, and no-value
      readback.

Completed SDK/CLI scope:

- The SDK exposes namespaced preset, encrypted source, external reference,
  dynamic issuer, audit, template-slot, sandbox creation, and runtime attachment
  resources. Sandbox helpers support list, attach, detach, inspect, test access,
  refresh, and rehydrate with typed errors and sanitized responses.
- The CLI exposes the same source-management and runtime workflows under
  `harakiri vault`, plus template slot authoring and create-time mappings.
  Secret input supports environment variables, stdin, and an explicit hidden
  prompt; JSON output is stable for automation and never reads values back.
- CLI and SDK reject non-replayable async credential creation locally. Packed
  consumer conformance and a real CLI smoke exercise source creation, launch,
  rotation, inspection, ephemeral attach/detach, revocation, audit, and cleanup.

### Phase 12: Documentation, Education, And Knowledge Base
**Status**: Complete

Phase 12 is a release-blocking phase, not a cleanup pass. Credential Vault is a
security-sensitive platform capability, so the documentation must let four
audiences succeed independently:

- Developers adopting Harakiri from the public docs.
- Integration teams adding Harakiri as a sandbox provider in another product.
- Operators installing Harakiri on Kubernetes, k0s, OpenShift, or private
  registry environments.
- Maintainers extending source adapters, provider adapters, encryption,
  rehydration, and audit behavior without private session context.

Documentation subphases:

1. Public product documentation:
   website docs, repository guide, screenshots where useful, quickstart,
   supported workflows, source-type matrix, provider presets, template slots,
   create flow, running-sandbox flow, rehydration, limitations, and common
   troubleshooting.
2. Technical documentation:
   domain model, source adapter contract, provider boundary, OpenSandbox
   adapter, egress coupling, rehydration model, audit model, encryption model,
   failure modes, schema evolution, and ADRs for durable decisions.
3. Internal engineering documentation:
   module ownership, code layout, invariants, redaction rules, review
   checklist, test matrix, migration rules, known limitations, and maintainer
   runbooks.
4. External integration documentation:
   API/SDK/CLI integration guide, template-slot contract, lifecycle caveats,
   auth requirements, error handling, provider capability matrix, and partner
   handoff checklist.
5. Operator and deployment documentation:
   Kubernetes/k0s/OpenShift requirements, OpenSandbox version compatibility,
   `dns+nft`, Credential Proxy, registry mirroring, one-namespace installs,
   environment variables, encryption keys, backup/restore, upgrade, health
   checks, and degraded or unsupported runtime profiles.
6. Security documentation:
   threat model, custody choices, no-readback guarantees, RBAC, auditability,
   rotation, incident response, external secret-manager trust boundaries,
   snapshot/log risks, and explicit non-goals.
7. Release and verification documentation:
   README, changelog/release notes, migration notes, feature matrix,
   troubleshooting runbooks, local/CI/k0s/OpenShift test reports, and browser
   smoke evidence for product docs.

Release cannot mark Credential Vault complete until each documentation
subphase has an owner, source path, acceptance gate, and verification evidence.

- [x] Audit all existing docs touched by Credential Vault and classify them as
      current, stale, incomplete, or missing. Track every missing artifact in
      this phase before declaring docs complete.
- [x] Create a documentation inventory with owner, audience, source path,
      website/public status, and acceptance gate for every required document.
- [x] Define naming and vocabulary rules so public docs consistently use
      `Vault`, `Credential`, `Secret source`, `Provider preset`,
      `Template slot`, `Attached`, `Injected`, and `Needs reinjection`.
- [x] Add current-slice public product documentation on the website:
      create-time and running-sandbox ephemeral vault attachments, provider
      presets, encrypted workspace secret custody, running-sandbox stored-secret
      attachment, test access, provider-boundary behavior, and security
      behavior.
- [x] Expand public product documentation on the website:
      Vault vision, supported workflows, source-type matrix, provider presets,
      template slots, create flow, running-sandbox flow, rehydration, common
      agent examples, and current limitations.
- [x] Add public API documentation for current endpoints:
      OpenAPI schemas, endpoint examples, provider preset endpoints, error
      codes, redaction rules, and compatibility guarantees for create-time
      credentials, running-sandbox attach/list/detach/test, stored-secret
      attachment, and workspace secret custody.
- [x] Expand public API documentation:
      remaining workspace secret details, provider preset APIs,
      template slot APIs, rehydration APIs, audit APIs, pagination, RBAC
      errors, and migration guarantees.
- [x] Add SDK documentation for current endpoints:
      TypeScript examples for provider presets, create-time and running-sandbox
      ephemeral credentials, workspace secret custody, stored-secret
      attachment, safe value sourcing, test access, and detach.
- [x] Expand SDK documentation:
      installation, authentication, ephemeral credentials, workspace secrets,
      template slots, Git access, model provider access, private API access,
      rehydration, typed errors, and integration-test recipes.
- [x] Add CLI documentation for current endpoints:
      provider presets, one-time credentials, attaching to sandboxes, testing
      access, workspace secret custody, stored-secret attachment, JSON mode,
      and CI-safe secret input.
- [x] Expand CLI documentation:
      installation, login, safe secret input, creating secrets, rotating
      secrets, mapping template slots, rehydration, workspace automation,
      JSON output contracts, and CI examples.
- [x] Add current technical architecture documentation:
      domain model, provider boundary, OpenSandbox adapter, egress coupling,
      encrypted workspace secret custody, stored-secret runtime attachment,
      lifecycle rehydration caveat, and audit metadata model.
- [x] Expand technical architecture documentation:
      envelope encryption, dynamic credential
      issuers, source adapter contract, provider adapter contract, full
      rehydration, rotation model, failure modes, and schema evolution.
- [x] Add current-slice internal engineering documentation:
      module ownership, code layout, invariants, test strategy, decision log,
      encrypted workspace secret custody, known limitations, and current
      adapter behavior.
- [x] Expand internal engineering documentation:
      encrypted source adapter maintenance, dynamic credential
      issuers, rehydration jobs, RBAC checks, migration strategy, future adapter
      guidance, and maintenance checklist.
- [x] Add operator documentation:
      required OpenSandbox versions, `dns+nft` requirement, Credential Proxy,
      Kubernetes/k0s settings, OpenShift constraints, service-mesh caveats,
      environment variables, encryption key setup, backup/restore, upgrade,
      health checks, and runtime support matrix.
- [x] Add dedicated OpenShift/operator acceptance docs:
      supported SCC assumptions, required OpenSandbox sidecar capabilities,
      image/chart inputs, registry mirroring, one-namespace install mode,
      degraded profiles, and how to disable Vault where runtime requirements are
      not met.
- [x] Add current security documentation:
      ephemeral secret custody, encrypted workspace secret write-only custody,
      redaction guarantees, provider boundary, and what Harakiri does not
      protect against in the MVP.
- [x] Expand security documentation:
      full threat model, secret custody options, RBAC, auditability, rotation,
      incident response, external secret-manager policies, snapshot/log risks,
      and security-review checklist.
- [x] Add external integration documentation:
      how third-party projects should depend on Harakiri Vault through API,
      SDK, and CLI without knowing OpenSandbox details.
- [x] Add partner-facing integration checklist:
      required Harakiri version, API base URL, SDK/CLI install path, auth mode,
      template slot contract, credential source choices, route behavior, egress
      behavior, lifecycle caveats, and support escalation data to collect.
- [x] Add a maintainer-facing internal implementation guide:
      code ownership, module boundaries, source-adapter contract,
      provider-adapter contract, redaction invariant, migration checklist,
      test matrix, and review checklist.
- [x] Add examples and cookbook docs:
      Anthropic/OpenAI-compatible model calls, private Git clone, npm/PyPI
      package access, private registry pull, private API call, and
      OpenCode-style agent template.
- [x] Add runnable example validation notes:
      prerequisites, exact commands, expected output, how to clean up generated
      sandboxes/secrets, and where to look when a provider rejects credentials.
- [x] Update release and migration docs:
      README, changelog/release notes, architecture overview, runtime contract,
      template docs, egress docs, lifecycle docs, SDK docs, CLI docs,
      OpenShift install docs, and upgrade notes.
- [x] Add troubleshooting and runbook docs:
      `401`, provider unsupported, missing `dns+nft`, blocked outbound host,
      stale vault after resume, disabled secret, failed external resolver,
      failed dynamic issuer, service mesh conflicts, and OpenShift capability
      limits.
- [x] Add verification documentation:
      local test commands, CI checks, k0s smoke tests, OpenShift profile tests,
      provider versions, example sandbox IDs where useful, known limitations,
      and regression coverage.
- [x] Add docs quality checks:
      broken-link check where available, OpenAPI regeneration check, SDK/CLI
      README examples kept in sync with tests, website docs browser smoke test,
      and manual review checklist for redaction claims.

Completed documentation scope:

- Public product, API, SDK, CLI, template, egress, lifecycle, error, cookbook,
  support-matrix, release, migration, and website documentation cover every
  shipped source and workflow.
- Technical and internal docs define the source/provider boundaries, envelope
  encryption, state machine, scheduler reconciliation, schema ownership,
  redaction invariants, extension guidance, and maintainer review checklist.
- Operator, OpenShift, external-reference, security/threat-model, incident,
  and external-integration docs state prerequisites, trust boundaries,
  unsupported profiles, troubleshooting data, and partner handoff steps.
- `docs/internal/credential-vault-documentation-inventory.md` owns vocabulary,
  audience, source path, ownership role, and release gate for every canonical
  artifact. OpenAPI drift, links, examples, package surfaces, and security
  boundaries are executable checks in the repository and CI.

### Phase 13: Verification, Release, And OSS Readiness
**Status**: Complete
- [x] Add unit tests for encrypted workspace secret custody, redaction,
      duplicate-name rejection, admin-only management, rotation, disable,
      enable, and deletion.
- [x] Add unit tests for domain validation, binding compilation, source adapter
      behavior, redaction, RBAC, and audit records.
- [x] Add API integration tests for workspace secrets, template slots, sandbox
      creation with credentials, attach/detach, test access, and error cases.
- [x] Add focused API/service/schema tests for template-slot launch mappings
      with stored workspace secrets, provider mismatch rejection, missing slot
      rejection, mapping selector validation, and total create-time credential
      limits.
- [x] Add focused tests proving duplicate provider credential names are
      rejected before create-time or running-sandbox provider injection.
- [x] Add provider conformance tests against dev provider and real
      OpenSandbox-backed k0s.
- [x] Add web component tests and live browser acceptance covering Vault,
      template slots, create flow, sandbox detail, Network coupling, and
      admin/member permission behavior.
- [x] Add CLI smoke tests for ephemeral credentials and workspace secrets.
- [x] Add lifecycle tests proving resume-time stored-source rehydration and
      clear `requires_reinjection` behavior for ephemeral secrets.
- [x] Add lifecycle tests proving restore-time and sidecar-replacement
      rehydration after those flows exist.
- [x] Add source scans that fail if real secrets are logged, returned, stored in
      sandbox env metadata, or copied into snapshots.
- [x] Deploy to k0s and run a full credential-bearing sandbox scenario.
- [x] Validate OpenShift install behavior and document whether Credential Vault
      is enabled, disabled, or operator-action-required in restricted clusters.
- [x] Update `docs/test-report.md` with commands, sandbox IDs, provider
      versions, results, and known limitations.
- [x] Prepare a release note that is honest about supported source types and
      runtime profiles.

Verification evidence on 2026-09-03:

- `pnpm --filter @harakiri/api typecheck`
- `pnpm --filter @h-sandbox/sdk typecheck`
- `pnpm --filter @h-sandbox/cli typecheck`
- `pnpm --filter @harakiri/web typecheck`
- `pnpm openapi:write && pnpm openapi:check`
- `pnpm --filter @harakiri/api typecheck`
- `pnpm --filter @harakiri/api exec node --test --import tsx src/external-secret-references-service.test.ts src/external-secret-references-routes.test.ts src/credential-vault-service.test.ts src/credential-vault-schema.test.ts`
  passed for external-reference service, authorization, route, source
  resolution, redaction, and migration coverage.
- `pnpm --filter @h-sandbox/sdk typecheck && pnpm --filter @h-sandbox/sdk test`
  passed with 45 SDK tests after adding external-reference resources and
  attachment source support.
- `pnpm --filter @h-sandbox/cli typecheck && pnpm --filter @h-sandbox/cli test`
  passed with 62 CLI tests after adding external-reference management,
  validation, and attachment flows.
- `pnpm --filter @harakiri/web typecheck && pnpm --filter @harakiri/web exec node --test --import tsx src/docs-content.test.ts src/dashboard-routes.test.ts`
  passed after adding external-reference dashboard and public documentation
  content.
- `helm lint infra/charts/harakiri` and an external-resolver render with exact
  allowed Secret names passed; the rendered Role contains only `get` and the
  configured `resourceNames`.
- `pnpm openapi:check` and `git diff --check` passed after documenting the
  external-reference contract.
- `pnpm typecheck` passed across shared, API, web, SDK, and CLI workspaces.
- `pnpm test` passed with 14 shared, 44 SDK, 37 web, 226 API, and 59 CLI
  tests after locking the new PATCH operation into the OpenAPI surface test.
- `pnpm --filter @harakiri/api test -- credential-vault-schema.test.ts sandboxes-service.test.ts credential-vault-service.test.ts workspace-credential-secrets-service.test.ts`
  passed with 216 API tests after adding required template-slot enforcement.
- `pnpm --filter @h-sandbox/sdk test -- index.test.ts` passed with 44 SDK
  tests.
- `pnpm --filter @h-sandbox/cli test -- command.test.ts credential-options.test.ts`
  passed with 59 CLI tests.
- `pnpm --filter @harakiri/web test -- docs-content.test.ts docs-route.test.ts`
  passed with 29 web/doc tests.
- `pnpm --filter @harakiri/api test -- sandbox-lifecycle.test.ts credential-vault-service.test.ts sandboxes-service.test.ts`
  passed with 217 API tests after adding resume-time
  `requires_reinjection` marking.
- `pnpm --filter @harakiri/api test -- credential-vault-service.test.ts sandbox-lifecycle.test.ts routes-runtime.test.ts`
  passed with 221 API tests after adding stored-source rehydration.
- `pnpm --filter @h-sandbox/sdk test -- index.test.ts` passed with 44 SDK
  tests after adding `credentials.rehydrate()`.
- `pnpm --filter @h-sandbox/cli test -- command.test.ts credential-options.test.ts`
  passed with 59 CLI tests after adding `vault rehydrate`.
- `pnpm --filter @harakiri/web test -- docs-content.test.ts docs-route.test.ts`
  passed with 29 web/doc tests after updating public Vault docs.
- `pnpm --filter @harakiri/web typecheck`
- `pnpm --filter @harakiri/web exec node --test --import tsx src/dashboard-routes.test.ts src/dashboard-shell-route.test.ts src/routing.test.ts src/docs-content.test.ts src/docs-route.test.ts`
  passed with 10 web route and documentation render tests after adding the
  admin workspace Vault screen.
- `pnpm --filter @harakiri/web exec node --test --import tsx src/sandbox-create-credentials.test.ts src/dashboard-routes.test.ts src/dashboard-shell-route.test.ts src/routing.test.ts src/docs-content.test.ts src/docs-route.test.ts`
  passed with 16 web route, documentation, and create-sandbox credential
  mapping tests after adding dashboard slot mapping.
- `pnpm --filter @harakiri/web test`
  passed with 36 web tests after the create-sandbox mapping UI and docs
  updates.
- `pnpm --filter @harakiri/api exec node --test --import tsx src/account-service.test.ts`
  passed with 6 account capability and membership tests after adding the
  `canManageCredentialSecrets` account capability.
- `pnpm --filter @harakiri/api typecheck`
- `pnpm --filter @harakiri/shared test`
- `pnpm --filter @h-sandbox/sdk typecheck`
- `pnpm --filter @h-sandbox/cli typecheck`
- `pnpm openapi:check`
- `git diff --check`
- `pnpm --filter @harakiri/api exec node --test --import tsx src/credential-vault-schema.test.ts src/workspace-credential-secrets-service.test.ts src/credential-vault-service.test.ts`
  passed with 30 schema and service tests after adding additive access-policy
  migration checks, member-use authorization, and usage summaries.
- `pnpm --filter @h-sandbox/sdk test` passed with 44 SDK tests after adding the
  workspace-secret policy update helper and response metadata.
- `pnpm --filter @h-sandbox/cli test` passed with 59 CLI tests after adding
  `--member-use`, `vault secrets share`, `vault secrets restrict`, and usage
  columns without value disclosure.
- `pnpm --filter @harakiri/web typecheck && pnpm --filter @harakiri/web test`
  passed with 37 web tests after documenting access policy and testing
  admin/member navigation visibility.
- `pnpm openapi:write && pnpm openapi:check`

Final verification evidence on 2026-09-04:

- `pnpm test` passed `16` shared, `48` SDK, `40` web, `288` API, and
  `70` CLI tests.
- `pnpm typecheck`, `pnpm build`, `pnpm openapi:check`, `pnpm docs:check`,
  `pnpm credential-vault:check`, `pnpm examples:check`,
  `pnpm templates:check`, `pnpm package:assert`, and `git diff --check`
  passed.
- `pnpm conformance:dev` applied migrations `025` through `034` to a fresh
  database and passed packed SDK/CLI consumers.
- Default and restricted OpenShift Helm lint passed. The restricted render
  sets `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "0"` and contains no SCC.
- The final API image was deployed to k0s API, scheduler, and template-builder
  workloads. `pnpm smoke:credential-vault` passed with
  `sbx_wJOXVNiQAO`, and `pnpm smoke:credential-vault-cli` passed with
  `sbx_WFdSKylaId`.
- Live agent-browser acceptance covered admin desktop/mobile screens and a
  temporary member launch through an explicitly shared source. Test-created
  sandboxes, sources, references, users, memberships, and API keys were
  removed. Full versions and image digests are in `docs/test-report.md`.
- The final deployment-backed Playwright suite passed `2/2` against the
  deployed k0s images. It covered real Web/API/CLI/SDK runtime workflows and
  Keycloak logout/re-login with completed-user onboarding bypass. The gate also
  found and fixed explicit sign-in from an uninitialized public route so it
  starts `login-required` directly instead of requiring a second click after a
  passive `check-sso` response.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-03 | Build Credential Vault as one platform architecture instead of isolated feature tickets. | Prevents early ephemeral support from becoming throwaway API/UI/schema work when encrypted, external, and dynamic sources arrive. | Ship a narrow runtime-only vault feature first and redesign later. |
| 2026-09-03 | Use OpenSandbox Credential Vault as the runtime injection primitive. | OpenSandbox already owns sandbox egress interception and credential injection; Harakiri should remain the control plane and product surface. | Implement Harakiri-owned MITM/proxy, Kubernetes exec-based injection, or secret file mounting. |
| 2026-09-03 | Treat `inline_ephemeral` as the first source adapter in the final model. | It gives a fast usable milestone without creating a separate temporary public contract. | Build a one-off `/apply-secret` API unrelated to future workspace secrets. |
| 2026-09-03 | Couple Credential Vault with default-deny outbound access by default. | OpenSandbox documents that credential-bearing bindings should explicitly allow matching destinations and avoid default-allow bypass risk. | Allow broad outbound internet access by default for credential-bearing sandboxes. |
| 2026-09-03 | Make rehydration a first-class concept. | OpenSandbox vault state is in-memory in the sidecar and is lost after Kubernetes pause/resume. | Assume pause/resume preserves active credentials or leave this as hidden behavior. |
| 2026-09-03 | Keep provider details out of the public Harakiri contract. | SDK/CLI/UI consumers should integrate with Harakiri, not sidecar URLs, provider headers, pod names, or OpenSandbox-specific identifiers. | Expose raw OpenSandbox vault APIs directly through Harakiri. |
| 2026-09-03 | Run Credential Vault test probes through the Harakiri command API. | The test must originate inside the sandbox but should still respect the OpenSandbox control-plane boundary and avoid Kubernetes exec. | Probe from the Harakiri API pod, expose sidecar test endpoints publicly, or use direct Kubernetes pod exec. |
| 2026-09-03 | Allow create-time `inline_ephemeral` credentials only on synchronous sandbox creation. | Harakiri intentionally does not persist raw ephemeral values, so queued or timeout-returning create flows cannot safely replay credential injection after process loss. | Store plaintext for replay, encrypt ephemeral values as operation secrets, or silently create without credentials. |
| 2026-09-03 | Default create-time credential sandboxes to restricted outbound access with binding hosts allowed. | Credential-bearing sandboxes need the OpenSandbox egress sidecar and should not expose broad outbound access by default. | Preserve open-mode defaults and rely on users to configure egress manually. |
| 2026-09-03 | Ship provider presets as a static shared catalog before custom preset storage. | Built-in presets improve developer experience immediately while keeping values out of storage and avoiding a premature custom preset schema before template slots exist. | Require every caller to hand-author bindings; build DB-backed custom presets first; add provider-specific branches in CLI and SDK. |
| 2026-09-03 | Ship preset-backed template credential slots before custom slot bindings. | Templates need a durable no-secret credential contract now, while user-owned host modeling, launch-time mapping, and encrypted sources need a deeper design before becoming public API. | Store custom binding JSON in `harakiri.toml` immediately; keep credentials only as create flags until stored-source mapping exists. |
| 2026-09-03 | Make CLI credential prompting explicit through `--prompt` and `prompt=true`. | Prompting is useful for local manual use, but hidden interactive reads should not surprise scripts or CI jobs. | Prompt automatically when no source is provided; keep only env/stdin sources. |
| 2026-09-03 | Ship encrypted workspace secret custody before stored-source runtime attachment. | It establishes the write-only storage, rotation, deletion, SDK, CLI, OpenAPI, and redaction contract without pretending rehydration is solved. | Delay all encrypted secret work until attachment/rehydration is complete; attach stored secrets immediately without a rehydration model. |
| 2026-09-03 | Keep workspace secret management admin-only in the first encrypted custody slice. | Harakiri does not yet have a separate permission model for members to use selected secrets without managing them, so broader access would be premature. | Allow every member to list/use secrets; add speculative fine-grained RBAC before runtime stored-source attachment exists. |
| 2026-09-03 | Shipped running-sandbox `harakiri_encrypted` attachment before launch mapping and rehydration. | Stored runtime attachment is useful once encrypted custody exists, and it can use the same provider boundary without persisting plaintext. Template-slot mapping and rehydration need stronger source-adapter state design. | Wait for full rehydration before any stored-secret attachment; overload create-time `credentials` with stored references immediately. |
| 2026-09-03 | Allow explicit `harakiri_encrypted` references in synchronous sandbox creation. | The source-adapter contract can now resolve stored material before launch, compute fake env and egress hosts, and attach through the same provider boundary without raw value persistence. | Keep stored secrets running-attach-only until full template-slot mapping and rehydration are done. |
| 2026-09-03 | Use a separate `credentialMappings` launch contract for template slots. | Direct `credentials` keep owning low-level binding data, while slot mappings let templates own binding, fake env, and egress metadata and let launch requests provide only an implemented source. This keeps the API compatible with future `external_ref` and `dynamic` source adapters. | Overload direct credential bodies with optional slot selectors, or require callers to duplicate template binding data at launch. |
| 2026-09-03 | Enforce required template credential slots only through explicit `credentialMappings`. | A direct low-level credential may be valid, but it does not prove the caller intended to satisfy a named template requirement. Keeping slot satisfaction explicit preserves the template contract and gives SDK/CLI/UI consumers a clear recovery path through `credential_vault_required_slot_missing`. | Infer satisfaction from provider preset, fake env, binding name, or credential name; add an operator bypass before a concrete operator workflow exists. |
| 2026-09-03 | Mark every active injected vault attachment `requires_reinjection` immediately after resume before any source-specific rehydration. | OpenSandbox vault state is provider-side and reset by resume; leaving attachments as `injected` would create a false security/runtime state. The control plane then re-applies sources it can resolve and leaves forgotten or unavailable sources in a truthful stale state. | Mark only `inline_ephemeral`; leave stored sources as `injected`; skip the stale intermediate state and risk misleading events if rehydration partially fails. |
| 2026-09-03 | Rehydrate active encrypted workspace secrets automatically after resume without failing the resume operation. | The sandbox lifecycle should recover runtime access when Harakiri owns decryptable source material, but a stale, disabled, or undecryptable credential should not prevent the user from resuming the sandbox. The attachment status, events, and audit log carry the truth for follow-up. | Fail the entire resume when one credential cannot be restored; require every stored credential to be manually reattached after resume; silently leave stale metadata as `injected`. |
| 2026-09-03 | Ship the first dashboard Vault slice as admin-only workspace secret custody. | The API/SDK/CLI already support encrypted workspace secrets, so the dashboard should expose that shipped capability without waiting for the larger create-flow, template-slot, sandbox-detail, and audit-history UX. | Keep all Vault management CLI/API-only until the full dashboard experience is complete; expose broader member secret usage before a separate permission model exists. |
| 2026-09-03 | Build dashboard launch mapping on the existing `credentialMappings` contract. | Template slots already own binding, fake env, and egress metadata. The dashboard only needs to choose an implemented source, which keeps the UI provider-neutral and compatible with future `external_ref` and `dynamic` sources. | Recreate low-level credential binding fields in the new-sandbox modal; add a UI-only endpoint for launch mapping. |
| 2026-09-03 | Keep workspace-secret management admin-only while adding an explicit `admins_only` or `organization_members` use policy. | Teams need shared credentials without allowing members to read, rotate, disable, delete, or broadly enumerate admin-only custody records. The same filtered list powers launch discovery and runtime attachment. | Keep all use admin-only; let all members use every secret; add per-user ACLs before a concrete need exists. |
| 2026-09-03 | Derive secret usage from sandbox attachments and never store template-to-secret references. | Templates define portable provider requirements, while a concrete secret is selected only at launch. Persisting a template reference would couple reusable template metadata to workspace custody and misrepresent actual use. | Store secret IDs on templates; report only a boolean used/unused state; build a separate usage ledger before attachment metadata proves insufficient. |
| 2026-09-03 | Resolve external credentials through a source-neutral adapter with Kubernetes Secret as the first implementation. | OSS operators need a no-plaintext-at-rest option that composes with Kubernetes and External Secrets Operator while keeping Harakiri independent from any one secret-manager vendor. | Embed Kubernetes lookups in sandbox routes; add vendor-specific domain types; mount customer Secrets into the API pod. |
| 2026-09-03 | Enforce external Kubernetes locators with operator allowlists and least-privilege generated RBAC. | Workspace admins must not be able to turn Harakiri into an unrestricted cluster Secret reader. Exact-name policies can use Kubernetes `resourceNames`; namespace and prefix policies are also checked before every resolution. | Give the API service account namespace-wide Secret read access without application policy; require operators to create one service account per reference. |
| 2026-09-03 | Use envelope encryption with a per-value DEK and a replaceable key-provider boundary for Harakiri-custodied secrets. | Per-secret DEKs make key rotation and future KMS wrapping possible without changing public Vault contracts. The current providers support an environment key for development and a mounted Kubernetes keyring for cluster installs. | Continue direct encryption with one global key; introduce a KMS-specific public source type. |
| 2026-09-03 | Treat provider state as observed state, separate from desired attachment state. | OpenSandbox sidecars can be replaced independently of PostgreSQL. Sanitized inspection plus reconciliation detects missing entries and rehydrates only resolvable sources. | Assume an `injected` database row proves provider presence; expose raw sidecar state. |
| 2026-09-03 | Keep snapshots credential-free and require explicit credential remapping when restoring. | A snapshot may outlive source permissions, rotations, or workspace policy. Explicit mappings avoid hidden inheritance while allowing encrypted, external, and dynamic sources to be injected during the restored sandbox's normal create flow. | Persist source mappings in snapshot artifacts and inherit them automatically; copy active provider vault state into snapshots. |
| 2026-09-03 | Reconcile provider inspection before refresh and rehydration work. | A missing provider entry can be discovered and repaired in one scheduler pass without falsely trusting stale control-plane state. | Run inspection and rehydration as unrelated jobs; wait for a later scheduler pass after inspection. |

## Tech Debt Incurred
- The SDK keeps a local protocol mirror so public packages do not depend on the
  internal `@harakiri/shared` package. The Credential Vault and provider preset
  types were added to both places manually; a future generator would reduce
  drift risk.
- Only Kubernetes external references and GitHub App installation tokens have
  shipped adapters. HashiCorp Vault, cloud secret managers, OAuth exchange, and
  cloud STS belong behind the existing interfaces and remain future work.
- `inline_ephemeral` values cannot be rehydrated after provider state loss by
  design. Async credential-bearing creation is therefore rejected instead of
  persisting values for replay.
- Current OpenSandbox `dns+nft` requires `NET_ADMIN`. Restricted OpenShift is
  operator-action-required until OpenSandbox offers a compatible enforcement
  profile or the operator grants an approved isolated capability model.
- Provider-state reconciliation is covered by state-machine and scheduler
  tests, but a live sidecar/pod replacement acceptance test remains desirable
  before promoting that single support-matrix row from Preview.
- The production web bundle emits Vite's advisory for a chunk above 500 kB.
  Route-level code splitting is separate frontend performance work and does not
  affect the Vault security or runtime contract.

## Completion Notes
Completed on 2026-09-04. Harakiri now has one provider-neutral Credential Vault
architecture spanning four source types, template slots, safe egress,
OpenSandbox runtime injection, lifecycle reconciliation, audit, dashboard,
SDK, CLI, operator configuration, and migrations `025` through `034`.

Verification passed across 462 workspace tests, typecheck, production builds,
fresh-database dev conformance, OpenAPI/docs/security/example/package gates,
restricted OpenShift Helm lint/render, live admin/member browser acceptance,
deployment-backed Playwright, and real k0s API and CLI smokes. The final
deployed image identities and sandbox IDs are recorded in
`docs/test-report.md`; all test-created resources were cleaned.

The authoritative shipped/degraded/operator-action classifications are in
`docs/credential-vault-support.md`. Restricted OpenShift Credential Vault,
additional external/dynamic adapters, ephemeral replay, and live provider-pod
replacement acceptance are intentionally deferred rather than hidden behind
fallbacks.
