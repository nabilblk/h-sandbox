# Build an app from the dashboard

Real execution, edited waiting. CLI output is replayed from recorded text; SDK snippets are source excerpts with educational diagrams. UI footage is recorded in the actual dashboard. No voiceover.

Model: opencode/mimo-v2.5-free. Recorded 2026-09-05T12:55:15.169Z. Free-model availability can change.

## 0s: Build and test a preview from the dashboard

The outcome is a working app with a tested filter, not just generated HTML or a screenshot.


## 18s: No local CLI or SDK is needed

Dashboard controls manage the workspace. OpenCode writes the app; Harakiri supplies terminal, files, routes and cleanup.

- **Your browser:** Create a workspace. Use Terminal, Filesystem and Network. Check results before cleanup.
- **Harakiri sandbox:** OpenCode generates server.mjs and index.html. Node serves the app on port 3000.
- **External model:** Only the explicit free model is configured. The provider receives synthetic task context.

## 34s: Create a workspace from the OpenCode template

Use the OpenCode template. Add model configuration before Create sandbox; do not paste a Harakiri API key into the form.


## 52s: Set the model configuration before creating

Select Create sandbox. Wait for running and for Terminal to report attached before sending commands.

```text
OPENCODE_CONFIG_CONTENT={"model":"opencode/mimo-v2.5-free","small_model":"opencode/mimo-v2.5-free","enabled_providers":["opencode"],"share":"disabled","autoupdate":false,"permission":{"*":"allow"}}
```

## 74s: The full prompt: application behavior

Three synthetic releases, a real select filter, a health endpoint, and Node standard library only.

```text
Build a working release status dashboard in /workspace with only Node standard library, no npm dependencies. Create server.mjs and index.html. Serve on 0.0.0.0:3000. GET /health must return JSON {"ok":true}. The page title and h1 must be Release board. Include three release rows with data-status: Portal passed, Search running, Billing queued. Add a select with id status-filter and options All, passed, running, queued; selecting an option must hide nonmatching rows.
```

## 98s: The full prompt: quality and execution

OpenCode must write files and execute tools. It must leave the server stopped so you control when the preview starts.

```text
Use a professional white layout, dark text, a small red brand accent, green/amber status indicators, clear headings, and responsive spacing. Add a count in #visible-count that updates with the visible rows. Test syntax with node --check server.mjs. Do not leave the server running. Use your tools to write the files and test them.
```

## 120s: Paste the complete command into Terminal

The command runs remotely. Do not close or kill the sandbox while the agent is writing files.

```text
cd /workspace && opencode run --format json --model opencode/mimo-v2.5-free 'Build a working release status dashboard in /workspace with only Node standard library, no npm dependencies. Create server.mjs and index.html. Serve on 0.0.0.0:3000. GET /health must return JSON {"ok":true}. The page title and h1 must be Release board. Include three release rows with data-status: Portal passed, Search running, Billing queued. Add a select with id status-filter and options All, passed, running, queued; selecting an option must hide nonmatching rows. Use a professional white layout, dark text, a small red brand accent, green/amber status indicators, clear headings, and responsive spacing. Add a count in #visible-count that updates with the visible rows. Test syntax with node --check server.mjs. Do not leave the server running. Use your tools to write the files and test them.' > agent.jsonl 2>&1
```

## 144s: Inspect tool activity and model costs

The recording contains completed file-writing and bash tools. Completed model steps reported cost 0.


## 164s: Inspect the files the agent actually created

Both requested files exist. A success message without files is not an accepted result.


## 182s: Check and start the Node server

Syntax passes and local health returns {"ok":true}. The app listens on 0.0.0.0:3000 for the route to reach it.

```text
cd /workspace && node --check server.mjs
cd /workspace && nohup node server.mjs > server.log 2>&1 < /dev/null &
curl -fsS http://127.0.0.1:3000/health
```

## 202s: Expose only the application port

Port 3000, HTTP, Public. The generated preview /health returned HTTP 200 and {"ok":true} in the capture.

```text
Port       3000
Protocol   HTTP
Access     Public
Health     200 / {"ok":true}

Only the app port is exposed.
```

## 222s: Exercise the filter in the real preview

Passed displays Portal only. All restores Portal, Search and Billing. Test behavior, not appearance alone.


## 242s: Terminate and verify the preview is gone

The UI Kill action terminated the recorded runtime, and the public route stopped serving the application.
