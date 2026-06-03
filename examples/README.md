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

The OpenCode server example also uses OpenCode's generated client:

```bash
pnpm add @h-sandbox/sdk @opencode-ai/sdk
```

Available examples:

- `sdk-basic-command`: create, wait, run a command, inspect logs, cleanup.
- `sdk-files`: write, read, list, upload, download, and remove files.
- `sdk-preview-route`: start a dev server and expose a token-protected route.
- `sdk-restricted-egress`: apply outbound access policy and test it.
- `sdk-dev-server`: full agent-style flow with setup, detached server, preview.
- `sdk-template-build`: create and build a custom Dockerfile template.
- `sdk-typescript-quickstart`: TypeScript compile smoke for SDK consumers.
- `sdk-sandbox-object`: object-oriented `HarakiriSandbox` flow for adapters.
- `sdk-opencode-headless`: run `opencode run` in an `opencode` sandbox, with an optional repository clone and diff readback.
- `sdk-opencode-server`: start `opencode serve`, expose port 4096, wait for health, and connect `@opencode-ai/sdk` through Harakiri route auth.

Maintainers can run the OpenCode examples as live smokes against a deployed
Harakiri API:

```bash
export HARAKIRI_API_URL=https://sb-api.harakiri.io
export HARAKIRI_API_KEY=hk_live_...
export OPENCODE_MODEL=opencode/deepseek-v4-flash-free

pnpm exec tsx examples/sdk-opencode-headless/index.ts
pnpm exec tsx examples/sdk-opencode-server/index.ts
```

Template examples live under `examples/templates`:

- `base-linux`: small general-purpose Linux devbox.
- `python-3.12-data`: Python data and analysis runtime.
- `node-20-app`: Node web app and API runtime.
- `browser-chromium`: headless Chromium automation runtime.
- `open-agents-dev`: browser-capable coding-agent runtime.
- `opencode`: OpenCode coding-agent runtime with a route-ready server.
