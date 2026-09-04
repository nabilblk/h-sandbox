# Installing Harakiri Sandbox on OpenShift

This is the customer-safe OpenShift runbook for Harakiri Sandbox. It targets
clusters where the platform team grants one namespace and does not allow
application teams to create or modify Security Context Constraints.

Canonical install package:

```text
OCP-install/harakiri-security/
```

The older root `OCP-install/install-restricted.sh` is only a compatibility
wrapper that delegates to this single-namespace package.

## What Gets Installed

All application resources run in one namespace, `harakiri-security` by default:

- PostgreSQL, with one database and service-specific roles/schemas.
- Keycloak, with `harakiri` and `background-agent` realms.
- OpenSandbox controller, server, gateway, and sandbox dataplane resources.
- Harakiri Sandbox control plane: API, web, scheduler, template builder.
- Optional BackgroundAgent chart configured to use Harakiri as its sandbox
  provider.
- OpenShift Routes for web, API, auth, BackgroundAgent, and sandbox wildcard
  traffic.

## Prerequisites

- `oc`, `helm`, `envsubst`, `node`, and `curl` on the operator workstation.
- Access to one OpenShift namespace or rights to create it.
- Harbor or another internal registry reachable from the cluster.
- Harakiri control-plane images and chart published to the internal registry.
- OpenSandbox chart and images mirrored to the same registry.
- DNS for:
  - Harakiri web, for example `hs.apps.example.com`
  - Harakiri API, for example `hs-api.apps.example.com`
  - Keycloak, for example `hs-auth.apps.example.com`
  - BackgroundAgent, if installed
  - wildcard sandbox routes, for example `*.hs-sbx.apps.example.com`

Artifact coordinates are tracked in
[`release-artifacts.md`](release-artifacts.md). Do not put real registry,
database, SMTP, Keycloak, or npm tokens in committed docs or values files.

## Mirror OpenSandbox

Mirror pinned upstream images with the repository workflow:

```text
Actions -> Mirror images (Harbor)
```

Mirror the OpenSandbox Helm chart to Harbor:

```bash
CLIENT_REGISTRY_URL=https://core.campus.clusterdiali.me/ \
CLIENT_REGISTRY_USERNAME=<robot-or-admin> \
CLIENT_REGISTRY_PASSWORD=<token> \
OCP-install/mirror-opensandbox-chart.sh
```

Default OpenSandbox chart:

```text
oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox --version 0.2.2
```

## Install

For a local CRC smoke install with the default sample values:

```bash
CLIENT_REGISTRY_USERNAME=<robot-or-admin> \
CLIENT_REGISTRY_PASSWORD=<token> \
POSTGRES_PASSWORD=<generated-password> \
KEYCLOAK_ADMIN_PASSWORD=<generated-password> \
OPEN_SANDBOX_API_KEY=<generated-token> \
BACKGROUND_AGENT_WORKSPACE=/path/to/background-agents \
./OCP-install/harakiri-security/install.sh
```

For a client cluster, log in first and pass explicit hosts and versions:

```bash
oc login https://api.<cluster>:6443

OPENSHIFT_LOGIN=false \
NAMESPACE=harakiri-security \
CLIENT_REGISTRY_URL=https://core.campus.clusterdiali.me/ \
CLIENT_REGISTRY_USERNAME=<robot-or-admin> \
CLIENT_REGISTRY_PASSWORD=<token> \
SANDBOX_CHART_VERSION=<harakiri-chart-version> \
SANDBOX_IMAGE_TAG=<harakiri-image-tag> \
OPEN_SANDBOX_CHART_VERSION=0.2.2 \
WEB_HOST=hs.apps.example.com \
API_HOST=hs-api.apps.example.com \
AUTH_HOST=hs-auth.apps.example.com \
BACKGROUND_AGENT_HOST=hs-background-agent.apps.example.com \
SBX_DOMAIN=hs-sbx.apps.example.com \
POSTGRES_PASSWORD=<generated-password> \
KEYCLOAK_ADMIN_PASSWORD=<generated-password> \
OPEN_SANDBOX_API_KEY=<generated-token> \
BACKGROUND_AGENT_WORKSPACE=/path/to/background-agents \
./OCP-install/harakiri-security/install.sh
```

The installer downloads local chart archives under `OCP-install/charts/`, creates
Kubernetes Secrets directly, applies declarative manifests, then runs HTTP
health checks when `SMOKE_TEST=true`. Add `SANDBOX_SMOKE_TEST=true` and a valid
`HARAKIRI_API_KEY` when the installer should also create, run, and delete a
sandbox.

## Restricted OpenShift Constraints

The default package does not create or grant SCCs.

OpenSandbox egress enforcement uses a sidecar that needs `NET_ADMIN` for the
current `dns+nft` mode. On customer clusters that only allow restricted-v2:

- open-network sandboxes are the supported default;
- `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0` is set in the restricted values so
  no-op allow-all sandboxes do not request the egress sidecar;
- restricted, custom, or blocked egress policies require a client-approved
  runtime profile or an OpenSandbox egress implementation that works under
  restricted-v2.

Credential Vault is therefore **operator-action-required** under the default
restricted profile. It must stay unavailable unless OpenSandbox reports
`credentialVaultReady: true` with `dns+nft`; Harakiri does not fall back to
environment injection or Kubernetes exec. Review
[Credential Vault Operations](credential-vault-operations.md) before enabling
the feature. The chart never creates or edits a default SCC.

Dockerfile template builds are also disabled in the restricted profile. Build
template images externally, push them to Harbor, and import them as image-backed
Harakiri templates.

## Publish `open-agents-dev`

Build and push the template image outside OpenShift:

```bash
export TEMPLATE_IMAGE=core.campus.clusterdiali.me/harakiri/templates/open-agents-dev:<tag>

docker buildx build \
  --platform linux/amd64 \
  -t "${TEMPLATE_IMAGE}" \
  --push \
  examples/templates/open-agents-dev
```

Import and smoke-test it:

```bash
export HARAKIRI_API_URL=https://hs-api.apps.example.com
export HARAKIRI_API_KEY=<workspace-api-key>

harakiri login --api-url "${HARAKIRI_API_URL}" --api-key "${HARAKIRI_API_KEY}"
harakiri template build \
  --name open-agents-dev \
  --source image \
  --image "${TEMPLATE_IMAGE}" \
  examples/templates/open-agents-dev \
  --timeout 900
harakiri template smoke open-agents-dev \
  --context examples/templates/open-agents-dev \
  --cmd "harakiri-open-agents-smoke" \
  --timeout-ms 180000 \
  --wait-timeout-ms 120000
```

## Verify

```bash
oc get pods -n harakiri-security
oc get routes -n harakiri-security
helm list -n harakiri-security
curl -fsSk https://hs-api.apps.example.com/health
curl -fsSk https://hs.apps.example.com/config.js
curl -fsSk https://hs-auth.apps.example.com/realms/harakiri/.well-known/openid-configuration
```

Then create a sandbox:

```bash
harakiri create --template python-3.12-data --name ocp-check
harakiri run sbx_... --cmd "python --version"
harakiri kill sbx_...
```

## Rollback And Uninstall

Rollback a failed upgrade:

```bash
helm history harakiri -n harakiri-security
helm rollback harakiri <revision> -n harakiri-security
```

Clean uninstall:

```bash
helm uninstall background-agent -n harakiri-security --ignore-not-found
helm uninstall harakiri -n harakiri-security --ignore-not-found
helm uninstall opensandbox -n harakiri-security --ignore-not-found
oc delete route harakiri-web harakiri-api keycloak background-agent sandbox-wildcard \
  -n harakiri-security --ignore-not-found
oc delete namespace harakiri-security
```

Persistent volumes are owned by the namespace and are removed with the namespace
unless the storage class has a Retain reclaim policy.
