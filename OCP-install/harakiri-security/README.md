# Harakiri Security Single-Namespace OpenShift Install

This installer deploys the local end-to-end stack into one OpenShift namespace:

- one PostgreSQL instance and one database, with separate roles for every service. Harakiri Sandbox uses schema `harakiri_sandbox`, Keycloak uses schema `keycloak`, and BackgroundAgent currently uses `public` because its migrations reference `public.*` tables explicitly;
- one Keycloak deployment with two realms: `harakiri` and `background-agent`;
- OpenSandbox controller, API server, and ingress gateway;
- Harakiri Sandbox control plane;
- BackgroundAgent configured to use Harakiri as its sandbox provider.

Default namespace: `harakiri-security`.

## What Is Validated

Validated on local OpenShift/CRC with the namespace `harakiri-security`:

- PostgreSQL is running once and shared by role/schema policy.
- Keycloak runs in the same namespace and imports two realms: `harakiri` and `background-agent`.
- OpenSandbox controller, server, and gateway are installed from the mirrored Helm chart.
- Harakiri Sandbox API/web/scheduler/template-builder are installed from the mirrored Helm chart.
- BackgroundAgent is installed from its Helm chart and configured with `SANDBOX_DEFAULT_PROVIDER=harakiri`.
- Routes return HTTP 200 for Harakiri API, Harakiri web config, Keycloak realm metadata, and BackgroundAgent health.
- Harakiri can create a `python-3.12-data` sandbox through OpenSandbox, run a command, and delete it.
- The `open-agents-dev` template can be published from `examples/templates/open-agents-dev`, imported as an image-backed Harakiri template, and smoke-tested in an OpenSandbox sandbox.

## OpenShift SCC Notes

The install does not modify default OpenShift SCCs.

OpenSandbox egress enforcement uses a sidecar that asks for `NET_ADMIN` in the
current `dns+nft` mode. The restricted Harakiri values set
`OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0` so open-network sandboxes do not send a
no-op allow-all `networkPolicy` and therefore do not request the egress sidecar.
Restricted/custom/blocked egress still requires a client-approved OpenShift
profile or an alternate OpenSandbox egress implementation that works under
restricted-v2.

The installer restarts `opensandbox-server` after the Helm upgrade because the upstream chart mounts `config.toml` from a ConfigMap but does not put a config checksum into the pod template.

## Run

```bash
CLIENT_REGISTRY_USERNAME=<robot-or-admin> \
CLIENT_REGISTRY_PASSWORD=<token> \
POSTGRES_PASSWORD=<generated-password> \
KEYCLOAK_ADMIN_PASSWORD=<generated-password> \
OPEN_SANDBOX_API_KEY=<generated-token> \
BACKGROUND_AGENT_WORKSPACE=/path/to/background-agents \
./OCP-install/harakiri-security/install.sh
```

The script reads BackgroundAgent secrets from:

- `${BACKGROUND_AGENT_WORKSPACE}/apps/web/.env`
- `${BACKGROUND_AGENT_WORKSPACE}/apps/web/.env.local`

It generates temporary files under `/tmp` and creates Kubernetes Secrets directly. Do not commit generated secret files.

## Images

The default single-namespace install uses these images:

| Component | Image |
| --- | --- |
| Harakiri API, scheduler, template-builder | `${CLIENT_REGISTRY}/${HARBOR_PROJECT}/harakiri-api:${SANDBOX_IMAGE_TAG}` |
| Harakiri web | `${CLIENT_REGISTRY}/${HARBOR_PROJECT}/harakiri-web:${SANDBOX_IMAGE_TAG}` |
| Keycloak | `core.campus.clusterdiali.me/harakiri/mirror/keycloak:26.4` |
| PostgreSQL | `registry.redhat.io/rhel9/postgresql-16:latest` |
| OpenSandbox controller | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/controller:v0.2.0` |
| OpenSandbox server | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/server:v0.2.3` |
| OpenSandbox execd | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/execd:v1.1.0` |
| OpenSandbox egress | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/egress:v1.1.7` |
| OpenSandbox ingress gateway | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/ingress:v1.0.10` |
| OpenSandbox image committer | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/image-committer:v0.1.1` |
| BackgroundAgent | `${CLIENT_REGISTRY}/${BACKGROUND_AGENT_IMAGE_REPOSITORY}:${BACKGROUND_AGENT_IMAGE_TAG}` |

If the client requires every image to come from Harbor, mirror PostgreSQL and
override it at install time:

```bash
POSTGRES_IMAGE=core.campus.clusterdiali.me/harakiri/mirror/postgresql-16:latest \
./OCP-install/harakiri-security/install.sh
```

The validated `open-agents-dev` template image is:

```text
core.campus.clusterdiali.me/harakiri/templates/open-agents-dev@sha256:fd71e2b7610f81260755ccb86ee60a119ce14816016a4870ef9820a8b4255070
```

## Default Local Routes

On CRC the default routes are:

- Harakiri Sandbox dashboard: `https://hs.apps-crc.testing`
- Harakiri Sandbox API: `https://hs-api.apps-crc.testing`
- Keycloak: `https://hs-auth.apps-crc.testing`
- BackgroundAgent: `https://hs-background-agent.apps-crc.testing`
- Sandbox route wildcard: `*.hs-sbx.apps-crc.testing`

Override with environment variables:

```bash
WEB_HOST=sandbox.apps.example.com \
API_HOST=sandbox-api.apps.example.com \
AUTH_HOST=sandbox-auth.apps.example.com \
BACKGROUND_AGENT_HOST=agents.apps.example.com \
SBX_DOMAIN=sandbox-routes.apps.example.com \
./OCP-install/harakiri-security/install.sh
```

## Smoke Test

The installer performs basic HTTP checks when `SMOKE_TEST=true`. Set
`SANDBOX_SMOKE_TEST=true` and `HARAKIRI_API_KEY` to a workspace API key when you
want the installer to run a Harakiri sandbox create/run/kill smoke test. For
production, keep `HARAKIRI_SEED_ON_BOOT=0` and create users/API keys
deliberately after Keycloak login.

To create an optional first Keycloak user during a lab install, pass
`BOOTSTRAP_USER_EMAIL` and `BOOTSTRAP_USER_PASSWORD`. The generated password is
temporary and must be changed on first login.

The BackgroundAgent chart is configured with `SANDBOX_DEFAULT_PROVIDER=harakiri`. For a first clean OpenShift smoke install, the default Harakiri template is `python-3.12-data` because it is seeded by Harakiri and can be created immediately. Switch `BACKGROUND_AGENT_HARAKIRI_TEMPLATE` to `open-agents-dev` once that template has been published and imported in the target cluster.

Manual status checks:

```bash
oc get pods -n harakiri-security
oc get jobs -n harakiri-security
oc get routes -n harakiri-security
helm list -n harakiri-security
```

## Publish The `open-agents-dev` Template

This OpenShift profile disables in-cluster Dockerfile builds. Publish custom
template images externally, push them to Harbor, then import the image into the
Harakiri control plane.

Run these commands from the Harakiri Sandbox repository root.

```bash
export CLIENT_REGISTRY=core.campus.clusterdiali.me
export HARBOR_PROJECT=harakiri
export TEMPLATE_NAME=open-agents-dev
export TEMPLATE_TAG=ocp-$(date +%Y%m%d%H%M)
export TEMPLATE_IMAGE="${CLIENT_REGISTRY}/${HARBOR_PROJECT}/templates/${TEMPLATE_NAME}:${TEMPLATE_TAG}"

# Use linux/amd64 for normal client OpenShift clusters.
# Use linux/arm64 for local CRC on Apple Silicon.
export TEMPLATE_PLATFORM=linux/amd64

docker login "${CLIENT_REGISTRY}"
docker buildx build \
  --platform "${TEMPLATE_PLATFORM}" \
  -t "${TEMPLATE_IMAGE}" \
  --push \
  examples/templates/open-agents-dev
```

Import the pushed image as a Harakiri template version:

```bash
export HARAKIRI_API_URL=https://hs-api.apps-crc.testing
export HARAKIRI_API_KEY=<workspace-api-key>

# CRC uses a local route certificate. Do not use this setting for production
# clusters with trusted TLS.
export NODE_TLS_REJECT_UNAUTHORIZED=0

node packages/cli/dist/index.js login \
  --api-url "${HARAKIRI_API_URL}" \
  --api-key "${HARAKIRI_API_KEY}"

node packages/cli/dist/index.js template build \
  --name open-agents-dev \
  --source image \
  --image "${TEMPLATE_IMAGE}" \
  examples/templates/open-agents-dev \
  --timeout 900
```

Smoke-test the imported runtime:

```bash
node packages/cli/dist/index.js template smoke open-agents-dev \
  --context examples/templates/open-agents-dev \
  --cmd "harakiri-open-agents-smoke" \
  --timeout-ms 180000 \
  --wait-timeout-ms 120000
```

On local CRC, the first sandbox that uses this image can spend several minutes
pulling Chromium, code-server, and agent tooling from Harbor. If the first smoke
test fails with `sandbox not ready` while OpenShift events show `Pulling image`,
wait until the sandbox pod becomes Ready or rerun the smoke after the image is
cached on the node.

Validated on this CRC install:

- Image: `core.campus.clusterdiali.me/harakiri/templates/open-agents-dev:ocp-202606120241`
- Digest: `sha256:fd71e2b7610f81260755ccb86ee60a119ce14816016a4870ef9820a8b4255070`
- Harakiri build: `bld_MIXUENfi7Iek`
- Harakiri template version: `tplv_KIVdeX4uC3-q`
- Smoke sandbox: `sbx_OdsQWvso9E`
- Smoke result: `harakiri open-agents smoke passed`

After the template is imported, BackgroundAgent can be installed or upgraded to
use it:

```bash
BACKGROUND_AGENT_HARAKIRI_TEMPLATE=open-agents-dev \
./OCP-install/harakiri-security/install.sh
```
