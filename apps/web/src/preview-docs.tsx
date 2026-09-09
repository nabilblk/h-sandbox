import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const previewDocs: DocPage = {
  id: "developer-preview", section: "Getting started", title: "Developer Preview", navTitle: "Preview scope",
  lede: "Evaluate Harakiri as a self-hosted control plane for trusted development teams. A working feature, a verified installation and a production guarantee are different claims.",
  toc: ["Choose your path", "Version and distribution", "Runtime profiles", "Measurements and capacity", "Security and operations"],
  body: <>
    <h2>Choose your path</h2>
    <p><strong>Developers:</strong> obtain an API URL and a scoped, expiring key from your operator. Follow <a href="#docs/quickstart">the deterministic quickstart</a>, then add <a href="#docs/workspaces">retained files</a> or <a href="#docs/opencode-template">OpenCode</a>. An agent or model-provider account is not required for the first task.</p>
    <p><strong>Operators:</strong> begin with the <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/developer-preview.md">installation and evaluation checklist</a>. Review dependencies, image digests, storage and runtime privileges before deploying. Repository access and anonymous artifact availability are separate gates; do not assume an internal Harbor URL is a public download.</p>
    <h2>Version and distribution</h2>
    <p>The latest candidate targeted by this guide is <code>0.5.0-rc.5</code>. SDK and CLI packages are on the <code>next</code> channel; <code>latest</code> still identifies the older <code>0.4.0</code> release. Pin the version agreed with your operator instead of mixing channels.</p>
    <CodeBlock language="bash">{`npm install --save-exact @h-sandbox/sdk@0.5.0-rc.5
npm install -g @h-sandbox/cli@0.5.0-rc.5
harakiri --version`}</CodeBlock>
    <p>For rc.5 installation and upgrade, use its <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/release-notes/0.5.0-rc.5-delivery.md">delivery receipt</a> and exact values overlay. Match the API, web, chart and package versions to the receipt. Source changes after that receipt are unreleased until a new candidate is published. Existing videos record the version shown in their evidence, not every later change.</p>
    <h2>Runtime profiles</h2>
    <table><thead><tr><th>Profile</th><th>Evidence and limits</th></tr></thead><tbody>
      <tr><td>Kubernetes + native OpenSandbox</td><td>Use the versioned native installation receipt for the exact clean-install and workflow evidence. Independent evaluation has been confirmed by the owner. Architecture support requires a real workflow on the named architecture, not only a successful image build.</td></tr>
      <tr><td>Restricted OpenShift</td><td>Chart rendering is not full runtime certification. No SCC modifications are required or implied. Vault and mutable egress are unsupported where the runtime cannot provide their enforcement requirements, including NET_ADMIN.</td></tr>
      <tr><td>Local development provider</td><td>For contracts and contributor tests. It does not prove sandbox isolation, network enforcement or Kubernetes storage behavior.</td></tr>
    </tbody></table>
    <p>Inspect the installed provider's capabilities before using pause, snapshots, persistent storage, Vault or egress. Unsupported operations must fail explicitly; Harakiri does not substitute Kubernetes exec or plaintext environment secrets.</p>
    <h2>Measurements and capacity</h2>
    <p><code>maxConcurrency</code> is a configured target, not enforced admission. Operators must bound evaluation access and resource consumption independently. This preview is not an unbounded public execution service or a hostile multi-tenant production recommendation.</p>
    <p>Usage counts describe retained control-plane records, including failed creates. Historical concurrency, historical peaks, compute hours, runtime durations and measured cold starts are unavailable. Older releases displayed synthetic estimates: do not use those values for billing, planning or isolation decisions.</p>
    <p>This candidate adds <code>coverage</code> to <code>GET /v1/usage</code> and returns an empty history. Deprecated numeric fields remain zero for wire compatibility only. Zero is not a measurement when the field appears in <code>coverage.unavailableMetrics</code>; missing coverage from an older server does not establish measured history.</p>
    <h2>Security and operations</h2>
    <p>Generate your own bootstrap credentials. Never expose development seed identities, dev authentication or localhost callback defaults through a public ingress. Keycloak verifies identity; Harakiri enforces organization and principal permissions. Review <a href="#docs/authorization">authorization</a> before sharing keys.</p>
    <p>A workspace retains files, not processes, and is not a backup. Validate database and volume recovery together. Revoking a credential does not erase files an agent already wrote or cancel detached work. See <a href="#docs/workspace-operations">workspace operations</a> and <a href="#docs/security-model">the security model</a>.</p>
    <p>No uptime or response-time SLA is offered for the maintainer lab. Report suspected vulnerabilities privately to <a href="mailto:nabilblk@gmail.com">nabilblk@gmail.com</a>. The repository maintainer owns triage; see the <a href="https://github.com/nabilblk/h-sandbox/blob/main/SECURITY.md">security policy</a> for report contents and disclosure coordination. Do not include credentials, customer data or exploit details in public issues.</p>
  </>
};
