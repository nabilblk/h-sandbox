# Execution Plan: Premium Integration 03 Runtime Metadata

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 3-5 engineering days

## Context
External applications need to know where to work inside a sandbox and which
features are safe to use. Harakiri currently exposes sandbox summaries,
template details, runtime capabilities, routes, metrics, and file metadata, but
the integration contract should make resolved runtime metadata obvious:
workdir, user, template runtime family, default ports, command shell,
capabilities, egress mode, route defaults, artifact limits, and lifecycle TTL.

This improves adapter quality without changing OpenSandbox ownership of the
runtime. Harakiri should collect and present product-level metadata from
template configuration, control-plane state, and provider capabilities.

## Success Criteria
- [x] Sandbox create/get/list responses expose resolved runtime metadata in a
      stable, typed object.
- [x] Metadata includes workdir, user, template ID/version, runtime family,
      default ports, exposed ports, route access default, egress mode, artifact
      limit, command timeout defaults, TTL, and provider capability states.
- [x] SDK exposes the metadata on both sandbox summaries and runtime-class
      instances.
- [x] CLI and dashboard show the most useful metadata without adding visual
      noise.
- [x] Metadata values are sourced from template config/control-plane/provider
      capability data, not guessed by the UI.
- [x] OpenAPI, docs, and tests define the contract clearly.

## Phases

### Phase 1: Metadata Schema
**Status**: Completed
- [x] Audit current sandbox summary, template config, and runtime capability
      types.
- [x] Define a `SandboxRuntimeMetadata` schema with stable field names and
      optional provider-specific metadata kept in a separate object.
- [x] Decide which fields are required versus nullable when a provider cannot
      resolve them.
- [x] Add config defaults for workdir, user, shell, route access, command
      timeout, artifact size, and default ports where missing.

### Phase 2: API And SDK
**Status**: Completed
- [x] Add metadata to create/get/list sandbox API responses.
- [x] Add API tests for metadata on newly created, existing, and terminated
      sandboxes.
- [x] Add SDK protocol types and accessors.
- [x] Ensure the runtime SDK class refreshes metadata when sandbox state
      changes.

### Phase 3: CLI And Dashboard
**Status**: Completed
- [x] Add selected metadata to CLI `inspect` or `get` output.
- [x] Add dashboard detail display for workdir, user, TTL, default ports,
      egress mode, and capability warnings.
- [x] Keep dense list screens focused; avoid adding too many columns.
- [x] Use existing design tokens and compact table/pill components.

### Phase 4: Documentation And Verification
**Status**: Completed
- [x] Update `docs/integrations/capabilities-and-limits.md`, `docs/sdk.md`, and
      website docs.
- [x] Add tests for metadata serialization and SDK typing.
- [x] Run API/SDK/web typecheck/build, OpenAPI check, and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat runtime metadata as control-plane contract, not UI inference | Integrators need one stable source of truth and UIs should not guess template/runtime details. | Keep metadata only in template docs; compute it in the SDK; expose provider-specific raw OpenSandbox data. |
| 2026-06-04 | Expose metadata on `SandboxSummary.runtimeMetadata` | Create/get/list already return sandbox summaries, and external apps need the same fields consistently across API, SDK, CLI, and dashboard. | Add a separate metadata endpoint; put fields only on templates; expose raw provider metadata. |
| 2026-06-04 | Source exposed ports from persisted sandbox routes | Routes are Harakiri control-plane records with access mode, token state, labels, and public URLs. | Query OpenSandbox directly in the UI; infer routes from default ports. |

## Tech Debt Incurred
None.

## Completion Notes
Completed 2026-06-04.

Implemented shared and SDK protocol types, API row mapping, provider capability
inclusion, CLI status output, dashboard detail display, OpenAPI generation, and
docs updates.

Verification:
- `pnpm --filter @harakiri/api test -- sandboxes-service.test.ts`
- `pnpm --filter @h-sandbox/sdk test`
- `pnpm --filter @h-sandbox/cli test`
- `pnpm --filter @harakiri/web test -- docs-content.test.ts sandbox-detail-route.test.ts`
- `pnpm openapi:check`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
- `pnpm deploy:k0s`
- Live forwarded API smoke created sandbox `sbx_kXFN3po2Fj`, verified
  `runtimeMetadata`, then terminated it.
- Browser docs smoke on `http://127.0.0.1:15173/#docs` confirmed the Runtime
  metadata section renders.
