import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

const source = "https://github.com/nabilblk/h-sandbox/blob/v0.5.0-rc.15";
const kit = `${source}/infra/openshift/standalone`;
const receipt = "https://github.com/nabilblk/h-sandbox/blob/main/docs/release-notes/0.5.0-rc.15-delivery.md";

export const openshiftCommands = {
  artifacts: `git clone --branch v0.5.0-rc.15 --depth 1 https://github.com/nabilblk/h-sandbox.git
cd h-sandbox
mkdir charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \\
  --version 0.5.0-rc.15 --destination charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \\
  --version 0.2.2-harakiri.2 --destination charts`,
  configure: `cp infra/openshift/standalone/operator-input.example.json operator-input.json
# Replace origins, Secret references and every image digest.
node infra/openshift/standalone/configure.mjs \\
  operator-input.json openshift-generated`,
  preflight: `export KUBECONFIG=/absolute/path/to/isolated-openshift.kubeconfig
export OCP_CONTEXT=reviewed-openshift-context
export NAMESPACE=harakiri
node infra/openshift/standalone/preflight.mjs \\
  operator-input.json "$KUBECONFIG" "$OCP_CONTEXT" > preflight.json`,
  render: `helm template harakiri-runtime charts/opensandbox-0.2.2-harakiri.2.tgz \\
  --namespace "$NAMESPACE" -f openshift-generated/runtime-values.json \\
  > openshift-generated/review-runtime.yaml
helm template harakiri charts/harakiri-0.5.0-rc.15.tgz \\
  --namespace "$NAMESPACE" --api-versions route.openshift.io/v1/Route \\
  -f openshift-generated/harakiri-values.json \\
  > openshift-generated/review-harakiri.yaml`,
  runtime: `oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" \\
  apply -f openshift-generated/network-policies.json
oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" \\
  apply -f openshift-generated/runtime-resources.json
helm install harakiri-runtime charts/opensandbox-0.2.2-harakiri.2.tgz \\
  --kubeconfig "$KUBECONFIG" --kube-context "$OCP_CONTEXT" \\
  --namespace "$NAMESPACE" -f openshift-generated/runtime-values.json \\
  --wait --timeout 10m`,
  controlPlane: `helm install harakiri charts/harakiri-0.5.0-rc.15.tgz \\
  --kubeconfig "$KUBECONFIG" --kube-context "$OCP_CONTEXT" \\
  --namespace "$NAMESPACE" -f openshift-generated/harakiri-values.json \\
  --wait --timeout 10m
oc --kubeconfig "$KUBECONFIG" --context "$OCP_CONTEXT" -n "$NAMESPACE" get pods,routes`,
  template: `export HARAKIRI_API_URL=https://sandbox-api.apps.example.test
# Supply HARAKIRI_API_KEY privately; never commit it.
harakiri doctor
harakiri capabilities
harakiri template build --name openshift-check --source image \\
  --image "$REVIEWED_TEMPLATE_IMAGE"
harakiri template inspect openshift-check`,
  verify: `mkdir openshift-check
cp infra/openshift/standalone/verify.mjs openshift-check/verify.mjs
npm install --prefix openshift-check --no-save --package-lock=false @h-sandbox/sdk@0.5.0-rc.15
export HARAKIRI_OPENSHIFT_TEST=1
export HARAKIRI_TEMPLATE=openshift-check
node openshift-check/verify.mjs > api-smoke.json
unset HARAKIRI_OPENSHIFT_TEST HARAKIRI_API_KEY`
};

export const openshiftInstallDocs: DocPage = {
  id: "install-openshift", section: "Self-hosting", title: "Install on OpenShift",
  lede: "A reviewable, restricted deployment path for the sandbox control plane. Prepare the platform, inspect the configuration, then prove the first sandbox.",
  toc: ["Deployment status", "Choose the restricted profile", "Prepare the platform", "Configure without installing", "Review network and trust", "Install in two stages", "Prove the first sandbox", "Troubleshoot and operate"],
  body: <>
    <h2>Deployment status</h2>
    <p><strong>Client-test preview: 0.5.0-rc.15. Native OpenShift validation is pending.</strong> Local API and Helm contract tests are not SCC admission or runtime evidence. Use matching rc.15 API/web images and chart; rc.14 does not include the restriction guard. Check the <a href={receipt}>delivery receipt</a> for verified publication before installing. Qualify on an isolated target before a production rollout.</p>
    <p><a href={`${source}/docs/install-openshift.md`}>Complete operator runbook</a> | <a href={`${kit}/README.md`}>Configuration kit</a> | <a href={`${source}/docs/openshift-qualification.md`}>Native acceptance checklist</a></p>
    <p>Use an isolated, explicitly approved target. Nothing here requires changing a default SCC or touching another cluster. PostgreSQL and Keycloak are operator-managed prerequisites, not silently installed dependencies.</p>

    <h2>Choose the restricted profile</h2>
    <table className="docs-data-table"><caption>Restricted deployment capabilities</caption><thead><tr><th scope="col">Surface</th><th scope="col">Baseline</th></tr></thead><tbody>
      <tr><td>Control plane</td><td>Dashboard, organizations, API keys, permissions, capacity and usage.</td></tr>
      <tr><td>Runtime workflow</td><td>Commands, files, terminal, logs and protected service access are native qualification targets.</td></tr>
      <tr><td>Templates</td><td>Import reviewed image digests. Build images outside this cluster.</td></tr>
      <tr><td>Domain egress and Vault injection</td><td>Unavailable. The current sidecar requires NET_ADMIN.</td></tr>
      <tr><td>Pause, snapshots and restore</td><td>Unavailable. The current rootfs implementation depends on containerd, not CRI-O.</td></tr>
      <tr><td>Persistent workspaces and Dockerfile builds</td><td>Disabled. Storage, UID/SELinux and build permissions need separate qualification.</td></tr>
    </tbody></table>
    <p>Discovery reflects deployment restrictions and the API rejects unsupported operations before new runtime effects. Cleanup remains available. This is a fresh-install profile, not a downgrade for an existing installation with active Vault mappings or persistent storage.</p>
    <p>The isolation boundary is the admitted container under the assigned SCC, not a microVM. Assess hostile multi-tenant workloads with your platform security team.</p>

    <h2>Prepare the platform</h2>
    <p>The platform administrator approves a fresh namespace, quotas, registry CA/pull access, NetworkPolicy support, DNS/TLS and runtime CRDs/RBAC. The current runtime chart includes cluster-scoped permissions, including Secret access. <strong>One namespace does not mean namespace-only privileges.</strong> Do not install a competing controller over existing workloads.</p>
    <p>Provide PostgreSQL 16-compatible storage with a dedicated database/role, pgcrypto, schema migration permissions and backups. Configure a Keycloak public browser client with code flow, PKCE S256, exact public origins, email/profile scopes and the harakiri-api audience. Identity discovery, token issuer and API allowlist must agree.</p>
    <p>Use a separate realm-scoped service account for invitations. Never reuse a master-realm admin password. See <a href="#docs/authorization">Authorization</a> and <a href="#docs/team-members">Member invitations</a>.</p>
    <table className="docs-data-table"><caption>Secrets and trust</caption><thead><tr><th scope="col">Operator-owned object</th><th scope="col">Contents</th></tr></thead><tbody>
      <tr><td>API Secret</td><td>DATABASE_URL, OPEN_SANDBOX_API_KEY, CONTROL_PLANE_SECRET_KEY, TEMPLATE_REGISTRY_CREDENTIAL_KEY; KEYCLOAK_ADMIN_CLIENT_SECRET for invitations.</td></tr>
      <tr><td>Runtime Secret</td><td>api-key, matching the API's runtime key.</td></tr>
      <tr><td>Gateway signing Secret</td><td>active-key and keys. A separate random signing key, never a plaintext value in Helm.</td></tr>
      <tr><td>Registry pull Secret</td><td>kubernetes.io/dockerconfigjson. Private template metadata resolution also needs an organization registry credential.</td></tr>
      <tr><td>Optional CA ConfigMap</td><td>ca-bundle.crt, PEM roots only. Node registry trust remains a platform prerequisite.</td></tr>
    </tbody></table>
    <p>Secret values never belong in the generator input. Do not put configuration overrides in the API Secret: Secret envFrom values take precedence over the reviewed ConfigMap. Preserve encryption keys with database backups.</p>

    <h2>Configure without installing</h2>
    <p>Use Node.js 22+, Helm 3 and the matching oc CLI. Download the tagged configuration kit and both charts, then compare their digests with the delivery receipt. Pin matching API/web and runtime image digests. The inspected runtime inputs are server v0.2.3, controller v0.2.0, gateway v1.0.10 and execd v1.1.0, with maintained chart 0.2.2-harakiri.2. These versions are inputs to qualification, not a blanket support claim.</p>
    <CodeBlock language="bash">{openshiftCommands.artifacts}</CodeBlock>
    <CodeBlock language="bash">{openshiftCommands.configure}</CodeBlock>
    <p>The five outputs are the Harakiri and runtime Helm values, runtime resources, network policies and a qualification receipt. Generation makes no network or cluster calls, rejects placeholder digests, and refuses to overwrite an existing output directory.</p>
    <CodeBlock language="bash">{openshiftCommands.preflight}</CodeBlock>
    <p>Preflight is read-only, bounded and checks Secret key names without printing their values. It does not prove credentials, image availability or admission. Its receipt remains native-validation-pending.</p>

    <h2>Review network and trust</h2>
    <p>Web/API Routes use edge TLS and the ingress-controller certificate. Internal service hops remain HTTP; customers requiring re-encryption or pod mTLS need a different reviewed transport profile. The runtime server and gateway remain private ClusterIP services.</p>
    <p>Generated policies allow sandbox ingress only from trusted control/runtime pods. Sandbox egress defaults to DNS only; approved CIDRs may allow TCP 443. Exclude pod, service, node, API and metadata networks. Review existing additive policies and the actual router/DNS topology. No wildcard public sandbox routing is configured.</p>
    <p>NetworkPolicy is not Harakiri domain egress or a credential-injection substitute. Control/runtime outbound access and dependency protection require platform review. Private CA roots do not disable certificate validation.</p>
    <CodeBlock language="bash">{openshiftCommands.render}</CodeBlock>

    <h2>Install in two stages</h2>
    <p>After platform review, apply the owned resources and install the runtime from the verified local archive. Keep the explicitly selected kubeconfig/context in every cluster command. Mirroring into a private registry changes artifact locations, not the reviewed image contents or security profile.</p>
    <CodeBlock language="bash">{openshiftCommands.runtime}</CodeBlock>
    <p>Then install Harakiri. Its API, scheduler and template-import worker share the reviewed API image. The web chart mounts config.js read-only and uses /tmp for Nginx scratch; it does not write into the static site directory.</p>
    <CodeBlock language="bash">{openshiftCommands.controlPlane}</CodeBlock>
    <p>The lifecycle server uses port 8080 in both TOML and container configuration. OpenShift assigns UID/GID and SELinux labels. Do not fix admission failures by granting an elevated SCC or patching live resources. A Deployment dry-run does not prove admission of its future Pods.</p>

    <h2>Prove the first sandbox</h2>
    <p>Sign in, complete workspace setup and create a scoped, expiring API key. Import a reviewed arbitrary-UID-compatible image with a writable HOME/workdir and the tools your task needs. Supply credentials privately and install the matching CLI before running these commands.</p>
    <CodeBlock language="bash">{openshiftCommands.template}</CodeBlock>
    <CodeBlock language="bash">{openshiftCommands.verify}</CodeBlock>
    <p>The model-free SDK check creates one owned sandbox, waits for readiness, proves non-root execution and a 1 MiB binary round trip, then waits for confirmed deletion. It records accepted IDs before testing. Preserve those IDs if create, interruption or cleanup is ambiguous; do not retry creation blindly.</p>
    <p>Complete the <a href={`${source}/docs/openshift-qualification.md`}>native checklist</a> for login/logout/refresh, terminal reconnect, Workbench previews, protected service access, feature denials, actual SCC/UID and network isolation. Record exact cluster, architecture and image/chart versions. Neither Pod readiness nor this smoke alone grants qualification.</p>

    <h2>Troubleshoot and operate</h2>
    <table className="docs-data-table"><caption>Common installation failures</caption><thead><tr><th scope="col">Symptom</th><th scope="col">First check</th></tr></thead><tbody>
      <tr><td>Admission denied</td><td>Pod/init security context, assigned UID and filesystem permissions. Never add anyuid as a shortcut.</td></tr>
      <tr><td>Login redirects to localhost or API returns 401</td><td>Web config.js, public issuer, redirect origins, audience, JWKS and Secret overrides.</td></tr>
      <tr><td>Template import or startup fails</td><td>Registry metadata credentials versus pod pull credentials, architecture, writable workdir and execd bootstrap.</td></tr>
      <tr><td>Outbound access is unavailable</td><td>Expected deployment restriction. Review cluster network policy separately.</td></tr>
      <tr><td>Terminal disconnects</td><td>Router tunnel timeouts, grant lifetime and private gateway reachability.</td></tr>
    </tbody></table>
    <p>Before upgrades, drain through Harakiri and back up the database, keys, realm configuration and reviewed values. Image rollback is not schema rollback. See <a href="#docs/backup-recovery">Backup and recovery</a>.</p>
    <p>For uninstall, confirm sandbox cleanup before removing Harakiri. The platform owner removes the runtime only when no workload depends on it. Retain backups and operator Secrets according to policy; never delete shared CRDs, SCCs or namespaces as an uninstall shortcut.</p>
  </>
};
