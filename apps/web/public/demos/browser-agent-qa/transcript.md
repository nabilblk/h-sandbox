# Let an agent test your web app

Real execution, edited waiting. CLI output is replayed from recorded text; SDK snippets are source excerpts with educational diagrams. UI footage is recorded in the actual dashboard. No voiceover.

Model: opencode/mimo-v2.5-free. Recorded 2026-09-05T17:23:43.964Z. Free-model availability can change.

## 0s: Turn acceptance criteria into browser tests

The agent writes tests. The worker reruns them and checks they fail when the app filter is deliberately broken.

- **A preview contract:** An existing release board. Three rows, a working filter and a mobile layout to verify.
- **Agent-written tests:** OpenCode writes qa.mjs. Playwright drives real Chromium and produces screenshots.
- **A regression gate:** Rerun the suite. Break the filter deliberately and require the same tests to reject it.

## 18s: The browser runs inside the sandbox

Only synthetic app source is provided to the model. No production site, credentials or customer browser session is involved.

- **Your Node worker:** Published SDK. Upload fixtures, track commands, compare bytes and download artifacts.
- **One sandbox:** OpenCode, Node and Chromium. Local-only HTTP app. No public browser or agent endpoint.
- **External free model:** Receives synthetic task context. No paid key or managed browser subscription.

## 36s: Run the complete worker example

The downloadable example supplies the fixture, complete prompt, worker, artifact checks and cleanup. No paid model fallback.

```text
npm install @h-sandbox/sdk@0.4.0
export OPENCODE_MODEL=opencode/mimo-v2.5-free
node browser-qa.mjs
```

## 56s: Set the contract before the agent starts

Expected results come from the caller. The agent receives an app and requirements, not a prewritten test suite.

```text
Initial rows     Portal / Search / Billing
Passed          Portal only
All             three rows restored
Desktop         1280 x 720
Mobile          390 x 844 / no horizontal overflow
```

## 74s: Prepare Chromium in the remote workspace

These commands run inside the sandbox, not on your worker. Do not assume stock OpenCode includes a browser.

```text
npm install --save-exact playwright@1.60.0
npx playwright install --with-deps chromium
```

## 96s: Start a tracked server, then check readiness

The local health check must succeed. Detached returns a job handle, not a ready application.

```text
await client.commands.start(sandbox.id, {
  command: 'node browser-server.mjs', cwd: '/workspace',
  timeoutMs: 600000, detached: true,
});
// Check inside the sandbox before starting the agent:
// curl --fail http://127.0.0.1:3000/health
```

## 116s: The full prompt: browser interactions

The agent must observe real rows, select Passed, restore All and capture the result in Chromium.

```text
Read browser-app.html and write qa.mjs using playwright and node:assert/strict.
The app is already running. Use process.env.BASE_URL as the target URL.
Launch headless Chromium; always close it in finally. Do not start a server.
At 1280x720, assert three visible release rows on load.
Select Passed in the Status dropdown and assert only Portal is visible using node:assert immediately after selectOption; do not wait for expected row counts.
Select All and assert the three rows return. Save desktop.png after restoring All.
```

## 140s: The full prompt: artifacts and guardrails

The prompt names every output and forbids fabricated results. The worker still independently checks acceptance.

```text
At 390x844, assert there is no horizontal page overflow and save mobile.png.
Write qa-report.json with exactly initialRows:3, passedNames:["Portal"], restoredRows:3, mobileOverflow:false, using observed browser values.
Do not modify browser-app.html, browser-server.mjs, package files or configuration.
Do not mock Playwright, fabricate results or catch assertion failures to exit successfully.
Use your tools to write and execute qa.mjs, then inspect the results.
```

## 164s: Build and execute the agentCommand

The four-minute agent command runs in /workspace. Raw reasoning stays private; only reviewed evidence is published.

```text
const prompt = (await readFile(
  new URL('./browser-prompt.txt', import.meta.url), 'utf8'
)).trim();
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const agentCommand =
  `opencode run --format json --model ${model} ${shellQuote(prompt)}`;
const agent = await run(
  `BASE_URL=http://127.0.0.1:3000 ${agentCommand}`, 240000
);
```

## 186s: Inspect the assertion OpenCode actually wrote

The recorded assertion reads browser state. The later mutation check proves it rejects the extra visible rows.

```text
await page.selectOption('#status', 'passed');

const passedNames = await page.locator('[data-testid="release-row"] td:first-child').allTextContents();

assert.deepEqual(passedNames, ['Portal'], 'After selecting Passed, only Portal should be visible');
```

## 206s: Independently rerun the generated tests

Fresh artifacts must be created. Existing output from the agent run cannot satisfy the independent rerun.

```text
rm -f qa-report.json desktop.png mobile.png
BASE_URL=http://127.0.0.1:3000 node qa.mjs
```

## 226s: Retrieve the real desktop screenshot

A real 1280 x 720 Chromium screenshot, downloaded through the Harakiri SDK after the independent run.


## 244s: Check the mobile viewport too

Real 390 x 844 screenshot. The generated test reports no horizontal overflow for this fixture.


## 262s: Break the filter and require a failing test

A browser startup error is not accepted as regression detection. The broken filter must trigger an assertion failure.

```text
// Target the broken copy with the unchanged generated suite:
BASE_URL=http://127.0.0.1:3001 node qa.mjs

// The worker requires:
// nonzero exitCode AND AssertionError / ERR_ASSERTION
// identical qa.mjs bytes before and after verification
```

## 286s: Accept evidence, not a green agent message

Original app passes. Broken filter fails. Screenshots downloaded. Model steps reported zero cost in this run.

```text
Original app      passed
Broken filter     assertion failed (exit 1)
Source and tests  unchanged
Artifacts         desktop.png / mobile.png
Model steps       zero reported cost
```

## 306s: Terminate both servers with the sandbox

The capture independently confirms termination. Setup failures, unavailable models and failed assertions also require cleanup.

```text
finally {
  await client.killSandbox(sandbox.id);
  await client.waitForSandbox(sandbox.id, {
    statuses: ['terminated'], timeoutMs: 30000,
  });
}
```
