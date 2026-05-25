# ADR 0005: API Contract Publication

## Status
Accepted

## Context
The API, SDK, CLI, and web app now share TypeScript request/response shapes from
`packages/shared`. API handlers and service mappers are typed against those
shared shapes, and route input validation is split into domain-local Zod
schemas under `apps/api/src/routes/*.schema.ts`.

That is enough to catch TypeScript drift inside the monorepo, but it is not a
complete public contract for an open-source platform. External contributors and
client authors need a stable machine-readable contract that can be rendered in
docs, diffed in CI, and used to generate client fixtures without reading route
implementation code.

## Decision
The next OSS milestone should publish an OpenAPI 3.1 contract generated from a
single contract source, not rely on TypeScript types alone.

The contract source should be a dedicated contract layer that composes:

- request validation schemas for route inputs,
- response and error envelope schemas matching `packages/shared`,
- auth/header metadata,
- route tags and examples.

The API implementation, SDK tests, CLI tests, and website product docs should
all consume or verify against the published contract. Until that generator
exists, the shared TypeScript types plus domain Zod schemas remain the internal
compile-time checkpoint, not the final OSS contract publication mechanism.

## Consequences
- Phase 7 can treat "TypeScript-only shared contracts" as an intermediate
  state, not the final design.
- OpenAPI generation should be introduced before declaring full API contracts
  complete.
- Future route changes should update the shared contract source and let API
  handlers, SDK helpers, CLI behavior, and website docs follow from that source.
- Manual `docs/api.md` remains useful narrative documentation, but it should not
  be the only authoritative API contract.
