# ADR 0002: Image Builder Interface

## Status
Accepted

## Context
The current template builder directly creates Kaniko Kubernetes Jobs for
Dockerfile builds. Kaniko is archived upstream, so making it the architectural
center of the OSS project would create avoidable maintenance risk.

Harakiri still needs Dockerfile builds, image imports, digest reporting, logs,
provenance, cache metadata, and cleanup.

## Decision
Introduce an `ImageBuilder` contract in `apps/api/src/builders/image-builder.ts`.
The preferred default target is rootless BuildKit. Kaniko can remain as a
legacy implementation during migration, but generic build state, API responses,
CLI output, docs, and tests should avoid depending on Kaniko terminology.

## Consequences
- Builder provenance records generic builder metadata first, with
  provider-specific details nested under `details`.
- Dockerfile, image-import, and future Git build paths can share orchestration.
- Phase 3 must isolate current Kaniko logic and either implement or stage the
  BuildKit provider.
