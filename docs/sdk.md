# Harakiri SDK

## Task-Oriented TypeScript API

The [task-oriented SDK guide](sdk-developer-experience.md) documents rc.11's
TypeScript improvements, compatibility behavior, failure recovery and six updated
recipes. Those examples require `0.5.0-rc.11` or newer; the additions
are not present in npm `0.5.0-rc.10`. The installed-package smoke tests exercise
the public ESM package and declarations without accessing a running cluster.

For APIs using migration 037, SDK requests use the same scoped key contract as
the CLI. Writes followed by polling normally need both read and write scopes.
`listApiKeys()` requires human OIDC authentication, not a runtime key.
See [authorization, expiry and legacy migration](authorization.md).

## Execution Capacity Admission

**Since 0.5.0-rc.9, migration 038.** `client.capacity()` reads organization execution
slots; keys need `org:read`. Inspect `HarakiriApiError.code` for
`organization_capacity_exceeded` (409), `organization_capacity_unavailable` (503),
`sandbox_transition_in_progress` (409) and `idempotency_conflict` (409).
No automatic retry is performed. Create and resume accept `idempotencyKey`;
persist an explicit key with the job for retries across restarts. Delete
acknowledgement is not terminal-state confirmation: refresh the sandbox and
observe `status: "terminated"` and `capacityPhase: "released"` on that sandbox.
Organization totals alone cannot prove that a particular reservation was released. Counts are null, not zero, when inventory is unverified.
The [runnable tutorial](../examples/sdk-execution-capacity/README.md) verifies
limit-one admission, conflict, cleanup and retry. Use matching API/SDK versions.

## Execution Readiness

API/SDK rc.9 separates execution health from lifecycle state. Default creation
and `waitForSandbox(id)` require the runtime execution service to be ready.
After `wait:false`, an explicit create wait budget, or resume, persist the ID
and wait before submitting the first task. A timeout or cancelled wait does not
terminate the sandbox, renew its TTL or release capacity. Commands and writes
are not replayed. See the [full readiness contract](operations/execution-readiness.md).

## Workspace and Streaming Preview

**Preview baseline: 0.5.0-rc.11.** `client.workspaces`, `workspaceId` and
`client.commands.stream` require a matching operator-enabled API. Stable npm
0.4.0 (`latest`) does not include them. Install the candidate explicitly:

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.11
```

See the [workspace and streaming guide](persistent-workspaces.md)
and the [published two-sandbox tutorial](https://sb.harakiri.io/#docs/persistent-workspaces).
The repository's `sdk-persistent-workspace` recipe requires rc.11;
see the [versioned example index](../examples/README.md).
Existing `commands.logs` remains supported; the new stream observes a tracked
command and never re-executes it on reconnect.

The `@h-sandbox/sdk` package is the recommended integration surface for
external TypeScript and Node.js applications. It wraps the public HTTP API and
keeps callers away from OpenSandbox IDs, Kubernetes objects, route internals,
and provider-specific command transports.

## Configuration

Install the public SDK from npm:

```bash
pnpm add --save-exact @h-sandbox/sdk@0.5.0-rc.11
# or
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.11
```

```ts
import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});
```

Use API keys for server-side integrations. Browser applications should use the
Harakiri web app and Keycloak login flow rather than embedding API keys.
The SDK is self-contained; external projects should import only from
`@h-sandbox/sdk`. `@harakiri/shared` is an internal monorepo package and is not
published as part of the public npm contract.

The reference snippets below assume the named client and resources already exist.
They are operation examples, not complete job owners. Use the
[published first-task program](https://sb.harakiri.io/#docs/quickstart) for
accepted-ID tracking, failure handling and confirmed cleanup. Object-input
`run({ command })` continues to return `{ result }`; the new string overload
and handle conveniences require rc.11 or newer.

## Sandbox Object

`HarakiriSandbox` is the object-oriented integration surface for code that owns
one sandbox at a time. It wraps a Harakiri sandbox ID, caches the latest
`SandboxSummary`, and binds commands, files, routes, egress, logs, metrics, and
lifecycle operations to that sandbox.

```ts
import { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});

const sandbox = await harakiri.sandboxes.create({
  template: "python-3.12-data",
  wait: false,
  ttlSeconds: 600,
  idempotencyKey: "job-123"
});

await sandbox.wait({ timeoutMs: 90_000 });

await sandbox.files.write({
  path: "/workspace/task.py",
  content: "print(2 + 2)\n",
  createParents: true
});

const run = await sandbox.run({
  command: "python /workspace/task.py",
  timeoutMs: 30_000
});
console.log(run.result.stdout);

const reconnected = await HarakiriSandbox.connect(harakiri, sandbox.id);
console.log(reconnected.summary.status);

await sandbox.kill();
```

`refresh()` and `wait()` update the cached summary. Runtime operations delegate
to the same public API methods as `HarakiriClient`, so error subclasses and API
contracts remain identical. Use `harakiri.sandboxes.wrap(summary)` when a list
or create response already returned a `SandboxSummary`.

## Runtime Metadata

Every sandbox summary includes a typed `runtimeMetadata` object. Use it instead
of guessing work directories, default ports, shell, egress state, route defaults,
or provider capability support from template names.

```ts
const sandbox = await harakiri.sandboxes.create({
  template: "open-agents-dev",
  wait: true
});

const metadata = sandbox.runtimeMetadata;
console.log(metadata.workdir);
console.log(metadata.template.versionId);
console.log(metadata.ports.default);
console.log(metadata.provider.capabilities);
```

`runtimeMetadata` is also present on raw `SandboxSummary` objects returned by
`createSandbox`, `getSandbox`, and `listSandboxes`. It includes the resolved
template ID/version/digest, runtime family, user, shell, workdir, default and
exposed ports, route policy defaults, egress mode/rule count, artifact and
command timeout limits, TTL timestamps, and provider capability states.

## Runtime Capabilities

External apps can inspect the active runtime provider before enabling advanced
features:

```ts
const runtime = await harakiri.getRuntimeCapabilities();
const commands = runtime.capabilities.find((capability) => capability.name === "commands");

if (commands?.state !== "available") {
  throw new Error(`Tracked commands unavailable: ${commands?.reason ?? "unknown"}`);
}
```

Capabilities use `available`, `degraded`, and `unavailable` states so
integrations can disable unsupported workflows without parsing provider names.
Each capability also includes `contract` and `source`:

- `opensandbox_spec`: backed by a formal OpenSandbox API/spec.
- `opensandbox_provider`: available through the current OpenSandbox provider
  implementation, but treated as feature-detected behavior.
- `harakiri_control_plane`: implemented by Harakiri on top of provider
  primitives, such as token-protected route proxying.
- `unavailable`: part of Harakiri's surface, but not exposed by this provider.
- `unsupported`: known but outside the current supported contract.

## Core Flow

```ts
const { sandbox } = await harakiri.createSandbox({
  template: "python-3.12-data",
  ttlSeconds: 600,
  egress: { mode: "restricted", presets: ["python-package-install"] },
  env: { APP_ENV: "integration" }
});

await harakiri.waitForSandbox(sandbox.id);

const { result } = await harakiri.runSandbox(sandbox.id, {
  command: "python -c 'print(2 + 2)'",
  cwd: "/workspace",
  timeoutMs: 30_000
});

console.log(result.stdout);
```

`runSandbox` is blocking. It is best for setup commands, tests, short scripts,
and one-shot agent steps.

## Tracked Commands

Use command resources for long-running processes and any workflow that must
survive API client restarts.

```ts
const { command } = await harakiri.commands.start(sandbox.id, {
  command: "python -m http.server 3000",
  cwd: "/workspace",
  detached: true
});

await harakiri.commands.wait(sandbox.id, command.id, {
  statuses: ["running"],
  timeoutMs: 15_000
});

const logs = await harakiri.commands.logs(sandbox.id, command.id, {
  tail: 200
});
await harakiri.commands.kill(sandbox.id, command.id);
```

The flat method names remain available for compatibility:
`startCommand`, `listCommands`, `getCommand`, `getCommandLogs`,
`commandLogs`, `killCommand`, and `waitForCommand`.
OpenAPI-shaped aliases are also available when adapter code wants method names
that mirror operation IDs: `runSandboxCommand`, `createSandboxCommand`,
`getSandboxEgress`, and `updateSandboxEgress`.
Command logs support provider cursors and provider-neutral tailing. When
`tail` is set, the response includes `stdoutTruncated` and `stderrTruncated`
flags so adapters can tell users that earlier output was omitted.

## Git Sources

Use a Git source when a sandbox should start with a repository checkout. This is
implemented on top of Harakiri command resources, so it works through the same
control-plane API as normal commands and does not require Kubernetes access.

```ts
const sandbox = await harakiri.sandboxes.create({
  template: "open-agents-dev",
  ttlSeconds: 1200,
  egress: { mode: "restricted", presets: ["llm-apis"] },
  source: {
    type: "git",
    url: "https://github.com/acme/project.git",
    branch: "main",
    targetPath: "/workspace/project",
    shallow: true
  }
});

const status = await sandbox.git.status({ cwd: "/workspace/project" });
console.log(status.branch, status.files);
```

When the create request uses `egress.mode: "restricted"` or `custom`, the SDK
adds the `git-hosting` preset unless `source.applyEgressPreset` is set to
`false`. The API receives only sanitized source provenance: repository
credentials are stripped before the request is sent, and the SDK later patches
the sandbox source status to `cloning`, `ready`, or `failed`.

`sandbox.summary.source` exposes the sanitized repository URL, branch, commit,
target path, clone duration, and redacted failure reason. Use it for dashboards,
audit views, and reconnect flows; keep credential handling inside the process
that starts the clone.

Git helpers attach constrained operation metadata to the normal command API.
Mutating operations such as clone, commit, pull, push, remote changes, and
config updates record `sandbox.git.*` audit entries with sanitized repository
and ref context. Read-only Git helpers still record structured sandbox events.

For private HTTPS repositories, pass a one-shot token. The tracked command text
contains `$HARAKIRI_GIT_TOKEN` instead of the secret value, and the clone resets
`origin` to the credential-free URL after checkout.

```ts
await sandbox.git.clone("https://github.com/acme/private.git", {
  targetPath: "/workspace/private",
  credentials: {
    type: "token",
    token: process.env.GITHUB_TOKEN!,
    username: "x-access-token"
  }
});
```

Use `credentialPersistence: "dangerously-store-in-remote"` only when the
repository must keep credentials in `.git/config` for later Git operations.

Git troubleshooting:

| Symptom | What to check |
| --- | --- |
| `git binary not found in sandbox image` | The SDK throws `HarakiriGitUnsupportedRuntimeError` with `code: "git_runtime_unsupported"`. Use a template that includes Git, such as `open-agents-dev`, `opencode`, or a custom image that installs `git`. |
| Private clone fails with `Authentication failed` | Confirm the token is present in the process environment and has repository read scope. Prefer one-shot credentials over credentialed URLs. |
| Clone or pull cannot reach GitHub | The SDK throws `HarakiriGitNetworkAccessError` with `code: "git_network_access_failed"` for DNS, TCP, proxy, and likely egress failures. If egress is restricted, include the `git-hosting` preset or allow the required Git hostnames. |
| Branch checkout fails | Check `branch`, `commit`, and `targetPath`; tags and branches are passed directly to Git. |
| Commit fails with missing identity | Run `sandbox.git.configureUser({ name, email }, { cwd })` before committing. |
| Push is rejected | Pull/rebase first, verify the token has write scope, and use explicit one-shot credentials for the push operation. |

## Credential Vault

Use Credential Vault when sandbox code needs to call an external API but should
not receive the real credential value. The SDK exposes one attachment contract
for `inline_ephemeral`, `harakiri_encrypted`, `external_ref`, and `dynamic`
sources, plus template slot mapping, provider inspection, refresh,
rehydration, and metadata-only audit.

```ts
import { HarakiriClient, credentialFromPreset } from "@h-sandbox/sdk";

const created = await harakiri.createSandbox({
  template: "python-3.12-data",
  credentials: [credentialFromPreset("openai", process.env.OPENAI_API_KEY!)]
});

console.log(created.credentialAttachments?.[0]?.status);

const attachment = await sandbox.credentials.attach({
  ...credentialFromPreset("openai", process.env.OPENAI_API_KEY!)
});

const result = await sandbox.credentials.test(attachment.attachment.id, {
  target: "https://api.openai.com/v1/models",
  timeoutMs: 10_000
});

console.log(result.ok, result.status, result.httpStatus);
await sandbox.credentials.detach(attachment.attachment.id);
```

Flat helpers are available for adapter-style code:

```ts
await harakiri.attachSandboxCredential(sandbox.id, {
  value: process.env.PRIVATE_API_TOKEN!,
  binding: {
    match: { hosts: ["api.internal.example"], schemes: ["https"] },
    auth: { type: "apiKey", name: "x-api-key" }
  }
});

await harakiri.listSandboxCredentials(sandbox.id);
await harakiri.testSandboxCredential(sandbox.id, "sca_...", {
  target: "https://api.internal.example/health"
});
```

Use `harakiri.credentialPresets.list()` to discover built-in presets for
OpenAI, Anthropic, OpenRouter, GitHub, GitLab, npm, and PyPI publish. Use an
explicit binding for private APIs, self-hosted Git, or private package indexes
that need custom hosts.

`credentialFromPreset` validates non-empty material and clones preset binding
and fake-env data so caller overrides cannot mutate the shared catalog. Use a
direct body for an exact-host custom profile. Checked examples live in
`examples/sdk-credential-vault` and `examples/sdk-private-api-vault`.

Workspace secret custody is available through `credentialSecrets`. These
helpers are for admin-managed encrypted `harakiri_encrypted` records. The raw
value is write-only and is accepted only on create and rotate:

```ts
const createdSecret = await harakiri.credentialSecrets.create({
  name: "openai-prod",
  providerPresetId: "openai",
  usePolicy: "admins_only",
  value: process.env.OPENAI_API_KEY!,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" }
});

const secrets = await harakiri.credentialSecrets.list();
console.log(secrets.secrets.map((secret) => ({
  id: secret.id,
  status: secret.status,
  version: secret.version,
  usePolicy: secret.usePolicy,
  activeSandboxes: secret.usage.activeSandboxCount,
  hasEncryptedSecret: secret.hasEncryptedSecret
})));

await harakiri.credentialSecrets.update(createdSecret.secret.id, {
  usePolicy: "organization_members"
});

await harakiri.credentialSecrets.rotate(createdSecret.secret.id, {
  value: process.env.OPENAI_API_KEY_NEXT!
});

const storedAttachment = await sandbox.credentials.attachSecret(
  createdSecret.secret.id,
  { displayName: "OpenAI production" }
);
console.log(storedAttachment.attachment.sourceType);

const storedLaunch = await harakiri.createSandbox({
  template: "open-agents-dev",
  credentials: [{
    sourceType: "harakiri_encrypted",
    secretId: createdSecret.secret.id,
    displayName: "OpenAI production"
  }]
});
console.log(storedLaunch.credentialAttachments?.[0]?.sourceRef);

const slottedLaunch = await harakiri.createSandbox({
  template: "open-agents-dev",
  credentialMappings: [{
    slotId: "llm",
    source: {
      sourceType: "harakiri_encrypted",
      secretId: createdSecret.secret.id,
      displayName: "OpenAI production"
    }
  }]
});
console.log(slottedLaunch.credentialAttachments?.[0]?.binding.name);

await harakiri.createSandbox({
  template: "open-agents-dev",
  credentialMappings: [{
    providerPresetId: "openai",
    source: {
      sourceType: "inline_ephemeral",
      value: process.env.OPENAI_API_KEY!
    }
  }]
});

await harakiri.credentialSecrets.disable(createdSecret.secret.id);
await harakiri.credentialSecrets.enable(createdSecret.secret.id);
await harakiri.credentialSecrets.delete(createdSecret.secret.id);
```

Workspace secret management remains admin-only. A secret defaults to
`admins_only`; setting `organization_members` lets members discover and attach
it without granting read or management access. `credentialSecrets` does not
return the raw value. Use a
`harakiri_encrypted` credential body in `createSandbox` for synchronous launch
injection, or `sandbox.credentials.attachSecret(secretId)` and
`harakiri.credentials.attachSecret(sandboxId, secretId)` for an already-running
sandbox. Use `credentialMappings` when the template declares the binding as a
slot and the launch request should only provide the credential source. Required
template slots must be mapped explicitly; direct low-level credentials do not
satisfy named template slots. The SDK rejects create-time credentials and
mappings with `wait:false` or `waitTimeoutMs` because async replay is not
implemented yet. Encrypted workspace secret attachments are rehydrated
automatically after resume when the source is active and decryptable. Use
`sandbox.credentials.rehydrate()` or
`harakiri.credentials.rehydrate(sandboxId)` to retry stored-source
rehydration manually.

Manage and use an external reference through `externalSecretReferences`:

```ts
const external = await harakiri.externalSecretReferences.create({
  name: "OpenAI from cluster",
  providerPresetId: "openai",
  resolverType: "kubernetes_secret",
  reference: {
    namespace: "harakiri",
    name: "harakiri-vault-agents",
    key: "OPENAI_API_KEY"
  },
  usePolicy: "organization_members"
});

const checked = await harakiri.externalSecretReferences.validate(
  external.reference.id
);
console.log(checked.reference.validation.state);

await sandbox.credentials.attachReference(external.reference.id);

await harakiri.createSandbox({
  template: "open-agents-dev",
  credentialMappings: [{
    slotId: "llm",
    source: {
      sourceType: "external_ref",
      referenceId: external.reference.id
    }
  }]
});
```

The SDK never accepts a raw value for an external reference and never returns
the resolved value. Admins manage references; organization members can list and
attach only references explicitly shared with them. The Kubernetes resolver is
an operator-enabled capability; see
[External Secret References](external-secret-references.md).

Configure a GitHub App installation issuer and attach a short-lived token:

```ts
const issuer = await harakiri.dynamicCredentialIssuers.create({
  name: "agent repositories",
  issuerType: "github_app_installation",
  scope: {
    installationId: "123456",
    repositories: ["agent-runtime"],
    permissions: { contents: "read", metadata: "read" }
  },
  usePolicy: "organization_members"
});

await harakiri.dynamicCredentialIssuers.validate(issuer.issuer.id);
const attached = await sandbox.credentials.attachIssuer(issuer.issuer.id);
await sandbox.credentials.refresh(attached.attachment.id);
```

The SDK never exposes an issued token or the platform GitHub App private key.
Dynamic sources can also be supplied in `credentials` or
`credentialMappings` as `{ sourceType: "dynamic", issuerId }`.

Inspect observed provider state and query admin-only organization history:

```ts
const state = await sandbox.credentials.inspect();
const history = await harakiri.auditEvents.list({
  targetId: sandbox.id,
  actionPrefix: "sandbox.credential.",
  limit: 50
});
```

Template definitions can also declare built-in or exact-host custom credential
slots. Slots are
metadata only and are copied to each immutable template version:

```ts
await harakiri.createTemplate({
  id: "agent-with-models",
  name: "Agent with models",
  image: "ubuntu:24.04",
  credentialSlots: [
    { providerPresetId: "openai" },
    { providerPresetId: "github", required: false },
    {
      id: "private-model",
      providerPresetId: "custom",
      required: false,
      customProfile: {
        host: "api.internal.example",
        authType: "apiKey",
        headerName: "x-api-key",
        methods: ["GET", "POST"],
        paths: ["/v1/*"],
        envName: "PRIVATE_MODEL_KEY",
        testPath: "/v1/health"
      }
    }
  ]
});

const template = await harakiri.getTemplate("agent-with-models");
console.log(template.template.credentialSlots?.map((slot) => slot.providerPresetId));
```

Do not hard-code secret values in source files or send them through command
strings. Use process environment variables, a CI secret store, or write-only
workspace secret custody. After resume, active injected attachments are marked
`requires_reinjection` because provider-side vault state is reset. Harakiri
then rehydrates active encrypted workspace, external-reference, and dynamic
attachments. Because
`inline_ephemeral` values are not stored, callers must reattach them with a
fresh value.

See the [Credential Vault cookbook](credential-vault-cookbook.md) for complete
model, private API, GitHub, package, registry, and OpenCode workflows.

## Files

Filesystem helpers support ordinary agent workflows:

```ts
await harakiri.files.write(sandbox.id, {
  path: "/workspace/task.txt",
  content: "Summarize this file\n",
  createParents: true
});

const file = await harakiri.files.read(sandbox.id, "/workspace/task.txt");
const listing = await harakiri.files.list(sandbox.id, "/workspace");
await harakiri.files.rename(sandbox.id, {
  fromPath: "/workspace/task.txt",
  toPath: "/workspace/input.txt"
});
```

Use artifact helpers when moving binary payloads through JSON. `files.upload`
and `files.download` remain compatible aliases, but `artifacts.*` communicates
that the operation is checksum-verified binary transfer:

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const archive = await readFile("./input.tar.gz");
await harakiri.artifacts.upload(sandbox.id, {
  path: "/workspace/input.tar.gz",
  contentBase64: archive.toString("base64"),
  sizeBytes: archive.byteLength,
  sha256: "sha256:" + createHash("sha256").update(archive).digest("hex"),
  createParents: true
});

const artifact = await harakiri.artifacts.download(sandbox.id, "/workspace/input.tar.gz");
console.log(artifact.sha256, artifact.transfer.maxBytes);
```

Artifact upload/download is base64 encoded and limited by
`SANDBOX_FILE_ARTIFACT_MAX_BYTES`, which defaults to 16 MiB. The API validates
decoded size and optional `sha256` before writing, and every response includes
`transfer.mode`, `transfer.encoding`, and `transfer.maxBytes`.

## Preview Routes

**Version boundary:** rc.11 preserves Request method/body/headers, scopes
credentials to the route origin/path and forces manual redirects. Older rc.10
does not preserve every Request field and follows native redirect defaults.
Upgrade before passing generated-client Requests to the generic route adapter.
Process and route handles keep their response properties for compatibility.
See [the route contract](https://sb.harakiri.io/#docs/typescript-sdk?section=protected-services)
and the [published authenticated server program](https://sb.harakiri.io/#docs/opencode-template).

Expose a sandbox port when a command starts a web server:

```ts
const route = await harakiri.routes.expose(sandbox.id, {
  port: 3000,
  protocol: "http",
  accessMode: "public",
  labels: ["preview", "web"]
});

console.log(route.route.url);
await harakiri.routes.delete(sandbox.id, 3000);
```

Use `accessMode: "token"` when a preview should not be directly public. Harakiri
returns a proxy URL plus a route token only on creation:

```ts
const preview = await harakiri.routes.expose(sandbox.id, {
  port: 5173,
  accessMode: "token",
  labels: ["preview"]
});

await fetch(preview.route.url, {
  headers: harakiri.routes.headers(preview)
});

const previewFetch = harakiri.routes.fetch(preview);
await previewFetch("/");
```

Store the token in your application if you need to reuse it. Later `listRoutes`
calls expose only `tokenHint`, not the token itself.
Route summaries also expose `labels`, `createdByUserId`, `createdByLabel`, and
`lastUsedAt`. `lastUsedAt` is updated for token routes served through the
Harakiri proxy; direct public provider routes may not pass through Harakiri.

The SDK includes route helpers that remove the repeated header and polling code
from agent integrations:

```ts
const route = await harakiri.routes.exposeAndWait(sandbox.id, {
  port: 4096,
  accessMode: "token",
  labels: ["agent-server"]
}, {
  path: "/health",
  timeoutMs: 30_000,
  fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(3000) })
});

const headers = harakiri.routes.headers(route);
const routeFetch = harakiri.routes.fetch(route);
await routeFetch("/health", { redirect: "error", signal: AbortSignal.timeout(5000) });
```

`routes.headers` returns the one-time route token header when the route was just
created. `routes.fetch` injects that token on every request. Both helpers accept
OpenCode-style basic auth options when the service behind the route has its own
credentials.

## OpenCode SDK Integration

Use the complete [published OpenCode programs](https://sb.harakiri.io/#docs/opencode-template)
with `@h-sandbox/sdk@0.5.0-rc.11`. Each creates its own sandbox, retains the
accepted ID before waiting, verifies the result, and confirms termination and
capacity release before reporting success. A cleanup failure preserves the ID
and original task error; it is not swallowed.

For headless execution, select `OPENCODE_MODEL` explicitly. Host environment
variables are not inherited: the program forwards an optional
`ANTHROPIC_API_KEY`. This exposes the real key inside the sandbox; use a supported
[Credential Vault binding](https://sb.harakiri.io/#docs/credential-vault) when
the runtime must not receive it. Free model availability depends on the model
catalog and provider, not the SDK release.

For the server integration:

1. Set `OPENCODE_SERVER_PASSWORD` in a fresh sandbox.
2. Wait for execution readiness and start a tracked `opencode serve` process.
3. Expose a token-protected route on port 4096.
4. Probe `/global/health` with both route-token and Basic authentication.
5. Use the same password in the generated OpenCode client.
6. Clean up only after the client operation has completed.

The published example pins `@opencode-ai/sdk@1.15.13` and uses a GET-only Fetch
adapter for its configuration check. It rejects redirects and scopes credentials
to the route. rc.10's generic route adapter does not preserve every `Request`
field; do not advertise it as a full generated-client adapter. The
[TypeScript guide](https://sb.harakiri.io/#docs/typescript-sdk)
documents the full scoped adapter and updated headless recipe.

## Outbound Access

Harakiri exposes developer-friendly outbound access operations:

```ts
await harakiri.setOutboundAccess(sandbox.id, {
  mode: "restricted",
  presets: ["python-package-install"]
});

await harakiri.allowDomains(sandbox.id, ["api.github.com"]);
const probe = await harakiri.testOutboundAccess(sandbox.id, "https://api.github.com");
```

## Lifecycle

Harakiri uses explicit TTL, renew, kill, and provider-backed persistence
semantics:

```ts
await harakiri.renewSandbox(sandbox.id);

await sandbox.pause();
await sandbox.resume();

const { snapshot } = await sandbox.snapshot({
  name: "before-upgrade",
  wait: true
});

await harakiri.sandboxes.create({
  snapshotId: snapshot.id,
  name: "restored-runner",
  wait: true
});

await harakiri.killSandbox(sandbox.id);
```

Pause, resume, snapshot, snapshot list/delete, and create-from-snapshot are
capability-gated. Read `getRuntimeCapabilities()` before presenting these
actions in product UI, and handle explicit provider unavailable errors when an
installation uses a runtime mode that does not support snapshots.

## Errors

**Candidate migration:** accepted creation failures now use
`HarakiriSandboxCreationError`, which is not a `HarakiriApiError`. Recover by
`sandboxId` and inspect `stage`, `creation`, `cleanup` and `cause`; direct Git calls still
raise Git errors. The string `run` overload with `check: true` adds
`HarakiriRunError`; object-input calls keep `{ result }` and require
an explicit exit-code check. Configuration and byte-integrity validation still use standard JavaScript
errors, not new exported SDK error classes. Aborting a wait never kills the remote workload.
See the [error and recovery contract](https://sb.harakiri.io/#docs/errors-troubleshooting).


API failures throw `HarakiriApiError` with:

- `status`: HTTP status code.
- `body`: raw response body.
- `details`: parsed structured error when available.
- `code`: shortcut to `details.error`.
- `category`: stable SDK category for coarse policy decisions.
- `retryable`: `true` when retry with backoff is usually reasonable.

Use `error.code` for product decisions and log `error.message` for operators.
Use subclasses when the application needs broad behavior:

- `HarakiriAuthenticationError`
- `HarakiriAuthorizationError`
- `HarakiriValidationError`
- `HarakiriNotFoundError`
- `HarakiriConflictError`
- `HarakiriRateLimitError`
- `HarakiriUnsupportedCapabilityError`
- `HarakiriProviderUnavailableError`
- `HarakiriTimeoutApiError`
- `HarakiriServerError`
- `HarakiriWaitTimeoutError`

Stable sandbox runtime codes are exported from `@h-sandbox/sdk` as
`sandboxRuntimeApiErrorCodes`. The most important integration branches are:

| Scenario | Codes | Typical handling |
| --- | --- | --- |
| Missing resource | `sandbox_not_found`, `sandbox_command_not_found`, `route_not_found`, `file_not_found` | Drop stale IDs, recreate the resource, or show a not-found state. |
| Sandbox state conflict | `sandbox_not_running`, `sandbox_terminated` | Refresh sandbox state; do not retry blindly against the same runtime. |
| Unsupported provider capability | `runtime_command_unsupported`, `runtime_file_operation_unsupported`, `credential_vault_unsupported` | Hide or disable the feature; check `getRuntimeCapabilities()` before retrying. |
| Provider unavailable | `sandbox_provision_failed`, `runtime_files_unavailable`, `egress_provider_unavailable`, `credential_vault_provider_unavailable`, `route_proxy_upstream_unreachable` | Retry idempotent operations with backoff and show degraded runtime state. |
| Command timeout | `sandbox_command_timeout` | Increase timeout, split the command, or switch to detached command resources. |
| File policy or path failure | `file_permission_denied`, `invalid_file_path`, artifact validation codes | Correct the path, permissions, or artifact metadata before retrying. |
| Route or egress policy failure | `route_token_required`, `route_access_mode_conflict`, `egress_policy_invalid`, egress limit codes | Ask the user to adjust access mode or outbound policy. |
| Credential Vault input or policy failure | `credential_vault_create_requires_sync`, `credential_vault_invalid_binding`, `credential_vault_egress_conflict`, `credential_vault_required_slot_missing`, `credential_vault_secret_required`, `credential_secret_invalid`, `credential_secret_value_required` | Correct the source, slot mapping, binding, fake env, sync-create mode, or runtime egress profile before retrying. |
| Credential Vault resource or permission failure | `credential_vault_attachment_not_found`, `credential_preset_not_found`, `credential_secret_not_found`, `credential_secret_duplicate`, `credential_secret_forbidden`, `credential_secret_disabled`, `credential_secret_encryption_unavailable`, `credential_secret_decryption_unavailable` | Refresh IDs, use an admin key for workspace secrets, enable disabled secrets, or fix server encryption configuration. |
| External or dynamic source failure | `external_secret_*`, `dynamic_credential_issuer_*`, `dynamic_credential_issue_*` | Correct operator configuration, locator or issuer scope, source status, and member-use policy; never fall back to an unrelated source. |
| Audit permission failure | `audit_event_forbidden` | Show organization Vault history only to admins and still handle server-side denial. |

```ts
import { HarakiriApiError, HarakiriProviderUnavailableError } from "@h-sandbox/sdk";

try {
  await harakiri.files.read(sandbox.id, "/missing.txt");
} catch (error) {
  if (error instanceof HarakiriApiError && error.code === "file_not_found") {
    // create the file or choose another path
  }
  if (error instanceof HarakiriProviderUnavailableError && error.retryable) {
    // retry an idempotent operation with backoff
  }
}
```

## Timeouts And Retries

- Set command `timeoutMs` for blocking or foreground work.
- Use `waitForSandbox` after asynchronous sandbox creation.
- Use `commands.wait` for detached process state transitions.
- Prefer `HarakiriSandbox` for adapter code that works with one sandbox at a
  time, and keep `HarakiriClient` for bulk operations or OpenAPI-shaped calls.
- Retry idempotent reads and list operations at the application layer if the
  network fails.
- For sandbox creation, use `idempotencyKey` when the caller may retry the same
  request.
