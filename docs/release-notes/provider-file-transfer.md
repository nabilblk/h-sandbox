# Provider File Transfer Fix: Candidate Qualification

Provider PR [#67](https://github.com/nabilblk/h-sandbox/pull/67) is independent of
the Python SDK candidate in [#66](https://github.com/nabilblk/h-sandbox/pull/66).
This note records the original source-candidate qualification. The subsequent
[API maintenance delivery](2026-10-02-provider-files-delivery.md) records merge
and publication separately. No production deployment is claimed.

## Failure and Correction

The previous OpenSandbox bridge embedded each upload's base64 contents in one
shell command. A valid 1 MiB artifact exceeded the operating system's argument
size limit and returned `502 runtime_files_unavailable`. Native acceptance
confirmed the provider error explicitly reports `argument list too long`.

Uploads now use OpenSandbox's native multipart endpoint. The bridge prepares a
private directory next to the destination, transfers the bytes into that
directory, applies the requested permissions, then atomically replaces the
destination. A failed transfer does not truncate the original file. Parent
creation stays opt-in; default permissions retain the command's umask; explicit
zero permissions remain supported. Directory destinations fail explicitly.
Invalid base64 is rejected before filesystem mutation, rather than silently
decoded by Node's permissive buffer decoder.

Paths remain literal, including `$HOME` or `$USD` in a directory or filename.
Because pinned execd expands environment variables in API paths, these paths
use a private, short-lived symlink in `/tmp`. File data stays at the requested
location; uploads still finalize from the same-filesystem staging directory.
The bridge removes the alias after success or failure. Ordinary paths do not
need this extra operation.

Downloads also use the native binary endpoint. A hermetic reproduction showed
that the legacy command parser inserted newlines between output chunks, which
could make large artifact responses invalid base64. The native reader preserves
bytes across arbitrary chunks, rejects partial responses, and cancels artifact
reads when they exceed the configured byte limit, with or without Content-Length.

The public file endpoints and SDK signatures are unchanged. Artifacts still use
buffered JSON/base64 with the configured limit (16 MiB by default); this is not a
streaming public API. Ordinary file reads retain their existing contract. There
is no Kubernetes exec fallback and no Python-specific workaround.

## Failure Semantics

Transfer and finalization have a bounded deadline; cleanup gets a separate
bounded attempt. Network failures do not replay uploads or finalization. Only
the existing explicit gateway-not-ready response is retried. If cleanup cannot
be confirmed, the caller receives an error that says so while preserving the
primary cause. A lost finalization response can mean the replacement happened;
callers must inspect the file before deciding to retry. Process crashes or a
provider that remains unreachable can leave temporary files; retained
workspaces may require later cleanup. This fix does not promise distributed
transactional writes or crash-time staging garbage collection.

## Qualification

The final implementation's native run
[36888651066](https://github.com/nabilblk/h-sandbox/actions/runs/36888651066)
passed on a disposable GitHub-hosted amd64 runner. It reproduced the old failure
against immutable server `0.5.0-rc.9`, loaded only a runner-local source API image,
and verified exact 0-byte, 1 KiB, 1 MiB and 16 MiB round trips with independent
runtime checksums. Upload/download byte ceilings, literal dollar paths,
non-regular-file rejection, parent creation, permissions, UTF-8, invalid-base64
rejection, existing-file preservation, capacity release, credential revocation
and fixture cleanup passed.

The [sanitized receipt](evidence/provider-file-transfer-2026-10-01.json) records
the candidate image configuration digest, exact source, checksums and successful
cleanup. The implementation commit is
`2cd66c1613152e47d7f861a996ba7499638df469`; GitHub tested its synthetic PR merge
`3ecff37bfcd08b4c991c78d2c3eb7e15f02b889b`. These identify an unpublished
candidate, not a released image. All
[standard CI checks](https://github.com/nabilblk/h-sandbox/actions/runs/36888651136)
passed. Local verification passed 373 API tests (9 environment-dependent skips),
28 acceptance contracts, 16 safety/browser-session/provider contracts and the
API typecheck. The two contract suites share five provider tests; their counts
are not additive. Linux-only filesystem cases passed in the native job.

The earlier Python run used server `0.5.0-rc.10`; neither published baseline has
been changed by this PR. Their legacy file-bridge source is identical (Git blob
`67c829e3f00e1187d9274e72ba110327283891ab`), so the rc.9 reproduction covers the
same implementation that blocked Python qualification on rc.10.

## Delivery Order

1. Review and merge the provider PR after its final checks pass.
2. Release the corrected server through the normal release process.
3. Pin the Python native harness to that released manifest and rerun its full
   SDK/framework qualification before Python publication.

There are no schema, key, Helm value, or client migrations required by the file
transport change. The local k0s cluster, OpenShift installation, tunnels, and
published packages were not touched during this work.
