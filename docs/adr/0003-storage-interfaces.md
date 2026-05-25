# ADR 0003: Build Artifact Storage Interfaces

## Status
Accepted

## Context
Build contexts and build logs are currently tied to PostgreSQL tables in core
business logic. PostgreSQL is a valid local default, but an OSS platform should
allow different artifact storage choices without rewriting build orchestration.

## Decision
Introduce `BlobStore` and `BuildLogStore` contracts under
`apps/api/src/storage/`.

`BlobStore` owns build contexts and future binary artifacts. `BuildLogStore`
owns append/read/delete behavior for build logs. PostgreSQL-backed
implementations may remain for migration compatibility, while local filesystem
storage should be available for contributor development.

## Consequences
- Build orchestration can move away from direct `BYTEA` and SQL log writes.
- Local contributors do not need object storage to run the stack.
- Operators can add S3-compatible storage later through the same contract.
