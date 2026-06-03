# Execution Plan: Premium Integration 03 Runtime Metadata

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
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
- [ ] Sandbox create/get/list responses expose resolved runtime metadata in a
      stable, typed object.
- [ ] Metadata includes workdir, user, template ID/version, runtime family,
      default ports, exposed ports, route access default, egress mode, artifact
      limit, command timeout defaults, TTL, and provider capability states.
- [ ] SDK exposes the metadata on both sandbox summaries and runtime-class
      instances.
- [ ] CLI and dashboard show the most useful metadata without adding visual
      noise.
- [ ] Metadata values are sourced from template config/control-plane/provider
      capability data, not guessed by the UI.
- [ ] OpenAPI, docs, and tests define the contract clearly.

## Phases

### Phase 1: Metadata Schema
**Status**: Not Started
- [ ] Audit current sandbox summary, template config, and runtime capability
      types.
- [ ] Define a `SandboxRuntimeMetadata` schema with stable field names and
      optional provider-specific metadata kept in a separate object.
- [ ] Decide which fields are required versus nullable when a provider cannot
      resolve them.
- [ ] Add config defaults for workdir, user, shell, route access, command
      timeout, artifact size, and default ports where missing.

### Phase 2: API And SDK
**Status**: Not Started
- [ ] Add metadata to create/get/list sandbox API responses.
- [ ] Add API tests for metadata on newly created, existing, and terminated
      sandboxes.
- [ ] Add SDK protocol types and accessors.
- [ ] Ensure the runtime SDK class refreshes metadata when sandbox state
      changes.

### Phase 3: CLI And Dashboard
**Status**: Not Started
- [ ] Add selected metadata to CLI `inspect` or `get` output.
- [ ] Add dashboard detail display for workdir, user, TTL, default ports,
      egress mode, and capability warnings.
- [ ] Keep dense list screens focused; avoid adding too many columns.
- [ ] Use existing design tokens and compact table/pill components.

### Phase 4: Documentation And Verification
**Status**: Not Started
- [ ] Update `docs/integrations/capabilities-and-limits.md`, `docs/sdk.md`, and
      website docs.
- [ ] Add tests for metadata serialization and SDK typing.
- [ ] Run API/SDK/web typecheck/build, OpenAPI check, and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat runtime metadata as control-plane contract, not UI inference | Integrators need one stable source of truth and UIs should not guess template/runtime details. | Keep metadata only in template docs; compute it in the SDK; expose provider-specific raw OpenSandbox data. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
