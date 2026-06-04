import type React from "react";

export type DocPage = {
  id: string;
  section: string;
  title: string;
  lede: string;
  toc: string[];
  body: React.ReactNode;
};

export const docPages: DocPage[] = [
  {
    id: "quickstart",
    section: "Getting started",
    title: "Quickstart",
    lede: "Spawn a sealed Python sandbox, run code in it, expose a port, and end it from the dashboard or CLI.",
    toc: ["Install", "Create", "Expose", "Next"],
    body: (
      <>
        <h2>Install</h2>
        <pre>{`npm install -g @h-sandbox/cli\nharakiri login --api-url https://sb-api.harakiri.io --api-key hk_live_...`}</pre>
        <h2>Create</h2>
        <pre>{`harakiri create --template python-3.12-data --name first-agent --ttl 600\nharakiri run sbx_... --cmd "python --version"\nharakiri kill sbx_...`}</pre>
        <h2>Expose</h2>
        <pre>{`harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0"\nharakiri expose sbx_... --port 3000\nharakiri routes sbx_...`}</pre>
        <h2>Next</h2>
        <p>Use SDK and CLI when integrating Harakiri into an application. Use Templates when you need a project-specific image with dependencies already installed.</p>
      </>
    )
  },
  {
    id: "sdk-cli",
    section: "Getting started",
    title: "SDK and CLI",
    lede: "Use the public npm packages for application integrations and local automation.",
    toc: ["Packages", "Configure", "Sandbox object", "SDK flow", "Git", "Git troubleshooting", "CLI flow", "Terminal", "Contract"],
    body: (
      <>
        <h2>Packages</h2>
        <p>`@h-sandbox/sdk` is the TypeScript integration package. `@h-sandbox/cli` installs the `harakiri` executable for local development and CI scripts.</p>
        <pre>{`npm install @h-sandbox/sdk\nnpm install -g @h-sandbox/cli`}</pre>
        <h2>Configure</h2>
        <p>Create an API key in the dashboard, then pass it through environment variables or `harakiri login`. Browser sign-in still belongs to Keycloak; API keys are for server-side integrations and local tools.</p>
        <pre>{`export HARAKIRI_API_URL=https://sb-api.harakiri.io\nexport HARAKIRI_API_KEY=hk_live_...\nharakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"`}</pre>
        <h2>Sandbox object</h2>
        <p>`HarakiriSandbox` wraps one sandbox ID and binds commands, files, routes, egress, logs, metrics, and lifecycle methods to that sandbox. Use `refresh()` or `wait()` when your code needs an updated cached summary.</p>
        <pre>{`import { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({\n  apiUrl: process.env.HARAKIRI_API_URL!,\n  apiKey: process.env.HARAKIRI_API_KEY!\n});\n\nconst sandbox = await harakiri.sandboxes.create({\n  template: "python-3.12-data",\n  wait: false,\n  ttlSeconds: 600,\n  idempotencyKey: "job-123"\n});\n\nawait sandbox.wait();\nawait sandbox.files.write({\n  path: "/workspace/task.py",\n  content: "print(2 + 2)\\n",\n  createParents: true\n});\nconst run = await sandbox.run({ command: "python /workspace/task.py" });\nconsole.log(run.result.stdout);\n\nconst reconnected = await HarakiriSandbox.connect(harakiri, sandbox.id);\nconsole.log(reconnected.summary.status);\nawait sandbox.kill();`}</pre>
        <h2>SDK flow</h2>
        <pre>{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({\n  apiUrl: process.env.HARAKIRI_API_URL!,\n  apiKey: process.env.HARAKIRI_API_KEY!\n});\n\nconst { sandbox } = await harakiri.createSandbox({\n  template: "python-3.12-data",\n  ttlSeconds: 600,\n  idempotencyKey: "job-123",\n  egress: { mode: "restricted", presets: ["python-package-install"] }\n});\n\nawait harakiri.waitForSandbox(sandbox.id);\nconst result = await harakiri.runSandbox(sandbox.id, {\n  command: "python -c 'print(2 + 2)'",\n  cwd: "/workspace"\n});\nconsole.log(result.result.stdout);\nawait harakiri.killSandbox(sandbox.id);`}</pre>
        <h2>Git</h2>
        <p>Use <code>source: {"{ type: \"git\" }"}</code> when a sandbox should start from a repository. The SDK creates the sandbox normally, sends only sanitized source provenance to the API, waits for readiness, and clones through the tracked command API. For restricted egress, the <code>git-hosting</code> preset is added automatically unless disabled.</p>
        <pre>{`const sandbox = await harakiri.sandboxes.create({\n  template: "open-agents-dev",\n  egress: { mode: "restricted", presets: ["llm-apis"] },\n  source: {\n    type: "git",\n    url: "https://github.com/acme/project.git",\n    branch: "main",\n    targetPath: "/workspace/project",\n    shallow: true\n  }\n});\n\nconst status = await sandbox.git.status({ cwd: "/workspace/project" });\nconsole.log(status.branch, status.clean);`}</pre>
        <p>Private HTTPS repositories use one-shot token credentials by default. Command records store environment variable names, not token values, and the SDK resets `origin` to a credential-free URL after clone. The sandbox summary exposes a safe source status trail for dashboards and reconnect flows.</p>
        <h2>Git troubleshooting</h2>
        <p>If Git is unavailable, SDK calls throw `HarakiriGitUnsupportedRuntimeError` with code `git_runtime_unsupported`; use a template that includes the `git` binary, such as `open-agents-dev`, `opencode`, or a custom template that installs it. If private clone or push fails, verify the token scope and pass credentials as one-shot env values. If clone or pull is unreachable with restricted egress, add the `git-hosting` preset or allow the required Git hostnames. For commit failures, configure identity first with `sandbox.git.configureUser` or `harakiri git user`.</p>
        <h2>CLI flow</h2>
        <pre>{`harakiri create --template python-3.12-data --name agent-runner --ttl 600\nharakiri create --template open-agents-dev --git https://github.com/acme/project.git --git-path /workspace/project\nharakiri git status sbx_... --cwd /workspace/project\nharakiri run sbx_... --cmd "python -c 'print(2 + 2)'"\nharakiri files sbx_... --path /workspace\nharakiri expose sbx_... --port 3000\nharakiri kill sbx_...`}</pre>
        <h2>Terminal</h2>
        <p>Use `attach` for an interactive human terminal. Use command sessions for stateful automation that needs `cd`, exported variables, or setup steps without taking over the local terminal.</p>
        <pre>{`harakiri attach sbx_... --cwd /workspace\n\nSESSION_ID=$(harakiri command session create sbx_... --cwd /workspace | head -n1)\nharakiri command session run sbx_... "$SESSION_ID" --cmd "cd /tmp && pwd"\nharakiri command session run sbx_... "$SESSION_ID" --cmd "pwd"\nharakiri command session delete sbx_... "$SESSION_ID"`}</pre>
        <p>The browser dashboard uses the same attach endpoint through a short-lived `/terminal/attach-ticket`, so Keycloak-authenticated users can open a WebSocket terminal without putting API keys in JavaScript.</p>
        <p>The current OpenSandbox PTY provider launches Bash. Harakiri exposes `--shell` and `--env` as stable attach options, but non-default shell or per-attach env values return `runtime_terminal_unsupported` until OpenSandbox exposes those fields.</p>
        <h2>Contract</h2>
        <p>The dashboard, CLI, and SDK use the same `/v1` API and OpenAPI contract. External applications should import only `@h-sandbox/sdk`; internal monorepo packages are not part of the public npm contract.</p>
      </>
    )
  },
  {
    id: "team-members",
    section: "Workspace",
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
    id: "session-management",
    section: "Workspace",
    title: "Sign-in sessions",
    lede: "Harakiri uses Keycloak for browser sign-in, token refresh, and provider logout.",
    toc: ["Sign in", "Refresh", "Sign out", "Session expired"],
    body: (
      <>
        <h2>Sign in</h2>
        <p>The dashboard starts an OpenID Connect Authorization Code flow with PKCE. Keycloak owns credentials, required actions, and the browser SSO session. Harakiri keeps only the intended return route in session storage while the browser leaves for Keycloak.</p>
        <h2>Refresh</h2>
        <p>The web app refreshes short-lived access tokens before API calls. Tokens stay in Keycloak adapter memory and are not written to `localStorage`; after a page reload, the app checks the Keycloak SSO session again instead of replaying a saved token.</p>
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
        <pre>{`harakiri create --template python-3.12-data --name agent-runner --ttl 300 --env HARAKIRI_ENV_SMOKE=env-ok\nharakiri create --template open-agents-dev --name repo-runner --git https://github.com/acme/project.git --git-path /workspace/project\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner\nharakiri status sbx_...`}</pre>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes</code></span>
        <pre>{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"python-3.12-data","name":"agent-runner","ttlSeconds":300,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}'\n\ncurl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"open-agents-dev:stable","name":"stable-runner","ttlSeconds":300}'`}</pre>
        <h2>Dashboard</h2>
        <p>Use New sandbox when you want to start from the browser. The Environment field accepts `KEY=value` rows and passes them only to the sandbox being created.</p>
        <h2>Routing</h2>
        <p>Expose a port only when a process is listening on `0.0.0.0` inside the sandbox.</p>
        <pre>{`harakiri expose sbx_... --port 3000\nharakiri routes sbx_...`}</pre>
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
        <p>Use `open` for local prototyping, `restricted` when an agent should only reach selected domains, `blocked` for offline evaluation, and `custom` when you need explicit allow and deny rules.</p>
        <h2>Presets</h2>
        <p>Presets expand to domain rules for common workflows such as Python package installs, Node package installs, Git hosting, and model API calls. Templates can define defaults; sandbox creation can override them.</p>
        <h2>Workspace</h2>
        <p>Admins use Settings, Outbound access to choose the default mode for new templates, enable or disable presets, allow or block custom domains, and set the max expanded rules per sandbox. These guardrails apply to templates, new sandboxes, and runtime policy changes.</p>
        <h2>Templates</h2>
        <p>Use the Egress tab on a team template to store the outbound access default. New sandboxes inherit the template policy unless a create request explicitly overrides it.</p>
        <h2>CLI</h2>
        <pre>{`harakiri create --template python-3.12-data --egress restricted --egress-preset python-package-install\nharakiri egress sbx_...\nharakiri egress allow sbx_... api.github.com\nharakiri egress block sbx_...\nharakiri egress test sbx_... https://pypi.org/simple`}</pre>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes/:id/egress</code></span>
        <span className="api-endpoint"><span className="api-method patch">PATCH</span><code>/v1/sandboxes/:id/egress</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes/:id/egress/test</code></span>
        <span className="api-endpoint"><span className="api-method patch">PATCH</span><code>/v1/templates/:id/egress</code></span>
        <pre>{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"python-3.12-data","egress":{"mode":"restricted","presets":["python-package-install"],"allow":["api.github.com"]}}'`}</pre>
        <h2>Troubleshooting</h2>
        <p>Open a sandbox, then use Network, Outbound access. Test access returns whether the target is reachable from inside the sandbox. If the provider status is unavailable, OpenSandbox did not return a ready egress sidecar endpoint.</p>
        <p>Test access depends on the sandbox image having a probe tool such as `curl`, `wget`, or `python3`. Minimal images can still enforce policy even when the test cannot run.</p>
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
        <pre>{`harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --port 5173 --tag hot`}</pre>
        <pre>{`name = "open-agents-dev"\nid = "open-agents-dev"\ndockerfile = "Dockerfile"\nvisibility = "private"\nruntime_family = "custom"\ncpu_count = 2\nmemory_mb = 2048\nworkdir = "/workspace"\nports = [3000, 5173]\ntags = ["hot"]\naliases = ["open-agents-dev"]\negress_mode = "restricted"\negress_presets = ["python-package-install", "git-hosting"]\nstart_command = "sleep 3600"\nready_command = "true"`}</pre>
        <h2>Dashboard</h2>
        <p>Use Templates, New template when you want to start from the browser. The flow can create a template from a pasted or uploaded Dockerfile, import an existing OCI image, or clone an existing template into your workspace. Set Outbound access during creation when the runtime should start restricted by default. Enable Hot image pre-pull for templates you expect to start frequently. The right panel previews the generated `harakiri.toml` before submit so the dashboard and CLI stay aligned.</p>
        <h2>Build</h2>
        <pre>{`harakiri template build --name open-agents-dev .\nharakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template build --name open-agents-dev . --no-wait\nharakiri template logs bld_...`}</pre>
        <p>The CLI uploads Dockerfile contexts as verified tar+gzip archives, follows build logs by default, and prints the final version, digest, duration, and next create command. A new template definition cannot create sandboxes until a build succeeds and creates a ready digest-pinned version. Tag frequently used templates as `hot` when you want the platform to pre-pull the resulting image on cluster nodes after a successful build. Use `--no-wait` when you want to enqueue and inspect later.</p>
        <h2>Run</h2>
        <pre>{`harakiri create --template open-agents-dev --name agent-runner\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner`}</pre>
        <p>The Templates List filters by visibility, owner, runtime family, and active/archived status. Rows show created and updated timestamps, aliases, latest build status, and latest image version or digest. Open shows the template detail panel with Overview, Versions, Egress, Config, and Runs tabs. Overview gives the create command and SDK snippet. Versions shows immutable version IDs and aliases. Egress stores the template's outbound access default for new sandboxes. Config shows the generated `harakiri.toml` plus redacted build args and metadata. Runs shows recent sandboxes created from the selected template and the exact version/digest selected at create time.</p>
        <p>Row actions provide Use, Build, Builds, Promote, Archive, and Copy ID. Use is enabled only after a ready version exists. Shared platform templates can be used by every workspace; Build, Promote, and Archive are limited to team-owned templates. Builds opens the Builds tab filtered to that template, and Promote marks the latest ready version as `stable`; use `template:stable` when you want the stable channel and `tplv_...` when you need an immutable pin.</p>
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
        <p>Builds move through `queued`, `building`, `success`, `failed`, or `canceled`. The CLI follows logs and status by default; retry creates a new queued build linked to the original. Successful builds show the resulting template version ID, Kubernetes builder pod and node when available, runtime pull preflight status, optional hot-template image pre-pull status, and context metadata in the dashboard detail pane. A template becomes runnable only after one of those successful builds creates a ready version.</p>
        <pre>{`harakiri template build --name open-agents-dev .\nharakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template builds --status queued\nharakiri template builds --query ubuntu-import`}</pre>
        <h2>Logs</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <pre>{`harakiri template logs bld_...`}</pre>
        <h2>Retention</h2>
        <p>Build logs and uploaded Dockerfile contexts are retained for debugging, then pruned by the scheduler after the workspace operator policy window. Old unused versions are marked `retired` instead of deleted, so existing audit records still show which image digest a sandbox used.</p>
        <h2>Retry</h2>
        <p>Use retry after a failed or canceled build. Use promote only for ready template versions.</p>
        <pre>{`curl -X POST "$PUBLIC_API_URL/v1/template-builds/bld_.../retry" -H "x-api-key: $HK_KEY"\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable`}</pre>
        <h2>Troubleshooting</h2>
        <p>When a build fails, open the Builds tab and select the failed row. The detail panel keeps the redacted error, retained logs, context hash, and any Kubernetes builder pod/node metadata. Registry lookup failures usually mean the image tag does not exist, is private, or did not return a digest. Runtime pull preflight failures mean the image was built or imported but the cluster could not pull the final digest. Optional hot-template pre-pull failures mean the image is ready, but the cluster could not warm every node cache. Dockerfile failures should be debugged from the retained logs first, then retried after the source changes.</p>
        <h2>Archive</h2>
        <p>Archive a template when it should no longer appear in active lists or be used for new sandboxes. Existing sandboxes keep running; queued or building template builds are canceled.</p>
        <pre>{`harakiri template archive open-agents-dev\ncurl -X POST "$PUBLIC_API_URL/v1/templates/open-agents-dev/archive" -H "x-api-key: $HK_KEY"`}</pre>
        <h2>Limits</h2>
        <p>If a template asks for more CPU, memory, or default ports than the workspace allows, the API returns `template_resource_limit_exceeded`. If too many builds are already queued or building, it returns `template_build_concurrency_limit_exceeded`. Image and Dockerfile base-image policy failures return `template_image_policy_violation`.</p>
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
        <pre>{`harakiri template builds --status failed\nharakiri template logs bld_...\nharakiri template build --name open-agents-dev .`}</pre>
        <h2>Registry pull</h2>
        <p>Image imports fail before a version is ready when the registry cannot return a manifest digest. Builds also fail before ready if runtime pull preflight cannot pull the final digest from the cluster. Check spelling, tag existence, registry visibility, workspace image policy, and whether the runtime registry host is reachable from k0s. A template without a ready version returns `template_not_ready` when you try to create a sandbox. Private runtime images can use a matching registry credential; if the credential includes encrypted username/password material, sandbox create passes it to OpenSandbox for the image pull. Dockerfile builds can also fail if the `FROM` image is private or denied by policy.</p>
        <pre>{`harakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template inspect ubuntu-import`}</pre>
        <h2>Environment</h2>
        <p>Environment variables are chosen when the sandbox is created. They are not added retroactively to an existing sandbox. Use `harakiri run --env KEY=value` only when the command creates a temporary sandbox for the run.</p>
        <pre>{`harakiri create --template open-agents-dev --env HARAKIRI_ENV_SMOKE=env-ok\nharakiri run --template open-agents-dev --env HARAKIRI_ENV_SMOKE=env-ok --cmd "printenv HARAKIRI_ENV_SMOKE"`}</pre>
        <h2>Aliases</h2>
        <p>If `harakiri create --template ...` cannot resolve a template, inspect the template ID, aliases, visibility, and archive status. Use `template:stable` for a promoted channel and the immutable version ID when you need to prove exactly which image digest was selected. Bare aliases like `stable` become ambiguous when several templates have the same alias, so prefer the qualified form.</p>
        <pre>{`harakiri template list\nharakiri template inspect open-agents-dev\nharakiri create --template open-agents-dev:stable --name stable-runner\nharakiri create --template tplv_... --name pinned-runner`}</pre>
        <h2>Routes</h2>
        <p>Route failures are usually separate from template builds. Start the server on `0.0.0.0` inside the sandbox, expose the matching port, then open the route from the Network tab or CLI. A server bound only to `127.0.0.1` will not be reachable through the public route.</p>
        <pre>{`harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0"\nharakiri expose sbx_... --port 3000\nharakiri routes sbx_...`}</pre>
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
        <pre>{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst client = new HarakiriClient({ apiUrl: process.env.HARAKIRI_API_URL!, apiKey: process.env.HARAKIRI_API_KEY! });\nconst { sandbox } = await client.createSandbox({\n  template: "open-agents-dev:stable",\n  ttlSeconds: 300,\n  env: { HARAKIRI_ENV_SMOKE: "env-ok" }\n});\nawait client.runSandbox(sandbox.id, { command: "printenv HARAKIRI_ENV_SMOKE" });`}</pre>
        <h2>HTTP</h2>
        <pre>{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"open-agents-dev:stable","ttlSeconds":300,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}'`}</pre>
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
        <ul><li>`bun`, `node`, `pnpm`, `npm`, and `yarn`</li><li>`agent-browser` and Chromium headless dependencies</li><li>`code-server`, `git`, `jq`, and Python</li><li>Writable `/workspace` directory</li></ul>
        <h2>Build</h2>
        <pre>{`harakiri template build --name open-agents-dev examples/templates/open-agents-dev\nharakiri template builds --query open-agents-dev\nharakiri template logs bld_...`}</pre>
        <h2>Ports</h2>
        <p>Use `3000`, `5173`, `4321`, and `8000` as default exposed-port candidates for web apps, Vite, code-server, and API servers.</p>
        <h2>Smoke test</h2>
        <pre>{`harakiri create --template open-agents-dev --name pilot\nharakiri run sbx_... --cmd "harakiri-open-agents-smoke"`}</pre>
        <h2>Expose a route</h2>
        <p>Bind your dev server to `0.0.0.0`, then expose the internal port.</p>
        <pre>{`harakiri run sbx_... --cmd "nohup node -e \\"require('http').createServer((req,res)=>res.end('ok')).listen(3000,'0.0.0.0')\\" >/tmp/app.log 2>&1 &"\nharakiri expose sbx_... --port 3000`}</pre>
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
        <ul><li>`opencode` from a pinned `opencode-ai` package</li><li>Node 22, `npm`, `pnpm`, and `yarn`</li><li>Python, Git, jq, ripgrep, fd, curl, and SSH tools</li><li>Writable `/workspace` directory</li><li>Default route candidate ports `4096`, `3000`, and `5173`</li></ul>
        <h2>Build</h2>
        <pre>{`harakiri template build --name opencode examples/templates/opencode\nharakiri template smoke opencode --cmd "harakiri-opencode-smoke"\nharakiri template promote opencode --version-id tplv_... --alias stable`}</pre>
        <p>The smoke command verifies the installed tools, writable workspace, OpenCode CLI help, and a local OpenCode `/global/health` response. It does not require model provider credentials.</p>
        <h2>Run</h2>
        <pre>{`harakiri create --template opencode --name opencode-agent --ttl 1200\nharakiri attach sbx_... --cwd /workspace\n\nharakiri create --template opencode --name opencode-runner\nharakiri run sbx_... --cwd /workspace --cmd \\\n  'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"'`}</pre>
        <p>Use the attached terminal for the OpenCode TUI. Use `opencode run` for automation. The example uses an OpenCode Zen free model; paid or bring-your-own-key models can still receive provider credentials as sandbox environment variables.</p>
        <h2>SDK</h2>
        <p>Use `@h-sandbox/sdk` to create the sandbox, run headless prompts, clone repositories, read diffs, and expose the OpenCode server without depending on OpenSandbox or Kubernetes internals.</p>
        <pre>{`import { HarakiriClient } from "@h-sandbox/sdk";\n\nconst harakiri = new HarakiriClient({ apiUrl: process.env.HARAKIRI_API_URL!, apiKey: process.env.HARAKIRI_API_KEY! });\nconst { sandbox } = await harakiri.createSandbox({\n  template: "opencode",\n  wait: true,\n  ttlSeconds: 1200,\n  egress: { mode: "restricted", presets: ["git-hosting", "llm-apis"] }\n});\n\nconst run = await harakiri.runSandbox(sandbox.id, {\n  command: 'opencode run --model opencode/deepseek-v4-flash-free "summarize this project"',\n  cwd: "/workspace",\n  timeoutMs: 300_000\n});\nconsole.log(run.result.stdout);\nawait harakiri.killSandbox(sandbox.id);`}</pre>
        <p>For the server mode, start `opencode serve`, then use `routes.exposeAndWait`, `routes.headers`, and `routes.fetch` to pass Harakiri route-token auth and OpenCode basic auth to HTTP clients.</p>
        <pre>{`import { createOpencodeClient } from "@opencode-ai/sdk";\n\nconst password = crypto.randomUUID();\nconst route = await harakiri.routes.exposeAndWait(sandbox.id, {\n  port: 4096,\n  accessMode: "token",\n  labels: ["opencode"]\n}, {\n  path: "/global/health",\n  basicAuth: { username: "opencode", password },\n  expect: async (response) => response.ok && (await response.clone().json()).healthy === true\n});\n\nconst opencode = createOpencodeClient({\n  baseUrl: route.route.url,\n  fetch: harakiri.routes.fetch(route, {\n    basicAuth: { username: "opencode", password }\n  })\n});\nawait opencode.config.get();`}</pre>
        <h2>Server route</h2>
        <p>OpenCode's server defaults to loopback. Start it on `0.0.0.0` before exposing port `4096`, and protect the route with a Harakiri route token.</p>
        <pre>{`harakiri create \\\n  --template opencode \\\n  --name opencode-server \\\n  --ttl 1200 \\\n  --env OPENCODE_SERVER_PASSWORD="$(openssl rand -hex 16)"\n\nharakiri run sbx_... --cwd /workspace --cmd \\\n  'nohup opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode.log 2>&1 &'\n\nharakiri expose sbx_... --port 4096 --access token --label opencode\nharakiri routes sbx_...`}</pre>
        <p>The OpenCode username defaults to `opencode`. The CLI prints the route URL and token header for token-protected routes.</p>
        <h2>Troubleshooting</h2>
        <p>If the route is not reachable, check that OpenCode was started with `--hostname 0.0.0.0`. If `opencode run` fails, verify the selected model and any provider keys required by that model. If the template is not runnable, inspect the latest build with `harakiri template builds --query opencode` and `harakiri template logs bld_...`.</p>
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
        <p>`private`, `internal`, and `public` control product visibility. Team-owned templates are visible only inside the owning workspace. Platform `public` and `internal` templates are shared for sandbox creation, while platform `private` templates stay hidden. Build, promote, archive, logs, and uploaded contexts remain scoped to the owning workspace.</p>
        <h2>Digests</h2>
        <p>Mutable tags can be accepted as input, but ready versions store an immutable image digest and pass runtime pull preflight before production use.</p>
        <h2>Secrets</h2>
        <p>Registry passwords and build secrets should live in Kubernetes Secrets, an external secret manager, or encrypted registry credential records. API responses show only whether an encrypted secret exists plus the configured pull or push Secret references. When encrypted pull credentials match a private runtime image, Harakiri can pass them to OpenSandbox for the image pull without returning the password through the API.</p>
        <h2>Runtime metadata</h2>
        <p>Every sandbox create request carries label-safe Harakiri metadata for the sandbox, organization, template, template version, image digest, and current route policy.</p>
        <h2>Image policy</h2>
        <p>Template images, image-import builds, and Dockerfile `FROM` references must match the workspace registry and prefix policy before a build can run. Generated Dockerfile images are stored under an organization-scoped registry namespace so teams do not share one flat repository path.</p>
        <h2>Provenance</h2>
        <p>Template versions keep SBOM references, provenance, runtime pull preflight status, optional hot-template pre-pull status, scan status, and scan summaries. Without a scanner hook, new versions are marked `not_scanned` with the reason `scanner_not_configured`. When operators configure a scanner webhook, the builder stores the scanner status such as `clean`, `vulnerable`, `blocked`, or `scan_failed` on the immutable version.</p>
        <h2>Audit</h2>
        <p>Template create, build create, build cancel, retry, builder success or failure, promote, archive, version retirement, and sandbox create actions are stored as audit events with redacted metadata.</p>
        <h2>Limits</h2>
        <p>Template CPU, memory, default ports, and active queued/building builds are capped by the workspace policy so one team cannot exhaust builder capacity.</p>
      </>
    )
  },
  {
    id: "api-reference",
    section: "Reference",
    title: "API reference",
    lede: "The Harakiri API is the shared contract behind the dashboard, CLI, and SDK.",
    toc: ["OpenAPI", "Templates", "Builds", "Sandboxes", "Promotion", "Archive"],
    body: (
      <>
        <h2>OpenAPI</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/openapi.json</code></span>
        <p>The repository keeps the same OpenAPI contract in `docs/openapi.json`. Use it for generated clients, contract review, and external integration checks.</p>
        <h2>Templates</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates/:id/versions</code></span>
        <h2>Builds</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/builds</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/template-builds/:id/context</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <p>Use `GET /v1/template-builds?template=open-agents-dev&limit=20` when a UI or script needs recent build records for one template.</p>
        <h2>Sandboxes</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes?template=:id</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/sandboxes?templateVersionId=:id</code></span>
        <p>The template detail Runs tab uses these filters to show recent sandboxes for a template or an immutable version.</p>
        <h2>Promotion</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/promote</code></span>
        <h2>Archive</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/archive</code></span>
        <h2>Registry credentials</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/registry-credentials</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/registry-credentials</code></span>
        <span className="api-endpoint"><span className="api-method del">DELETE</span><code>/v1/registry-credentials/:id</code></span>
        <p>Credential responses include registry host, purpose, repository prefix, Secret references, `lastUsedAt`, and `hasEncryptedSecret`, never the raw registry secret.</p>
      </>
    )
  }
];
