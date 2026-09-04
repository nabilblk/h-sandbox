# Integrating Credential Vault

This guide is for products that use Harakiri as a sandbox provider. Integrate
with the Harakiri `/v1` API or `@h-sandbox/sdk`; do not call OpenSandbox sidecar
endpoints or depend on pod names, ports, or provider IDs.

## Integration Contract

Your product owns user intent and obtains source material from its existing
secret store. Harakiri owns organization authorization, template slots,
credential attachment state, egress compilation, audit metadata, and provider
translation. OpenSandbox owns sandbox execution and runtime injection.

Choose a source per workflow:

| Source | Use when | Persistence | Rehydration |
| --- | --- | --- | --- |
| `inline_ephemeral` | Your process already has a one-use value | Never stored by Harakiri | Caller must provide it again |
| `harakiri_encrypted` | A workspace needs reusable write-only custody | Envelope-encrypted in Harakiri | Automatic while active and decryptable |
| `external_ref` | Kubernetes/ESO owns the source of truth | Locator only | Automatic by resolving the current value |
| `dynamic` | A platform issuer can mint short-lived scope | Scope and expiry metadata only | Refreshed and reissued while valid |

## Recommended SDK Flow

```ts
import { HarakiriClient, credentialFromPreset } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const created = await client.createSandbox({
  template: "open-agents-dev:stable",
  name: `agent-${crypto.randomUUID()}`,
  credentials: [credentialFromPreset(
    "anthropic",
    process.env.ANTHROPIC_API_KEY!
  )]
});

const sandbox = client.sandbox(created.sandbox.id);
const inspected = await sandbox.credentials.inspect();
if (inspected.attachments.some((item) => item.providerState !== "present")) {
  throw new Error("runtime credential state is not ready");
}

try {
  await sandbox.commands.run({ command: "node agent.mjs" });
} finally {
  await sandbox.kill();
}
```

Use template slots when the runtime has a stable credential requirement. Your
launch request then selects a source without duplicating binding policy:

```ts
await client.createSandbox({
  template: "agent-runtime:stable",
  credentialMappings: [{
    slotId: "llm",
    source: {
      sourceType: "external_ref",
      referenceId: process.env.HARAKIRI_LLM_REFERENCE_ID!
    }
  }]
});
```

## Authentication

Server-side integrations should use a Harakiri API key in `x-api-key`. Browser
applications use the existing OIDC flow and must not embed workspace API keys
or credential values in frontend bundles. Keep API URL and key injectable so
self-hosted installations do not require source changes.

## Lifecycle Requirements

- Credential-bearing creation is synchronous. Do not request async creation or
  a wait timeout when the request contains credential values or mappings.
- Wait for a running sandbox and successful attachment response before starting
  the agent.
- On reconnect, call `credentials.inspect()`. If provider state is missing,
  call `credentials.rehydrate()` for stored, external, or dynamic sources.
- An ephemeral source in `requires_reinjection` needs a new value and a new
  attachment.
- Snapshot restore never inherits old source selections. Supply explicit
  `credentialMappings` for the restored sandbox.
- Treat typed `credential_vault_*`, `credential_secret_*`,
  `external_secret_*`, and `dynamic_credential_*` errors as actionable states,
  not generic provider failures.

## Egress And Routes

Vault bindings and outbound access form one safety boundary. A credential
binding automatically contributes its hosts to restricted launch policy.
Additional destinations required by the agent must be declared separately.
Do not switch a credential-bearing sandbox to open outbound access merely to
work around a missing hostname.

Ingress routes are independent. A route exposes a sandbox service; it does not
grant outbound access or access to Vault material.

## RBAC Expectations

- Admins manage reusable sources, external locators, dynamic issuers, and Vault
  audit history.
- Members can launch or attach only sources explicitly shared for organization
  member use.
- Integrations should render management controls only when the account
  capability says they are available, while still handling a server-side 403.

## CLI And CI

For shell automation, install `@h-sandbox/cli`, run `harakiri login`, and use
`--from-env` or stdin. Add `--json` for stable machine-readable output.

```bash
harakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"
harakiri create \
  --template agent-runtime:stable \
  --credential 'preset=openai,from-env=OPENAI_API_KEY' \
  --json
```

Do not put values directly in `--credential`, command arguments, logs, or CI
artifacts.

## Conformance Checklist

- [ ] API base URL and auth mode are configuration, not constants.
- [ ] The integration checks `/v1/capabilities` and the published support
      matrix before showing Vault as available.
- [ ] Template requirements are modeled as slots, not product-specific env
      conventions.
- [ ] Secret values enter only through SDK request objects, process env, stdin,
      or an admin write form and are never logged.
- [ ] Create failure cleans up the remote sandbox or accepts Harakiri's
      compensating rollback result.
- [ ] Reconnect inspects provider state and handles `requires_reinjection`.
- [ ] Shutdown terminates the sandbox and does not assume attachment deletion
      revokes the upstream credential.
- [ ] Tests cover a permitted target, denied target, source unavailable,
      runtime unavailable, and member forbidden path.
- [ ] Support tickets capture Harakiri version, runtime profile, sandbox ID,
      attachment ID, source type, and error code without a raw value.

For migration from provider-specific calls, see
[Migrating From Direct OpenSandbox](migrating-from-direct-opensandbox.md). For
the wider sandbox adapter contract, see [Provider Adapter Shape](provider-adapter.md).
