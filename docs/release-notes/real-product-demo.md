# Agent Demo Library

Deployed to the public k0s lab September 5, 2026. Web-only image update plus scoped
media-serving and port-forward fixes; no API, CLI, SDK, or Helm version bump.
Public deployment evidence is recorded in docs/test-report.md. This source
update does not publish npm/Harbor artifacts.

## Changes

- Restores the original homepage layout. Videos move to a dedicated public Demos
  menu with deep links, surface filters, chapters and native playback controls.
- Adds four independent OpenCode videos: CLI code repair (4m32s), dashboard app
  creation and preview (4m22s), SDK report generation/download (4m58s), and
  browser test generation with Chromium artifacts and mutation checks (5m26s).
- Expands the SDK story into 16 chapters: the task, worker/sandbox/provider
  boundaries, full prompt and explicit agentCommand, model configuration,
  execution versus waiting timeouts, downloads, assertions and recovery.
- Expands CLI/UI to 14/13 chapters with full prompts, model configuration,
  execution boundaries, failure handling and independent acceptance checks.
- Adds four real tutorials to docs, plus standalone HTML, transcripts, captions,
  downloadable fixtures/template source and hashed provenance.
- Keeps code visible when captions are enabled, versions cached media URLs,
  and protects copyable static npm commands from Cloudflare email obfuscation.
- Verifies actual failed/passed tests, unchanged inputs, agent tool calls, exact
  report totals, public HTTP behavior, working preview filters, and cleanup.
- Uses the published CLI/SDK 0.4.0, OpenCode 1.15.13 and mimo-v2.5-free. All recorded
  model steps report zero cost. Free availability and data policies can change.
- Restores public service after missing host port-forwards caused Cloudflare 502s.
  k0s and application pods were healthy; no database or identity changes needed.

## Evidence And Limits

The CLI, UI, SDK report and browser-QA tasks ran in separate real sandboxes through public contracts.
They were terminated, their routes cleaned, and the dedicated API key revoked.
No Kubernetes exec or provider-admin access was used for demo work.
Browser QA checks unchanged fixture/test bytes, fresh artifacts and a deliberate
filter regression that must fail an assertion. It uses the current OpenCode
template plus cold browser installation, not a new managed browser service.
See docs/demo-use-case-research.md for the E2B inspiration and explicit limits.

Films are silent 1080p/30 H.264. CLI output is replayed from recorded text; SDK
snippets are source excerpts with educational diagrams; UI video is captured from the real dashboard.
Waiting is edited, not a latency benchmark. No private reasoning traces are public.

Remotion eligibility is confirmed. Live unattended agent-refresh CI is not enabled;
maintainer refresh commands and recovery are documented in the production runbook.
The legacy infrastructure video remains a secondary tutorial, not homepage media.
The earlier CLI wording correction is still a source change, not an npm release.
