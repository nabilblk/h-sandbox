# Agent Demo Production

## Scope

The public Demos library is separate from the original homepage. It contains
the full-frame UI product tour plus four real OpenCode stories: CLI invoice repair, dashboard app creation,
SDK report generation and agent-written browser QA. The former 68-second infrastructure tour remains a
historical example in /demo, not the homepage or main demo catalog.

The maintainer confirmed Remotion eligibility on September 5, 2026. Remotion
4.0.520 is build-time only; its license is separate from Harakiri's Apache-2.0
license. CI rendering remains explicitly controlled by REMOTION_RENDER_ENABLED.
Check https://www.remotion.dev/docs/license before changing the producing entity.

All runtime operations use public Harakiri contracts. Docker is only a clean
local npm consumer. No Kubernetes exec, provider credentials, customer projects,
paid-model fallback, or private reasoning traces belong in published material.

## Full-Frame UI Product Tour

See the [September 9 acceptance report](ui-product-tour-verification.md) for the
actual recording, browser checks, artifact hash and local/public delivery boundary.

The UI product tour is a separate Remotion composition, `ui-product-tour`. Its
17 chapters (5m34s) follow a deterministic release-check project, not an AI model
benchmark. It preserves every pixel of the 1920x1080 application viewport at
device scale 1 and browser zoom 1. Browser chrome is not part of the recording.
There are no panel crops, zooms, speed changes, synthetic UI, narration or music.
Small pointer rings replay actual input positions. The synchronized guide stays
outside the video. Native captions are optional; native fullscreen remains available.

The story is maintained in `apps/web/src/ui-product-tour.ts`. The same timeline
drives capture durations, composition, website chapters, captions and written
documentation. The existing four films are not rerendered by this pipeline.

### Capture Prerequisites

- An isolated organization with no active runtimes or workspaces and a unique
  `release-checks` workspace name. Archived workspaces retain their names; use a
  fresh recording organization after a discarded attempt.
- A non-platform-admin recording user with organization-admin access. Do not
  record the owner's workspace, login form, member addresses or API-key values.
- A short-lived organization key with `sandboxes:read`, `sandboxes:write`,
  `templates:read`, `workspaces:read`, `workspaces:write`, and `org:read`.
- A ready `node-20` template, 1 CPU / 1 GiB RAM, plus configured persistent
  storage, public preview routing and mutable egress enforcement. This recording
  uses the current OpenSandbox adapter through Harakiri, not Kubernetes exec.
- A local source preview with explicit public API/OIDC configuration. Never
  deploy a local OIDC origin. Captures identify the local-preview/live-API setup,
  source revision and actual frontend file hashes in their public provenance.
- The minimal Node image lacks curl, wget and Python. The included
  `prepare-tools.sh` installs curl and certificate roots through Commands while
  Internet access is enabled. Full package logs remain in `/tmp/tour-packages.log`.
  A prepared non-root deployment should include these tools in its image instead
  of granting privilege or changing OpenShift SCC for this demonstration.

Provide an owner-readable JSON credential file (mode 0600), outside Git, with
`web`, `api`, `username`, `password`, `organizationId`, `apiKey`, `apiKeyId` and
`expiresAt`. Populate values from your secret manager. The capture uses browser
OIDC login and checks the current identity/organization before recording. No
recording-specific Keycloak user creation or admin credentials are required by
the committed script.

```sh
export HARAKIRI_DEMO_IDENTITY=/absolute/private/path/to/recording-identity.json
pnpm --filter @harakiri/demo-video capture:tour
```

Raw evidence remains under ignored `docs/artifacts/demo/ui-product-tour/`.
Each run keeps a private inventory and diagnostics. Only a completed run writes
`tour.json` and updates `latest.json`. On failure, cleanup terminates the owned
runtimes, archives released storage, and revokes the capture key. A machine crash
or forced process termination may need manual recovery using the exact IDs in
`private-inventory.json`. Never run broad namespace or organization cleanup.

The capture verifies command exit codes, the live HTTP preview, permitted and
unlisted destinations after a known reachable baseline, two distinct runtime IDs,
and identical report bytes across workspace reuse. Both runtimes and the preview
must be inactive. Workspace archive **retains files and allocation**; it is not
physical deletion. Fixture files are uploaded through the file API between the
terminal and tools chapters, explicitly disclosed in the guide.

### Review, Render and Verify

Review the complete private source footage and screenshots first. Continuous DOM
privacy checks reject sensitive content during capture; normalize only invisible
terminal control characters, never redact secrets and then declare a frame safe.
The publication command copies only schema-approved clips and the evidence manifest.

```sh
pnpm --filter @harakiri/demo-video prepare:tour --reviewed
pnpm --filter @harakiri/demo-video render:tour
pnpm --filter @harakiri/demo-video verify:tour
pnpm --filter @harakiri/demo-video browser:tour http://127.0.0.1:19497
pnpm --filter @harakiri/web build
```

The renderer writes the MP4, WebP poster, VTT, transcript, standalone no-JavaScript
tutorial, source ZIP and provenance into `apps/web/public/demos/ui-product-tour/`.
It also refreshes the static demo index. Public docs include a Getting Started
page, Markdown export and machine-readable inventory. The landing page remains
unchanged. No Remotion code is added to the browser bundle.

Verification checks source/output hashes, cleanup evidence, normal-speed full
viewport dimensions, exact timing, caption/tutorial drift, source archive contents,
and OCR/pixel checks on chapter starts, middles and ends. Browser QA additionally
checks decoded video pixels, five viewport sizes, guide synchronization, chapter
seeking, captions, native fullscreen, wide-player toggle and failure/no-JS states.
OCR is sampled verification, not proof that every frame has been manually audited.
Keep the private verification results separate from public media.

Run the repository secret scan before publication and include new, not-yet-tracked
tour files in the candidate inventory. Source hashes next to auth-related paths
can trigger generic-key rules. Recompute each flagged file checksum before adding
an exact value-and-manifest-path exception; never exclude the manifest wholesale.

The source file hashes describe the recorded application, including local edits
before the next commit. A rendered/local preview is not a public deployment. A
web-only deployment is a separate operation; API, Keycloak and npm releases are
not needed to distribute the tour.

### Known Diagnostic Boundary

The current access-test endpoint labels a missing curl/wget/Python probe as
`blocked_or_unreachable`. The capture detected this, inspected the real response
through Harakiri, and added the explicit tools prerequisite above. Do not infer
network denial from that label alone. Distinguishing missing tools in the API/UI
is a follow-up product diagnostic improvement, not a reason to bypass the provider.

## Prerequisites

- Node 22+, pinned pnpm, Docker, FFmpeg/ffprobe, Tesseract, zip/unzip.
- pnpm install --frozen-lockfile.
- pnpm --filter @harakiri/demo-video exec playwright install chromium.
- Healthy public web/API/OIDC and wildcard preview routes.
- Dedicated demo organization, non-platform-admin user, short-lived API key.
- Ready opencode template. Build through the published CLI:
  harakiri template build --name opencode examples/templates/opencode.
- At least 1 GiB free space plus render working space.

Set HARAKIRI_API_URL, HARAKIRI_WEB_URL, HARAKIRI_API_KEY,
HARAKIRI_DEMO_USER and HARAKIRI_DEMO_PASSWORD through your secret manager.
Do not put values in shell arguments, screenshots, Git, or CI artifacts.
Local identity helpers under docs/artifacts/demo are ignored operator files,
not prerequisites or distributable scripts.

## Free Model Policy

The September 5 recordings used opencode/mimo-v2.5-free, with the same model
configured as small_model, only the opencode provider enabled, sharing disabled,
and no paid credentials. Confirm live availability through OpenCode before a
new capture: https://opencode.ai/docs/zen/.

Free models may change or stop working; data retention policies apply. Only
synthetic fixtures are permitted. The capture rejects missing steps, tool errors,
nonzero reported costs, failed assertions and incomplete cleanup. Reported zero
cost describes the model steps, not host infrastructure or a permanent free tier.
Permission allow is limited to this disposable demonstration.

## Capture Sequentially

```sh
pnpm --filter @harakiri/demo-video capture:agents
pnpm --filter @harakiri/demo-video capture:ui
pnpm --filter @harakiri/demo-video capture:browser
```

The first command runs CLI then SDK, not concurrent workloads. The second uses
real dashboard controls for create, terminal, files, expose and Kill.
The third runs browser-qa.mjs with published SDK 0.4.0 in a clean client. It
installs pinned Playwright/Chromium inside the sandbox, not on the worker. Allow
up to 360 seconds for cold installation and use a package-install-capable
template. Restricted non-root deployments should prebuild dependencies; never
weaken OpenShift SCC. The app remains sandbox-local with no public route.

Evidence is private under docs/artifacts/demo/<run-id>. Each attempt records
recovery.json. CLI tests must fail before the repair and pass afterward with an
unchanged test hash. SDK artifacts must have exact expected totals and unchanged
input data. UI acceptance checks real HTTP and browser filter behavior.
Browser acceptance checks unchanged app bytes, a fresh caller-triggered test
run, exact report values, real nonblank desktop/mobile PNGs, and an assertion
failure against a deliberately broken filter using identical test bytes.
Setup/process failures and timeouts do not count as mutation detection.

Keep logs before termination: provider command logs can disappear with the
runtime. The SDK fixture handles this explicitly. Full OpenCode traces can contain
private reasoning; only reviewed tool names, edited code and results are selected.

On interruption, finally/SIGINT/SIGTERM clean up. Machine failure and SIGKILL cannot
run handlers. Recover with the same organization key and API origin:

```sh
pnpm demo:cleanup /absolute/path/to/run/recovery.json
```

Recovery matches only the recording's exact names/IDs, including the SDK attempt,
and removes only its local Docker client. Verify no active demo sandboxes remain,
then revoke the short-lived API key. TTL is defense in depth, not proof of cleanup.

## Prepare, Review And Render

```sh
pnpm --filter @harakiri/demo-video prepare:workflows /path/to/cli.json /path/to/sdk.json /path/to/ui.json /path/to/browser.json
pnpm demo:studio
pnpm demo:render
pnpm demo:verify
```

prepare:workflows selects an explicit public evidence subset and copies only
referenced footage. Source evidence hashes remain in the generated manifest.
Review the JSON and every source image before rendering. In the dashboard film,
the create/preview footage is cropped to the relevant product content without
altering its state. The public route readiness scene reports independently tested
facts, avoiding an unreadable truncated URL screenshot.

Rendering writes H.264 MP4, posters, WebVTT, transcripts, provenance, standalone
tutorial HTML and an explicit-source ZIP into apps/web/public/demos. The ZIP
includes the OpenCode template and its smoke script, not .env or generated output.
CLI text is a replay of actual output; SDK snippets are condensed API excerpts.
Waiting is edited. Films are silent, not narrated or speed benchmarks.

The detailed library now includes CLI 4m32s/14 chapters, UI 4m22s/13 chapters,
SDK report 4m58s/16 chapters and browser QA 5m26s/16 chapters. The CLI/UI movies
reuse the verified September 5 source evidence with expanded instruction, not
an invented new capture. Each outline feeds its tutorial and player timestamps.
Browser screenshots and the displayed qa.mjs assertion come from the real run.
See [use-case selection and boundaries](demo-use-case-research.md) for the E2B
research that informed the new scenario.

The expanded SDK story is 4m58s with 16 chapters. Its outline, full prompt and
command are shared by the video and written tutorial in
apps/web/src/sdk-demo-walkthrough.ts; the player derives its timestamps from
that outline. Keep changes consistent with examples/demo/agent-workflows/sdk-report.mjs.
Tests compare the displayed prompt and shell command against the actual runnable
source and verify quoting of apostrophes and shell metacharacters. Changed
executable examples require fresh capture evidence before rendering.

To refresh only the SDK story (with the same private capture environment):

```sh
DEMO_ONLY=sdk pnpm --filter @harakiri/demo-video capture:agents
pnpm --filter @harakiri/demo-video prepare:workflows /absolute/path/to/sdk.json
pnpm --filter @harakiri/demo-video render:workflows sdk-agent-report
pnpm --filter @harakiri/demo-video verify:workflows
```

For caption or written-text corrections only, `render:workflows --refresh-text`
reuses existing video/poster files after checking their hashes and the unchanged
workflow manifest. Changes to scenes, composition code or visual design still
require a full render. Media URLs carry a revision so browser/edge caches do not
serve a previous edition. Verification also compares source ZIP contents to the
current allowlisted examples and public media bytes to local provenance.

Static tutorial code blocks use Cloudflare's `email_off` markers. Without them,
Email Address Obfuscation rewrites npm strings such as `sdk@0.4.0` as email
addresses, breaking copy/paste for no-JavaScript readers. Public browser QA
asserts that the exact npm install command survives delivery. See
[Cloudflare's per-block exclusion](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/#prevent-cloudflare-from-obfuscating-email).

The sample downloads report.json and summary.md. It asserts exact report totals
and unchanged CSV bytes; only a nonempty check is made for summary prose. Do not
claim full semantic validation of that prose. The template calls an external
model provider, so use only synthetic data and review current provider policies.
Reference: [OpenCode CLI run options](https://opencode.ai/docs/cli/#run) and
[Remotion's published skills](https://www.skills.sh/remotion-dev).

Verification checks hashes, output allowlists, 1920x1080 dimensions, duration,
captions/catalog boundaries, zero cost, cleanup, and OCR on posters, source images,
chapter frames and first/last frames. Limits: 10 MiB/video and 250 KiB/poster.
OCR supplements human visual review; it cannot replace it.
The two sandbox-local fixture origins on 127.0.0.1 ports 3000/3001 are explicitly
reviewed examples in the educational films. Other loopback/infrastructure URLs
remain rejected. OCR normalization is limited to spacing in those example URL
schemes; it does not approve unknown domains or relax credential scanning.

## Website Verification

```sh
pnpm --filter @harakiri/web test
pnpm --filter @harakiri/demo-video test
pnpm --filter @harakiri/demo-video recording:check
pnpm --filter @harakiri/demo-video exec tsx scripts/storyboard-layout.ts
pnpm --filter @harakiri/demo-video browser:qa http://localhost:5185
pnpm --filter @harakiri/demo-video server:qa http://localhost:5190
pnpm docs:check
```

browser:qa covers desktop/mobile, reduced motion, deep links, filters, chapter
seeking, native playback pixels, captions, no-JS tutorials and failure states.
server:qa must target the built Nginx image for MIME, ranges, caching and missing
media 404. Verify fullscreen and browser back/forward interactively too.
The homepage must contain no video and make no video request.

Helm deployments mount their own Nginx configuration. Update both the image and
chart media locations; the web-runtime checksum ensures chart changes roll out.
The origin uses 3600-second media caching. The current public Cloudflare policy
can return 14400 seconds with must-revalidate; purge/revalidate changed stable
media paths during a refresh rather than assuming every edge has the new bytes.

Only deploy the web image. Set public API and Keycloak build/runtime URLs
explicitly; never rebuild a public image with localhost defaults. Record the
previous image for rollback and verify all public endpoints afterward.
No API migration, Keycloak change, npm publication or new Helm release is needed.

## Public Lab Recovery

On September 5 the public 502s were caused by absent host port-forwards. The k0s
node and all application pods were healthy. The existing recovery command was:

```sh
bash infra/scripts/port-forward.sh start
```

Then verify sb.harakiri.io, sb-api.harakiri.io/health and
sb-auth.harakiri.io/realms/harakiri/.well-known/openid-configuration.
Do not redeploy healthy pods or change OIDC to fix missing origin listeners.
These forwards run in tmux and are not supervised across host restart; an
operator still needs to restore them after that failure mode.
The helper now repairs missing windows in an existing session without stopping
healthy services. New forwards retry after pod replacement; the web forward's
automatic recovery was verified during the media-configuration rollout.

## CI Boundaries

demo.yml checks committed media without live credentials. Representative Remotion
stills are opt-in with REMOTION_RENDER_ENABLED. Remotion eligibility is confirmed,
but repository-level variable configuration is separate from that confirmation.

demo-refresh.yml is explicitly the legacy infrastructure-tour refresher. It stays
disabled without HARAKIRI_DEMO_CAPTURE_ENABLED and a protected demo-refresh
environment. Do not enable it expecting the new agent library to refresh.
New agent captures currently use the documented maintainer commands.

Unattended agent refresh, protected-environment provisioning and review settings
are follow-up work. They are not required to watch or reproduce the shipped
library, and this implementation does not claim they were configured in GitHub.
