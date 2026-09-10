# Harakiri on OpenShift

This guide describes the **standalone Harakiri control plane**, using published
charts and operator-managed dependencies. It does not install a consuming agent
application, require a private deployment repository or modify an SCC.

**Support boundary:** the recorded native installation is the
[Kubernetes/arm64 evaluation profile](../infra/preview/README.md), not a fresh
restricted OpenShift certification. The values below express the restricted
installation contract and are render-checked; validate the complete workflow
on your selected OpenShift, storage and runtime versions before advertising
that profile as supported.

## 1. Agree on Prerequisites

| Component | Operator responsibility |
| --- | --- |
| Harakiri namespace | An approved namespace, service-account/RBAC policy and enough capacity; never reuse a populated customer namespace implicitly |
| Database | PostgreSQL, migrations/extension prerequisites, a Harakiri role and coordinated backups; see the [chart guide](../infra/charts/harakiri/README.md) |
| Identity | Keycloak-compatible OIDC, a browser client with PKCE S256, exact public HTTPS origins and API audience `harakiri-api`; see [authorization](authorization.md) |
| Member invitations | A scoped realm service account, its Secret reference, and separately configured/tested SMTP; see [members](members.md) |
| Runtime | A separately approved OpenSandbox deployment; it is the current runtime provider, not the product identity |
| Registry | Published chart/image coordinates, trusted CA chain and pull Secrets available to the relevant control-plane and runtime service accounts |
| Storage | A tested StorageClass, arbitrary-UID permissions and reclaim/recovery policy before enabling workspaces |
| Routes | Public web/API/auth DNS and TLS; wildcard sandbox routing is a separate optional configuration |

The maintained [runtime chart](../infra/charts/opensandbox/HARAKIRI.md) requires
platform approval for CRDs and cluster-scoped RBAC. A single application namespace
does not remove those prerequisites. Use one approved runtime installation; do
not start a second controller against existing workloads.

OpenSandbox's lifecycle server container and its TOML server configuration must
both use port `8080` for non-root execution. Its Service may still expose `80`.
Do not patch a running deployment to repair a mismatched chart/configuration.

## 2. Prepare Values and Secrets

Choose an exact supported release from the [release artifacts](release-artifacts.md)
and its receipt. Keep chart and image versions aligned, including any documented
web overlay. The current preview reference is `0.5.0-rc.8`; this does not certify
that candidate on OpenShift.

Create an operator-owned Secret named `harakiri-api` before installation. Supply
`DATABASE_URL`, `OPEN_SANDBOX_API_KEY`, encryption/wrapping keys and any required
OIDC service-account secret using your approved secret-management process.
The chart's [configuration reference](../infra/charts/harakiri/README.md) and
[Vault operations](credential-vault-operations.md) describe their lifetimes.
Never put credentials in committed values, command-line flags or shared render
output. Preserve the same keys across upgrade and recovery.

An example `operator-values.yaml` for **a fresh control-plane installation with
existing dependencies** follows. Replace all example registry, service and
public origins. Configure the Keycloak client with the same web origin and
post-logout redirect; internal JWKS access must not change the public issuer.

```yaml
fullnameOverride: harakiri
image:
  registry: registry.example.com
  repository: harakiri
imagePullSecrets:
  - name: registry-pull
secret:
  create: false
  existingSecret: harakiri-api
registry:
  enabled: false
ingress:
  enabled: false
rbac:
  create: false
  prepullClusterRole: false
podSecurityContext:
  seccompProfile:
    type: RuntimeDefault
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]
config:
  HARAKIRI_RUNTIME_PROVIDER: opensandbox
  AUTH_DEV_ALLOW: "0"
  SEED_ON_BOOT: "0"
  PUBLIC_WEB_URL: https://sandbox.apps.example.com
  PUBLIC_API_URL: https://sandbox-api.apps.example.com
  PUBLIC_KEYCLOAK_URL: https://auth.apps.example.com
  PUBLIC_KEYCLOAK_REALM: harakiri
  PUBLIC_KEYCLOAK_CLIENT_ID: harakiri-web
  PUBLIC_OPEN_SANDBOX_URL: ""
  KEYCLOAK_ISSUER: https://auth.apps.example.com/realms/harakiri
  KEYCLOAK_ISSUER_ALLOWLIST: https://auth.apps.example.com/realms/harakiri
  KEYCLOAK_AUDIENCE: harakiri-api
  KEYCLOAK_JWKS_URL: http://keycloak.identity.svc:8080/realms/harakiri/protocol/openid-connect/certs
  KEYCLOAK_ADMIN_BASE_URL: http://keycloak.identity.svc:8080
  KEYCLOAK_ADMIN_REALM: harakiri
  KEYCLOAK_ADMIN_TOKEN_REALM: harakiri
  KEYCLOAK_ADMIN_CLIENT_ID: harakiri-admin
  KEYCLOAK_INVITATION_REDIRECT_URI: https://sandbox.apps.example.com/#dashboard/sandboxes
  OPEN_SANDBOX_BASE_URL: http://opensandbox-server.runtime.svc:80
  OPEN_SANDBOX_GATEWAY_URL: http://opensandbox-ingress-gateway.runtime.svc:80
  OPEN_SANDBOX_ALLOW_FALLBACK: "0"
  OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "0"
  SANDBOX_ROUTE_DEFAULT_ACCESS_MODE: token
  SANDBOX_ROUTE_LOCAL_FALLBACK_URL: ""
  TEMPLATE_DOCKERFILE_BUILDER: disabled
  TEMPLATE_IMAGE_ALLOW_REGISTRIES: registry.example.com
  TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED: "0"
  TEMPLATE_IMAGE_PREPULL_ENABLED: "0"
  TEMPLATE_RETENTION_DELETE_BUILDER_JOBS: "0"
  PERSISTENT_WORKSPACES_ENABLED: "0"
```

This baseline disables Dockerfile builder Jobs, pre-pull and runtime pull
preflight, so it does not grant their Kubernetes roles. Image-backed template
imports remain the intended path. Enabling additional features requires their
documented permissions; do not apply these fresh-install values blindly to an
existing installation with different enabled features.

The current `dns+nft` egress and Vault sidecars require `NET_ADMIN`, unavailable
under the default [restricted-v2 SCC](https://docs.redhat.com/en/documentation/openshift_container_platform/4.17/html/authentication_and_authorization/managing-pod-security-policies).
Open networking omits that sidecar; this is
**not** enforced egress isolation. Restricted/custom/blocked modes and Vault
runtime use must report unavailable unless a separately approved compatible
runtime profile is provided. Do not grant an elevated SCC or use secret-to-env
fallbacks to conceal that limitation. See the [support matrix](credential-vault-support.md).

## 3. Download, Review and Install the Control Plane

Run these only after the platform prerequisites and operator configuration have
been approved. Use an explicitly selected kubeconfig/context and namespace:

```bash
export NAMESPACE=harakiri
export HARAKIRI_VERSION=0.5.0-rc.8
export CHART_REGISTRY=core.campus.clusterdiali.me
oc whoami
oc config current-context
oc get namespace "$NAMESPACE"
mkdir -p charts
helm pull "oci://${CHART_REGISTRY}/harakiri/charts/harakiri" \
  --version "$HARAKIRI_VERSION" --destination charts
helm template harakiri "charts/harakiri-${HARAKIRI_VERSION}.tgz" \
  --namespace "$NAMESPACE" -f operator-values.yaml > rendered-harakiri.yaml
```

Check the archive checksum against the selected release, review every rendered
resource and verify there is no SCC, host networking or unexpected cluster
role. Render locally before installation; do not rebuild or patch the chart.
For an air gap, use the [artifact mirroring guide](airgap.md).

For the approved **fresh** namespace:

```bash
helm install harakiri "charts/harakiri-${HARAKIRI_VERSION}.tgz" \
  --namespace "$NAMESPACE" -f operator-values.yaml --wait --timeout 10m
oc create route edge harakiri-web --namespace "$NAMESPACE" \
  --service=harakiri-web --port=http --hostname=sandbox.apps.example.com \
  --insecure-policy=Redirect
oc create route edge harakiri-api --namespace "$NAMESPACE" \
  --service=harakiri-api --port=http --hostname=sandbox-api.apps.example.com \
  --insecure-policy=Redirect
```

These routes use the ingress controller's certificate; provision a matching
trusted certificate if it does not cover the chosen hosts. Identity's public
route is owned by the identity deployment. Do not expose the runtime lifecycle
service publicly. Start with authenticated Harakiri route access; advertise
public sandbox routes only after their gateway, wildcard DNS and TLS are tested.

## 4. Validate the Profile, Not Just Pod Readiness

- Verify web bootstrap and OIDC discovery advertise the exact public origins,
  including after login/logout, token refresh and pod replacement.
- Sign in, create a scoped/expiring API key and import a reviewed template image.
- Create a sandbox through Harakiri, execute a deterministic command, verify a
  file round trip and terminate it. Do not substitute Kubernetes exec acceptance.
- Check runtime UID/storage permissions and unsupported-feature behavior. Enable
  workspaces only after a two-sandbox retained-file/recovery test passes.
- Prove role/key denial and revocation. Test invitation delivery separately.
- Record versions, architecture, SCC/storage profile, results and limitations.

Use [conformance](integrations/conformance.md) and
[workspace operations](persistent-workspace-operations.md) for repeatable checks.
An upgrade requires a coordinated database/key/volume backup and the release's
migration sequence; Helm rollback alone does not reverse database migrations.
Uninstall only owned releases after handling running sandboxes and retained
storage. Never delete a populated namespace or shared CRDs as a cleanup shortcut.
