import type { DocPage } from "./docs-content";
import { ArchitectureDiagram, TaskLifecycleDiagram } from "./components/docs-diagrams";

export const visionDocs: DocPage = {
  id: "vision-architecture",
  section: "Getting started",
  title: "Vision and architecture",
  lede: "The self-hosted sandbox control plane for agent applications. One developer experience, with runtime execution behind a provider boundary.",
  toc: ["Why Harakiri exists", "What belongs to whom", "Architecture", "From a task to a result", "Design principles", "What you can build today", "Operate it on your terms", "Where we are going"],
  body: <div className="vision-doc">
    <section><h2>Why Harakiri exists</h2>
      <p>An agent becomes useful when it can act: check out a repository, install dependencies, run tests, change files and produce something another system can use. That work needs a real execution environment, but every application should not have to become a cluster integration to get one.</p>
      <p><strong>Harakiri makes that environment a product primitive.</strong> Create a sandbox through a documented API, give it a task and a bounded lifetime, observe the work, retrieve the result, then release the runtime. Use the same product concepts from the TypeScript SDK, CLI and dashboard.</p>
      <blockquote className="docs-thesis">The application should describe the work and its boundaries. It should not need to know which pod runs it.</blockquote>
      <p>Open source matters at this boundary. Teams need to inspect how identity, credentials, network access and cleanup actually work, and operate the system alongside their own infrastructure. Harakiri aims to make those responsibilities understandable, not invisible.</p>
    </section>
    <section><h2>What belongs to whom</h2>
      <p>Harakiri is a sandbox control plane, not an agent framework or a wrapper whose identity depends on a particular runtime. The product contract and the execution engine have different responsibilities. Keeping them separate lets the control plane evolve while runtime implementations change.</p>
      <dl className="docs-ownership">
        <div><dt>Your application</dt><dd>Chooses the agent and model, defines the task, coordinates retries and decides whether the result is correct. Model inference may take place outside the sandbox.</dd></div>
        <div><dt>Harakiri</dt><dd>Owns organization-scoped product records and access policy, templates and builds, sandbox lifecycle coordination, runtime-facing APIs and the developer experience.</dd></div>
        <div><dt>The runtime provider</dt><dd>Creates and operates execution environments. An adapter implements lifecycle, commands, files and supported network controls. OpenSandbox is the current implementation; other providers or a first-party runtime would implement this boundary.</dd></div>
        <div><dt>Your platform team</dt><dd>Operates the cluster, identity service, registry, storage and network. The underlying runtime configuration determines the isolation guarantees.</dd></div>
      </dl>
    </section>
    <section><h2>Architecture</h2>
      <p>Integrations use Harakiri IDs and authenticated API requests. The control plane validates ownership and policy, records lifecycle intent, and delegates execution through the runtime provider. Provider IDs and endpoint credentials stay behind that boundary.</p>
      <ArchitectureDiagram />
      <h3>The product plane</h3>
      <p>The API is the entry point for organization-scoped operations. PostgreSQL records organizations, memberships, templates, builds, sandboxes, routes, workspace reservations and audit events. Keycloak owns browser sign-in and account credentials; automation uses Harakiri API keys.</p>
      <p>The scheduler coordinates expiration and lifecycle cleanup. The template builder prepares reusable, versioned images separately from live sandbox execution. These workers share persisted product intent, rather than requiring the browser to keep a task alive.</p>
      <h3>The runtime boundary</h3>
      <p>OpenSandbox is the current integrated runtime provider. Terminal, commands, files and diagnostics use provider APIs, not Kubernetes exec from the Harakiri application. Kubernetes access remains an operator and platform concern, including image-build jobs and storage provisioning.</p>
      <p><strong>Provider independence is an architectural direction, not a claim of universal compatibility.</strong> A new adapter must implement the required contracts, report capabilities honestly, and pass lifecycle, isolation, storage and recovery tests. Today there is one real execution adapter and a fixture provider for local development. Changing providers is not a supported live migration of running sandboxes or workspace volumes.</p>
      <p>HTTP previews use the runtime ingress path with Harakiri route policy. Outbound restrictions and credential injection require the corresponding provider enforcement capabilities. A configuration field is not evidence that enforcement is active; integrations must check capabilities and errors.</p>
      <h3>Two different kinds of state</h3>
      <p>PostgreSQL holds <em>metadata</em>, not an agent's working directory. An ordinary sandbox filesystem is disposable. An optional <a href="#docs/workspaces">persistent workspace</a> retains files on operator-managed storage and can be attached to a later sandbox. Backing up the database alone does not back up those files.</p>
    </section>
    <section><h2>From a task to a result</h2>
      <p>Consider a code-repair worker. It starts from a known template, transfers a repository and task, asks an agent to change the code, runs independent tests, and downloads the patch. Harakiri manages the execution environment; the worker still decides what counts as success.</p>
      <TaskLifecycleDiagram />
      <ol className="docs-task-details">
        <li><strong>Prepare deliberately.</strong> Resolve a template version, set a TTL, choose outbound access and provide only the credentials the task requires.</li>
        <li><strong>Keep execution observable.</strong> Track a command ID, inspect exit status and reconnect to output when supported. Following logs alone does not renew the sandbox lifetime.</li>
        <li><strong>Verify outside the agent's claims.</strong> Collect files, run acceptance checks and handle nonzero exits. A successful API request is not proof of a correct task result.</li>
        <li><strong>Release explicitly.</strong> Terminate in cleanup logic and use TTL as a safety net. With persistent storage, wait for the workspace reservation to become available before attaching a replacement.</li>
      </ol>
      <p>See the <a href="#docs/cli-agent-repair">OpenCode repair walkthrough</a> for a concrete example with original tests, real command output and cleanup.</p>
    </section>
    <section><h2>Design principles</h2>
      <div className="docs-principles">
        <section><span>01</span><h3>One vocabulary across tools</h3><p>Templates, sandboxes, commands, routes and workspaces mean the same thing in the API, SDK, CLI and UI. Examples should lead to the same observable outcome.</p></section>
        <section><span>02</span><h3>Clear boundaries over shortcuts</h3><p>Runtime behavior stays behind the RuntimeProvider contract. An adapter can evolve independently of the product surface; that does not make every runtime interchangeable today.</p></section>
        <section><span>03</span><h3>Explicit state over guesswork</h3><p>A process, its files and its lifetime are distinct. Pending, failed and uncertain outcomes must be visible and recoverable without pretending an operation succeeded.</p></section>
        <section><span>04</span><h3>Security that can be inspected</h3><p>Organization scope, route access, egress and credential delivery have separate controls. Their guarantees depend on the deployed provider and infrastructure, not on a badge in the UI.</p></section>
      </div>
    </section>
    <section><h2>What you can build today</h2>
      <ul className="docs-usecases">
        <li><a href="#docs/cli-agent-repair"><strong>Code-repair agents</strong><span>Give an agent a repository, preserve the tests and retrieve a verified change.</span></a></li>
        <li><a href="#docs/sdk-agent-report"><strong>Data and artifact workers</strong><span>Execute an analysis, download its files and validate a machine-readable result.</span></a></li>
        <li><a href="#docs/ui-agent-app"><strong>Agent-generated previews</strong><span>Inspect generated code and expose a running app through an explicit route.</span></a></li>
        <li><a href="#docs/browser-agent-qa"><strong>Browser QA workflows</strong><span>Run browser tests inside a prepared template and inspect the resulting evidence.</span></a></li>
      </ul>
      <p>The examples use OpenCode, but Harakiri does not require a particular agent or model provider. Your template must contain the tools your workload needs. External model availability, cost and data handling remain the model provider's responsibility.</p>
    </section>
    <section><h2>Operate it on your terms</h2>
      <p>Self-hosting separates the product contract from where it runs. A deployment combines the API and workers, dashboard, PostgreSQL, Keycloak, registry and a supported runtime provider. Operators configure public URLs, TLS, registry access, resource limits and storage for their environment. The current installation guide uses the OpenSandbox adapter.</p>
      <p>Cluster policy is part of the design, not a detail to bypass. Validate your runtime and storage against the target Kubernetes or OpenShift configuration. Harakiri's workspace preview has k0s acceptance evidence; restricted OpenShift persistent-storage acceptance is still pending.</p>
      <p>Start with the <a href="#docs/security-model">security model</a>. Follow <a href="#docs/backup-recovery">backup and recovery</a> to protect identities, product state, retained files and wrapping keys together; use <a href="#docs/workspace-operations">persistent storage operations</a> for volume ownership and retention.</p>
    </section>
    <section><h2>Where we are going</h2>
      <p>Our north star is a dependable execution layer for agent products: easy to integrate, possible to operate, and honest about its limits. Better examples, consistent SDK and CLI behavior, observable execution and reliable state recovery matter as much as new runtime features.</p>
      <p>Harakiri should be the durable control plane teams integrate with, whether execution continues to use OpenSandbox, moves to another provider, or eventually uses a runtime we build. That direction does not require inventing adapters before there is a real workload and a verified operational contract for them.</p>
      <aside className="docs-notice"><p><strong>Available is not the same as universal.</strong> The stable npm channel is 0.4.0. The current Developer Preview is 0.5.0-rc.10 on <code>next</code>. Match clients and server versions, and check your deployment's capabilities.</p><p>Snapshots and pause/resume are provider-dependent. Workspace-backed snapshots, shared concurrent workspace writers and automatic process recovery are not part of the current workspace preview. See the <a href="#changelog">release notes</a> and <a href="#docs/workspace-reference">workspace reference</a> for exact availability.</p></aside>
      <p>Start with the <a href="#docs/quickstart">quickstart</a>, then choose a <a href="#docs/hands-on-tutorials">complete workflow</a>. A small, verified integration is the best starting point for a production adoption.</p>
    </section>
  </div>
};
