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

## Degraded Provider States

When OpenSandbox file operations are unavailable, Harakiri returns provider
errors and the dashboard shows the degraded state. It does not invent directory
contents. List responses include provider `source` and optional `warnings` so
integrations can expose a clear partial-state UI.

## Future Scale-Up

The v1 JSON/base64 path is reliable for small and medium artifacts. Large
streaming, multipart uploads, or signed transfer URLs are intentionally left as
future scale-up work once OpenSandbox exposes a matching provider contract.
