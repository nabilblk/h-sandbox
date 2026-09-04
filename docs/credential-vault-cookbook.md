# Credential Vault Cookbook

These examples keep real values in process environment variables or an
operator secret store. Replace IDs and URLs, but never place a real credential
in source, shell arguments, screenshots, or committed test fixtures.

## Run The Checked SDK Example

The same example supports every built-in preset:

```bash
export HARAKIRI_API_URL=http://127.0.0.1:18082
export HARAKIRI_API_KEY=hk_live_...
export HARAKIRI_CREDENTIAL_PRESET=anthropic
export HARAKIRI_CREDENTIAL_VALUE="$ANTHROPIC_API_KEY"
pnpm --filter @h-sandbox/sdk build
pnpm tsx examples/sdk-credential-vault/index.ts
```

Use `openai`, `anthropic`, `openrouter`, `github`, `gitlab`, `npm`, or
`pypi-publish` as the preset. The example verifies the fake environment,
inspects sanitized provider state, runs the preset test target, prints no
credential value, and deletes its sandbox.

## OpenAI-Compatible Or Anthropic Agent

```ts
import { HarakiriClient, credentialFromPreset } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const result = await client.createSandbox({
  template: "open-agents-dev:stable",
  credentials: [credentialFromPreset(
    "anthropic",
    process.env.ANTHROPIC_API_KEY!
  )]
});
```

For a self-hosted OpenAI-compatible endpoint, use the private API profile below
instead of widening the built-in OpenAI preset.

## Private HTTPS API

```bash
export HARAKIRI_PRIVATE_API_HOST=api.internal.example
export HARAKIRI_PRIVATE_API_KEY='...'
export HARAKIRI_PRIVATE_API_HEADER=x-api-key
export HARAKIRI_PRIVATE_API_PATH=/v1/health
pnpm tsx examples/sdk-private-api-vault/index.ts
```

The host must be exact. Custom profiles support bearer or one API-key header,
HTTPS only, optional method/path restrictions, fake env, and a test path.

Template authors can declare the same requirement:

```toml
[[credential_slot]]
id = "private-model"
provider = "custom"
required = true
label = "Private model API"
host = "api.internal.example"
auth = "api-key"
header = "x-api-key"
methods = ["GET", "POST"]
paths = ["/v1/*"]
env_name = "PRIVATE_MODEL_KEY"
test_path = "/v1/health"
```

## GitHub API And Private Git

The `github` Vault preset targets `api.github.com`. For short-lived access,
configure a GitHub App installation issuer:

```bash
harakiri vault issuers create \
  --name agent-repositories \
  --installation-id 123456 \
  --repository private-repo \
  --permission contents=read \
  --permission metadata=read
harakiri vault issuers validate dci_...
harakiri vault attach-issuer sbx_... dci_...
```

For `git clone`, use Harakiri's Git integration with a one-shot token. Git
authentication has transport-specific behavior and is deliberately separate
from the GitHub API preset:

```ts
await sandbox.git.clone({
  url: "https://github.com/acme/private-repo.git",
  token: process.env.GITHUB_TOKEN!
});
```

The SDK removes credentials from `origin`, and Harakiri stores redacted command
metadata. See [SDK Git integration](sdk.md#git-integration).

## npm And PyPI

Attach the `npm` preset for authenticated requests to `registry.npmjs.org`, or
`pypi-publish` for uploads to `upload.pypi.org`. Package-manager config still
needs to reference the fake env value expected by the template.

```bash
harakiri create \
  --template node-20 \
  --credential 'preset=npm,from-env=NPM_TOKEN'

harakiri create \
  --template python-3.12-data \
  --credential 'preset=pypi-publish,from-env=PYPI_TOKEN'
```

Public package downloads do not need a credential. Use the existing Python or
Node outbound-access preset when only network policy is required.

## Private Registry Pull

Runtime image pulls happen before sandbox code and before Credential Vault
exists. Use Harakiri template registry credentials, not a Vault attachment:

```bash
harakiri registry-credentials create \
  --registry registry.internal.example \
  --username "$REGISTRY_USER" \
  --password-stdin <<<"$REGISTRY_PASSWORD"
```

Credential Vault is appropriate for package or API calls made after the
sandbox starts. Image pull credentials remain a separate control-plane
channel.

## OpenCode-Style Template

Build and smoke the included template, then add a model source only when the
selected model needs one:

```bash
harakiri template build --name opencode examples/templates/opencode
harakiri template smoke opencode --cmd harakiri-opencode-smoke
harakiri create \
  --template opencode \
  --credential 'preset=openrouter,from-env=OPENROUTER_API_KEY'
```

The free-model smoke path in the template does not require a credential.

## CI-Safe CLI Pattern

```bash
set +x
printf '%s' "$OPENAI_API_KEY" | \
  harakiri vault secrets create \
    --name ci-openai \
    --preset openai \
    --from-stdin \
    --json >credential-metadata.json
```

Delete disposable workspace sources after the test. Deleting Harakiri custody
does not revoke the value at its upstream issuer.

## Expected Results And Cleanup

A successful attach returns an attachment ID with `status: injected`. Inspect
should report `providerState: present`; test should report a reachable HTTP
status without a response body. A denied URL should report blocked or
unreachable, and a URL outside the binding should report `binding_mismatch`.

Cleanup:

```bash
harakiri vault detach "$SANDBOX_ID" "$ATTACHMENT_ID"
harakiri kill "$SANDBOX_ID"
harakiri vault secrets delete "$SECRET_ID"
harakiri vault references delete "$REFERENCE_ID"
harakiri vault issuers delete "$ISSUER_ID"
```

When a provider rejects credentials, inspect the typed error, attachment state,
outbound policy, and metadata-only audit event. Never enable open outbound
access or log a raw value as a diagnostic shortcut.
