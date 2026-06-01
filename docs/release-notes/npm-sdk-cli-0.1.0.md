# NPM SDK And CLI 0.1.0

Harakiri now publishes the public JavaScript integration packages:

- `@h-sandbox/sdk@0.1.0`
- `@h-sandbox/cli@0.1.0`

Published on 2026-06-01.

## Install

```bash
pnpm add @h-sandbox/sdk
npm install -g @h-sandbox/cli
```

## Highlights

- SDK exports the public `HarakiriClient`, typed sandbox/runtime contracts,
  error classes, command helpers, filesystem helpers, route helpers, template
  helpers, and egress helpers.
- CLI installs a normal `harakiri` executable; no direct `node dist/index.js`
  workflow is required.
- `@harakiri/shared` remains internal and is not part of the public npm install
  graph.
- Package release checks verify no `workspace:*` dependencies and no
  `@harakiri/shared` dependency leaks into published packages.

## Verification

- `pnpm publish:local-check`
- `pnpm publish:dry-run`
- `pnpm publish:postcheck`
- `pnpm conformance:sdk`
- `pnpm conformance:cli`
