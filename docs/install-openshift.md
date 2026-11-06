# Install Harakiri on OpenShift

Deploy the standalone Harakiri sandbox control plane using two reviewed Helm
charts, existing PostgreSQL and Keycloak, and the default restricted security
policy. No SCC changes, privileged installer or customer application are required
by this profile.

**Status: rc.15 client-test preview; native OpenShift validation pending.** Local tests
verify the configuration generator, Helm contracts and API capability denials.
They do not prove SCC admission, arbitrary-UID execution, routing or isolation on
your cluster. Use matching `0.5.0-rc.15` API/web images and chart. The restriction
guard is absent from rc.14; do not combine these values with an older API that
ignores `RUNTIME_DISABLED_FEATURES`. Check the
[delivery receipt](release-notes/0.5.0-rc.15-delivery.md) for verified publication
and immutable digests before installing. This preview is for an approved isolated
client test, not a production rollout before native acceptance.

Public navigation: **Docs > Self-hosting > Install on OpenShift**. The maintained
[configuration kit](../infra/openshift/standalone/README.md) writes ordinary JSON
Helm values and Kubernetes resources, without contacting a cluster. JSON is
accepted by both Helm and `oc`; no installer or post-install patch is involved.

## 1. Choose the Profile

| Capability | Restricted baseline |
| --- | --- |
| Dashboard, organizations, scoped API keys, capacity admission | Included; OIDC and database are operator-managed |
| Commands, files, terminal, logs and service access through Harakiri | Qualification targets, not yet certified on OpenShift |
| Image-backed templates | Import reviewed images; build outside the cluster |
| Pause/resume, rootfs snapshots and restore | Disabled; the current implementation depends on containerd, not CRI-O |
| Mutable domain egress and runtime Vault injection | Disabled; the current sidecar needs `NET_ADMIN` |
| Persistent workspaces | Disabled until a specific CSI, UID and SELinux profile is qualified |
| In-cluster Dockerfile builds, image pre-pull, node collectors | Disabled; no corresponding control-plane Kubernetes privileges |

Disabling a feature changes discovery and rejects new runtime operations. It
does not erase historical state or disable cleanup of existing resources. Start
in a fresh approved namespace; do not use this profile as an in-place downgrade
of an installation with active snapshots, Vault mappings or workspaces.

The baseline uses standard container isolation under the assigned SCC. It is
**not a microVM boundary**. Assess hostile multi-tenant workloads with the
platform security team. NetworkPolicy is a separate cluster boundary, not a
substitute for Harakiri's per-sandbox domain policy or credential injection.

## 2. Platform Handoff

The platform administrator owns:

- An isolated qualification target and a fresh namespace with restricted SCC
  admission, quotas, pod-network capacity and enough schedulable CPU/memory.
- Approval of the runtime chart's **CRDs and ClusterRoles/ClusterRoleBindings**.
  The vendored controller/server/gateway have cluster-scoped permissions,
  including Secret access. One application namespace does not make those
  permissions namespace-scoped. Do not install a competing controller over
  existing workloads. A cluster rejecting these grants needs a different,
  explicitly qualified runtime arrangement; this kit does not bypass that policy.
- Registry trust and pull access on the nodes, DNS, the ingress-controller
  certificate and a CNI that enforces NetworkPolicy.
- PostgreSQL 16-compatible service, a dedicated database/role owning Harakiri's
  schema, `pgcrypto`, TLS/trust and tested backups. Migrations run on API startup
  in this fresh-install profile (`AUTO_MIGRATE=1`); the role needs DDL privileges.
- A Keycloak realm and HTTPS origin accessible from both browsers and API pods.
  Keep self-registration disabled unless explicitly desired. Create the first
  operator account privately; no sample user/password is seeded.

The namespace operator owns Secret delivery, reviewed Helm releases, template
imports, application verification and the qualification receipt. The control
plane itself receives no Kubernetes RBAC and no mounted service-account token.
Only the trusted runtime controllers need Kubernetes API credentials. Sandbox
pods use a separate, unprivileged, token-free service account.

### Identity Contract

Configure `harakiri-web` as a public browser client with standard authorization
code flow and PKCE S256, no implicit/direct-grant flow. Set the exact web origin
for web origins and its `/*` path for allowed login and post-logout redirects.
Add the `harakiri-api` access-token audience and email/profile scopes. The issuer,
discovery document, token `iss`, API allowlist and browser origin must agree;
never replace the public issuer with an internal hostname.

For invitations, provision a separate confidential `harakiri-admin` service
account in the same realm, with the scoped realm user-management permissions
described in [member management](members.md). Deliver its secret privately and
configure SMTP in Keycloak. The main login flow does not need a master-realm
admin password. See [authorization](authorization.md) for audience and role checks.

### Secret Contract

Create these **before** installing Helm releases, using your approved Secret
manager. Names are configurable in the input file. Never put values in Git,
Helm values, command-line flags or the qualification receipt.

| Default name | Required keys |
| --- | --- |
| `harakiri-api` | `DATABASE_URL`, `OPEN_SANDBOX_API_KEY`, `CONTROL_PLANE_SECRET_KEY`, `TEMPLATE_REGISTRY_CREDENTIAL_KEY`; `KEYCLOAK_ADMIN_CLIENT_SECRET` for invitations |
| `opensandbox-api-key` | `api-key`, identical to `OPEN_SANDBOX_API_KEY` above |
| `opensandbox-gateway-signing` | `active-key` (for example `a`), `keys` (`a=<base64-encoded 32-byte random signing key>`) |
| `registry-pull` | Standard `kubernetes.io/dockerconfigjson` pull Secret for mirrored images |
| Optional private-CA ConfigMap | `ca-bundle.crt`, PEM CA certificates, not a private key |

Generate separate high-entropy control-plane, registry-encryption and runtime
keys. Preserve encryption keys with database backups. Do not include non-secret
configuration keys in the API Secret: `envFrom` Secret values override the
ConfigMap and could defeat a reviewed origin or deployment restriction.

Private registry login for **image template metadata resolution** is separate
from the pod pull Secret. Register an organization-scoped, read-only registry
credential through Harakiri when the registry is not anonymously readable. The
template worker still runs for imports even though Dockerfile builds are disabled.

## 3. Pin and Generate

Prerequisites on the operator workstation: Node.js 22+, Helm 3, matching `oc`,
Git and a trusted CA bundle. Download the tagged kit and both chart archives.
Record the Git SHA and compare chart/image digests with the release receipt.
Do not rebuild images to change origins; runtime configuration is provided by Helm.

```bash
git clone --branch v0.5.0-rc.15 --depth 1 https://github.com/nabilblk/h-sandbox.git
cd h-sandbox
mkdir charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version 0.5.0-rc.15 --destination charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \
  --version 0.2.2-harakiri.2 --destination charts
```

For a disconnected target, mirror these exact charts and image contents into the
approved registry first; see [artifact mirroring](airgap.md). The configuration
input records the destination repositories and verified digests, not credentials.

```bash
cp infra/openshift/standalone/operator-input.example.json operator-input.json
# Edit origins, namespace, registry, Secret references and verified image digests.
node infra/openshift/standalone/configure.mjs \
  operator-input.json openshift-generated
```

The generator rejects unknown fields, plaintext credentials, loopback origins,
placeholder digests and unbounded egress CIDRs. It refuses an existing output
directory. Revisions should go into a new directory and be reviewed as a diff.

Outputs: `harakiri-values.json`, `runtime-values.json`, `runtime-resources.json`,
`network-policies.json` and `qualification.json`. All resources use the selected
namespace. The last file starts with **native-validation-pending** and empty
evidence fields; generation never counts as qualification.

Runtime input versions inspected for this candidate: server `v0.2.3`, controller
`v0.2.0`, ingress gateway `v1.0.10`, execd `v1.1.0`; maintained runtime chart
`0.2.2-harakiri.2`. Resolve and mirror their actual platform/index digests,
including your sandbox template image. No `latest` tag is used for installation.
Inactive BuildKit, egress and snapshot helper images are not part of this
baseline's pull set. Do not enable those features by mirroring their images.

### Network and TLS Review

- Web/API Routes terminate TLS at the OpenShift router and redirect HTTP to
  HTTPS. The router's certificate must cover both configured hosts. Internal
  service hops remain HTTP. If the customer requires re-encryption or mTLS to
  pods, this baseline is insufficient; do not describe edge TLS as end-to-end TLS.
- The runtime server and gateway stay private ClusterIP services. Do not create
  public Routes for them. Sandbox services use authenticated Harakiri access;
  wildcard/public sandbox routing is not configured by this kit.
- Generated policies select only owned pod labels, not every pod in the
  namespace. Sandboxes receive ingress only from trusted control/runtime pods,
  DNS egress to `openshift-dns`, and optionally TCP 443 to approved CIDRs.
  `sandboxEgressCIDRs: []` means DNS-only outbound access, even though Harakiri's
  domain-policy view is unavailable. There is no hidden public-internet allow.
- Never allow pod/service/node/API/metadata networks in `sandboxEgressCIDRs`.
  CIDR validation checks syntax, not your cluster topology. The platform team
  must review ranges, DNS selectors, router topology and any existing policies:
  Kubernetes allow policies are additive. Dependencies outside these selectors
  need their own protection. No namespace-wide policy is silently overwritten.
- Control/runtime outbound traffic is not restricted by this kit. Review access
  to PostgreSQL, Keycloak, registries, DNS and Kubernetes separately.
- `trustBundle` adds PEM roots to Node's TLS trust without disabling verification.
  Cluster node image-pull trust, PostgreSQL TLS settings, workstation trust and
  sandbox application CA trust are distinct operator responsibilities.

## 4. Inspect, Then Install

Use explicit target flags throughout. Do not change a developer's current
context or implicitly reuse a live cluster.

```bash
export KUBECONFIG=/absolute/path/to/isolated-openshift.kubeconfig
export OCP_CONTEXT=reviewed-openshift-context
export NAMESPACE=harakiri
node infra/openshift/standalone/preflight.mjs \
  operator-input.json "$KUBECONFIG" "$OCP_CONTEXT" > preflight.json
```

The preflight is read-only and bounded. It checks namespace UID allocation,
Route discovery, namespace permissions and Secret **key names only**. It does
not prove credential validity, image existence, cluster-admin approval or SCC
admission. Keep its JSON receipt; it never reports a production qualification.

Render both verified archives offline, after reviewing their provenance. Do not
substitute a newer upstream chart silently.

```bash
helm template harakiri-runtime charts/opensandbox-0.2.2-harakiri.2.tgz \
  --namespace "$NAMESPACE" -f openshift-generated/runtime-values.json \
  > openshift-generated/review-runtime.yaml
helm template harakiri charts/harakiri-0.5.0-rc.15.tgz \
  --namespace "$NAMESPACE" --api-versions route.openshift.io/v1/Route \
  -f openshift-generated/harakiri-values.json \
  > openshift-generated/review-harakiri.yaml
```

Review CRDs/RBAC with the platform administrator. No SCC object, host networking,
hostPath, fixed UID/fsGroup, privilege escalation or unconfined seccomp belongs
in this profile. Set admission expectations before installing. A Deployment
server dry-run does **not** exercise SCC admission of the Pods its controller
will later create. Verify actual admitted control-plane, runtime and sandbox Pods.

On the approved isolated target, the platform administrator installs the runtime:

```bash
oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" \
  apply -f openshift-generated/network-policies.json
oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" \
  apply -f openshift-generated/runtime-resources.json
helm install harakiri-runtime charts/opensandbox-0.2.2-harakiri.2.tgz \
  --kubeconfig "$KUBECONFIG" --kube-context "$OCP_CONTEXT" \
  --namespace "$NAMESPACE" -f openshift-generated/runtime-values.json \
  --wait --timeout 10m
```

The namespace operator installs Harakiri after dependencies and runtime are ready:

```bash
helm install harakiri charts/harakiri-0.5.0-rc.15.tgz \
  --kubeconfig "$KUBECONFIG" --kube-context "$OCP_CONTEXT" \
  --namespace "$NAMESPACE" -f openshift-generated/harakiri-values.json \
  --wait --timeout 10m
oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" get pods,routes
```

There is no patch/restart repair loop. The lifecycle server binds to 8080 in
both container and TOML configuration; its Service still exposes 80. The web
chart mounts `config.js` read-only and writes Nginx scratch only under `/tmp`.
OpenShift assigns UIDs, GIDs and SELinux context rather than a fixed image user.
If a Pod fails, correct the reviewed configuration or image before retrying.

## 5. First Sandbox and Acceptance

Sign in at the web Route, complete workspace setup and create an expiring API
key with the scopes required for template import and sandbox testing. Import a
digest-pinned image from the approved registry. Its shell/tools, writable HOME
and workdir must support an arbitrary UID with group 0 access; it must not need
`sudo`, privileged ports or root-only package installation at startup.

```bash
export HARAKIRI_API_URL=https://sandbox-api.apps.example.test
# Supply HARAKIRI_API_KEY privately through your shell or Secret manager.
harakiri doctor
harakiri capabilities
harakiri template build --name openshift-check --source image \
  --image "$REVIEWED_TEMPLATE_IMAGE"
harakiri template inspect openshift-check
```

Do not equate successful registry import with a runnable template. Run the
model-free SDK smoke from an isolated workstation folder:

```bash
mkdir openshift-check
cp infra/openshift/standalone/verify.mjs openshift-check/verify.mjs
npm install --prefix openshift-check --no-save --package-lock=false @h-sandbox/sdk@0.5.0-rc.15
export HARAKIRI_OPENSHIFT_TEST=1
export HARAKIRI_TEMPLATE=openshift-check
node openshift-check/verify.mjs > api-smoke.json
unset HARAKIRI_OPENSHIFT_TEST HARAKIRI_API_KEY
```

This creates only its own 600-second sandbox, records its accepted ID and
idempotency key, waits for readiness, checks non-root execution and a 1 MiB
binary round trip, and waits for confirmed deletion. Handled readiness/execution
failures still trigger cleanup. If create/cleanup is ambiguous or the process is
interrupted, preserve the reported identity, inspect through Harakiri and confirm
termination; do not repeat creation blindly or rely only on TTL. Failure output
is intentionally sanitized; inspect application logs privately for details.

Complete [the native acceptance checklist](openshift-qualification.md) as well:
browser login/logout/refresh, terminal resize/reconnect, Workbench file previews,
protected services, unsupported-feature denials, assigned SCC/UID and actual
network denial. The SDK smoke alone is **not** the complete acceptance gate.

## 6. Diagnose and Operate

| Symptom | Check before changing permissions |
| --- | --- |
| SCC admission denied | Events and the exact Pod spec, fixed IDs, init containers, capabilities and filesystem permissions. Do not grant `anyuid`/privileged SCC as a shortcut. |
| Lifecycle server binds port 80 | Both generated `server.port` and TOML must be 8080; use the maintained chart. |
| Web cannot write `config.js` | Wrong chart/image pairing or overridden entrypoint; the chart mounts runtime configuration read-only. |
| Login redirects to localhost / API 401 | Web `config.js`, Keycloak public issuer/redirects, API audience/JWKS and any Secret overriding configuration. |
| ImagePullBackOff / template import unauthorized | Node CA/pull Secret and architecture; separately check Harakiri's organization registry credential. |
| Sandbox stays preparing | Pod events, execd bootstrap, writable HOME/workdir under the assigned UID, resources and network policy. A template needing root is not compatible. |
| `runtime_feature_unavailable` / lifecycle unsupported | Expected for disabled profile features; inspect capabilities. Do not bypass it by calling the provider directly. |
| Outbound request blocked | DNS and approved NetworkPolicy CIDRs. The absence of an egress sidecar does not mean unrestricted cluster networking. |
| Terminal/service stream disconnects | Router WebSocket/tunnel timeouts, token lifetime and gateway reachability. Never expose the private gateway as a workaround. |

Use targeted `oc get events`, `describe pod` and component logs with the explicit
kubeconfig/context. Logs may contain sensitive application data; redact before
sharing. Never dump Secrets, tokens, kubeconfigs or complete process environments.

Before upgrade, stop new work, drain/terminate owned sandboxes through Harakiri,
back up the database, encryption keys, realm/client configuration and reviewed
values, then test recovery in isolation. Render the new charts and migrate with
the documented release procedure. `helm rollback` does not undo a database
migration; do not use `--reuse-values` across changed deployment contracts.
See [backup and recovery](operations/standalone-recovery.md).

For uninstall, first terminate sandboxes through Harakiri and confirm provider
cleanup. Back up retained state. Uninstall `harakiri`, then ask the platform owner
to uninstall `harakiri-runtime` only if no other workload uses it. Remove only
the generated ConfigMap/ServiceAccount/network policies after that. Preserve
operator Secrets and database backups according to retention policy. Do not
delete namespaces, CRDs, SCCs or shared dependencies as an uninstall shortcut.

## References

- [Restricted SCC behavior](https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/authentication_and_authorization/managing-pod-security-policies)
- [OpenShift image authoring and arbitrary UIDs](https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/images/creating-images)
- [NetworkPolicy semantics](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Runtime configuration at server/v0.2.3](https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/server/opensandbox_server/config.py)
- [Maintained runtime chart provenance](../infra/charts/opensandbox/HARAKIRI.md)
- [Artifact mirroring](airgap.md) and [release artifacts](release-artifacts.md)
