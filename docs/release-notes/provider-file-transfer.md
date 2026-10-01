# Provider File Transfer Fix: Unreleased Candidate

Provider PR [#67](https://github.com/nabilblk/h-sandbox/pull/67) is independent of
the Python SDK candidate in [#66](https://github.com/nabilblk/h-sandbox/pull/66).
This note does not announce a server release or a production deployment.

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

The first native run
[36883538057](https://github.com/nabilblk/h-sandbox/actions/runs/36883538057)
passed on a disposable GitHub-hosted amd64 runner. It reproduced the old failure
against immutable server `0.5.0-rc.9`, loaded only a runner-local source API image,
and verified exact 0-byte, 1 KiB, 1 MiB and 16 MiB round trips with independent
runtime checksums. Parent creation, permissions, UTF-8, rejected-write
preservation, capacity release, credential revocation and fixture cleanup passed.

That first run qualified the upload correction. Final qualification of the
additional native-download, byte-ceiling and invalid-base64 checks is pending.
The earlier Python run used server `0.5.0-rc.10`; neither published baseline has
been changed by this PR.

## Delivery Order

1. Review and merge the provider PR after its final checks pass.
2. Release the corrected server through the normal release process.
3. Pin the Python native harness to that released manifest and rerun its full
   SDK/framework qualification before Python publication.

There are no schema, key, Helm value, or client migrations required by the file
transport change. The local k0s cluster, OpenShift installation, tunnels, and
published packages were not touched during this work.
