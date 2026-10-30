# Open Terminal Template (Developer Preview)

Open Terminal 0.14.6, Python 3.12, Bash, Git and matplotlib. This is the runtime
half of the optional [OpenWebUI integration](../../../integrations/openwebui/README.md),
not a public terminal service. The source candidate passed native Linux amd64
[OpenWebUI qualification](../../../docs/operations/openwebui-source-acceptance.md).
The [rc.14 release record](../../../docs/release-notes/0.5.0-rc.14.md) tracks the
published template digest. The template release workflow tests native amd64 and
arm64 startup at UID 1000 and an arbitrary non-root UID before publication;
that image smoke does not establish full OpenWebUI workflow parity on arm64.

Build through the Harakiri CLI using this directory and `harakiri.toml`. The base
image is digest-pinned and Python dependencies use a hash-locked requirements
file. OS package installation uses the base distribution's security repositories;
the resulting build digest, not a claim of byte-identical rebuilds, is the
immutable runtime identity. Record it in acceptance receipts.

- Non-root image default: UID 1000, group 0. No extra capabilities or host mounts.
- Service binds `0.0.0.0:8000`. Startup requires `OPEN_TERMINAL_API_KEY` from the
  adapter; never embed a key in the template or image.
- `/workspace` holds retained user data, HOME, cache and service state. The
  selected runtime/storage profile must actually mount it writable by UID 1000.
  Verify this in native acceptance; do not change customer SCCs to work around it.
- `harakiri-open-terminal-smoke` checks installed tools. `/health` separately
  checks the running service through its protected route.
- Terminal enabled, multi-user mode off, notebooks and system prompt disabled.
  The adapter allocates separate sandboxes instead of sharing upstream users
  inside one container.
- matplotlib generates PNG/PDF without network access. HTML is untrusted content.
  LibreOffice is not installed: DOCX/PPTX conversion is not advertised.
- Retained files survive confirmed runtime replacement; Python processes, shell
  sessions and in-memory Open Terminal execution state do not.

Dependency update (review the diff and requalify both upstream products):

```bash
uv pip compile examples/templates/open-terminal/requirements.in \
  --universal --python-version 3.12 --generate-hashes \
  --output-file examples/templates/open-terminal/requirements.txt
uv run --no-project --python 3.12 --with open-terminal==0.14.6 \
  python integrations/openwebui/scripts/export-openapi.py
```

The generated discovery schema carries the upstream MIT notice in the adapter
directory. OpenWebUI is separately licensed. The template does not install the
enterprise Terminals orchestrator or an MCP listener.
