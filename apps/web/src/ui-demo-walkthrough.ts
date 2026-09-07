import type { DemoStep } from './demo-walkthrough';

export const uiPromptParts = [
  'Build a working release status dashboard in /workspace with only Node standard library, no npm dependencies. Create server.mjs and index.html. Serve on 0.0.0.0:3000. GET /health must return JSON {"ok":true}. The page title and h1 must be Release board. Include three release rows with data-status: Portal passed, Search running, Billing queued. Add a select with id status-filter and options All, passed, running, queued; selecting an option must hide nonmatching rows.',
  'Use a professional white layout, dark text, a small red brand accent, green/amber status indicators, clear headings, and responsive spacing. Add a count in #visible-count that updates with the visible rows. Test syntax with node --check server.mjs. Do not leave the server running. Use your tools to write the files and test them.',
];
export const uiDemoPrompt = uiPromptParts.join(' ');

export const uiDemoSteps: DemoStep[] = [
  {
    id: 'use-case', title: 'Build and test a preview from the dashboard', chapter: 'Use case', seconds: 18,
    text: 'A developer wants a release-status prototype without setting up a local toolchain. Use the dashboard to create a workspace, ask OpenCode to build the app, inspect its files and expose a temporary preview. This is a prototype with synthetic releases, not a production deployment.', language: "plaintext", code: '',
    check: 'The outcome is a working app with a tested filter, not just generated HTML or a screenshot.',
  },
  {
    id: 'boundary', title: 'No local CLI or SDK is needed', chapter: 'What runs where', seconds: 16,
    text: 'Your browser controls Harakiri through its authenticated dashboard. The terminal, Node server and agent run in the sandbox. OpenCode calls an external free-model provider. Only synthetic data is used, and no paid provider credentials are supplied.', language: "plaintext", code: '',
    check: 'Dashboard controls manage the workspace. OpenCode writes the app; Harakiri supplies terminal, files, routes and cleanup.',
  },
  {
    id: 'create', title: 'Create a workspace from the OpenCode template', chapter: 'Create in the UI', seconds: 18,
    text: 'Sign in, open Sandboxes and select New sandbox. Choose the ready opencode template, a recognizable name, and a 600-second TTL. Before selecting Create sandbox, add the model configuration from the next chapter to the environment field. Use an outbound policy that permits the selected model; open access is used only for this synthetic example.', language: "plaintext", code: '',
    check: 'Use the OpenCode template. Add model configuration before Create sandbox; do not paste a Harakiri API key into the form.',
  },
  {
    id: 'model', title: 'Set the model configuration before creating', chapter: 'Free-model setup', seconds: 22,
    text: 'Paste this as a single environment entry in the creation dialog. Both main and small models are explicit; only the opencode provider is enabled. Broad tool permission is limited to this disposable synthetic demonstration. Stop on provider unavailability rather than choosing a paid fallback.',
    language: "plaintext", code: 'OPENCODE_CONFIG_CONTENT={"model":"opencode/mimo-v2.5-free","small_model":"opencode/mimo-v2.5-free","enabled_providers":["opencode"],"share":"disabled","autoupdate":false,"permission":{"*":"allow"}}',
    check: 'Select Create sandbox. Wait for running and for Terminal to report attached before sending commands.',
  },
  {
    id: 'prompt-app', title: 'The full prompt: application behavior', chapter: 'Full prompt: behavior', seconds: 24,
    text: 'The prompt has two parts, both shown in full here and in ui-prompt.txt. This first part defines the output files, HTTP binding, health contract and exact filter behavior. Define these acceptance criteria before the agent begins.', language: "plaintext", code: uiPromptParts[0]!,
    check: 'Three synthetic releases, a real select filter, a health endpoint, and Node standard library only.',
  },
  {
    id: 'prompt-quality', title: 'The full prompt: quality and execution', chapter: 'Full prompt: completion', seconds: 22,
    text: 'The second part specifies presentation, live row count and a syntax check. It asks the agent to write and test files but leave server startup to the operator. The complete command in the next chapter joins both parts; there is no hidden FULL_PROMPT placeholder.', language: "plaintext", code: uiPromptParts[1]!,
    check: 'OpenCode must write files and execute tools. It must leave the server stopped so you control when the preview starts.',
  },
  {
    id: 'command', title: 'Paste the complete command into Terminal', chapter: 'Run the full command', seconds: 24,
    text: 'Paste this single command into the dashboard terminal input and press Enter. opencode run is non-interactive; JSON is the event format, not the app output. The quoted argument is the full task. Redirecting saves the trace inside the sandbox. Wait for the terminal command to finish before the next step. The film and written tutorial both show the complete command, with no undefined prompt variable.',
    language: "bash", code: `cd /workspace && opencode run --format json --model opencode/mimo-v2.5-free '${uiDemoPrompt}' > agent.jsonl 2>&1`,
    check: 'The command runs remotely. Do not close or kill the sandbox while the agent is writing files.',
  },
  {
    id: 'tools', title: 'Inspect tool activity and model costs', chapter: 'Recorded tools', seconds: 20,
    text: 'Run these commands one at a time in Terminal. Raw agent.jsonl may contain private reasoning and should not be shared. Inspect completed tool states and model cost fields, not just a final agent message. Missing events or error states mean the run was not successful.',
    language: "bash", code: `jq -Rr 'fromjson? | select(.type == "tool_use") | [.part.tool,.part.state.status] | @tsv' agent.jsonl\njq -Rr 'fromjson? | select(.type == "step_finish") | .part.cost' agent.jsonl`,
    check: 'The recording contains completed file-writing and bash tools. Completed model steps reported cost 0.',
  },
  {
    id: 'files', title: 'Inspect the files the agent actually created', chapter: 'Inspect generated files', seconds: 18,
    text: 'Open Filesystem and inspect /workspace. Confirm server.mjs and index.html exist. Review their contents before exposing them. These are agent-written files from this run; no finished application was uploaded. Download any work you want to keep before termination.', language: "plaintext", code: '',
    check: 'Both requested files exist. A success message without files is not an accepted result.',
  },
  {
    id: 'start-server', title: 'Check and start the Node server', chapter: 'Start and health check', seconds: 20,
    text: 'Return to Terminal. Run the syntax check, then start Node with nohup so it remains running when the terminal command ends. After startup, check /health inside the sandbox. If Node exits or health fails, inspect server.log before exposing the port.',
    language: "bash", code: 'cd /workspace && node --check server.mjs\ncd /workspace && nohup node server.mjs > server.log 2>&1 < /dev/null &\ncurl -fsS http://127.0.0.1:3000/health',
    check: 'Syntax passes and local health returns {"ok":true}. The app listens on 0.0.0.0:3000 for the route to reach it.',
  },
  {
    id: 'expose', title: 'Expose only the application port', chapter: 'Public preview route', seconds: 20,
    text: 'Open Network. Enter 3000, select HTTP and Public, then Expose port. Open the generated URL. Public means anyone with the URL can reach the app; use only synthetic content. Never expose the agent control server or a shell as an unauthenticated public service.', language: "plaintext", code: '',
    check: 'Port 3000, HTTP, Public. The generated preview /health returned HTTP 200 and {"ok":true} in the capture.',
  },
  {
    id: 'preview', title: 'Exercise the filter in the real preview', chapter: 'Browser acceptance', seconds: 20,
    text: 'Open the preview in a browser. Confirm all three releases appear. Select passed and require Portal only, then select All to restore three rows. Inspect the visible count as well. The recording independently asserted the row/filter behavior rather than trusting agent output; generated design may differ in your run.', language: "plaintext", code: '',
    check: 'Passed displays Portal only. All restores Portal, Search and Billing. Test behavior, not appearance alone.',
  },
  {
    id: 'cleanup', title: 'Terminate and verify the preview is gone', chapter: 'Cleanup and recovery', seconds: 20,
    text: 'Return to the sandbox detail, retain any files, and select Kill. Wait for terminated, then refresh the preview URL and confirm it no longer serves the app. If connectivity fails, use the retained sandbox ID to recover in Sandboxes. TTL is an additional safety net.', language: "plaintext", code: '',
    check: 'The UI Kill action terminated the recorded runtime, and the public route stopped serving the application.',
  },
];

export const uiDemoTutorial = {
  id: 'ui-agent-app', title: 'UI: build and preview an agent-written app',
  lede: 'A full dashboard walkthrough with model setup, the complete prompt, real terminal work, file inspection, a tested public preview and cleanup.',
  sections: uiDemoSteps,
};
