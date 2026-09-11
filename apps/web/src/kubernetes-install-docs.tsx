import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

// Pin operator inputs independently of application image/package versions.
export const installationSourceRevision = "d0e6d4e1c934be6a2b0e83feeb382da2d9723748";
const source = `https://github.com/nabilblk/h-sandbox/blob/${installationSourceRevision}`;

export const kubernetesInstallCommands = {
  source: `git clone --filter=blob:none --no-checkout \\
  https://github.com/nabilblk/h-sandbox.git harakiri-install
cd harakiri-install
git checkout --detach ${installationSourceRevision}`,
  cluster: `export KUBECONFIG=/absolute/path/to/your-empty-cluster.kubeconfig
kubectl config current-context
kubectl get nodes -o wide
kubectl get storageclass
kubectl get namespaces`,
  configure: `export PREVIEW_OPERATOR_EMAIL=operator@example.test
export PREVIEW_WEB_ORIGIN=http://127.0.0.1:28480
export PREVIEW_API_ORIGIN=http://127.0.0.1:28482
export PREVIEW_AUTH_ORIGIN=http://127.0.0.1:28484
node infra/preview/configure.mjs`,
  dependencies: `kubectl apply -f infra/preview/dependencies.yaml
kubectl apply -f infra/preview/.private/secrets.json
kubectl -n harakiri-preview rollout status deployment/preview-postgres --timeout=5m
kubectl -n harakiri-preview rollout status deployment/preview-keycloak --timeout=10m`,
  charts: `mkdir -p preview-charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \\
  --version 0.2.2-harakiri.2 --destination preview-charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \\
  --version 0.5.0-rc.8 --destination preview-charts
helm show chart preview-charts/harakiri-0.5.0-rc.8.tgz`,
  runtime: `helm install preview-runtime preview-charts/opensandbox-0.2.2-harakiri.2.tgz \\
  --namespace harakiri-preview \\
  -f infra/preview/.private/opensandbox-values.json --wait --timeout 10m`,
  controlPlane: `helm install harakiri preview-charts/harakiri-0.5.0-rc.8.tgz \\
  --namespace harakiri-preview \\
  -f infra/preview/.private/harakiri-values.json \\
  -f docs/release-notes/0.5.0-rc.8-public-values.yaml --wait --timeout 10m
kubectl -n harakiri-preview get pods
kubectl -n harakiri-preview-runtime get pods`,
  webForward: `kubectl -n harakiri-preview port-forward --address=127.0.0.1 \\
  svc/harakiri-web 28480:80`,
  apiForward: `kubectl -n harakiri-preview port-forward --address=127.0.0.1 \\
  svc/harakiri-api 28482:8080`,
  authForward: `kubectl -n harakiri-preview port-forward --address=127.0.0.1 \\
  svc/preview-keycloak 28484:8080`,
  health: `curl --fail --silent --show-error http://127.0.0.1:28482/health
curl --fail --silent --show-error \\
  http://127.0.0.1:28484/realms/harakiri/.well-known/openid-configuration \\
  | jq -e '.issuer == "http://127.0.0.1:28484/realms/harakiri"'`,
  cli: `npm install --global @h-sandbox/cli@0.5.0-rc.8
harakiri --version
export HARAKIRI_API_URL=http://127.0.0.1:28482
read -r -s -p "Harakiri API key: " HARAKIRI_API_KEY
printf '\\n'
export HARAKIRI_API_KEY
harakiri login --api-url "$HARAKIRI_API_URL"
harakiri capabilities`,
  template: `harakiri template build --name opencode --source image \\
  --image core.campus.clusterdiali.me/harakiri/templates/opencode@sha256:6b300e6ecde41a6174428f13f39663462c32dd7f6799e5af863cd50245d95de5 \\
  examples/templates/opencode
harakiri template inspect opencode`,
  consumer: `mkdir install-check
cd install-check
npm init -y
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.8`,
  execute: `node install-check.mjs
unset HARAKIRI_API_KEY`,
  inspect: `kubectl -n harakiri-preview get pods,pvc
kubectl -n harakiri-preview get events --sort-by=.lastTimestamp
kubectl -n harakiri-preview-runtime get pods,pvc
kubectl -n harakiri-preview-runtime get events --sort-by=.lastTimestamp
helm status harakiri --namespace harakiri-preview
helm status preview-runtime --namespace harakiri-preview`,
  uninstall: `helm uninstall harakiri --namespace harakiri-preview --wait
helm uninstall preview-runtime --namespace harakiri-preview --wait
kubectl -n harakiri-preview get pvc
kubectl -n harakiri-preview-runtime get pvc`
};

export const kubernetesInstallCheck = `import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";

const { HARAKIRI_API_URL: apiUrl, HARAKIRI_API_KEY: apiKey } = process.env;
assert.ok(apiUrl && apiKey, "Set the API URL and supply your key privately");
const client = new HarakiriClient({ apiUrl, apiKey });
const sandbox = await client.sandboxes.create({
  template: "opencode",
  name: "installation-check",
  ttlSeconds: 600,
  wait: true
});
console.log("Created:", sandbox.id);

try {
  await client.files.write(sandbox.id, {
    path: "/workspace/install-check.txt",
    content: "harakiri-ready",
    encoding: "utf8",
    createParents: true
  });
  const { result } = await sandbox.run({
    command: "cat /workspace/install-check.txt"
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "harakiri-ready");
  const file = await client.files.read(sandbox.id, "/workspace/install-check.txt");
  assert.equal(file.content, "harakiri-ready");
} finally {
  await sandbox.kill();
}
console.log("PASS: create, file write/read, command and termination");`;

export const kubernetesInstallDocs: DocPage = {
  id: "install-kubernetes", section: "Self-hosting", title: "Install on Kubernetes",
  lede: "Self-host Harakiri on Kubernetes (K8s): install the control plane, identity, database and a real sandbox runtime with Helm. Finish with a checked SDK task, not just healthy pods.",
  toc: ["Choose the deployment profile", "Prepare your cluster", "Generate private configuration", "Install PostgreSQL and Keycloak", "Install the runtime and control plane", "Connect and sign in", "Run a real sandbox task", "Configure public access", "Troubleshoot installation", "Upgrade and recovery", "Uninstall deliberately"],
  body: <>
    <h2>Choose the deployment profile</h2>
    <p>This walkthrough uses the versioned <strong>native Kubernetes Developer Preview</strong>: an empty, operator-owned cluster, two namespaces and local browser access. Harakiri is the sandbox control plane; OpenSandbox supplies the current execution adapter. The application Helm chart does not bundle the database, identity service or runtime.</p>
    <table className="docs-data-table"><caption>Installed components</caption><thead><tr><th scope="col">Layer</th><th scope="col">Components and responsibility</th></tr></thead><tbody>
      <tr><td>Data and identity</td><td><strong>PostgreSQL 16.15 and Keycloak 26.7.3</strong>, from manifests. Separate application and identity databases; browser sign-in and a realm-scoped service account.</td></tr>
      <tr><td>Runtime</td><td><strong>OpenSandbox chart 0.2.2-harakiri.2.</strong> Controller, lifecycle server and gateway; executes sandbox workloads in a separate namespace.</td></tr>
      <tr><td>Control plane</td><td><strong>Harakiri chart and API 0.5.0-rc.8.</strong> API, dashboard, scheduler and template worker. The overlay selects web 0.5.0-rc.8-docs.2 by digest.</td></tr>
      <tr><td>Developer clients</td><td><strong>SDK and CLI 0.5.0-rc.8.</strong> Your application connects only to the Harakiri API.</td></tr>
    </tbody></table>
    <aside className="docs-notice"><p><strong>Scope matters.</strong> Recorded native acceptance is Linux/arm64 on k0s 1.36.3, Ubuntu 24.04, with 8 CPUs, 16 GiB RAM, 80 GiB disk and local-path storage. This is a reference allocation, not a minimum, capacity guarantee or certification of every Kubernetes distribution. Native amd64 acceptance is still pending.</p><p>This is for trusted-team evaluation, not hostile multi-tenancy or HA. Organization concurrency targets are not enforced, and historical usage is not measured. Read <a href="#docs/developer-preview">the preview limits</a> before sharing access.</p></aside>
    <p><strong>Already have PostgreSQL, OIDC and a runtime?</strong> Use the <a href={`${source}/infra/charts/harakiri/values.yaml`}>chart values reference</a> with your existing services and operator-owned Secret. Do not run the bundled dependency manifests against them. This walkthrough is the complete reference path, not a recipe for replacing an existing installation.</p>
    <p><strong>OpenShift or a disconnected registry?</strong> Review the standalone <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/install-openshift.md">OpenShift boundaries</a> and <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/airgap.md">artifact mirroring guide</a>. The native egress sidecar requires network privileges including <code>NET_ADMIN</code>; it does not fit an unchanged restricted OpenShift SCC. Do not relax SCCs to follow this guide. BackgroundAgent and customer deployment bundles are not prerequisites.</p>

    <h2>Prepare your cluster</h2>
    <p>Use Bash with Git, Node.js 22 or newer, npm, Helm with OCI support, a compatible kubectl, curl and jq. Nodes must be Ready, have image-pull access to the selected registries, and provide a tested default StorageClass named <code>local-path</code>. The workspace configuration explicitly selects that class. A different CSI driver is a separate profile to validate, not a drop-in claim of support.</p>
    <p>Cluster-administrator permissions are needed for runtime CRDs and roles. Do not install a second OpenSandbox controller in a cluster that already has one. This profile owns <code>harakiri-preview</code> for services and <code>harakiri-preview-runtime</code> for workloads. Stop if either namespace already belongs to another installation.</p>
    <CodeBlock language="bash" filename="Select the target cluster">{kubernetesInstallCommands.cluster}</CodeBlock>
    <p>For a disposable local cluster, the <a href={`${source}/infra/preview/README.md`}>native reference guide</a> includes a separate Lima/k0s fixture. Do not reuse or reset the maintainer lab. Download the pinned operator files below; no application build or pnpm installation is required.</p>
    <CodeBlock language="bash" filename="Download operator files">{kubernetesInstallCommands.source}</CodeBlock>
    <p>Run subsequent file-based commands from <code>harakiri-install</code>. The source revision pins configuration inputs; the charts and images are separately published artifacts. Keep all generated files and downloaded charts together as your private installation record.</p>

    <h2>Generate private configuration</h2>
    <p>Replace the example email with your operator email. These three loopback origins are deliberate for local port forwards. For HTTPS ingress, choose your real public origins <em>before</em> generating the realm and review <a href="#docs/install-kubernetes?section=configure-public-access">public access</a>.</p>
    <CodeBlock language="bash" filename="Generate configuration only">{kubernetesInstallCommands.configure}</CodeBlock>
    <p>The helper only writes configuration; it does not contact Kubernetes or install anything. It refuses to overwrite its output directory. <code>infra/preview/.private</code> is mode 0700 and its files are mode 0600, ignored by Git. Preserve them; generating new passwords against existing database volumes will break access.</p>
    <table className="docs-data-table"><caption>Private installation files</caption><thead><tr><th scope="col">Private file</th><th scope="col">Purpose</th></tr></thead><tbody>
      <tr><td><code>operator-login.json</code></td><td>Initial application sign-in. Read it locally in a trusted editor.</td></tr>
      <tr><td><code>recovery-login.json</code></td><td>Separate Keycloak master recovery administrator. Not an application account.</td></tr>
      <tr><td><code>secrets.json</code></td><td>Database passwords, realm import, runtime authentication and encryption keys.</td></tr>
      <tr><td><code>harakiri-values.json</code></td><td>Public origins, runtime settings and references to existing Secrets. Dev authentication and seed accounts are disabled.</td></tr>
      <tr><td><code>opensandbox-values.json</code></td><td>Runtime configuration, including its API key. Treat it as a secret.</td></tr>
    </tbody></table>
    <p>The runtime chart stores its configuration in a ConfigMap and Helm metadata. Namespace read access is therefore privileged. Do not share Helm values, generated files or kubeconfigs in issues. The API uses a realm-scoped service account, not the Keycloak master password. Invitation/reset emails need separately configured SMTP; they are not enabled by this fixture.</p>

    <h2>Install PostgreSQL and Keycloak</h2>
    <CodeBlock language="bash">{kubernetesInstallCommands.dependencies}</CodeBlock>
    <p>Both deployments must become ready. The database PVC must be Bound. Initial database creation and realm import happen only on first initialization; updating a Secret does not change an existing database password or reimport an existing realm.</p>

    <h2>Install the runtime and control plane</h2>
    <p>Download the <strong>two</strong> charts before installation. The published Harbor artifacts allow anonymous reads; private mirrors require your own registry identity. Do not use unversioned chart or image tags.</p>
    <CodeBlock language="bash">{kubernetesInstallCommands.charts}</CodeBlock>
    <p>Compare each digest reported by <code>helm pull</code> with the <a href={`${source}/docs/release-notes/0.5.0-rc.8-delivery.md`}>release artifact receipt</a>: the runtime digest starts with <code>b93f5155</code>, and the control-plane digest with <code>87e9c225</code>. Verify the full digest, not just these prefixes. An OCI manifest digest is not the archive checksum and does not establish a signing/provenance guarantee.</p>
    <CodeBlock language="bash" filename="Install the runtime first">{kubernetesInstallCommands.runtime}</CodeBlock>
    <p>The runtime server listens on 8080; its internal Service uses port 80. The supplied values explicitly set both subchart namespaces. The lifecycle API remains internal.</p>
    <CodeBlock language="bash" filename="Install Harakiri second">{kubernetesInstallCommands.controlPlane}</CodeBlock>
    <p>The public-launch overlay pins the API and corrected web image by digest. It does not replace credentials or public origins. This profile supports importing existing template images; it supplies no registry writer and does not prove Dockerfile build support. Configure that workflow separately.</p>

    <h2>Connect and sign in</h2>
    <p>Open three terminals. Set the same <code>KUBECONFIG</code> in each and keep one forward running per terminal. They are loopback-only; no Cloudflare tunnel, DNS or public ingress is needed.</p>
    <CodeBlock language="bash" filename="Terminal 1: dashboard">{kubernetesInstallCommands.webForward}</CodeBlock>
    <CodeBlock language="bash" filename="Terminal 2: API">{kubernetesInstallCommands.apiForward}</CodeBlock>
    <CodeBlock language="bash" filename="Terminal 3: identity">{kubernetesInstallCommands.authForward}</CodeBlock>
    <p>In the original terminal, check the API and exact OIDC issuer:</p>
    <CodeBlock language="bash">{kubernetesInstallCommands.health}</CodeBlock>
    <p>The health endpoint returns <code>{'{"status":"ok"}'}</code>; the issuer check returns <code>true</code>. These are connectivity checks, not proof that a runtime works. Open <code>http://127.0.0.1:28480</code>, sign in using <code>operator-login.json</code>, and complete organization onboarding.</p>
    <p>Create a short-lived API key in <strong>API keys</strong> with <code>templates:read</code>, <code>templates:write</code>, <code>sandboxes:read</code> and <code>sandboxes:write</code>. Keep it on your machine, never inside a sandbox. The master recovery login is for Keycloak administration only.</p>

    <h2>Run a real sandbox task</h2>
    <p>A fresh installation does not assume a seeded template catalog. Authenticate the published CLI and import the digest-pinned OpenCode image. This registers an existing runtime image, not a local Dockerfile build. The first task uses files and a shell command; no LLM account or model call is required.</p>
    <CodeBlock language="bash">{kubernetesInstallCommands.cli}</CodeBlock>
    <CodeBlock language="bash">{kubernetesInstallCommands.template}</CodeBlock>
    <p>The import must reach <code>success</code>. Check the reported capabilities and leave room for the template's 2 CPUs and 4 GiB memory in addition to platform services. Install the SDK in a separate consumer folder:</p>
    <CodeBlock language="bash">{kubernetesInstallCommands.consumer}</CodeBlock>
    <CodeBlock language="javascript" filename="install-check.mjs">{kubernetesInstallCheck}</CodeBlock>
    <CodeBlock language="bash">{kubernetesInstallCommands.execute}</CodeBlock>
    <p>Success prints <code>PASS: create, file write/read, command and termination</code>. Confirm <code>installation-check</code> is terminated in the dashboard. A failed or timed-out creation can still leave runtime work: inspect its lifecycle operation before retrying. The ten-minute TTL is a safety net, not admission control. Revoke the test key when finished; unsetting the environment variable does not revoke the CLI's saved credential.</p>
    <p>Next, test <a href="#docs/persistent-workspaces">workspace reattachment</a>, <a href="#docs/routes">protected preview routes</a> and <a href="#docs/authorization">read-only/revoked-key denial</a>. These are separate acceptance checks. Protected routes use the API proxy; wildcard public routes are not configured by this loopback profile.</p>

    <h2>Configure public access</h2>
    <p>For a new ingress-based installation, supply three HTTPS origins such as <code>https://sandbox.example.com</code>, <code>https://sandbox-api.example.com</code> and <code>https://auth.example.com</code> as <code>PREVIEW_WEB_ORIGIN</code>, <code>PREVIEW_API_ORIGIN</code> and <code>PREVIEW_AUTH_ORIGIN</code> before configuration. You own the ingress controller, DNS and TLS certificates. Do not publish loopback values.</p>
    <p>The chart can expose web/API through <code>ingress.enabled</code>, <code>ingress.className</code>, <code>ingress.web.host</code>, <code>ingress.api.host</code> and <code>ingress.tls</code>. Keycloak needs its own ingress and trusted proxy configuration. Keep PostgreSQL and the runtime lifecycle API internal. Add wildcard runtime routing only when you need public previews and can validate that separate gateway path.</p>
    <p>Keep <code>PUBLIC_WEB_URL</code>, <code>PUBLIC_API_URL</code>, <code>PUBLIC_KEYCLOAK_URL</code>, Keycloak's external hostname, browser redirect/logout URLs and the exact <code>KEYCLOAK_ISSUER</code>/<code>KEYCLOAK_ISSUER_ALLOWLIST</code> aligned. The access token must include audience <code>harakiri-api</code>. An internal JWKS URL is permitted for server-to-server access; it must not become the browser's issuer.</p>
    <p>For an existing realm, update the live client and hostname deliberately: changing the import file alone does not update Keycloak. Preserve database passwords and encryption keys. Before sharing the deployment, verify login, refresh, logout and onboarding from the public origins. A redirect to localhost or a 401 during onboarding is a configuration failure, not expected behavior.</p>

    <h2>Troubleshoot installation</h2>
    <CodeBlock language="bash">{kubernetesInstallCommands.inspect}</CodeBlock>
    <table className="docs-data-table"><caption>Common installation failures</caption><thead><tr><th scope="col">Symptom</th><th scope="col">Check first</th></tr></thead><tbody>
      <tr><td>Pending database or workspace</td><td>StorageClass, PVC events, free disk and scheduling resources. The first agent needs headroom beyond the control plane.</td></tr>
      <tr><td>ImagePullBackOff</td><td>Node access to Harbor, Docker Hub and Quay, the exact image reference, architecture and any private-mirror pull secret.</td></tr>
      <tr><td>401 during onboarding</td><td>API origin, token issuer, API audience mapper and server JWKS access. Do not enable dev authentication to bypass the error.</td></tr>
      <tr><td>Login redirects to localhost</td><td>Public runtime config, Keycloak hostname and existing realm client URLs. Do not regenerate credentials as a repair.</td></tr>
      <tr><td>Runtime or egress unavailable</td><td>Runtime capabilities, network privileges, workload namespace and controller events. Do not use Kubernetes exec as an application fallback.</td></tr>
      <tr><td>Running sandbox, but the first file request returns 502</td><td>A cold-start readiness race was observed with the pinned rc.8 profile: lifecycle status became running before the execution endpoint was reachable. Keep the accepted sandbox ID and check a read-only file listing. Do not recreate the sandbox or blindly retry commands and writes whose outcome is unknown.</td></tr>
      <tr><td>Browser stops working after pod replacement</td><td>Restart the affected local port forward. For public ingress, inspect Service endpoints and ingress configuration instead.</td></tr>
    </tbody></table>
    <p>Share sanitized versions, status and relevant error codes in <a href="https://github.com/nabilblk/h-sandbox/discussions">Discussions</a>. Never attach Secrets, a full Helm values dump, tokens or customer data. The <a href="#docs/errors-troubleshooting">error reference</a> describes application-level failures.</p>

    <h2>Upgrade and recovery</h2>
    <aside className="docs-notice"><p><strong>Upcoming capacity admission upgrade.</strong> Migration 038 is unreleased and is not included in the pinned 0.5.0-rc.8 installation above. It requires stopping all older API and scheduler writers, verifying runtime inventory and activating existing organizations before reopening mutations. Do not mix old and new writers. Read <a href="#docs/execution-capacity">Execution capacity</a> and the <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/execution-capacity.md">operator activation runbook</a> before upgrading to a release containing it.</p></aside>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/execution-capacity-install-acceptance.md">September 11 installation and rollback receipt</a> records a separate arm64 fixture, real workspace retention and rollback between capacity-aware images. It also records the cold-start failure and remaining publication gates. This is not a newly published candidate or permission to roll back to pre-capacity rc.8 after migration 038.</p>
    <p>Use the target release's migration order, downloaded chart, original operator values and matching image overlay. Do not use <code>helm upgrade --reuse-values</code> as a substitute for reviewing changes, mix npm <code>latest</code> with the candidate server, or regenerate the configuration directory.</p>
    <p>Before upgrading, quiesce writes and workers and back up both PostgreSQL databases, operator Secrets, encryption keyrings and detached workspace files from the same point in time. Test restoration into a disposable target. A database dump is not a workspace backup; retained files are not a process or memory snapshot.</p>
    <p>The recorded reference acceptance covers coordinated database/file-volume recovery, not HA/CSI recovery or encrypted Vault rows. See <a href="#docs/workspace-operations">storage operations</a>, the <a href={`${source}/docs/credential-vault-operations.md`}>Vault recovery procedure</a> and the <a href={`${source}/docs/release-notes/0.5.0-rc.8-delivery.md`}>exact delivery evidence</a>. Rollback must account for database compatibility; reverting an image alone may be insufficient.</p>

    <h2>Uninstall deliberately</h2>
    <p>Confirm the target kubecontext, stop accepting tasks, terminate owned sandboxes through Harakiri and archive workspaces according to your retention policy. Secure backups before uninstalling. These commands remove only the two Helm releases; they are not a complete data erasure:</p>
    <CodeBlock language="bash">{kubernetesInstallCommands.uninstall}</CodeBlock>
    <p>PostgreSQL, Keycloak, generated Secrets, PVCs and runtime CRDs can remain. Delete dependency resources and namespaces only after explicitly deciding to discard this fixture's data. Never delete shared CRDs or another installation's namespace. Preserve private configuration and recovery material for the chosen backup-retention period.</p>
  </>
};
