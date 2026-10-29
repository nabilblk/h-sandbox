import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

const source = "https://github.com/nabilblk/h-sandbox/blob/main";

export const openwebuiDocs: DocPage = {
  id: "openwebui",
  section: "Integrations",
  title: "OpenWebUI and Open Terminal",
  lede: "Connect chat, shell and files to personal Harakiri sandboxes without changing OpenWebUI.",
  toc: [
    "Availability",
    "Responsibilities",
    "Install the candidate",
    "Connect OpenWebUI",
    "Chat to artifacts",
    "Retention and recovery",
    "Security and support"
  ],
  body: (
    <>
      <h2>Availability</h2>
      <aside className="docs-notice">
        <p>
          <strong>Source candidate, not yet natively qualified.</strong> This integration requires the candidate API,
          SDK, adapter and template from the same checkout. Core rc.13 does not contain generic application WebSocket
          support; Python 0.1.0rc1 does not contain the new route helpers. There is no published adapter package or
          image to install yet.
        </p>
      </aside>
      <p>
        The candidate pins OpenWebUI 0.12.4 and Open Terminal 0.14.6. Unit, transport and database tests are separate
        from real OpenWebUI browser and model qualification. Check the{" "}
        <a href={`${source}/integrations/openwebui/compatibility.json`}>compatibility record</a>; a missing native
        receipt is not a supported-version claim.
      </p>
      <h2>Responsibilities</h2>
      <p>
        OpenWebUI owns chat, model selection and tool calls. A separate adapter authenticates that OpenWebUI server,
        maps its verified users to retained workspaces and uses Harakiri public APIs for lifecycle and protected routes.
        Each sandbox runs its own Open Terminal service. Harakiri owns admission, runtime lifecycle and storage; no
        Kubernetes exec or provider credentials enter the integration.
      </p>
      <p>
        The initial context is one personal workspace per user and adapter instance. Chats from that user share files; a
        chat session does not create a private workspace. Model inference stays outside the sandbox.
      </p>
      <h2>Install the candidate</h2>
      <p>
        Start with an isolated <a href="#docs/install-kubernetes">Harakiri installation</a>, retained workspace support,
        a working template registry and spare execution capacity. Build the matching source API first, then the{" "}
        <a href={`${source}/examples/templates/open-terminal/README.md`}>Open Terminal template</a>. Do not replace a
        working production installation for evaluation.
      </p>
      <CodeBlock language="bash">{`pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/cli build
node packages/cli/dist/index.js template build \\
  --name open-terminal examples/templates/open-terminal`}</CodeBlock>
      <p>
        Follow the <a href={`${source}/integrations/openwebui/README.md`}>complete self-service installation guide</a>{" "}
        for the source-built adapter, private PostgreSQL bindings, secrets and pinned OpenWebUI Compose profile. The
        profile does not install or modify Kubernetes. Keep the Harakiri API key, adapter key, binding encryption key
        and OpenWebUI session secret separate.
      </p>
      <h2>Connect OpenWebUI</h2>
      <p>
        Use the administrator-configured native Open Terminal connection, not a custom user tool. In the supplied
        Compose network its URL is <code>http://adapter:8080</code>, its schema path is <code>/openapi.json</code> and
        its bearer credential is the adapter key. Disable cookie forwarding and orchestrator/context mode. Limit access
        to the intended users.
      </p>
      <p>
        Connection verification reads discovery/configuration without provisioning. A real authenticated operation
        creates the user's first workspace and runtime. Application health is checked separately from sandbox readiness.
      </p>
      <h2>Chat to artifacts</h2>
      <p>
        Configure a tool-capable model through OpenWebUI. The reference scenario uses local Ollama with{" "}
        <code>qwen3:4b-instruct</code>; no paid model key is needed by the adapter. Native tool calling, model identity,
        resource limits and actual outcomes must be recorded in qualification.
      </p>
      <CodeBlock language="plaintext">{`Use the connected terminal. Work in /workspace/demo.
Create sales.csv with region,amount rows North,12; South,7; North,5.
Read it with Python. Write report.json with North=17, South=7, total=24.
Use matplotlib to create chart.png and report.pdf, and write index.html.
Read the JSON back to verify it. Show links to the files.
Do not install packages or download data. Report tool failures honestly.`}</CodeBlock>
      <p>
        This is the acceptance recipe, not a claimed passing demo. Inspect the tool calls, browse the files, open
        image/PDF previews, download the JSON and verify its exact contents independently. Exercise shell input, resize,
        interrupt and reconnect. A convincing model reply without these artifacts is not success.
      </p>
      <h2>Retention and recovery</h2>
      <p>
        Default runtime TTL is 15 minutes, with a four-hour session age ceiling. Mutations and shell input may renew at
        most every 30 seconds; health, listings and output polling do not. After confirmed termination and storage
        release, a new runtime can reuse the retained workspace. Processes, execution IDs and old terminals are not
        resumed.
      </p>
      <p>
        Concurrent first requests coordinate through encrypted PostgreSQL bindings. Unknown create outcomes and lost
        one-time grants fail closed for explicit reconciliation. Failed command/upload forwarding is never automatically
        replayed. Capacity denial does not run the command.
      </p>
      <p>
        Stopping the adapter does not delete workspaces. Stop owned sandboxes, wait for release, then archive storage
        only after retaining required files. The guide covers key rotation, backup and recovery of bindings, and safe
        retirement.
      </p>
      <h2>Security and support</h2>
      <p>
        <strong>No new per-user Harakiri ACLs or unified command audit.</strong> Use a dedicated organization. Direct
        members retain organization permissions; Open Terminal executions do not become Harakiri Commands. The trusted
        OpenWebUI backend can assert user identities with its adapter credential.
      </p>
      <p>
        Protected routes remove platform credentials and cookies, bound transfers and connections, and revalidate
        grants. OpenWebUI must preserve opaque-origin preview isolation. Do not add <code>allow-same-origin</code> to
        make a preview work. A file-browser root is not a filesystem boundary.
      </p>
      <p>
        OpenWebUI may buffer uploads and some responses, so incremental Harakiri transport does not imply end-to-end
        streaming. Office conversion, notebooks, per-chat orchestration and customer OpenShift qualification are
        excluded. Read <a href="#docs/routes">Routes</a> for transport behavior and the{" "}
        <a href={`${source}/docs/protected-services-design.md`}>technical design</a> for ownership and maintenance.
      </p>
    </>
  )
};
