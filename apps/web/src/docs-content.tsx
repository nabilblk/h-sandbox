import type React from "react";
import { CodeBlock } from "./components/docs-code";
import { visionDocs } from "./vision-docs";
import { previewDocs } from "./preview-docs";
import { kubernetesInstallDocs } from "./kubernetes-install-docs";
import { authorizationDocs } from "./authorization-docs";
import { overviewDocs, quickstartDocs } from "./getting-started-docs";
import { demoTutorialSections } from "./demo-tutorial";
import { agentDemoPrerequisites, agentDemoTutorials } from "./agent-demo-tutorials";
import { workspaceDocs } from "./workspace-docs";
import { workspaceTutorialDocs } from "./workspace-tutorial-docs";
import { workspaceReferenceDocs } from "./workspace-reference-docs";
import { workspaceOperationsDocs } from "./workspace-operations-docs";
import { uiProductTourDocs } from "./ui-product-tour-docs";

export type DocPage = {
  id: string;
  section: string;
  title: string;
  navTitle?: string;
  lede: string;
  toc: string[];
  body: React.ReactNode;
};



const TutorialScenario = ({ number, title, meta, children }: { number: string; title: string; meta: string; children: React.ReactNode }) => (
  <section className="tutorial-scenario">
    <div className="tutorial-scenario-head">
      <span className="tutorial-number">{number}</span>
      <div>
        <h2>{title}</h2>
        <span className="tutorial-meta">{meta}</span>
      </div>
    </div>
    {children}
  </section>
);

const TutorialCheck = ({ children }: { children: React.ReactNode }) => (
  <div className="tutorial-check">
    <b>Verification</b>
    <p>{children}</p>
  </div>
);

export const docPages: DocPage[] = [
  previewDocs,
  kubernetesInstallDocs,
  overviewDocs,
  uiProductTourDocs,
  authorizationDocs,
  ...agentDemoTutorials.map((tutorial): DocPage => ({
    id: tutorial.id, section: "Agent demos", title: tutorial.title, lede: tutorial.lede,
    navTitle: ({ "cli-agent-repair": "CLI: repair code", "ui-agent-app": "UI: build an app", "sdk-agent-report": "SDK: generate a report", "browser-agent-qa": "SDK: browser QA" } as Record<string, string>)[tutorial.id],
    toc: tutorial.sections.map((section) => section.title),
    body: <div className="tutorial-doc"><p><a href={`#demos/${tutorial.id}`}>Watch the demo</a> | <a href="/demos/agent-workflows.zip">Download example source</a> | <a href={`/demos/${tutorial.id}/tutorial.html`}>Standalone tutorial</a></p><p>{agentDemoPrerequisites}</p><p><a href="https://opencode.ai/docs/zen/">OpenCode model availability and data policies</a></p>{tutorial.sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p>{section.code && <CodeBlock language={section.language}>{section.code}</CodeBlock>}<TutorialCheck>{section.check}</TutorialCheck></section>)}</div>,
  })),
  workspaceDocs,
  workspaceTutorialDocs,
  workspaceReferenceDocs,
  workspaceOperationsDocs,
  {
    id: "cli-live-preview",
    section: "Tutorials",
    title: "CLI to live preview",
    lede: "Reproduce the real product demo: create a workspace, attach, run an application, expose it, inspect it, and clean up.",
    toc: demoTutorialSections.map((section) => section.title),
    body: <div className="tutorial-doc"><p><a href="/demo/harakiri-product-demo.mp4">Watch the 68-second walkthrough</a> | <a href="/demo/transcript.md">Transcript</a> | <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/demo/product-tour">Example application source</a></p>{demoTutorialSections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p>{section.code && <CodeBlock language="bash">{section.code}</CodeBlock>}<p><strong>Verification: </strong>{section.check}</p></section>)}</div>,
  },
  visionDocs,
  quickstartDocs,
  {
    id: "hands-on-tutorials",
    section: "Tutorials",
    title: "Hands-on tutorials",
    lede: "Run complete sandbox workflows with observable checks: execute a data job, publish a private preview, constrain egress, work with Git, restore a snapshot, and integrate the SDK.",
    toc: ["Before you start", "Run a data job and retrieve its artifact", "Publish a token-protected preview", "Restrict outbound network access", "Create a Git workspace", "Pause, snapshot, and restore state", "Integrate Harakiri into a worker", "Troubleshooting"],
    body: (
      <div className="tutorial-doc">
        <div className="tutorial-map" aria-label="Tutorial scenarios">
          <div><span>01</span><b>Data job</b><small>files + commands</small></div>
          <div><span>02</span><b>Private preview</b><small>process + route</small></div>
          <div><span>03</span><b>Restricted egress</b><small>policy + diagnostics</small></div>
          <div><span>04</span><b>Git workspace</b><small>clone + commit</small></div>
          <div><span>05</span><b>Snapshot restore</b><small>pause + persistence</small></div>
          <div><span>06</span><b>SDK worker</b><small>application integration</small></div>
        </div>

        <h2>Before you start</h2>
        <p>Install the public CLI, create an API key in the dashboard, and point the CLI at your deployment. The examples use <code>jq</code> where a generated route or snapshot ID must be read from JSON.</p>
        <CodeBlock language="bash">{`npm install -g @h-sandbox/cli

export HARAKIRI_API_URL=https://sb-api.harakiri.io
export HARAKIRI_API_KEY=hk_live_...

harakiri login \\
  --api-url "$HARAKIRI_API_URL" \\
  --api-key "$HARAKIRI_API_KEY"
harakiri capabilities`}</CodeBlock>
        <div className="tutorial-note"><b>Cleanup contract</b><p>Every tutorial installs a shell trap immediately after creation. TTL is the platform safety net, not a replacement for application cleanup.</p></div>

        <TutorialScenario number="01" title="Run a data job and retrieve its artifact" meta="10 minutes - python-3.12-data - command and file APIs">
          <p>Create a disposable workspace, upload input and code, execute the job, then make the result checkable outside the sandbox.</p>
          <CodeBlock language="bash">{`WORK_DIR="$(mktemp -d)"
printf 'item,amount\napi,21\nworker,34\npreview,13\n' >"$WORK_DIR/orders.csv"
cat >"$WORK_DIR/job.py" <<'PY'
import csv
rows = list(csv.DictReader(open("orders.csv")))
total = sum(int(row["amount"]) for row in rows)
open("summary.txt", "w").write(f"orders={len(rows)} total={total}\\n")
print(f"processed {len(rows)} orders")
PY

SBX_ID="$(harakiri create --template python-3.12-data --name tutorial-data-job --ttl 600 | sed -n '/^sbx_/p')"
cleanup() { harakiri kill "$SBX_ID" >/dev/null 2>&1 || true; rm -rf "$WORK_DIR"; }
trap cleanup EXIT

harakiri file-upload "$SBX_ID" --from "$WORK_DIR/orders.csv" --path /workspace/orders.csv --parents
harakiri file-upload "$SBX_ID" --from "$WORK_DIR/job.py" --path /workspace/job.py --parents
harakiri run "$SBX_ID" --cwd /workspace --cmd "python job.py"
harakiri file-download "$SBX_ID" --path /workspace/summary.txt --to "$WORK_DIR/summary.txt"
grep -qx "orders=3 total=68" "$WORK_DIR/summary.txt"`}</CodeBlock>
          <TutorialCheck>The run prints <code>processed 3 orders</code>. The download verifies its checksum and the final <code>grep</code> exits successfully.</TutorialCheck>
        </TutorialScenario>

        <TutorialScenario number="02" title="Publish a token-protected preview" meta="10 minutes - python-3.12 - detached process and route auth">
          <p>Start a service that remains alive after the command returns. Expose it through a token route and prove both the denied and authenticated paths.</p>
          <CodeBlock language="bash">{`SBX_ID="$(harakiri create --template python-3.12 --name tutorial-private-preview --ttl 600 | sed -n '/^sbx_/p')"
cleanup() { harakiri kill "$SBX_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

harakiri file-write "$SBX_ID" \\
  --path /workspace/index.html \\
  --content '<h1>Harakiri preview is ready</h1>' \\
  --parents

COMMAND_JSON="$(harakiri command run "$SBX_ID" \\
  --cmd "python -m http.server 5173 --bind 0.0.0.0" \\
  --cwd /workspace --detached --json)"
COMMAND_ID="$(jq -r '.command.id' <<<"$COMMAND_JSON")"
harakiri command wait "$SBX_ID" "$COMMAND_ID" --status running --timeout-ms 30000

ROUTE_JSON="$(harakiri expose "$SBX_ID" --port 5173 --access token \\
  --label tutorial-preview --wait --wait-path / --json)"
ROUTE_URL="$(jq -r '.route.url' <<<"$ROUTE_JSON")"
HEADER_NAME="$(jq -r '.accessHeaderName' <<<"$ROUTE_JSON")"
ROUTE_TOKEN="$(jq -r '.accessToken' <<<"$ROUTE_JSON")"

test "$(curl -sS -o /dev/null -w '%{http_code}' "$ROUTE_URL")" = "401"
curl -fsS -H "$HEADER_NAME: $ROUTE_TOKEN" "$ROUTE_URL" | \\
  grep -q "Harakiri preview is ready"`}</CodeBlock>
          <TutorialCheck>The anonymous request returns <code>401</code>; the request carrying the one-time route header returns the preview body.</TutorialCheck>
        </TutorialScenario>

        <TutorialScenario number="03" title="Restrict outbound network access" meta="10 minutes - python-3.12-data - egress policy">
          <p>Use a preset for package infrastructure, keep unrelated destinations denied, and add one explicit hostname at runtime.</p>
          <CodeBlock language="bash">{`SBX_ID="$(harakiri create --template python-3.12-data \\
  --name tutorial-restricted-egress --ttl 600 \\
  --egress restricted --egress-preset python-package-install | sed -n '/^sbx_/p')"
cleanup() { harakiri kill "$SBX_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

PYPI="$(harakiri egress test "$SBX_ID" https://pypi.org/simple 2>/dev/null | cut -f1)"
GOOGLE="$(harakiri egress test "$SBX_ID" https://www.google.com 2>/dev/null | cut -f1)"
test "$PYPI" = "ok"
test "$GOOGLE" = "blocked"

harakiri egress allow "$SBX_ID" api.github.com
GITHUB="$(harakiri egress test "$SBX_ID" https://api.github.com 2>/dev/null | cut -f1)"
test "$GITHUB" = "ok"
harakiri egress "$SBX_ID"`}</CodeBlock>
          <TutorialCheck>PyPI and the newly added GitHub API hostname report <code>ok</code>. Google remains <code>blocked</code>.</TutorialCheck>
        </TutorialScenario>

        <TutorialScenario number="04" title="Create a Git workspace" meta="10 minutes - ubuntu-24.04 - public clone and local commit">
          <p>Prepare a portable Ubuntu workspace, clone a repository, edit through the file API, then use Harakiri Git operations without granting any push credential.</p>
          <CodeBlock language="bash">{`SBX_ID="$(harakiri create --template ubuntu-24.04 \\
  --name tutorial-git-workspace --ttl 900 | sed -n '/^sbx_/p')"
cleanup() { harakiri kill "$SBX_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

harakiri run "$SBX_ID" \\
  --cmd 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates git && if [ -n "\${SSL_CERT_FILE:-}" ]; then git config --global http.sslCAInfo "$SSL_CERT_FILE"; fi'
harakiri git clone "$SBX_ID" https://github.com/octocat/Hello-World.git \\
  --path /workspace/project --depth 1
harakiri git branch "$SBX_ID" tutorial/change --cwd /workspace/project
harakiri file-write "$SBX_ID" --path /workspace/project/harakiri.txt \\
  --content "created in a disposable workspace" --parents
harakiri git add "$SBX_ID" harakiri.txt --cwd /workspace/project
harakiri git commit "$SBX_ID" --cwd /workspace/project \\
  --message "Add Harakiri workspace marker" \\
  --author-name "Harakiri Tutorial" --author-email "tutorial@example.com"
harakiri git status "$SBX_ID" --cwd /workspace/project | grep -q clean`}</CodeBlock>
          <TutorialCheck>The repository starts clean, the local commit succeeds, and the final status returns <code>clean</code>.</TutorialCheck>
          <p>For real workloads, bake Git into a custom template such as <code>open-agents-dev</code>. The bootstrap also makes Git honor a runtime-provided <code>SSL_CERT_FILE</code> when egress uses a trusted interception certificate. Installing tools at runtime adds latency and weakens reproducibility.</p>
        </TutorialScenario>

        <TutorialScenario number="05" title="Pause, snapshot, and restore state" meta="15 minutes - python-3.12 - provider persistence">
          <p>Preflight persistence capabilities, preserve state across pause/resume, then restore the same state into a second sandbox.</p>
          <CodeBlock language="bash">{`harakiri capabilities | grep -E \\
  'lifecyclePause|lifecycleResume|lifecycleSnapshot|createFromSnapshot'

SOURCE_ID=""; RESTORED_ID=""; SNAPSHOT_ID=""
cleanup() {
  test -z "$RESTORED_ID" || harakiri kill "$RESTORED_ID" >/dev/null 2>&1 || true
  test -z "$SOURCE_ID" || harakiri kill "$SOURCE_ID" >/dev/null 2>&1 || true
  test -z "$SNAPSHOT_ID" || harakiri snapshots delete "$SNAPSHOT_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

SOURCE_ID="$(harakiri create --template python-3.12 --name tutorial-snapshot-source --ttl 900 | sed -n '/^sbx_/p')"
harakiri file-write "$SOURCE_ID" --path /workspace/checkpoint.txt \\
  --content "checkpoint-ready" --parents
harakiri pause "$SOURCE_ID"
harakiri resume "$SOURCE_ID"
test "$(harakiri file-read "$SOURCE_ID" --path /workspace/checkpoint.txt)" = "checkpoint-ready"

SNAPSHOT_JSON="$(harakiri snapshot "$SOURCE_ID" --name tutorial-checkpoint \\
  --wait --wait-timeout-ms 120000 --json)"
SNAPSHOT_ID="$(jq -r '.snapshot.id' <<<"$SNAPSHOT_JSON")"
RESTORED_ID="$(harakiri create --snapshot "$SNAPSHOT_ID" \\
  --name tutorial-snapshot-restored --ttl 600 | sed -n '/^sbx_/p')"
test "$(harakiri file-read "$RESTORED_ID" --path /workspace/checkpoint.txt)" = "checkpoint-ready"`}</CodeBlock>
          <TutorialCheck>The marker survives both resume and creation from the immutable snapshot.</TutorialCheck>
        </TutorialScenario>

        <TutorialScenario number="06" title="Integrate Harakiri into a worker" meta="10 minutes - @h-sandbox/sdk - idempotent application flow">
          <p>Use the public SDK with a bounded wait, an idempotency key, explicit result validation, and cleanup in <code>finally</code>.</p>
          <CodeBlock language="bash">{`npm install @h-sandbox/sdk`}</CodeBlock>
          <CodeBlock language="javascript">{`import { randomUUID } from "node:crypto";
import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandboxId;
const jobId = process.env.JOB_ID ?? randomUUID();
try {
  const created = await client.createSandbox({
    template: "python-3.12-data",
    name: "tutorial-sdk-worker",
    ttlSeconds: 600,
    wait: false,
    idempotencyKey: \`tutorial-job-\${jobId}\`
  });
  sandboxId = created.sandbox.id;
  await client.waitForSandbox(sandboxId, { timeoutMs: 90_000 });
  await client.writeSandboxFile(sandboxId, {
    path: "/workspace/task.py",
    content: "print('sdk-worker-ready')\\n",
    createParents: true
  });
  const run = await client.runSandbox(sandboxId, { command: "python /workspace/task.py" });
  if (run.result.exitCode !== 0 || !run.result.stdout.includes("sdk-worker-ready")) {
    throw new Error(run.result.stderr || "unexpected sandbox result");
  }
  console.log(\`PASS: \${sandboxId} completed the worker task\`);
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error({ code: error.code, retryable: error.retryable });
  }
  throw error;
} finally {
  if (sandboxId) await client.killSandbox(sandboxId).catch(() => undefined);
}`}</CodeBlock>
          <CodeBlock language="bash">{`JOB_ID="$(date +%s)" node worker.mjs`}</CodeBlock>
          <TutorialCheck>The worker prints a <code>PASS</code> line and the sandbox is terminated even when task validation throws.</TutorialCheck>
        </TutorialScenario>

        <h2>Troubleshooting</h2>
        <ul>
          <li><code>401 Unauthorized</code>: verify the API URL and rotate or reconfigure the API key.</li>
          <li>Pending sandbox: inspect <code>harakiri status &lt;id&gt; --json</code> for the operation error.</li>
          <li>Route timeout: bind the service to <code>0.0.0.0</code> and expose the same port.</li>
          <li>Egress unavailable: inspect runtime capabilities and ask the operator whether enforcement is enabled.</li>
          <li>Snapshot unsupported: stop at the capability check; do not emulate persistence with Kubernetes access.</li>
        </ul>
        <p>Continue with CLI reference, SDK and CLI, Lifecycle, Routes, Outbound access, or Credential Vault for the complete contracts behind each scenario.</p>
      </div>
    )
  },
  {
    id: "sdk-cli",
    section: "Getting started",
    title: "SDK and CLI",
    lede: "Use the public npm packages for application integrations and local automation.",
    toc: ["Packages", "Configure", "Sandbox object", "Runtime metadata", "SDK flow", "Git", "Git troubleshooting", "CLI flow", "Terminal", "Contract"],
    body: (
      <>
        <h2>Packages</h2>
        <p><code>{"@h-sandbox/sdk"}</code> is the TypeScript integration package. <code>{"@h-sandbox/cli"}</code> installs the <code>{"harakiri"}</code> executable for local development and CI scripts.</p>
        <CodeBlock language="bash">{`npm install @h-sandbox/sdk\nnpm install -g @h-sandbox/cli`}</CodeBlock>
        <h2>Configure</h2>
        <p>Create an API key in the dashboard, then pass it through environment variables or <code>{"harakiri login"}</code>. Browser sign-in still belongs to Keycloak; API keys are for server-side integrations and local tools.</p>
        <CodeBlock language="bash">{`export HARAKIRI_API_URL=https://sb-api.harakiri.io\nexport HARAKIRI_API_KEY=hk_live_...\nharakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"`}</CodeBlock>
        <h2>Sandbox object</h2>
        <p><code>{"HarakiriSandbox"}</code> wraps one sandbox ID and binds commands, files, routes, egress, logs, metrics, and lifecycle methods to that sandbox. Use <code>{"refresh()"}</code> or <code>{"wait()"}</code> when your code needs an updated cached summary.</p>
        <CodeBlock language="typescript">{`import { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({\n  apiUrl: process.env.HARAKIRI_API_URL!,\n  apiKey: process.env.HARAKIRI_API_KEY!\n});\n\nconst sandbox = await harakiri.sandboxes.create({\n  template: "python-3.12-data",\n  wait: false,\n  ttlSeconds: 600,\n  idempotencyKey: "job-123"\n});\n\nawait sandbox.wait();\nawait sandbox.files.write({\n  path: "/workspace/task.py",\n  content: "print(2 + 2)\\n",\n  createParents: true\n});\nconst run = await sandbox.run({ command: "python /workspace/task.py" });\nconsole.log(run.result.stdout);\n\nconst reconnected = await HarakiriSandbox.connect(harakiri, sandbox.id);\nconsole.log(reconnected.summary.status);\nawait sandbox.kill();`}</CodeBlock>
        <h2>Runtime metadata</h2>
        <p>Sandbox create, get, and list responses include <code>{"runtimeMetadata"}</code>, the resolved contract for workdir, user, shell, template version, default ports, exposed routes, egress mode, limits, TTL, and provider capability states. Use it instead of deriving runtime facts from template names.</p>
        <CodeBlock language="typescript">{`const sandbox = await harakiri.sandboxes.create({ template: "open-agents-dev" });\nconst runtime = sandbox.runtimeMetadata;\n\nconsole.log(runtime.workdir);\nconsole.log(runtime.ports.default);\nconsole.log(runtime.egress.mode);\nconsole.log(runtime.provider.capabilities);`}</CodeBlock>
        <h2>SDK flow</h2>
        <CodeBlock language="typescript">{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({\n  apiUrl: process.env.HARAKIRI_API_URL!,\n  apiKey: process.env.HARAKIRI_API_KEY!\n});\n\nconst { sandbox } = await harakiri.createSandbox({\n  template: "python-3.12-data",\n  ttlSeconds: 600,\n  idempotencyKey: "job-123",\n  egress: { mode: "restricted", presets: ["python-package-install"] }\n});\n\nawait harakiri.waitForSandbox(sandbox.id);\nconst result = await harakiri.runSandbox(sandbox.id, {\n  command: "python -c 'print(2 + 2)'",\n  cwd: "/workspace"\n});\nconsole.log(result.result.stdout);\nawait harakiri.killSandbox(sandbox.id);`}</CodeBlock>
        <h2>Git</h2>
        <p>Use <code>source: {"{ type: \"git\" }"}</code> when a sandbox should start from a repository. The SDK creates the sandbox normally, sends only sanitized source provenance to the API, waits for readiness, and clones through the tracked command API. For restricted egress, the <code>git-hosting</code> preset is added automatically unless disabled.</p>
        <CodeBlock language="typescript">{`const sandbox = await harakiri.sandboxes.create({\n  template: "open-agents-dev",\n  egress: { mode: "restricted", presets: ["llm-apis"] },\n  source: {\n    type: "git",\n    url: "https://github.com/acme/project.git",\n    branch: "main",\n    targetPath: "/workspace/project",\n    shallow: true\n  }\n});\n\nconst status = await sandbox.git.status({ cwd: "/workspace/project" });\nconsole.log(status.branch, status.clean);`}</CodeBlock>
        <p>Private HTTPS repositories use one-shot token credentials by default. Command records store environment variable names, not token values, and the SDK resets <code>{"origin"}</code> to a credential-free URL after clone. The sandbox summary exposes a safe source status trail for dashboards and reconnect flows. Mutating Git helpers record <code>{"sandbox.git.*"}</code> audit entries with sanitized repository context.</p>
        <h2>Git troubleshooting</h2>
        <p>If Git is unavailable, SDK calls throw <code>{"HarakiriGitUnsupportedRuntimeError"}</code> with code <code>{"git_runtime_unsupported"}</code>; use a template that includes the <code>{"git"}</code> binary, such as <code>{"open-agents-dev"}</code>, <code>{"opencode"}</code>, or a custom template that installs it. If private clone or push fails, verify the token scope and pass credentials as one-shot env values. If clone or pull is unreachable, <code>{"HarakiriGitNetworkAccessError"}</code> points to restricted egress and Git hostnames; add the <code>{"git-hosting"}</code> preset or allow the required Git hostnames. For commit failures, configure identity first with <code>{"sandbox.git.configureUser"}</code> or <code>{"harakiri git user"}</code>.</p>
        <h2>CLI flow</h2>
        <CodeBlock language="bash">{`harakiri create --template python-3.12-data --name agent-runner --ttl 600\nharakiri create --template open-agents-dev --git https://github.com/acme/project.git --git-path /workspace/project\nharakiri git status sbx_... --cwd /workspace/project\nharakiri run sbx_... --cmd "python -c 'print(2 + 2)'"\nharakiri files sbx_... --path /workspace\nharakiri expose sbx_... --port 3000 --wait --wait-path /\nharakiri kill sbx_...`}</CodeBlock>
        <h2>Terminal</h2>
        <p>Use <code>{"attach"}</code> for an interactive human terminal. Use command sessions for stateful automation that needs <code>{"cd"}</code>, exported variables, or setup steps without taking over the local terminal.</p>
        <CodeBlock language="bash">{`harakiri attach sbx_... --cwd /workspace\n\nSESSION_ID=$(harakiri command session create sbx_... --cwd /workspace | head -n1)\nharakiri command session run sbx_... "$SESSION_ID" --cmd "cd /tmp && pwd"\nharakiri command session run sbx_... "$SESSION_ID" --cmd "pwd"\nharakiri command session delete sbx_... "$SESSION_ID"`}</CodeBlock>
        <p>The browser dashboard uses the same attach endpoint through a short-lived <code>{"/terminal/attach-ticket"}</code>, so Keycloak-authenticated users can open a WebSocket terminal without putting API keys in JavaScript.</p>
        <p>The current OpenSandbox PTY provider launches Bash. Harakiri exposes <code>{"--shell"}</code> and <code>{"--env"}</code> as stable attach options, but non-default shell or per-attach env values return <code>{"runtime_terminal_unsupported"}</code> until OpenSandbox exposes those fields.</p>
        <h2>Contract</h2>
        <p>The dashboard, CLI, and SDK use the same <code>{"/v1"}</code> API and OpenAPI contract. External applications should import only <code>{"@h-sandbox/sdk"}</code>; internal monorepo packages are not part of the public npm contract.</p>
      </>
    )
  },
  {
    id: "team-members",
    section: "Organization",
    title: "Team members",
    lede: "Invite teammates by email, review pending invitations, and keep workspace access limited to active members.",
    toc: ["Invite", "Statuses", "Access", "Troubleshooting"],
    body: (
      <>
        <h2>Invite</h2>
        <p>Organization admins can open Members and use Invite member. Enter the teammate's email address; the role defaults to Member for the MVP.</p>
        <p>The invite sends an account setup email when email delivery is configured. The invited person sets their password from that email, signs in, and lands in the inviting workspace.</p>
        <h2>Statuses</h2>
        <p>Active rows are current workspace members. Pending rows are invitations waiting for the recipient to complete setup. Email failed means the invitation is saved but delivery needs operator attention before Retry can send another setup email.</p>
        <h2>Access</h2>
        <p>Only organization admins can open Members, invite teammates, retry delivery, cancel pending invitations, or remove members. Regular members do not see the Members navigation item.</p>
        <h2>Troubleshooting</h2>
        <p>If an invite shows Email failed, ask the operator to check the authentication email configuration, then use Retry. Harakiri never creates or displays passwords; credential setup stays in the sign-in provider.</p>
      </>
    )
  },
  {
    id: "cli-reference",
    section: "Reference",
    title: "CLI reference",
    lede: "Install the harakiri executable, configure an API key, and automate sandbox workflows from a terminal.",
    toc: ["Install", "Configure", "Lifecycle", "Processes", "Files", "Routes", "Vault", "Templates"],
    body: (
      <>
        <h2>Install</h2>
        <CodeBlock language="bash">{`npm install -g @h-sandbox/cli\nharakiri --version`}</CodeBlock>
        <h2>Configure</h2>
        <CodeBlock language="bash">{`export HARAKIRI_API_URL=https://sb-api.harakiri.io\nexport HARAKIRI_API_KEY=hk_live_...\nharakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"\nharakiri config`}</CodeBlock>
        <p>The CLI resolves explicit flags first, then environment variables, then saved config. Browser sign-in remains Keycloak-owned; CLI automation uses API keys.</p>
        <h2>Lifecycle</h2>
        <CodeBlock language="bash">{`harakiri create --template python-3.12-data --name agent-runner --ttl 600\nharakiri status sbx_... --json\nharakiri renew sbx_...\nharakiri capabilities\nharakiri kill sbx_...`}</CodeBlock>
        <h2>Processes</h2>
        <CodeBlock language="bash">{`harakiri run sbx_... --cmd "python --version"\nharakiri process run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0" --detached --json\nharakiri command wait sbx_... cmd_... --status running\nharakiri command tail sbx_... cmd_... --lines 100\nharakiri attach sbx_... --cwd /workspace`}</CodeBlock>
        <h2>Files</h2>
        <CodeBlock language="bash">{`harakiri files sbx_... --path /workspace\nharakiri file-upload sbx_... --path /workspace/out.bin --from ./out.bin --parents\nharakiri file-download sbx_... --path /workspace/out.bin --json --to ./out.bin`}</CodeBlock>
        <h2>Routes</h2>
        <CodeBlock language="bash">{`harakiri expose sbx_... --port 5173 --access token --label preview --wait --wait-path /\nharakiri routes sbx_... --json\nharakiri unexpose sbx_... --port 5173`}</CodeBlock>
        <h2>Vault</h2>
        <CodeBlock language="bash">{`export OPENAI_API_KEY=placeholder\nharakiri create --template open-agents-dev --credential 'name=openai,host=api.openai.com,auth=bearer,from-env=OPENAI_API_KEY,fake-env=OPENAI_API_KEY=fake-openai-key'\nharakiri vault attach sbx_... --name openai --host api.openai.com --auth bearer --from-env OPENAI_API_KEY --fake-env OPENAI_API_KEY=fake-openai-key\nharakiri vault attach sbx_... --preset openai --prompt\nharakiri vault list sbx_...\nharakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models\nharakiri vault detach sbx_... sca_...`}</CodeBlock>
        <p>Use <code>{"--from-env"}</code>, <code>{"--from-stdin"}</code>, or <code>{"--prompt"}</code> for real values. The sandbox sees only fake env values; the provider injects credentials only for matching outbound requests. Create-time credentials require synchronous sandbox creation.</p>
        <h2>Templates</h2>
        <CodeBlock language="bash">{`harakiri template init --name open-agents-dev --dockerfile Dockerfile\nharakiri template build --name open-agents-dev .\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable\nharakiri create --template open-agents-dev:stable --name stable-runner`}</CodeBlock>
      </>
    )
  },
  {
    id: "session-management",
    section: "Organization",
    title: "Sign-in sessions",
    lede: "Harakiri uses Keycloak for browser sign-in, token refresh, and provider logout.",
    toc: ["Sign in", "Refresh", "Sign out", "Session expired"],
    body: (
      <>
        <h2>Sign in</h2>
        <p>The dashboard starts an OpenID Connect Authorization Code flow with PKCE. Keycloak owns credentials, required actions, and the browser SSO session. Harakiri keeps only the intended return route in session storage while the browser leaves for Keycloak.</p>
        <h2>Refresh</h2>
        <p>The web app refreshes short-lived access tokens before API calls. Tokens stay in Keycloak adapter memory and are not written to <code>{"localStorage"}</code>; after a page reload, the app checks the Keycloak SSO session again instead of replaying a saved token.</p>
        <h2>Sign out</h2>
        <p>Use the account menu and choose Sign out of Harakiri and Keycloak. This starts OIDC provider logout and returns to the landing page after Keycloak closes the SSO session.</p>
        <h2>Session expired</h2>
        <p>If refresh fails or another tab signs out, Harakiri clears local state, keeps the current route, and asks you to sign in again. Other open Harakiri tabs receive the same logout or session-expired event.</p>
      </>
    )
  },
  {
    id: "create-sandbox",
    section: "Sandboxes",
    title: "Create a sandbox",
    lede: "Create sandboxes from catalog templates, custom aliases, qualified stable aliases, or immutable template version IDs.",
    toc: ["CLI", "API", "Dashboard", "Routing"],
    body: (
      <>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri create --template python-3.12-data --name agent-runner --ttl 300 --env HARAKIRI_ENV_SMOKE=env-ok\nharakiri create --template open-agents-dev --name repo-runner --git https://github.com/acme/project.git --git-path /workspace/project\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner\nharakiri status sbx_...`}</CodeBlock>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes</code></span>
        <CodeBlock language="bash">{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"python-3.12-data","name":"agent-runner","ttlSeconds":300,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}'\n\ncurl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"open-agents-dev:stable","name":"stable-runner","ttlSeconds":300}'`}</CodeBlock>
        <h2>Dashboard</h2>
        <p>Use New sandbox when you want to start from the browser. The Environment field accepts <code>{"KEY=value"}</code> rows and passes them only to the sandbox being created.</p>
        <h2>Routing</h2>
        <p>Expose a port only when a process is listening on <code>{"0.0.0.0"}</code> inside the sandbox.</p>
        <CodeBlock language="bash">{`harakiri expose sbx_... --port 3000 --wait --wait-path /\nharakiri routes sbx_...\nharakiri unexpose sbx_... --port 3000`}</CodeBlock>
      </>
    )
  },
  {
    id: "sandbox-lifecycle",
    section: "Sandboxes",
    title: "Lifecycle",
    lede: "Use explicit create, reconnect, renew, kill, and provider-backed persistence semantics without exposing provider IDs to users.",
    toc: ["States", "Supported operations", "TTL and activity", "Snapshots", "Capability gating", "SDK", "CLI", "Cleanup"],
    body: (
      <>
        <h2>States</h2>
        <p>Sandbox states are <code>{"pending"}</code>, <code>{"running"}</code>, <code>{"idle"}</code>, <code>{"pausing"}</code>, <code>{"paused"}</code>, <code>{"resuming"}</code>, <code>{"error"}</code>, and <code>{"terminated"}</code>. OpenSandbox owns the runtime status. Harakiri stores the control-plane record, TTL, expiration, routes, commands, snapshots, usage, and audit events around that runtime.</p>
        <p><code>{"terminated"}</code> is terminal. Reconnect can read the historical summary, but it does not resurrect a runtime.</p>
        <h2>Supported operations</h2>
        <p>Create starts a runtime from a template or a ready snapshot. Reconnect looks up an existing sandbox by ID and refreshes its summary. Renew extends the TTL and updates <code>{"expiresAt"}</code>. Kill terminates the runtime and removes active route records. Pause and resume delegate to provider lifecycle operations when available.</p>
        <h2>TTL and activity</h2>
        <p><strong>From 0.5.0-rc.3:</strong> renewal and expiration coordinate on the same deadline. Operators must stop the old scheduler, apply migration 036 and deploy matching API and scheduler versions. Earlier releases can expire a renewed sandbox at its original schedule.</p>
        <p>Commands and command sessions renew before execution. An attached terminal renews periodically. Reading status, files or metrics and following command output do not keep a sandbox alive. For long or detached jobs, choose sufficient TTL or explicitly renew before expiry.</p>
        <p>A successful renewal requires a running or idle native runtime; it cannot revive an expired sandbox. Reusing an <code>Idempotency-Key</code> replays the same renewal, not another extension. Read <code>expiresAt</code> after renewal to see the current deadline.</p>
        <h2>Snapshots</h2>
        <p>Snapshot creation stores a public Harakiri <code>{"snp_..."}</code> ID and keeps the provider snapshot ID internal. Restores use <code>{"POST /v1/sandboxes"}</code> with <code>{"snapshotId"}</code>, so SDK and CLI users never need provider-specific snapshot identifiers.</p>
        <h2>Capability gating</h2>
        <p>Runtime capabilities report <code>{"lifecyclePause"}</code>, <code>{"lifecycleResume"}</code>, <code>{"lifecycleSnapshot"}</code>, <code>{"snapshotList"}</code>, <code>{"snapshotDelete"}</code>, and <code>{"createFromSnapshot"}</code>. Product UI should enable these actions only when the capability state is <code>{"available"}</code>.</p>
        <h2>SDK</h2>
        <CodeBlock language="typescript">{`const sandbox = await harakiri.sandboxes.create({\n  template: "python-3.12-data",\n  wait: true,\n  ttlSeconds: 600\n});\n\nawait sandbox.pause();\nawait sandbox.resume();\n\nconst { snapshot } = await sandbox.snapshot({\n  name: "before-upgrade",\n  wait: true\n});\n\nawait harakiri.sandboxes.create({\n  snapshotId: snapshot.id,\n  name: "restored-runner",\n  wait: true\n});\n\nawait sandbox.kill();`}</CodeBlock>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri create --template python-3.12-data --name agent-runner --ttl 600\nharakiri pause sbx_...\nharakiri resume sbx_...\nharakiri snapshot sbx_... --name before-upgrade --wait\nharakiri snapshots list\nharakiri create --snapshot snp_... --name restored-runner\nharakiri capabilities\nharakiri kill sbx_...`}</CodeBlock>
        <h2>Cleanup</h2>
        <p>Use <code>{"kill"}</code> when your application owns the sandbox lifecycle. Use short TTLs when a caller may crash or lose the sandbox ID. For route-heavy flows, delete preview routes when the server stops and kill the sandbox when runtime work is done.</p>
      </>
    )
  },
  {
    id: "sandbox-processes",
    section: "Sandboxes",
    title: "Detached processes",
    lede: "Run servers, watchers, and background agents as tracked command resources that can be reattached by ID.",
    toc: ["Contract", "SDK", "CLI", "Failure modes", "Cleanup"],
    body: (
      <>
        <h2>Contract</h2>
        <p>Detached processes are OpenSandbox execd tracked commands persisted by Harakiri. Store the sandbox ID and command ID when a caller may restart or reconnect later. Command summaries include status, timestamps, exit code, finish reason, signal, redacted output, provider command ID, and log cursor/tail metadata.</p>
        <h2>SDK</h2>
        <CodeBlock language="typescript">{`const sandbox = await harakiri.sandboxes.create({\n  template: "python-3.12-data",\n  wait: true,\n  ttlSeconds: 600\n});\n\nconst { command } = await sandbox.processes.start({\n  command: "python -m http.server 3000 --bind 0.0.0.0",\n  cwd: "/workspace"\n});\n\nawait sandbox.processes.wait(command.id, { statuses: ["running"] });\nconst logs = await sandbox.processes.tail(command.id, 100);\nawait sandbox.processes.kill(command.id);`}</CodeBlock>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri process run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0" --detached --json\nharakiri command wait sbx_... cmd_... --status running\nharakiri command tail sbx_... cmd_... --lines 100\nharakiri command status sbx_... cmd_... --json\nharakiri command kill sbx_... cmd_...`}</CodeBlock>
        <h2>Failure modes</h2>
        <p>SDK callers receive typed errors for missing commands, provider unavailability, unsupported command transport, wait timeouts, and commands that reach <code>{"failed"}</code> or <code>{"killed"}</code> before success. Invalid cursor or tail parameters return validation errors.</p>
        <h2>Cleanup</h2>
        <p>Kill individual commands when a server should stop but the sandbox remains useful. Kill the sandbox when the integration owns the whole runtime lifecycle. Sandbox termination removes active route records.</p>
      </>
    )
  },
  {
    id: "filesystem-artifacts",
    section: "Sandboxes",
    title: "Filesystem and artifacts",
    lede: "Move files and binary artifacts through the public runtime contract without depending on provider internals.",
    toc: ["Contract", "Artifacts", "SDK", "CLI", "Dashboard", "Limits"],
    body: (
      <>
        <h2>Contract</h2>
        <p>Filesystem operations stay behind the OpenSandbox provider interface. Use sandbox paths, prefer the runtime <code>{"workdir"}</code>, and handle structured errors for missing paths, permission failures, directory/file mismatches, and provider unavailability.</p>
        <p>List responses include the resolved <code>{"cwd"}</code>, file entries, provider <code>{"source"}</code>, and optional <code>{"warnings"}</code>. Harakiri does not invent directory data when a provider is degraded.</p>
        <h2>Artifacts</h2>
        <p>Use artifacts for binary payloads, generated reports, and archives. The v1 transfer mode is <code>{"json-base64"}</code>; responses include <code>{"transfer.encoding=base64"}</code> and <code>{"transfer.maxBytes"}</code> so clients can reject unsupported modes before moving large files.</p>
        <h2>SDK</h2>
        <CodeBlock language="typescript">{`await sandbox.files.write({\n  path: "/workspace/task.txt",\n  content: "ready\\n",\n  createParents: true\n});\n\nconst uploaded = await sandbox.artifacts.upload({\n  path: "/workspace/out.bin",\n  contentBase64: Buffer.from("ok").toString("base64"),\n  sizeBytes: 2,\n  sha256: "sha256:..."\n});\n\nconst artifact = await sandbox.artifacts.download("/workspace/out.bin");\nconsole.log(uploaded.transfer.mode, artifact.sha256);`}</CodeBlock>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri files sbx_... --path /workspace\nharakiri file-write sbx_... --path /workspace/task.txt --content ready --parents\nharakiri file-upload sbx_... --path /workspace/out.bin --from ./out.bin --parents\nharakiri file-download sbx_... --path /workspace/out.bin --to ./out.bin\nharakiri file-download sbx_... --path /workspace/out.bin --json --to ./out.bin`}</CodeBlock>
        <h2>Dashboard</h2>
        <p>The Files tab shows directories, files, empty paths, loading state, provider source, and provider warnings. Very large directories are capped in the UI and should be narrowed by path.</p>
        <h2>Limits</h2>
        <p><code>{"SANDBOX_FILE_ARTIFACT_MAX_BYTES"}</code> controls the decoded artifact limit and defaults to 16 MiB. Large streaming, multipart uploads, or signed transfer URLs are future scale-up work after OpenSandbox exposes a matching provider contract.</p>
      </>
    )
  },
  {
    id: "routes",
    section: "Sandboxes",
    title: "Routes",
    lede: "Expose HTTP services from a sandbox with public or token-protected URLs.",
    toc: ["Access modes", "Readiness", "SDK", "CLI", "Cleanup"],
    body: (
      <>
        <h2>Access modes</h2>
        <p><code>{"public"}</code> returns the provider preview URL directly. <code>{"token"}</code> returns a Harakiri proxy URL plus a route token shown only when the route is created. Later route lists expose <code>{"tokenHint"}</code>, labels, creator metadata, provider IDs, readiness state, and <code>{"lastUsedAt"}</code>, but not the token value.</p>
        <h2>Readiness</h2>
        <p>Route state tells you whether the provider route exists. It does not prove the application server inside the sandbox has booted. Bind the server to <code>{"0.0.0.0"}</code>, expose the matching port, then poll a health path.</p>
        <CodeBlock language="bash">{`harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"\nharakiri expose sbx_... --port 3000 --wait --wait-path /`}</CodeBlock>
        <h2>SDK</h2>
        <CodeBlock language="typescript">{`const route = await harakiri.routes.exposeAndWait(sandbox.id, {\n  port: 5173,\n  accessMode: "token",\n  labels: ["preview"]\n}, {\n  path: "/health",\n  timeoutMs: 30_000\n});\n\nconst routeFetch = harakiri.routes.fetch(route);\nawait routeFetch("/health");`}</CodeBlock>
        <p>If an adapter needs synchronous <code>{"domain(port)"}</code> behavior, pre-expose the route and cache the returned summary by sandbox ID and port. Keep the one-time token in your application if the route is token-protected.</p>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri expose sbx_... --port 5173 --access token --label vite --wait --wait-path /\nharakiri routes sbx_... --json\nharakiri open sbx_... --port 5173 --token "$HARAKIRI_ROUTE_TOKEN"`}</CodeBlock>
        <h2>Cleanup</h2>
        <p>Use the Network tab delete control or <code>{"harakiri unexpose"}</code> when the preview is no longer needed. Sandbox termination also disables active route records.</p>
        <CodeBlock language="bash">{`harakiri unexpose sbx_... --port 5173`}</CodeBlock>
      </>
    )
  },
  {
    id: "outbound-access",
    section: "Sandboxes",
    title: "Outbound access",
    lede: "Limit which public domains a sandbox can reach without managing raw network-policy rules.",
    toc: ["Modes", "Presets", "Workspace", "Templates", "CLI", "API", "Troubleshooting"],
    body: (
      <>
        <h2>Modes</h2>
        <p>Use <code>{"open"}</code> for local prototyping, <code>{"restricted"}</code> when an agent should only reach selected domains, <code>{"blocked"}</code> for offline evaluation, and <code>{"custom"}</code> when you need explicit allow and deny rules.</p>
        <h2>Presets</h2>
        <p>Presets expand to domain rules for common workflows such as Python package installs, Node package installs, Git hosting, and model API calls. Templates can define defaults; sandbox creation can override them.</p>
        <h2>Workspace</h2>
        <p>Admins use Settings, Outbound access to choose the default mode for new templates, enable or disable presets, allow or block custom domains, and set the max expanded rules per sandbox. These guardrails apply to templates, new sandboxes, and runtime policy changes.</p>
        <h2>Templates</h2>
        <p>Use the Egress tab on a team template to store the outbound access default. New sandboxes inherit the template policy unless a create request explicitly overrides it.</p>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`harakiri create --template python-3.12-data --egress restricted --egress-preset python-package-install\nharakiri egress sbx_...\nharakiri egress allow sbx_... api.github.com\nharakiri egress block sbx_...\nharakiri egress test sbx_... https://pypi.org/simple`}</CodeBlock>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes/:id/egress</code></span>
        <span className="api-endpoint"><span className="api-method patch">PATCH</span><code>/v1/sandboxes/:id/egress</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/egress/test</code></span>
        <span className="api-endpoint"><span className="api-method patch">PATCH</span><code>/v1/templates/:id/egress</code></span>
        <CodeBlock language="bash">{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"python-3.12-data","egress":{"mode":"restricted","presets":["python-package-install"],"allow":["api.github.com"]}}'`}</CodeBlock>
        <h2>Troubleshooting</h2>
        <p>Open a sandbox, then use Network, Outbound access. Test access returns whether the target is reachable from inside the sandbox. If the provider status is unavailable, OpenSandbox did not return a ready egress sidecar endpoint.</p>
        <p>Test access depends on the sandbox image having a probe tool such as <code>{"curl"}</code>, <code>{"wget"}</code>, or <code>{"python3"}</code>. Minimal images can still enforce policy even when the test cannot run.</p>
      </>
    )
  },
  {
    id: "credential-vault",
    section: "Sandboxes",
    title: "Credential Vault",
    lede: "Attach credentials to selected outbound requests without putting the real value inside the sandbox process.",
    toc: ["Why", "Source types", "Provider presets", "Template slots", "CLI", "SDK", "API", "Lifecycle", "Security", "Troubleshooting"],
    body: (
      <>
        <h2>Why</h2>
        <p>Agent sandboxes often need model APIs, private Git hosts, package registries, or internal services. Credential Vault lets a sandbox call those services while Harakiri stores only sanitized metadata and the runtime provider injects auth only when the outbound request matches a binding.</p>
        <h2>Source types</h2>
        <p>Use <code>{"inline_ephemeral"}</code> when the caller already has a one-time value, <code>{"harakiri_encrypted"}</code> for reusable envelope-encrypted workspace custody, <code>{"external_ref"}</code> for an operator-approved Kubernetes Secret locator, and <code>{"dynamic"}</code> for a short-lived GitHub App installation token. All four use the same synchronous launch, template mapping, runtime attachment, inspection, test, and sanitized metadata contract. Harakiri forgets ephemeral values, never returns encrypted values, stores only external locators, and never persists issued dynamic tokens.</p>
        <p>Admins manage reusable sources and organization audit history in Vault. Members can use only active sources explicitly shared for organization-member use. The new-sandbox flow lists only sources available to the current caller.</p>
        <h2>Provider presets</h2>
        <p>Presets provide fake env names, auth shape, binding hosts, egress domains, and a default test target for common services. Built-ins cover OpenAI, Anthropic, OpenRouter, GitHub, GitLab, npm, and PyPI publish. Private APIs, self-hosted Git, and private package indexes should use explicit custom bindings.</p>
        <h2>Template slots</h2>
        <p>Templates can declare required and optional provider credentials without storing values. <code>{"credential_slots = [\"openai\"]"}</code> and <code>{"optional_credential_slots = [\"github\"]"}</code> become sanitized slot metadata on each immutable version. Structured <code>{"[[credential_slot]]"}</code> entries support a private API with one exact HTTPS host, bearer or API-key auth, and optional method/path restrictions. The dashboard uses the same schema and shows a binding preview.</p>
        <h2>CLI</h2>
        <CodeBlock language="bash">{`export OPENAI_API_KEY=placeholder\n\nharakiri vault presets\nharakiri vault preset openai\n\nharakiri template init \\\n  --name open-agents-dev \\\n  --dockerfile Dockerfile \\\n  --credential-slot openai\n\nharakiri create \\\n  --template open-agents-dev \\\n  --name agent-with-vault \\\n  --credential 'preset=openai,from-env=OPENAI_API_KEY'\n\nharakiri vault secrets create \\\n  --name openai-prod \\\n  --preset openai \\\n  --from-env OPENAI_API_KEY\n\nharakiri create \\\n  --template open-agents-dev \\\n  --name stored-vault-agent \\\n  --credential 'secret-id=vlt_...,name=openai-prod'\n\nharakiri create \\\n  --template open-agents-dev \\\n  --name slotted-vault-agent \\\n  --credential 'slot=llm,secret-id=vlt_...,name=openai-prod'\n\nharakiri vault attach sbx_... \\\n  --preset openai \\\n  --from-env OPENAI_API_KEY\n\nharakiri vault attach sbx_... \\\n  --preset openai \\\n  --prompt\n\nharakiri vault list sbx_...\nharakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models\nharakiri vault rehydrate sbx_...\nharakiri vault detach sbx_... sca_...\n\nharakiri vault attach-secret sbx_... vlt_... \\\n  --name openai-prod\n\nharakiri vault secrets list\nharakiri vault secrets rotate vlt_... --prompt\nharakiri vault secrets delete vlt_...`}</CodeBlock>
        <p>Use <code>{"--from-env"}</code>, <code>{"--from-stdin"}</code>, or <code>{"--prompt"}</code> so real values do not appear in shell history. <code>{"--credential"}</code> can select a preset, custom host, encrypted secret, external reference, or dynamic issuer, optionally mapped to a template slot. Creation is synchronous. <code>{"--member-use"}</code>, <code>{"share"}</code>, and <code>{"restrict"}</code> control reusable-source use without granting value readback. <code>{"vault inspect"}</code> and <code>{"vault rehydrate"}</code> diagnose and repair provider state.</p>
        <CodeBlock language="bash">{`harakiri vault references create \\
  --name "OpenAI from cluster" \\
  --preset openai \\
  --namespace harakiri \\
  --secret-name harakiri-vault-agents \\
  --key OPENAI_API_KEY \\
  --member-use

harakiri vault references validate xsr_...
harakiri vault attach-reference sbx_... xsr_...`}</CodeBlock>
        <p>External-reference commands manage locators and never accept a raw value. Use <code>{"--credential 'reference-id=xsr_...'"}</code> for a direct synchronous launch, optionally with <code>{"slot=..."}</code> for a template mapping.</p>
        <CodeBlock language="bash">{`harakiri vault issuers create \
  --name agent-repositories \
  --installation-id 123456 \
  --repository agent-runtime \
  --permission contents=read \
  --permission metadata=read
harakiri vault issuers validate dci_...
harakiri vault attach-issuer sbx_... dci_...
harakiri vault inspect sbx_...
harakiri vault audit --action-prefix credential_ --json`}</CodeBlock>
        <p>Dynamic issuer commands manage GitHub App installation scope, never the platform private key or issued token. <code>{"inspect"}</code> compares desired attachments with sanitized provider state. Source-management examples require an admin-created key with <code>credentials:manage</code>; audit queries need <code>audit:read</code>. See <a href="#docs/authorization">Authorization</a> for migration and runtime scopes.</p>
        <h2>SDK</h2>
        <CodeBlock language="typescript">{`import { credentialFromPreset } from "@h-sandbox/sdk";

await harakiri.createSandbox({
  template: "open-agents-dev",
  credentials: [credentialFromPreset("anthropic", process.env.ANTHROPIC_API_KEY!)]
});`}</CodeBlock>
        <CodeBlock language="typescript">{`const external = await harakiri.externalSecretReferences.create({
  name: "OpenAI from cluster",
  providerPresetId: "openai",
  resolverType: "kubernetes_secret",
  reference: {
    namespace: "harakiri",
    name: "harakiri-vault-agents",
    key: "OPENAI_API_KEY"
  }
});

await harakiri.externalSecretReferences.validate(external.reference.id);
await sandbox.credentials.attachReference(external.reference.id);`}</CodeBlock>
        <CodeBlock language="typescript">{`const { preset } = await harakiri.credentialPresets.get("openai");\n\nconst created = await harakiri.createSandbox({\n  template: "python-3.12-data",\n  credentials: [{\n    displayName: preset.label,\n    credentialName: preset.credentialName,\n    value: process.env.OPENAI_API_KEY!,\n    fakeEnv: preset.fakeEnv,\n    binding: preset.binding\n  }]\n});\n\nconsole.log(created.credentialAttachments?.[0]?.status);\n\nconst attachment = await sandbox.credentials.attach({\n  displayName: preset.label,\n  credentialName: preset.credentialName,\n  value: process.env.OPENAI_API_KEY!,\n  fakeEnv: preset.fakeEnv,\n  binding: preset.binding\n});\n\nconst test = await sandbox.credentials.test(attachment.attachment.id, {\n  target: preset.test.target,\n  timeoutMs: 10_000\n});\n\nawait sandbox.credentials.detach(attachment.attachment.id);\n\nconst secret = await harakiri.credentialSecrets.create({\n  name: "openai-prod",\n  providerPresetId: "openai",\n  value: process.env.OPENAI_API_KEY!,\n  fakeEnv: preset.fakeEnv\n});\n\nawait harakiri.createSandbox({\n  template: "open-agents-dev",\n  credentials: [{\n    sourceType: "harakiri_encrypted",\n    secretId: secret.secret.id,\n    displayName: "OpenAI production"\n  }]\n});\n\nawait harakiri.createSandbox({\n  template: "open-agents-dev",\n  credentialMappings: [{\n    slotId: "llm",\n    source: {\n      sourceType: "harakiri_encrypted",\n      secretId: secret.secret.id,\n      displayName: "OpenAI production"\n    }\n  }]\n});\n\nawait sandbox.credentials.attachSecret(secret.secret.id, {\n  displayName: "OpenAI production"\n});\n\nawait sandbox.credentials.rehydrate();\n\nawait harakiri.credentialSecrets.rotate(secret.secret.id, {\n  value: process.env.OPENAI_API_KEY_NEXT!\n});`}</CodeBlock>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-presets</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-presets/:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-secrets</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets</code></span>
        <span className="api-endpoint"><span className="api-method post">PATCH</span><code>/v1/credential-secrets/:id</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/rotate</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/disable</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/enable</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/credential-secrets/:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/external-secret-references</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/external-secret-references</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/external-secret-references/:id/validate</code></span>
        <span className="api-endpoint"><span className="api-method patch">PATCH</span><code>/v1/external-secret-references/:id</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/external-secret-references/:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/dynamic-credential-issuers</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/dynamic-credential-issuers</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/dynamic-credential-issuers/:id/validate</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/audit-events</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates</code><span>with credentialSlots</span></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes</code><span>with credentials or credentialMappings</span></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes/:id/credentials</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials/inspect</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials/rehydrate</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials/:attachmentId/refresh</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/sandboxes/:id/credentials/:attachmentId</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials/:attachmentId/test</code></span>
        <p>Create-time credentials accept one-time values, encrypted workspace sources, Kubernetes external references, GitHub App dynamic issuers, or template mappings to any of them. Slot mappings use the template's binding, fake env, and egress hosts. Required slots must be mapped explicitly. Creation is synchronous and rolls back if safe egress or any attachment fails. Responses never return a real credential value.</p>
        <h2>Lifecycle</h2>
        <p>Provider vault state is observed, not assumed. Resume and background inspection rehydrate active encrypted, external, and dynamic sources. Ephemeral sources become <code>{"requires_reinjection"}</code>. Snapshot restore requires explicit source mappings and never inherits provider vault state.</p>
        <h2>Security</h2>
        <p>Credential-bearing sandboxes use restricted outbound access with binding destinations. OpenSandbox injection requires Credential Proxy, <code>{"dns+nft"}</code>, and a positive runtime readiness attestation. Harakiri does not fall back to Kubernetes exec, mounted Secrets, sidecar URLs, open egress, or real sandbox env vars.</p>
        <h2>Troubleshooting</h2>
        <p><code>{"credential_vault_egress_conflict"}</code> means the runtime cannot attest safe <code>{"dns+nft"}</code> enforcement. <code>{"credential_vault_unsupported"}</code> means the provider lacks the capability; <code>{"credential_vault_provider_unavailable"}</code> means its sidecar cannot be reached. <code>{"binding_mismatch"}</code> is a caller error. <code>{"requires_reinjection"}</code> means desired metadata exists but provider state is absent. Run <code>{"vault inspect"}</code> and <code>{"vault rehydrate"}</code>; supply a fresh value for an ephemeral source.</p>
      </>
    )
  },
  {
    id: "custom-templates",
    section: "Templates",
    title: "Create a custom template",
    lede: "Define an OpenSandbox-compatible runtime once, build it, then create sandboxes by template name or alias.",
    toc: ["Config", "Dashboard", "Build", "Run"],
    body: (
      <>
        <h2>Config</h2>
        <CodeBlock language="bash">{`harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --port 5173 --tag hot --credential-slot openai`}</CodeBlock>
        <CodeBlock language="toml">{`name = "open-agents-dev"\nid = "open-agents-dev"\ndockerfile = "Dockerfile"\nvisibility = "private"\nruntime_family = "custom"\ncpu_count = 2\nmemory_mb = 2048\nworkdir = "/workspace"\nports = [3000, 5173]\ntags = ["hot"]\naliases = ["open-agents-dev"]\negress_mode = "restricted"\negress_presets = ["python-package-install", "git-hosting"]\nstart_command = "sleep 3600"\nready_command = "true"\ncredential_slots = ["openai"]`}</CodeBlock>
        <h2>Dashboard</h2>
        <p>Use Templates, New template when you want to start from the browser. The flow can create a template from a pasted or uploaded Dockerfile, import an existing OCI image, or clone an existing template into your workspace. Set Outbound access during creation when the runtime should start restricted by default. Enable Hot image pre-pull for templates you expect to start frequently. The right panel previews the generated <code>{"harakiri.toml"}</code> before submit so the dashboard and CLI stay aligned.</p>
        <h2>Build</h2>
        <CodeBlock language="bash">{`harakiri template build --name open-agents-dev .\nharakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template build --name open-agents-dev . --no-wait\nharakiri template logs bld_...`}</CodeBlock>
        <p>The CLI uploads Dockerfile contexts as verified tar+gzip archives, follows build logs by default, and prints the final version, digest, duration, and next create command. A new template definition cannot create sandboxes until a build succeeds and creates a ready digest-pinned version. Tag frequently used templates as <code>{"hot"}</code> when you want the platform to pre-pull the resulting image on cluster nodes after a successful build. Use <code>{"--no-wait"}</code> when you want to enqueue and inspect later.</p>
        <h2>Run</h2>
        <CodeBlock language="bash">{`harakiri create --template open-agents-dev --name agent-runner\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner`}</CodeBlock>
        <p>The Templates List filters by visibility, owner, runtime family, and active/archived status. Rows show created and updated timestamps, aliases, latest build status, and latest image version or digest. Open shows the template detail panel with Overview, Versions, Egress, Config, and Runs tabs. Overview gives the create command and SDK snippet. Versions shows immutable version IDs and aliases. Egress stores the template's outbound access default for new sandboxes. Config shows the generated <code>{"harakiri.toml"}</code> plus redacted build args and metadata. Runs shows recent sandboxes created from the selected template and the exact version/digest selected at create time.</p>
        <p>Row actions provide Use, Build, Builds, Promote, Archive, and Copy ID. Use is enabled only after a ready version exists. Shared platform templates can be used by every workspace; Build, Promote, and Archive are limited to team-owned templates. Builds opens the Builds tab filtered to that template, and Promote marks the latest ready version as <code>{"stable"}</code>; use <code>{"template:stable"}</code> when you want the stable channel and <code>{"tplv_..."}</code> when you need an immutable pin.</p>
      </>
    )
  },
  {
    id: "template-builds",
    section: "Templates",
    title: "Template builds",
    lede: "Build records make template image creation inspectable from the API, CLI, and dashboard.",
    toc: ["Statuses", "Logs", "Retention", "Retry", "Troubleshooting", "Archive", "Limits"],
    body: (
      <>
        <h2>Statuses</h2>
        <p>Builds move through <code>{"queued"}</code>, <code>{"building"}</code>, <code>{"success"}</code>, <code>{"failed"}</code>, or <code>{"canceled"}</code>. The CLI follows logs and status by default; retry creates a new queued build linked to the original. Successful builds show the resulting template version ID, Kubernetes builder pod and node when available, runtime pull preflight status, optional hot-template image pre-pull status, and context metadata in the dashboard detail pane. A template becomes runnable only after one of those successful builds creates a ready version.</p>
        <CodeBlock language="bash">{`harakiri template build --name open-agents-dev .\nharakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template builds --status queued\nharakiri template builds --query ubuntu-import`}</CodeBlock>
        <h2>Logs</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <CodeBlock language="bash">{`harakiri template logs bld_...`}</CodeBlock>
        <h2>Retention</h2>
        <p>Build logs and uploaded Dockerfile contexts are retained for debugging, then pruned by the scheduler after the workspace operator policy window. Old unused versions are marked <code>{"retired"}</code> instead of deleted, so existing audit records still show which image digest a sandbox used.</p>
        <h2>Retry</h2>
        <p>Use retry after a failed or canceled build. Use promote only for ready template versions.</p>
        <CodeBlock language="bash">{`curl -X POST "$PUBLIC_API_URL/v1/template-builds/bld_.../retry" -H "x-api-key: $HK_KEY"\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable`}</CodeBlock>
        <h2>Troubleshooting</h2>
        <p>When a build fails, open the Builds tab and select the failed row. The detail panel keeps the redacted error, retained logs, context hash, and any Kubernetes builder pod/node metadata. Registry lookup failures usually mean the image tag does not exist, is private, or did not return a digest. Runtime pull preflight failures mean the image was built or imported but the cluster could not pull the final digest. Optional hot-template pre-pull failures mean the image is ready, but the cluster could not warm every node cache. Dockerfile failures should be debugged from the retained logs first, then retried after the source changes.</p>
        <h2>Archive</h2>
        <p>Archive a template when it should no longer appear in active lists or be used for new sandboxes. Existing sandboxes keep running; queued or building template builds are canceled.</p>
        <CodeBlock language="bash">{`harakiri template archive open-agents-dev\ncurl -X POST "$PUBLIC_API_URL/v1/templates/open-agents-dev/archive" -H "x-api-key: $HK_KEY"`}</CodeBlock>
        <h2>Limits</h2>
        <p>If a template asks for more CPU, memory, or default ports than the workspace allows, the API returns <code>{"template_resource_limit_exceeded"}</code>. If too many builds are already queued or building, it returns <code>{"template_build_concurrency_limit_exceeded"}</code>. Image and Dockerfile base-image policy failures return <code>{"template_image_policy_violation"}</code>.</p>
      </>
    )
  },
  {
    id: "template-troubleshooting",
    section: "Templates",
    title: "Template troubleshooting",
    lede: "Use the dashboard, CLI, and API records to recover from failed builds, registry pull problems, route setup, and alias mistakes.",
    toc: ["Failed builds", "Registry pull", "Environment", "Aliases", "Routes"],
    body: (
      <>
        <h2>Failed builds</h2>
        <p>Select the failed row in Templates, Builds. The detail panel shows the redacted error, retained logs, context digest, source image, Dockerfile path, and builder pod/node metadata when the Kubernetes builder started. Use Retry only after changing the source image, Dockerfile, or policy setting that caused the failure. Very old logs and uploaded contexts can disappear after the operator retention window, but the build status and audit trail remain.</p>
        <CodeBlock language="bash">{`harakiri template builds --status failed\nharakiri template logs bld_...\nharakiri template build --name open-agents-dev .`}</CodeBlock>
        <h2>Registry pull</h2>
        <p>Image imports fail before a version is ready when the registry cannot return a manifest digest. Builds also fail before ready if runtime pull preflight cannot pull the final digest from the cluster. Check spelling, tag existence, registry visibility, workspace image policy, and whether the runtime registry host is reachable from k0s. A template without a ready version returns <code>{"template_not_ready"}</code> when you try to create a sandbox. Private runtime images can use a matching registry credential; if the credential includes encrypted username/password material, sandbox create passes it to OpenSandbox for the image pull. Dockerfile builds can also fail if the <code>{"FROM"}</code> image is private or denied by policy.</p>
        <CodeBlock language="bash">{`harakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template inspect ubuntu-import`}</CodeBlock>
        <h2>Environment</h2>
        <p>Environment variables are chosen when the sandbox is created. They are not added retroactively to an existing sandbox. Use <code>{"harakiri run --env KEY=value"}</code> only when the command creates a temporary sandbox for the run.</p>
        <CodeBlock language="bash">{`harakiri create --template open-agents-dev --env HARAKIRI_ENV_SMOKE=env-ok\nharakiri run --template open-agents-dev --env HARAKIRI_ENV_SMOKE=env-ok --cmd "printenv HARAKIRI_ENV_SMOKE"`}</CodeBlock>
        <h2>Aliases</h2>
        <p>If <code>{"harakiri create --template ..."}</code> cannot resolve a template, inspect the template ID, aliases, visibility, and archive status. Use <code>{"template:stable"}</code> for a promoted channel and the immutable version ID when you need to prove exactly which image digest was selected. Bare aliases like <code>{"stable"}</code> become ambiguous when several templates have the same alias, so prefer the qualified form.</p>
        <CodeBlock language="bash">{`harakiri template list\nharakiri template inspect open-agents-dev\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner`}</CodeBlock>
        <h2>Routes</h2>
        <p>Route failures are usually separate from template builds. Start the server on <code>{"0.0.0.0"}</code> inside the sandbox, expose the matching port, then open the route from the Network tab or CLI. A server bound only to <code>{"127.0.0.1"}</code> will not be reachable through the public route.</p>
        <CodeBlock language="bash">{`harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"\nharakiri expose sbx_... --port 3000 --wait --wait-path /\nharakiri routes sbx_...`}</CodeBlock>
      </>
    )
  },
  {
    id: "sdk-usage",
    section: "Templates",
    title: "Using templates from SDKs",
    lede: "The SDK uses the same API surface as the dashboard and CLI, so template aliases work consistently.",
    toc: ["JavaScript", "HTTP", "Python"],
    body: (
      <>
        <h2>JavaScript</h2>
        <CodeBlock language="typescript">{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst client = new HarakiriClient({ apiUrl: process.env.HARAKIRI_API_URL!, apiKey: process.env.HARAKIRI_API_KEY! });\nconst { sandbox } = await client.createSandbox({\n  template: "open-agents-dev:stable",\n  ttlSeconds: 300,\n  env: { HARAKIRI_ENV_SMOKE: "env-ok" }\n});\nawait client.runSandbox(sandbox.id, { command: "printenv HARAKIRI_ENV_SMOKE" });`}</CodeBlock>
        <h2>HTTP</h2>
        <CodeBlock language="bash">{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"open-agents-dev:stable","ttlSeconds":300,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}'`}</CodeBlock>
        <h2>Python</h2>
        <p>A Python SDK is not shipped in this prototype yet. Use the HTTP API from Python until the SDK package is added.</p>
      </>
    )
  },
  {
    id: "open-agents-template",
    section: "Templates",
    title: "Open Agents template",
    lede: "The Open Agents pilot template packages browser automation, code editing, JavaScript, and Python tools for agent runtimes.",
    toc: ["Included tools", "Build", "Ports", "Smoke test", "Expose a route"],
    body: (
      <>
        <h2>Included tools</h2>
        <ul><li><code>{"bun"}</code>, <code>{"node"}</code>, <code>{"pnpm"}</code>, <code>{"npm"}</code>, and <code>{"yarn"}</code></li><li><code>{"agent-browser"}</code> and Chromium headless dependencies</li><li><code>{"code-server"}</code>, <code>{"git"}</code>, <code>{"jq"}</code>, and Python</li><li>Writable <code>{"/workspace"}</code> directory</li></ul>
        <h2>Build</h2>
        <CodeBlock language="bash">{`harakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template builds --query open-agents-dev\nharakiri template logs bld_...`}</CodeBlock>
        <h2>Ports</h2>
        <p>Use <code>{"3000"}</code>, <code>{"5173"}</code>, <code>{"4321"}</code>, and <code>{"8000"}</code> as default exposed-port candidates for web apps, Vite, code-server, and API servers.</p>
        <h2>Smoke test</h2>
        <CodeBlock language="bash">{`harakiri create --template open-agents-dev --name pilot\nharakiri run sbx_... --cmd "harakiri-open-agents-smoke"`}</CodeBlock>
        <h2>Expose a route</h2>
        <p>Bind your dev server to <code>{"0.0.0.0"}</code>, then expose the internal port.</p>
        <CodeBlock language="bash">{`harakiri run sbx_... --cmd "nohup node -e \\"require('http').createServer((req,res)=>res.end('ok')).listen(3000,'0.0.0.0')\\" >/tmp/app.log 2>&1 &"\nharakiri expose sbx_... --port 3000 --wait --wait-path /`}</CodeBlock>
      </>
    )
  },
  {
    id: "opencode-template",
    section: "Templates",
    title: "OpenCode template",
    lede: "Build a coding-agent sandbox with OpenCode installed, then choose TUI, headless run, or route-exposed server mode.",
    toc: ["Included tools", "Build", "Run", "SDK", "Server route", "Troubleshooting"],
    body: (
      <>
        <h2>Included tools</h2>
        <ul><li><code>{"opencode"}</code> from a pinned <code>{"opencode-ai"}</code> package</li><li>Node 22, <code>{"npm"}</code>, <code>{"pnpm"}</code>, and <code>{"yarn"}</code></li><li>Python, Git, jq, ripgrep, fd, curl, and SSH tools</li><li>Writable <code>{"/workspace"}</code> directory</li><li>Default route candidate ports <code>{"4096"}</code>, <code>{"3000"}</code>, and <code>{"5173"}</code></li></ul>
        <h2>Build</h2>
        <CodeBlock language="bash">{`harakiri template build --name opencode examples/templates/opencode\nharakiri template smoke opencode --cmd "harakiri-opencode-smoke"\nharakiri template promote opencode --version-id tplv_... --alias stable`}</CodeBlock>
        <p>The smoke command verifies the installed tools, writable workspace, OpenCode CLI help, and a local OpenCode <code>{"/global/health"}</code> response. It does not require model provider credentials.</p>
        <h2>Run</h2>
        <CodeBlock language="bash">{`harakiri create --template opencode --name opencode-agent --ttl 1200\nharakiri attach sbx_... --cwd /workspace\n\nharakiri create --template opencode --name opencode-runner\nharakiri run sbx_... --cwd /workspace --cmd \\\n  'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"'`}</CodeBlock>
        <p>Use the attached terminal for the OpenCode TUI. Use <code>{"opencode run"}</code> for automation. The example uses an OpenCode Zen free model; paid or bring-your-own-key models can still receive provider credentials as sandbox environment variables.</p>
        <h2>SDK</h2>
        <p>Use <code>{"@h-sandbox/sdk"}</code> to create the sandbox, run headless prompts, clone repositories, read diffs, and expose the OpenCode server without depending on OpenSandbox or Kubernetes internals.</p>
        <CodeBlock language="typescript">{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({ apiUrl: process.env.HARAKIRI_API_URL!, apiKey: process.env.HARAKIRI_API_KEY! });\nconst { sandbox } = await harakiri.createSandbox({\n  template: "opencode",\n  wait: true,\n  ttlSeconds: 1200,\n  egress: { mode: "restricted", presets: ["git-hosting", "llm-apis"] }\n});\n\nconst run = await harakiri.runSandbox(sandbox.id, {\n  command: 'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"',\n  cwd: "/workspace",\n  timeoutMs: 300_000\n});\nconsole.log(run.result.stdout);\nawait harakiri.killSandbox(sandbox.id);`}</CodeBlock>
        <p>For the server mode, start <code>{"opencode serve"}</code>, then use <code>{"routes.exposeAndWait"}</code>, <code>{"routes.headers"}</code>, and <code>{"routes.fetch"}</code> to pass Harakiri route-token auth and OpenCode basic auth to HTTP clients.</p>
        <CodeBlock language="typescript">{`import { createOpencodeClient } from "@opencode-ai/sdk";\n\nconst password = crypto.randomUUID();\nconst route = await harakiri.routes.exposeAndWait(sandbox.id, {\n  port: 4096,\n  accessMode: "token",\n  labels: ["opencode"]\n}, {\n  path: "/global/health",\n  basicAuth: { username: "opencode", password },\n  expect: async (response) => response.ok && (await response.clone().json()).healthy === true\n});\n\nconst opencode = createOpencodeClient({\n  baseUrl: route.route.url,\n  fetch: harakiri.routes.fetch(route, {\n    basicAuth: { username: "opencode", password }\n  })\n});\nawait opencode.config.get();`}</CodeBlock>
        <h2>Server route</h2>
        <p>OpenCode's server defaults to loopback. Start it on <code>{"0.0.0.0"}</code> before exposing port <code>{"4096"}</code>, and protect the route with a Harakiri route token.</p>
        <CodeBlock language="bash">{`harakiri create \\\n  --template opencode \\\n  --name opencode-server \\\n  --ttl 1200 \\\n  --env OPENCODE_SERVER_PASSWORD="$(openssl rand -hex 16)"\n\nharakiri run sbx_... --cwd /workspace --cmd \\\n  'nohup opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode.log 2>&1 &'\n\nharakiri expose sbx_... --port 4096 --access token --label opencode --wait --wait-path /global/health\nharakiri routes sbx_...`}</CodeBlock>
        <p>The OpenCode username defaults to <code>{"opencode"}</code>. The CLI prints the route URL and token header once when a token-protected route is created; later route lists show only a token hint.</p>
        <h2>Troubleshooting</h2>
        <p>If the route is not reachable, check that OpenCode was started with <code>{"--hostname 0.0.0.0"}</code>. If <code>{"opencode run"}</code> fails, verify the selected model and any provider keys required by that model. If the template is not runnable, inspect the latest build with <code>{"harakiri template builds --query opencode"}</code> and <code>{"harakiri template logs bld_..."}</code>.</p>
      </>
    )
  },
  {
    id: "security-model",
    section: "Reference",
    title: "Security model",
    lede: "Custom templates are untrusted inputs until the builder, registry, digest, and promotion checks succeed.",
    toc: ["Visibility", "Digests", "Secrets", "Runtime metadata", "Image policy", "Provenance", "Audit", "Limits"],
    body: (
      <>
        <h2>Visibility</h2>
        <p>Organization membership and API-key scopes are a separate boundary from template visibility. See <a href="#docs/authorization">Authorization and API keys</a> for roles, scoped credentials, expiry and upgrade requirements.</p>
        <p><code>{"private"}</code>, <code>{"internal"}</code>, and <code>{"public"}</code> control product visibility. Team-owned templates are visible only inside the owning workspace. Platform <code>{"public"}</code> and <code>{"internal"}</code> templates are shared for sandbox creation, while platform <code>{"private"}</code> templates stay hidden. Build, promote, archive, logs, and uploaded contexts remain scoped to the owning workspace.</p>
        <h2>Digests</h2>
        <p>Mutable tags can be accepted as input, but ready versions store an immutable image digest and pass runtime pull preflight before production use.</p>
        <h2>Secrets</h2>
        <p>Registry passwords and build secrets should live in Kubernetes Secrets, an external secret manager, or encrypted registry credential records. API responses show only whether an encrypted secret exists plus the configured pull or push Secret references. When encrypted pull credentials match a private runtime image, Harakiri can pass them to OpenSandbox for the image pull without returning the password through the API.</p>
        <h2>Runtime metadata</h2>
        <p>Every sandbox create request carries label-safe Harakiri metadata for the sandbox, organization, template, template version, image digest, and current route policy. API responses also expose a typed runtime metadata object for workdir, user, shell, default ports, exposed routes, egress mode, artifact and command limits, TTL, and provider capability states.</p>
        <h2>Image policy</h2>
        <p>Template images, image-import builds, and Dockerfile <code>{"FROM"}</code> references must match the workspace registry and prefix policy before a build can run. Generated Dockerfile images are stored under an organization-scoped registry namespace so teams do not share one flat repository path.</p>
        <h2>Provenance</h2>
        <p>Template versions keep SBOM references, provenance, runtime pull preflight status, optional hot-template pre-pull status, scan status, and scan summaries. Without a scanner hook, new versions are marked <code>{"not_scanned"}</code> with the reason <code>{"scanner_not_configured"}</code>. When operators configure a scanner webhook, the builder stores the scanner status such as <code>{"clean"}</code>, <code>{"vulnerable"}</code>, <code>{"blocked"}</code>, or <code>{"scan_failed"}</code> on the immutable version.</p>
        <h2>Audit</h2>
        <p>Template create, build create, build cancel, retry, builder success or failure, promote, archive, version retirement, and sandbox create actions are stored as audit events with redacted metadata.</p>
        <h2>Limits</h2>
        <p>Template CPU, memory, default ports, and active queued/building builds are capped by the workspace policy so one team cannot exhaust builder capacity.</p>
      </>
    )
  },
  {
    id: "errors-troubleshooting",
    section: "Reference",
    title: "Errors and troubleshooting",
    lede: "Handle Harakiri failures through stable API error codes, SDK error classes, and provider capability states.",
    toc: ["API shape", "SDK classes", "Retry", "Common fixes", "Boundary"],
    body: (
      <>
        <h2>API shape</h2>
        <CodeBlock language="json">{`{\n  "error": "runtime_files_unavailable",\n  "message": "Filesystem provider is unavailable.",\n  "details": { "provider": "opensandbox" }\n}`}</CodeBlock>
        <p>Use HTTP status for coarse handling and the <code>{"error"}</code> field for product behavior. Do not parse human messages.</p>
        <h2>SDK classes</h2>
        <p>The SDK maps common responses to typed errors such as <code>{"HarakiriAuthenticationError"}</code>, <code>{"HarakiriValidationError"}</code>, <code>{"HarakiriNotFoundError"}</code>, <code>{"HarakiriProviderUnavailableError"}</code>, <code>{"HarakiriUnsupportedCapabilityError"}</code>, and <code>{"HarakiriCommandEndedError"}</code>.</p>
        <h2>Retry</h2>
        <p>Retry idempotent creates, waits, route readiness, and provider-unavailable reads with backoff. Do not blindly retry validation errors, auth failures, terminated sandboxes, resource-limit failures, or artifact checksum mismatches.</p>
        <h2>Common fixes</h2>
        <p><code>{"sandbox_file_artifact_checksum_mismatch"}</code> means the caller must recompute <code>{"sha256"}</code> over raw bytes. <code>{"route_proxy_upstream_unreachable"}</code> usually means the server is not listening on <code>{"0.0.0.0"}</code> or the wrong port was exposed. <code>{"git_network_access_failed"}</code> usually needs the <code>{"git-hosting"}</code> egress preset or explicit host allow rules. <code>{"template_not_ready"}</code> requires a successful digest-pinned template build.</p>
        <h2>Boundary</h2>
        <p>Application integrations should recover through Harakiri API, SDK, CLI, and documented route URLs. Do not reach into Kubernetes pods or provider endpoint credentials from application code.</p>
      </>
    )
  },
  {
    id: "api-reference",
    section: "Reference",
    title: "API reference",
    lede: "The Harakiri API is the shared contract behind the dashboard, CLI, and SDK.",
    toc: ["OpenAPI", "Authentication", "Templates", "Builds", "Sandboxes", "Credential Vault", "Promotion", "Archive"],
    body: (
      <>
        <h2>OpenAPI</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/openapi.json</code></span>
        <p>The deployed OpenAPI document is the complete schema for that server version. The groups below are a navigation aid, not a replacement for its request bodies, response schemas and error contracts.</p>
        <CodeBlock language="bash">{`curl --fail-with-body "$HARAKIRI_API_URL/openapi.json" \\
  --output openapi.json`}</CodeBlock>
        <p>The repository keeps the same OpenAPI contract in <code>{"docs/openapi.json"}</code>. Use it for generated clients, contract review, and external integration checks.</p>
        <h2>Authentication</h2>
        <p>Resource operations accept an organization-scoped API key in <code>x-api-key</code> or a valid Keycloak bearer token. Keep API keys on the trusted caller, not in frontend bundles or sandbox files. The organization comes from the authenticated identity.</p>
        <p>Start with <a href="#docs/quickstart">the quickstart</a> for connection setup, <a href="#docs/security-model">the security model</a> for access boundaries, and <a href="#docs/errors-troubleshooting">errors and troubleshooting</a> for failures. Workspace operations have a dedicated <a href="#docs/workspace-reference">API, SDK and CLI reference</a>.</p>
        <h2>Templates</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates/:id/versions</code></span>
        <h2>Builds</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/builds</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/template-builds/:id/context</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <p>Use <code>{"GET /v1/template-builds?template=open-agents-dev&limit=20"}</code> when a UI or script needs recent build records for one template.</p>
        <h2>Sandboxes</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes?template=:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes?templateVersionId=:id</code></span>
        <p>The template detail Runs tab uses these filters to show recent sandboxes for a template or an immutable version.</p>
        <h2>Credential Vault</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-presets</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-presets/:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/credential-secrets</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets</code></span>
        <span className="api-endpoint"><span className="api-method post">PATCH</span><code>/v1/credential-secrets/:id</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/rotate</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/disable</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/credential-secrets/:id/enable</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/credential-secrets/:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes/:id/credentials</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/sandboxes/:id/credentials/:attachmentId</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/credentials/:attachmentId/test</code></span>
        <p>The current vault API supports running-sandbox <code>{"inline_ephemeral"}</code> attachments, admin-managed encrypted workspace secret custody, explicit organization-member use policy, attachment-derived usage, and attaching permitted active stored secrets to running sandboxes. Responses are sanitized and never include raw credential values.</p>
        <h2>Promotion</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/promote</code></span>
        <h2>Archive</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/archive</code></span>
        <h2>Registry credentials</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/registry-credentials</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/registry-credentials</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/registry-credentials/:id</code></span>
        <p>Credential responses include registry host, purpose, repository prefix, Secret references, <code>{"lastUsedAt"}</code>, and <code>{"hasEncryptedSecret"}</code>, never the raw registry secret.</p>
      </>
    )
  }
];
