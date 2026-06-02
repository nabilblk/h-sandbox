# Harakiri Template Examples

These examples are OpenSandbox-compatible OCI templates that can be built with
the Harakiri CLI. Each directory keeps the same shape:

- `Dockerfile`: runtime image.
- `harakiri.toml`: control-plane metadata read by `harakiri template build`.
- `smoke.sh`: runtime contract check used by `harakiri template smoke`.
- `README.md`: build, smoke, and usage notes.

## Available Templates

| Template | Runtime family | Use case |
| --- | --- | --- |
| `base-linux` | `linux` | Small general-purpose Linux devbox. |
| `python-3.12-data` | `python-data` | Python data and analysis workloads. |
| `node-20-app` | `node` | Node web apps, APIs, and Vite-style dev servers. |
| `browser-chromium` | `browser` | Headless browser automation and web agents. |
| `open-agents-dev` | `open-agents` | Browser-capable coding-agent runtime. |
| `opencode` | `agent-opencode` | OpenCode coding-agent runtime with a route-ready server. |

Build and smoke any example:

```bash
harakiri template build --name base-linux examples/templates/base-linux
harakiri template smoke base-linux
```

Use the immutable `tplv_...` version printed by the build for reproducible
automation, or promote a stable alias when a team should consume a named
channel:

```bash
harakiri template promote base-linux --version-id tplv_... --alias stable
harakiri create --template base-linux:stable --name linux-runner
```

Agent templates should remain normal Harakiri templates. Build them, smoke
them, then promote a stable alias only after the image has a ready digest:

```bash
harakiri template build --name opencode examples/templates/opencode
harakiri template smoke opencode --cmd "harakiri-opencode-smoke"
harakiri template promote opencode --version-id tplv_... --alias stable
```
