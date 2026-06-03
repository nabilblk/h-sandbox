# SDK Sandbox Object

Harakiri now exposes a high-level `HarakiriSandbox` runtime object in
`@h-sandbox/sdk`.

## Added

- `HarakiriSandbox.create(client, input)`, `connect(client, id)`, and
  `wrap(client, summary)`.
- `client.sandboxes.create`, `connect`, `wrap`, `list`, `get`, `wait`, `renew`,
  and `kill` namespace helpers.
- Bound sandbox methods for `run`, `refresh`, `wait`, `renew`, `kill`, `logs`,
  `metrics`, `commands`, `terminal`, `files`, `routes`, and `egress`.
- `examples/sdk-sandbox-object` for adapter-style TypeScript integrations.

## Compatibility

The new object is additive. Existing `HarakiriClient` methods, OpenAPI-shaped
aliases, CLI behavior, and typed SDK errors remain unchanged.
