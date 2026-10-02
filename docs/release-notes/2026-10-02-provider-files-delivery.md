# API Maintenance: Reliable File Transfers

October 2, 2026. API-only prerelease `api-2026-10-02.1` on the rc.12 source line.
This publishes the provider correction; it does not publish the Python packages
or upgrade any existing installation.

## Correction

Valid large uploads previously exceeded the operating system's argument limit.
The provider now transfers bytes through its native multipart endpoint and
replaces destinations atomically from same-filesystem staging. Failed transfers
preserve the existing destination. Binary downloads use the native endpoint,
preserve exact bytes across chunks and enforce the artifact byte limit.

Permissions, parent-directory opt-in and literal dollar-containing paths are
preserved. Invalid base64 is rejected before filesystem mutation. Cleanup has
its own bounded attempt and reports uncertainty instead of concealing failure.
Unknown finalization outcomes must be inspected before retrying.

Public API and SDK signatures are unchanged. Artifact responses remain bounded
JSON/base64, normally up to 16 MiB; this is not a streaming public API. No
Kubernetes exec fallback or Python-specific transfer workaround was introduced.

## Source and Publication

[PR #67](https://github.com/nabilblk/h-sandbox/pull/67) merged as
`a55df315825b0e4788b35b71af571c4f0d11ac23`. Its tree exactly matches the reviewed
candidate `be6b8a35d476e1d1f6e756c878bdddc6cef41a2d`. All final PR checks and
[merged-source CI](https://github.com/nabilblk/h-sandbox/actions/runs/36946958274)
passed. The
[protected API publication](https://github.com/nabilblk/h-sandbox/actions/runs/36947012800)
passed for both Linux architectures. No web image, chart, npm package or PyPI
package was published by this release; existing tags were not replaced.

Image:

```text
core.campus.clusterdiali.me/harakiri/harakiri-api:0.5.0-rc.12-provider-files.a55df31@sha256:f927bda60dd79bcd5754ff48bdb9813d74a18b633a00d848d9c4b5b7e770fab2
```

The attached `api-image.json` records the image index, amd64/arm64 manifests,
configuration digests, source revision and publication workflow. Anonymous
downloads verified their checksums and OCI source/version labels. This is not
independent signature verification or a claim that every layer was downloaded.
The OCI version remains `0.5.0-rc.12`; the maintenance tag, source and digest
identify the correction. Plain `0.5.0-rc.12` is unchanged and lacks this fix.

## Qualification and Compatibility

The [provider candidate acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/36890337240)
passed native amd64 round trips through 16 MiB, boundary/error cases and cleanup
on an isolated GitHub-hosted runner. That run used a runner-built image, not the
new Harbor artifact. The subsequent
[Python candidate acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/36947872246)
installed the published digest, verified its running identity and passed all gates:
1 MiB/16 MiB round trips, sync/async framework tools, authorization, capacity,
retained-file recovery, provider-loss handling and a real model repair. Runtime
and fixture cleanup passed and private material was removed. This qualifies that
API image with the candidate Python wheels, not unpublished PyPI artifacts or a
coordinated product release.

No database schema, API-key, runtime-provider or Helm value migration is required.
Existing published charts can select the maintenance API image through
`image.api.tag`; keep all installation-specific values and other images unchanged.
The template builder image setting, when configured explicitly, must refer to
the same selected API image. The Python fixture retains the immutable rc.10
chart/web baseline and records its published API override separately, rather than
pretending the entire installation is a new coordinated product release.

No local k0s, customer OpenShift, tunnel, Keycloak, database or running sandbox
was changed. This release does not establish HA, restricted OpenShift or general
cross-schema rollback guarantees.
