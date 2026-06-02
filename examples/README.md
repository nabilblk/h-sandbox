# Harakiri SDK Examples

These examples show the public integration surface expected by external
applications. They use only `@h-sandbox/sdk` and environment variables.

Set:

```bash
export HARAKIRI_API_URL=http://127.0.0.1:18082
export HARAKIRI_API_KEY=hk_live_...
```

Run an example from a project that has `@h-sandbox/sdk` installed:

```bash
pnpm add @h-sandbox/sdk
node examples/sdk-basic-command/index.mjs
```

Available examples:

- `sdk-basic-command`: create, wait, run a command, inspect logs, cleanup.
- `sdk-files`: write, read, list, upload, download, and remove files.
- `sdk-preview-route`: start a dev server and expose a token-protected route.
- `sdk-restricted-egress`: apply outbound access policy and test it.
- `sdk-dev-server`: full agent-style flow with setup, detached server, preview.
- `sdk-template-build`: create and build a custom Dockerfile template.
- `sdk-typescript-quickstart`: TypeScript compile smoke for SDK consumers.

Template examples live under `examples/templates`:

- `base-linux`: small general-purpose Linux devbox.
- `python-3.12-data`: Python data and analysis runtime.
- `node-20-app`: Node web app and API runtime.
- `browser-chromium`: headless Chromium automation runtime.
- `open-agents-dev`: browser-capable coding-agent runtime.
