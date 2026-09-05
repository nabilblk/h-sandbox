# Demo Use-Case Selection

Reviewed September 5, 2026 against E2B's public documentation. The old
`e2b.dev/docs` URLs now redirect to `docs.e2b.dev`.

## What E2B Highlights

| Official guide | Highlight | Fit for current Harakiri demos |
| --- | --- | --- |
| [Coding agents](https://docs.e2b.dev/use-cases/coding-agents) | Agent work in an isolated development environment, followed by extracting results | Existing CLI repair and UI app-generation stories |
| [OpenCode](https://docs.e2b.dev/agents/opencode) | Prebuilt agent runtime, interactive or headless work, generated code and Git access | Existing OpenCode template and published command/file APIs |
| [CI/CD](https://docs.e2b.dev/use-cases/ci-cd) | Agent-assisted review, test generation and validation in disposable environments | New browser-QA worker demonstrates the test-generation and validation core |
| [Cloud browser](https://docs.e2b.dev/use-cases/remote-browser) | Screenshot endpoints, browse for data and preview browser activity using external Kernel browsers | Inspiration for browser artifacts; our Chromium runs inside the sandbox, not Kernel |
| [Computer use](https://docs.e2b.dev/use-cases/computer-use) | Agents controlling a virtual Linux desktop | Not claimed by this headless browser example |

## Selected Addition: Browser QA Agent

A Node worker supplies a small release-board app and acceptance criteria.
OpenCode writes Playwright tests with an explicitly free model. The worker
reruns those tests, checks that input bytes were not changed, downloads real
desktop/mobile screenshots and introduces a broken-filter mutation. The same
test program must reject that regression with an assertion failure.

This adds a distinct developer outcome: a generated regression suite and
reviewable artifacts. It does not repeat the existing CSV-analysis task or
present app generation as a second test-generation demo.

All runtime operations use SDK 0.4.0: sandbox lifecycle, files, tracked commands,
waiting and logs. No new control-plane feature, Kubernetes exec, provider-admin
access, external browser subscription or paid-model fallback is required.

## Explicit Boundaries

- The app is our deterministic synthetic fixture; the test program is written
  by the real agent. The film labels downloaded browser screenshots as artifacts.
- OpenCode calls an external model. Isolation does not imply local inference or
  override model-provider retention policies.
- Chromium is installed during cold setup for the stock OpenCode template.
  Repeated/restricted deployments should prebuild dependencies. Never weaken
  OpenShift SCC to run a demo.
- App HTTP endpoints bind to sandbox loopback only. They are illustrative
  addresses, not the operator's local origin forwards or public platform URLs.
- A successful process or model response is insufficient. Require artifacts,
  unchanged source/tests and rejection of the deliberate regression.
- This is not a shipped GitHub Actions integration, autonomous PR reviewer,
  E2B SDK compatibility layer, managed cloud browser or full computer-use API.
- Future model runs can generate different code or fail. The example fails
  closed on unavailable providers, nonzero reported model cost or failed checks.

## Public Material

- [Browser-QA demo](https://sb.harakiri.io/#demos/browser-agent-qa)
- [No-JavaScript tutorial](https://sb.harakiri.io/demos/browser-agent-qa/tutorial.html)
- Runnable worker and fixtures: `examples/demo/agent-workflows/`
- Capture/verification pipeline: `apps/demo-video/scripts/`
- Operational details: [Demo production runbook](demo-production-runbook.md)
