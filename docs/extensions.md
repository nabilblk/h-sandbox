# Extension Interfaces

Harakiri is built around small interfaces so contributors can add providers
without rewriting the product surface. The API, CLI, SDK, and web UI should
continue to use the same public contracts regardless of the implementation
behind these interfaces.

## Runtime Providers

Source:

- `apps/api/src/providers/runtime/provider.ts`
- `apps/api/src/providers/runtime/opensandbox-provider.ts`
- `apps/api/src/providers/runtime/dev-provider.ts`

`RuntimeProvider` owns sandbox lifecycle and runtime panels:

- create, list, get, delete, and renew sandbox lifecycle
- run commands
- list files from the template workdir or an explicit path
- read logs and metrics
- expose and delete routes

Rules:

- OpenSandbox remains the default provider.
- Provider-specific HTTP, endpoint, and fallback behavior stays under
  `apps/api/src/providers/runtime/`.
- Harakiri API routes and services should depend on `RuntimeProvider`, not on a
  concrete OpenSandbox module.
- Do not add direct Kubernetes `pods/exec` or sandbox `pods/log` permissions to
  Harakiri for normal runtime behavior.

## Image Builders

Source:

- `apps/api/src/builders/image-builder.ts`
- `apps/api/src/builders/buildkit-kubernetes-builder.ts`
- `apps/api/src/builders/kaniko-builder.ts`

`ImageBuilder` turns template build records into digest-pinned template
versions. Rootless BuildKit is the default Dockerfile builder. The Kaniko
implementation remains a legacy compatibility provider and should not leak into
generic API responses, CLI output, SDK types, or website copy.

New builders should report provider details under `builderDetails` while
keeping generic fields such as build ID, template version ID, image URI, digest,
duration, and status builder-neutral.

## Storage Backends

Source:

- `apps/api/src/storage/`

`BlobStore` stores uploaded Dockerfile build contexts and future artifacts.
`BuildLogStore` stores append-only template build logs. Implementations should
support local development without requiring external object storage, while
keeping room for S3/MinIO-style operators.

## Auth Providers

Source:

- `apps/api/src/auth.ts`
- `apps/api/src/providers/auth/`
- `apps/web/src/auth.ts`

Browser auth is OIDC-compatible and currently targets Keycloak. API keys are
hashed control-plane records with `hk_live_` and `hk_test_` prefixes. Future
auth-provider changes should keep these boundaries:

- browser identity comes from an OIDC issuer and JWKS
- programmatic clients use API keys
- authorization decisions are made against organizations and memberships in
  PostgreSQL

## Audit Sinks

Source:

- `apps/api/src/providers/audit/audit-sink.ts`
- `apps/api/src/services/`

Audit events are control-plane records for sandbox lifecycle, templates, builds,
routes, credentials, and settings. A future sink can mirror events elsewhere,
but service code should keep writing through the audit interface rather than
embedding destination-specific logic.

## Scanner Hooks

Source:

- `apps/api/src/template-builder.ts`
- `docs/template-security.md`

Template versions can call an operator-owned scanner webhook before a ready
version is inserted. The webhook receives the build/template/image/provenance
payload and returns a normalized scan status plus optional summary fields.

Rules:

- scanner results attach to immutable template versions
- scanner summaries must be redacted before persistence
- `TEMPLATE_SCANNER_FAIL_ON_ERROR=1` may turn scanner failures into build
  failures
- the default no-webhook state is `not_scanned`, not a silent clean result

## Contract Changes

Public contract changes must update:

- `packages/shared/src/index.ts`
- `packages/shared/src/openapi.ts`
- `docs/openapi.json` through `pnpm openapi:write`
- affected API route/service mappers
- CLI, SDK, and web call sites
- docs or website product docs when behavior changes
