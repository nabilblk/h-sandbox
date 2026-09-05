# Real OpenCode Workflows

Four independent scenarios for Harakiri CLI, dashboard, and published Node SDK.
Use only the included synthetic fixtures. No customer data or paid provider key
is needed for the model used in the September 5, 2026 recordings.

## Tutorials

- CLI: https://sb.harakiri.io/#demos/cli-agent-repair
- UI: https://sb.harakiri.io/#demos/ui-agent-app
- SDK: https://sb.harakiri.io/#demos/sdk-agent-report
- Browser QA: https://sb.harakiri.io/#demos/browser-agent-qa

Each page includes the video, transcript, exact capture provenance and a
step-by-step tutorial. Static tutorials also work without JavaScript at
`https://sb.harakiri.io/demos/<demo-id>/tutorial.html`.

## Requirements

Your Harakiri organization must have a ready `opencode` template. Administrators
can build `examples/templates/opencode` (or the `opencode` folder in the source
download) with `harakiri template build --name opencode ./opencode`.
Template builds need the installation's normal build service and registry.

Set `HARAKIRI_API_URL` and `HARAKIRI_API_KEY` privately. Never commit API keys.
Use Node.js 22+, CLI/SDK 0.4.0 and `jq` for the CLI tutorial.

The tested model is `opencode/mimo-v2.5-free`. Main and small models must both
use the explicit free model. Availability and data retention policies can
change: consult https://opencode.ai/docs/zen/ before sending data. Stop on model
errors; do not fall back silently to a paid model. Permission `allow` is only
for this disposable synthetic demonstration, not a general security policy.

## SDK Quick Run

```sh
npm install @h-sandbox/sdk@0.4.0
export OPENCODE_MODEL=opencode/mimo-v2.5-free
node sdk-report.mjs
```

Expected local `report.json`: 3 paid orders, 29600 revenue cents, 1 refund.
The script also saves `summary.md`. It verifies unchanged input, completed
zero-cost steps and cleanup. The summary must be nonempty; review its prose
separately from the exact JSON assertions.
The SDK captures logs before termination because provider command logs can
disappear when the runtime is destroyed. Do not enable `DEMO_EVIDENCE` outside
the private recording workflow: that option contains private execution traces.

### What Is agentCommand?

`agentCommand` is an ordinary shell string defined in `sdk-report.mjs`:
`opencode run --format json --model <model> <quoted prompt>`. It is not a hidden
SDK function. `opencode run` starts a non-interactive task, `--format json`
emits execution events, `--model` chooses the explicit free model, and the last
argument is the full prompt immediately above it in the source. The shellQuote
helper preserves that prompt as one literal argument, including apostrophes.

Your Node.js worker calls `commands.start` to execute this string inside
`/workspace` in the remote sandbox. OpenCode reads the uploaded CSV, writes
`analyze.py`, executes Python, and creates the files. Your worker uses the SDK
to transfer files, then validates them; the SDK is not a model client. OpenCode contacts an external
provider, so sandbox isolation does not imply local/private inference.

`detached: true` returns a command ID immediately. The 240000ms execution limit
is distinct from the 260000ms caller waiting budget and the 600-second sandbox
TTL. Wait timeouts are not cancellation. The complete example uses `finally`
to terminate after success or failure, but connectivity failures still require
recovery using the printed sandbox ID. Download artifacts before termination.

## Verification

The invoice tests intentionally fail before OpenCode edits `invoice.mjs`.
Their checksum must stay unchanged and all four must pass afterward. The UI
prompt requires a working status filter and a `/health` endpoint; inspect and
test generated code, not just a screenshot or model success message.

Always kill created sandboxes and verify termination. TTL limits abandoned
runtimes, but does not replace cleanup. Public preview routes are public; do
not expose private information. Preserve needed artifacts before termination.

## Browser QA Quick Run

```sh
npm install @h-sandbox/sdk@0.4.0
export OPENCODE_MODEL=opencode/mimo-v2.5-free
node browser-qa.mjs
```

This is a different task from generating the dashboard: `browser-app.html` and
`browser-server.mjs` are supplied fixtures. OpenCode generates the Playwright
test program, not the app. The complete prompt is in `browser-prompt.txt`.

The stock OpenCode template does not include Chromium. The worker installs
`playwright@1.60.0` and its matching browser inside the sandbox using
`npx playwright install --with-deps chromium`. This requires package-install
permissions and outbound access to npm, Debian repositories and the browser
download service. The recorded development template permits this installation.
For repeated or restricted non-root deployments, prebuild those dependencies
into a versioned OpenCode template. Do not modify SCC or grant privileged access.

The sandbox has a 1200-second TTL. Browser installation has a 360-second command
budget, the fixture server 600 seconds and the agent 240 seconds. Cold setup can
take several minutes; the film edits that waiting and does not claim instant
browser startup. Stop on unavailable models, setup errors or failed assertions.
Neither the Harakiri API key nor a paid LLM key is uploaded to the sandbox.

The worker checks the original app bytes, deletes old artifacts and reruns the
agent-written `qa.mjs` independently. Expected report:

```json
{"initialRows":3,"passedNames":["Portal"],"restoredRows":3,"mobileOverflow":false}
```

It then creates a deliberately broken copy on local port 3001. The exact same
generated test must exit nonzero with an assertion error. A browser startup
error or timeout does not count as successful mutation detection. The prompt
requests immediate Node assertions after `selectOption` so a failed filter is
diagnosed as an assertion, not waiting for a state that never arrives.

Successful output is saved locally in `browser-output/`: `qa.mjs`,
`qa-report.json`, `desktop.png` (1280x720), `mobile.png` (390x844). Review the
generated test source and screenshots. A focused mutation test is useful
evidence, not comprehensive coverage or a defense against malicious test code.
The app and browser stay inside the sandbox; no public route is exposed.
`finally` kills the sandbox and both tracked servers, including on failure.
Retain the printed sandbox ID for recovery if your worker or network stops.
