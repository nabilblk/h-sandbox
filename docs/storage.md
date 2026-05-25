# Storage Interfaces

Harakiri separates build artifact storage from template orchestration through
small interfaces in `apps/api/src/storage/`.

## BlobStore

`BlobStore` stores binary objects such as uploaded template build contexts and
future generated artifacts. The current implementations are:

- `PostgresTemplateBuildContextBlobStore`: compatibility implementation backed
  by the existing `template_build_contexts` table.
- `FileSystemBlobStore`: local development implementation that writes blobs and
  sidecar metadata under a configured directory.

The default template build upload and context-exporter paths now access build
context archives through `BlobStore` instead of embedding `BYTEA` reads and
writes in route handlers or builder code. PostgreSQL remains the active default
until a later migration chooses a filesystem or object-store default.

## BuildLogStore

`BuildLogStore` appends, lists, and deletes template build log records. The
current implementations are:

- `PostgresBuildLogStore`: compatibility implementation backed by
  `template_build_logs`.
- `FileSystemBuildLogStore`: local development implementation that writes JSONL
  records per build.

`appendBuildLog` is now a compatibility helper over `PostgresBuildLogStore` so
existing transactional code can keep passing a database client while new code
can depend directly on the storage interface.

## Next Steps

## Optional Object Storage

S3-compatible storage is intentionally optional. A local contributor should be
able to run Harakiri with PostgreSQL or the filesystem implementation only.
For shared environments, an S3 or MinIO implementation can satisfy the same
`BlobStore` contract:

- Use bucket keys such as `template-build-contexts/<build-id>.tar.gz`.
- Persist `sha256`, `sizeBytes`, `contentType`, and source metadata as object
  metadata or sidecar JSON.
- Keep build logs in `BuildLogStore`; do not require object storage for log
  streaming unless an operator explicitly selects it.
- Preserve the same retention contract: `delete(ref)` returns how many objects
  were deleted.

## Next Steps

Phase 4 leaves the active default on PostgreSQL. The next storage pass should:

1. Add a storage selector for local filesystem versus PostgreSQL.
2. Add an S3/MinIO `BlobStore` implementation if operators need external object
   storage.
3. Add migration tooling for moving existing PostgreSQL build contexts to a
   selected blob backend.
