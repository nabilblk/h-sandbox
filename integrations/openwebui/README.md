# OpenWebUI with Harakiri

**Source candidate, not a released or natively qualified integration.** Build the
API, SDK and adapter from the same checkout. Core 0.5.0-rc.13 does not provide the
new generic WebSocket transport. Do not install this adapter against rc.13 and
assume the shell works. Qualification status and upstream pins are recorded in
[compatibility.json](compatibility.json); a null receipt means no complete passing
native qualification has been recorded. Failed or partial runs do not qualify the pair.

This optional adapter connects **unmodified OpenWebUI** to Harakiri through its
native Open Terminal connection. Harakiri manages runtime capacity, lifecycle,
routes and retained workspaces. Open Terminal runs inside each personal sandbox
and supplies its file, shell and preview API. Models and the chat UI stay in
OpenWebUI. No Kubernetes exec, provider credentials or OpenWebUI-specific core
API is used.

## Boundaries

- Use an administrator-managed **server-to-server** connection. Never put the
  Harakiri key, adapter key or route grant into a user-supplied tool configuration.
- One workspace per OpenWebUI user and `ADAPTER_INSTANCE_ID`. Chats share that
  user's files; opaque chat session IDs keep their terminal/cwd context separate.
  Per-chat orchestration contexts are not supported.
- The configured OpenWebUI server is trusted to assert `X-User-Id`. Possession of
  the adapter key grants this authority. Headers alone are not user authentication.
  Trusted administrators configure that key in their settings UI; it is not a
  secret from those administrators. Ordinary chat clients receive neither that
  key nor Harakiri service keys or route grants.
- Use a dedicated Harakiri organization. This does **not** add per-user resource
  ACLs to Harakiri; members with direct organization access keep those permissions.
- Open Terminal executions are not Harakiri Commands. No unified command audit,
  tracked-command recovery or per-command Harakiri policy is implied.
- Filesystem navigation starts at `/workspace`; this is not a chroot. Sandboxed
  code can read its own Open Terminal service credentials, never the adapter's
  Harakiri control-plane key. Runtime isolation remains the provider's responsibility.
- Native PDF/PNG/HTML previews and PTY behavior remain qualification gates. Office
  conversion and notebooks are excluded. Do not enable unsafe preview origins.
- HTML reports must be self-contained: embed images as data URLs and use inline
  styles. With OpenWebUI's default SameSite=Lax cookies, an opaque-origin preview
  cannot authenticate relative image/CSS/JS requests. Do not enable
  `allow-same-origin`, weaken session-cookie policy, or put tokens into asset URLs
  to bypass this boundary. Download multi-file applications instead; this profile
  does not qualify live port-hosted applications with authenticated relative assets.

## 1. Prepare Harakiri

Use an isolated supported Kubernetes installation running this source candidate.
Do not overwrite a working installation just to evaluate the adapter. See the
[Kubernetes guide](https://sb.harakiri.io/#docs/install-kubernetes) for the baseline
installation and [protected service contract](../../docs/routes.md) for the
candidate transport. The operator must configure:

- A template builder and registry reachable by runtime nodes.
- Retained workspaces with the existing single-writer storage profile.
- Reachable protected service routes through the provider gateway, including
  WebSocket upgrades. Do not substitute direct pod URLs.
- An execution slot for each concurrent active user and sufficient storage quota.
- A separate service-principal key with `templates:read`, `sandboxes:read`,
  `sandboxes:write`, `workspaces:read` and
  `workspaces:write`. Check the current authorization reference when minting it.

### Install the matching candidate API

After installing the baseline in a **disposable evaluation cluster**, use the
same checkout for the API and adapter. The native qualification target is Linux
amd64. Authenticate Docker to your own registry privately and set these values:

```bash
export KUBECONFIG=/absolute/path/to/evaluation-kubeconfig
export HARAKIRI_REGISTRY=registry.example.com
export HARAKIRI_IMAGE_PROJECT=evaluation
export HARAKIRI_NAMESPACE=harakiri-evaluation
export HARAKIRI_VALUES=/absolute/path/to/evaluation-values.yaml
```

`HARAKIRI_VALUES` must be the complete values file used to install that baseline,
including its public URLs, existing Secrets, provider configuration and retained
storage. Do not substitute chart defaults or another installation's values. Check
the selected cluster and release before proceeding:

```bash
kubectl config current-context
helm list --namespace "$HARAKIRI_NAMESPACE"
git diff --exit-code HEAD
SOURCE_REV=$(git rev-parse --verify HEAD)
for COMPONENT in api web; do
  docker buildx build --platform linux/amd64 \
    --file "apps/$COMPONENT/Dockerfile" \
    --tag "$HARAKIRI_REGISTRY/$HARAKIRI_IMAGE_PROJECT/harakiri-$COMPONENT:openwebui-$SOURCE_REV" \
    --push .
done
helm upgrade harakiri ./infra/charts/harakiri \
  --namespace "$HARAKIRI_NAMESPACE" \
  --values "$HARAKIRI_VALUES" \
  --set-string image.registry="$HARAKIRI_REGISTRY" \
  --set-string image.repository="$HARAKIRI_IMAGE_PROJECT" \
  --set-string image.api.name=harakiri-api \
  --set-string image.web.name=harakiri-web \
  --set-string image.api.tag="openwebui-$SOURCE_REV" \
  --set-string image.web.tag="openwebui-$SOURCE_REV" \
  --set-string config.TEMPLATE_BUILDER_JOB_IMAGE="$HARAKIRI_REGISTRY/$HARAKIRI_IMAGE_PROJECT/harakiri-api:openwebui-$SOURCE_REV" \
  --wait --timeout 10m
```

This assumes the baseline release is named `harakiri`; use its actual name if
different. The registry must be trusted by the cluster and its pull credentials
must already be configured. No TLS bypass or direct pod access is required.
The chart shares its registry/project between API and web, so both images are
built here; the scheduler and template builder also use the candidate API image.
Record the commit and resulting registry digests. This is a source qualification
path, not a published release or an instruction to upgrade a working lab.

### Build the Open Terminal template

Configure `HARAKIRI_API_URL` and `HARAKIRI_API_KEY` privately in your terminal.
Build the template through the normal public CLI (with an operator key allowed
to build templates):

```bash
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/cli build
node packages/cli/dist/index.js template build \
  --name open-terminal examples/templates/open-terminal
node packages/cli/dist/index.js template builds --query open-terminal
```

The template starts Open Terminal 0.14.6 on port 8000. Wait for a successful
digest-pinned build before configuring the adapter. Runtime readiness alone is
not application readiness; the adapter also probes `/health` through the grant.
See [the template](../../examples/templates/open-terminal/README.md).

## 2. Configure the separate adapter

Docker Compose is a reproducible **evaluation** profile, not a Harakiri installer.
It starts only OpenWebUI, the adapter and a private binding database. It does not
start or modify Kubernetes. Reserve about 3 GiB for these containers plus your
separate model server and sandbox runtime capacity.

Create `integrations/openwebui/.env` from [.env.example](.env.example), using a
private editor or your secret manager. The file is ignored by Git. Set:

| Setting | Meaning |
| --- | --- |
| `HARAKIRI_API_URL` | API URL reachable from the adapter container; not host `localhost` |
| `HARAKIRI_API_KEY` | Dedicated organization service key |
| `HARAKIRI_TEMPLATE` | Successfully built template ID or alias |
| `ADAPTER_INSTANCE_ID` | Stable identity for this OpenWebUI instance; changing it creates different personal workspaces |
| `ADAPTER_ENCRYPTION_KEY` | 64 hex characters, from `openssl rand -hex 32`; back it up separately |
| `OPENWEBUI_ADAPTER_KEY` | Separate random value, at least 32 characters, used by OpenWebUI only |
| `ADAPTER_DATABASE_PASSWORD` | Separate random hex password; hex is URL-safe in this Compose profile |
| `WEBUI_SECRET_KEY` | OpenWebUI session-signing secret, independent of the other keys |
| `OPENWEBUI_PORT` | Unused loopback host port, default 28580 |

Never paste these secrets in an issue, screenshot or model prompt. Do not print
the expanded `docker compose config` output into CI logs.

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml config --quiet
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml up -d --build
```

Open `http://127.0.0.1:28580` and create the first administrator. OpenWebUI 0.12.4
then disables public signup automatically. Add the intended users through its
admin panel, or temporarily enable signup and approve their accounts, then disable
signup again. Grant those users access to the Terminal connection below; creating
an account alone does not grant access. Bindings and OpenWebUI data use separate persistent
volumes. Neither the database nor adapter port is published on the host. Keep the
OpenWebUI branding; it has its own [license](https://github.com/open-webui/open-webui/blob/v0.12.4/LICENSE),
distinct from Harakiri's Apache-2.0 and Open Terminal's MIT license.

For Kubernetes, package the same adapter image as a non-root Deployment and
internal Service, use a dedicated PostgreSQL database/user, and supply settings
via Secrets. There is no adapter Helm chart or OpenShift certification yet. Keep
the adapter reachable only from the trusted OpenWebUI backend; use TLS between
hosts, including the database, and do not weaken certificate verification.

## 3. Add the native Open Terminal connection

In OpenWebUI 0.12.4, open **Admin Panel > Settings > Integrations**, then use
**Add Connection** in the **Terminal** section. The Tools and Knowledge sections
have different connections with the same button label.
Add a connection with:

| Field | Value |
| --- | --- |
| URL | `http://adapter:8080` (Compose network, not a browser URL) |
| API key / bearer key | Your private `OPENWEBUI_ADAPTER_KEY` |
| OpenAPI path | `/openapi.json` |
| Connection mode | Ordinary Open Terminal, not Terminals orchestrator |
| Forward cookies | Off |
| Chat uploads | Filesystem, when selecting upload-to-terminal behavior |
| Access | Only the intended test users |

Verify and save the connection. Verification fetches discovery/configuration
without allocating a sandbox. A user's first real operation creates their
workspace and sandbox. Cold-start waits are finite; if OpenWebUI times out first,
inspect the existing sandbox and retry observation, not the original command.
The pinned OpenWebUI file browser shows a generic connection error for failed
directory requests, including capacity denial. Its network response preserves
the HTTP status and adapter error code; operators should use those and Harakiri's
capacity view to distinguish exhausted slots from an unreachable service.

## 4. Use a model, then inspect the actual result

### Optional local model

Skip this subsection if OpenWebUI already has a tool-capable model connection.
The optional Compose profile starts a CPU-only Ollama server on the private
Compose network. Reserve **6 GiB and 3 CPUs in addition to** the integration's
resources and Harakiri runtimes. The initial image/model downloads require
internet access; inference does not require a paid provider or cloud account.

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml --profile local-model up -d model
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml --profile local-model exec -T model \
  ollama pull qwen3:4b-instruct
```

In **Admin Panel > Settings > Connections**, enable Ollama and add
`http://model:11434`. This is the OpenWebUI backend's address, not a browser URL.
No model port is published on the host. Verify the downloaded identity from the
OpenWebUI container before treating it as the reference model:

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml exec -T openwebui python -c '
import json, urllib.request
models = json.load(urllib.request.urlopen("http://model:11434/api/tags", timeout=10))["models"]
model = next(item for item in models if item["name"] == "qwen3:4b-instruct")
expected = "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0"
if model["digest"].removeprefix("sha256:") != expected:
    raise SystemExit("Model digest differs from the qualification candidate")
print(model["name"], model["digest"])
'
```

The model tag can change; a different digest is a different qualification target.
Do not silently update the expected digest. The optional model volume is a download
cache, separate from user workspaces and the adapter binding database.

### Model settings and first chat

Configure a tool-capable model in OpenWebUI's normal Connections settings. No
model key is required by this adapter. The reference scenario targets the local
`qwen3:4b-instruct` model through Ollama, with native tool calling, thinking off
and a 16,384-token context for the terminal schema. The bounded evaluation profile
uses temperature 0, seed 42 and at most 3,072 generated tokens per model response;
these settings are not a deterministic-output guarantee. The model runs outside the sandbox.
For this focused workflow, disable the model's unrelated built-in tools in
OpenWebUI's model capabilities while keeping **Terminal** enabled. These are normal
OpenWebUI model settings, not changes to its source or the adapter's tool schema.
Record its exact digest when testing; a mutable model name is not proof of a
reproducible run. Inspect its license and resource requirements separately.

Open a new chat, select the model and the terminal connection, and send:

```text
Use the connected terminal's tools, not a code block in your reply.
First use write_file to save a Python script at /workspace/report.py. Do not put Python source in a shell command or heredoc.
Then use run_command with command="python /workspace/report.py", cwd=/workspace and wait=5.
The script must first create /workspace/demo with pathlib.Path.mkdir(parents=True, exist_ok=True).
Create /workspace/demo/sales.csv with header region,sales and rows North,12; South,7; North,5.
Read this CSV with Python csv and aggregate sales by region.
Write report.json containing exactly {"North":17,"South":7,"total":24}.
Use matplotlib's Agg backend to generate chart.png and report.pdf from the totals.
Write a self-contained index.html with heading Sales report, total 24, and the same PNG embedded as a data:image/png;base64 URL.
Make the HTML responsive with a viewport meta tag. Use body style="margin:16px;font-family:system-ui" and img style="max-width:100%;height:auto" (inline attributes, no CSS template braces).
Keep all five files in /workspace/demo. Do not use relative or external assets in the HTML.
Compute the base64 with Python from the PNG; never generate or print the base64 as model text.
Read the JSON back to verify it. Print only the small totals dictionary and file names.
Check the command's exit_code and output before claiming success. If still running, inspect its status until done.
Do not install packages or download data. Report failures honestly. Finish with a brief summary and file links.
```

Check the tool calls, not just the model's prose. In OpenWebUI's file browser,
inspect `/workspace/demo`, open the image/PDF and download `report.json`. Check
the exact numbers independently. Open the shell, run `pwd` and `cat` on the JSON,
resize it and interrupt a short-running command. Change a file, then refresh its
preview. These are intended acceptance steps, **not claimed passing results**.

The adapter forwards text/binary HTTP responses and shell frames. It cannot
improve buffering inside OpenWebUI: the pinned application buffers requests and
some text/JSON responses. Harakiri's incremental transport is not a promise of
end-to-end streaming for every OpenWebUI operation.

For long-running commands, request `wait=0`, retain the returned process ID and
use `get_process_status` to observe it. The default Harakiri service proxy allows
10 seconds to receive response headers; a synchronous Open Terminal wait longer
than that can lose its response while the command continues. Do not resubmit the
command after a transport timeout. Operators can configure finite proxy budgets;
see the [transport limits](../../docs/routes.md).

## 5. Lifecycle, retention and cleanup

Defaults: 15-minute runtime TTL, 4-hour maximum session age. Actual mutations or
shell input can renew at most every 30 seconds. Health checks, file listings,
automatic working-directory synchronization, output polling and terminal ping/resize frames do not renew. A socket closes after 60 seconds without frames;
reconnect explicitly. A connected browser alone is not a perpetual lease.
Process/port polling and reconnecting an old PTY never allocate a runtime. They
return `409 sandbox_session_inactive` when the previous runtime has ended.

After confirmed termination and workspace release, the next user operation can
create a fresh runtime on the retained workspace: refresh/open files, start a
new command or open a new terminal. Input or cancellation targeting an old
process cannot create a replacement. Processes, PTYs and execution
IDs are not restored. A paused/failed runtime or uncertain release requires an
operator decision; the adapter will not force a second writer.

Stop the integration without deleting data:

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml --profile local-model down
```

Stopping the adapter does not delete Harakiri resources. Revoke routes and stop
only the sandboxes owned by this integration using Harakiri's dashboard or CLI;
wait for capacity release. Archive retained workspaces separately only after
their files are no longer needed. Delete the dedicated service key when retiring
the integration. Do not remove database volumes until bindings/data are backed up
and all owned resources are accounted for.

## Troubleshooting And Operations

| Symptom / error | Action |
| --- | --- |
| `adapter_authentication_required` | Verify the native server connection key, not a Harakiri key or browser JWT |
| `invalid_context` | Use the native Open Terminal connection; it forwards a verified user ID |
| `personal_context_only` | Disable orchestrator/context mode; this release maps personal workspaces |
| `organization_capacity_exceeded` | Free a confirmed execution slot or ask the administrator to raise capacity; no command ran |
| `context_busy` | A lifecycle action holds this user's binding; inspect/observe it before issuing another mutation |
| `workspace_creation_unconfirmed` | A creation response was lost; locate the deterministic workspace name and reconcile ownership, never blindly allocate another |
| `route_creation_unconfirmed` | Use the generation-checked grant recovery command below; never edit encrypted records or allocate a replacement sandbox |
| `service_grant_unavailable` | Access to the saved route was denied; inspect/revoke it and use explicit grant recovery below. Health polling will not replace it automatically |
| `sandbox_recovery_required` | Inspect paused/failed/terminating state and retained storage; no automatic resume or replacement is attempted |
| `sandbox_session_inactive` | The previous runtime ended; refresh files or start a new command/terminal. Old process and PTY IDs cannot be resumed |
| `workspace_release_unconfirmed` | Wait for confirmed provider cleanup and storage detach; do not force attach |
| `binding_decryption_failed` | Restore the matching encryption key with its database backup; do not reset the binding |
| `sandbox_service_unavailable` | Check sandbox readiness, template logs, port 8000, `/health`, route state, key scopes and API/provider reachability |
| Shell fails but HTTP works | Verify every ingress supports Upgrade and the generic service WebSocket candidate is deployed |
| Preview fails | Check content MIME and the OpenWebUI proxy security headers; do not add `allow-same-origin` to make an unsafe preview work |

Uncertain execution/upload is never replayed automatically. Inspect files or the
Open Terminal execution identity before manually retrying a side effect.

### Recover A Lost Service Grant

Obtain the affected user's immutable ID from OpenWebUI's administrator interface,
not their display name or email. Inspect its binding without printing credentials:

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml exec -T adapter \
  node integrations/openwebui/dist/operator.js inspect --user-id USER_ID
```

The result includes the generation UUID, sandbox ID and workspace ID, never the
service key or route token. Confirm that these are the intended resources. Then:

```bash
docker compose --env-file integrations/openwebui/.env \
  -f integrations/openwebui/compose.yaml exec -T adapter \
  node integrations/openwebui/dist/operator.js reset-grant \
  --user-id USER_ID --expect-generation GENERATION_FROM_INSPECTION
```

This revokes only the recorded sandbox's port-8000 route and enables a fresh grant
on the next operation. Existing connections can close; files and processes are
not deleted. A changed generation or non-running sandbox stops the operation.
If revocation is uncertain, the binding remains closed and the command can be
explicitly retried after inspection. It never retries a shell command or upload.
This is an operator command inside the separate adapter, not Kubernetes exec
into a sandbox or a direct runtime-provider operation.

The adapter uses AES-256-GCM encrypted PostgreSQL bindings with per-identity
authentication data. Back up the binding database and encryption key together,
but store the key separately. Also back up Harakiri's database and retained
storage according to its recovery guide. This is not a replacement for those
backups. There is no automatic key-rewrap tool: changing the encryption key
without re-encrypting existing records intentionally fails closed.

Rotate the OpenWebUI adapter key in both configurations and restart the adapter
to close existing connections. Rotate the Harakiri key in its secret and restart;
API-key revocation alone does not revoke existing independent route grants.
Delete those routes or terminate the sandbox to revoke service access. Restore a
previous image/configuration only with a matching binding-schema version; do not
roll back the core while active clients depend on generic WebSockets.

## Development And Qualification

```bash
pnpm --filter @harakiri/openwebui-adapter typecheck
pnpm --filter @harakiri/openwebui-adapter test
# Requires local initdb/pg_ctl; starts/stops only a new private Unix-socket database.
# Also verifies the core route authorization SQL and live connection revocation.
pnpm --filter @harakiri/openwebui-adapter test:postgres
pnpm --filter @harakiri/openwebui-adapter test:package
```

These are protocol/contract tests, not real OpenWebUI browser evidence. The
[execution plan](../../docs/exec-plans/active/protected-services-openwebui.md)
lists native, security, recovery and independent self-service acceptance gates.
Do not change `nativeAcceptance` or label the pair supported without those results.
Read the [architecture decision](../../docs/protected-services-design.md) before
changing credential boundaries or the context mapping.
The [contributor guide](CONTRIBUTING.md) describes module ownership, the isolated
native runner, evidence handling and release gates.
