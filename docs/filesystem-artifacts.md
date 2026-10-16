# Filesystem And Artifacts

Harakiri exposes sandbox filesystem operations through the public API, SDK, CLI,
and dashboard. Runtime file access stays behind the OpenSandbox provider
interface; integrations should not depend on Kubernetes pod access or provider
IDs.

## Filesystem Contract

All file paths are sandbox paths. Prefer absolute paths under the runtime
workspace, usually `/workspace`, and read the resolved workspace from
`sandbox.runtimeMetadata.workdir` when templates customize it. Relative paths
are resolved by the provider. Invalid, missing, permission-denied, and
directory/file mismatches are returned as structured API errors instead of fake
empty content.

Supported operations:

- `list`: returns `cwd`, file entries, provider `source`, and any degraded-state
  `warnings`.
- `stat`: returns one file or directory entry.
- `read`: returns UTF-8 text by default or base64 when `encoding=base64`.
- `write`: writes UTF-8 or base64 content, with optional `createParents` and
  `mode`.
- `mkdir`: creates directories, optionally recursively.
- `rename`: moves a file or directory inside the sandbox.
- `remove`: deletes a file or directory, optionally recursively.

Directory listings are capped in the dashboard at the first 300 entries for UI
stability. Use narrower paths for very large directories.

## Artifact Contract

Use artifact helpers for binary payloads, archives, generated reports, and other
outputs where size and checksum matter. The current v1 transfer mode is
JSON/base64:

```json
{
  "transfer": {
    "mode": "json-base64",
    "encoding": "base64",
    "maxBytes": 16777216
  }
}
```

`maxBytes` is controlled by `SANDBOX_FILE_ARTIFACT_MAX_BYTES` and defaults to
16 MiB decoded. Upload validates canonical base64, decoded size, optional
`sizeBytes`, and optional `sha256` before writing to the provider. Download
returns `sizeBytes` and `sha256` so SDK and CLI callers can verify the payload
after decoding.

## SDK

Use `files.*` for normal file operations and `artifacts.*` when a binary
transfer is the intent:

```ts
const sandbox = await harakiri.sandboxes.create({
  template: "python-3.12-data",
  wait: true
});

await sandbox.files.write({
  path: "/workspace/task.py",
  content: "print('ok')\n",
  createParents: true
});

const output = Buffer.from("hello");
const uploaded = await sandbox.artifacts.upload({
  path: "/workspace/out.bin",
  contentBase64: output.toString("base64"),
  sizeBytes: output.byteLength,
  sha256: "sha256:..."
});

const downloaded = await sandbox.artifacts.download("/workspace/out.bin");
console.log(downloaded.sha256, downloaded.transfer.maxBytes);
```

## CLI

```bash
harakiri files sbx_... --path /workspace
harakiri file-stat sbx_... --path /workspace/out.bin
harakiri file-write sbx_... --path /workspace/task.txt --content "ready" --parents
harakiri file-read sbx_... --path /workspace/task.txt
harakiri file-upload sbx_... --path /workspace/out.bin --from ./out.bin --parents
harakiri file-download sbx_... --path /workspace/out.bin --to ./out.bin
harakiri file-download sbx_... --path /workspace/out.bin --json --to ./out.bin
harakiri file-rm sbx_... --path /workspace/out.bin
```

`file-upload` computes and sends `sha256`. `file-download` validates the
returned checksum before writing to stdout or disk.

## Sandbox Workbench (rc.13)

The [Sandbox Workbench](sandbox-workbench.md) requires matching `0.5.0-rc.13`
API/web versions. It adds inert UTF-8 previews (256 KiB), destination-confirmed
uploads and verified downloads to the dashboard. Preview and transfer payloads
are checked for byte size and SHA-256. Browser transfers are buffered and capped
at 16 MiB or the lower server limit. Cancelled uploads may have completed
remotely; inspect before retrying. This is not an editor, deletion UI, streaming
transport or atomic create-only write.

Refresh reloads a selected file's preview even when its name and size are
unchanged. If the file was deleted elsewhere, the next successful listing
removes its preview. A failed listing hides stale preview contents.

Core rc.13 includes the OpenSandbox transfer correction previously delivered
as `api-2026-10-02.1`: provider-native multipart uploads and binary downloads,
without the old shell argument-size and chunked-base64 failure modes. The
[maintenance receipt](release-notes/2026-10-02-provider-files-delivery.md) records
that earlier delivery, not rc.13 qualification. No migration is required.

## Degraded Provider States

When OpenSandbox file operations are unavailable, Harakiri returns provider
errors and the dashboard shows the degraded state. It does not invent directory
contents. List responses include provider `source` and optional `warnings` so
integrations can expose a clear partial-state UI.

## Future Scale-Up

The public v1 API still buffers JSON/base64. Public streaming uploads/downloads,
multipart endpoints and signed transfer URLs remain future work. Native
multipart/binary transport inside the provider bridge does not remove the
public API's memory requirements or decoded byte limit.
