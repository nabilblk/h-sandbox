# Execution Plan: Real Agent Workflow Demo Library

**Created**: 2026-09-04
**Revised**: 2026-09-05
**Author**: Codex
**Status**: In Progress
**Priority**: P1

## September 10 Planning Checkpoint

The four agent films are delivered. A separate completed
[full-frame UI tour plan](../completed/ui-product-tour.md) added the fifth film;
the [public delivery receipt](../../release-notes/2026-09-09-ui-product-tour-delivery.md)
also records restoration of the vertical demo menu. These are not missing
deliverables and do not need another redesign for the post-launch backlog.

This plan stays active only for its protected unattended capture/refresh
configuration and real CI acceptance. That maintenance work is lower priority
than capacity and release/profile reliability; it does not gate Python or
continued use of the published films. Free-model availability and live capture
were not rechecked during this planning session. No new capture or rendering
is authorized by the backlog update.

## Context And Direction

The initial CLI-to-preview video proved the live capture pipeline, but the
maintainer rejected its quality, single-scenario scope, and homepage placement.
This revision supersedes the initial landing-loop deliverable. Do not deploy the
previous landing-page redesign or describe the original video as an accepted
final demo. Prior capture evidence remains in `docs/test-report.md`.

The maintainer confirmed Remotion eligibility on 2026-09-05. Licensing is no
longer a blocker. The desired product is a dedicated **Demos** library linked
from public navigation and documentation, with multiple real workflows across
the CLI, dashboard, and published SDK. OpenCode must perform actual agent work
using an explicitly selected free model, without a paid-provider dependency.

## Success Criteria

- [x] Restore public web, API, and Keycloak availability without unnecessary
      redeployment or changing OIDC, SMTP, databases, or other applications.
- [x] Restore the original landing route and its layout; remove homepage video
      playback and demo downloads from that route.
- [x] Provide public, deep-linkable Demos navigation on desktop and mobile.
- [x] Deliver three distinct, verified agent videos: CLI repair, dashboard app
      creation, and SDK data analysis/artifact retrieval.
- [x] Prove a free model can write and execute code in the actual OpenCode
      template through the Harakiri control plane.
- [x] Each film shows task, meaningful agent tool use, verified outcome, and
      cleanup. A model's claim of success alone is never acceptance.
- [x] Use high-resolution real UI captures and legible code, tight framing,
      chapter-based pacing, and restrained Harakiri-native presentation.
- [x] Every video has a poster, captions, transcript, source example, written
      tutorial, exact package/model/template versions, and sanitized provenance.
- [x] Native player supports pause, seek, fullscreen and chapter navigation;
      no autoplay, no Remotion browser runtime dependency.
- [x] Tests cover failed model execution, nonzero cost, tampered results, failed
      cleanup, missing assets, wrong deep links, and media loading failures.
- [x] Desktop/mobile browser QA and actual production-server media tests pass.
- [x] Publish the web-only update, verify the public routes and tutorials, and
      add an accurate shipped changelog entry.
- [ ] Configure protected CI refresh before enabling unattended capture.

## Canonical Stories

| Surface | Task | Independent Evidence |
| --- | --- | --- |
| CLI | Ask OpenCode to repair a broken invoice calculation | Tests fail before; agent changes implementation; the same unmodified tests pass afterward; inspect diff and terminate |
| UI | Create an OpenCode sandbox, ask the agent to build a small status dashboard, run it and expose port 3000 | Actual dashboard interactions, agent-generated files, HTTP 200, functional preview controls, route state and termination |
| SDK | Upload order data, run OpenCode as a tracked background job, retrieve a validated report | Published SDK calls, agent writes/runs an analysis program, exact JSON totals, downloaded artifact and finally cleanup |
| SDK / Browser QA | Supply a preview app; ask OpenCode to generate Playwright tests | Unchanged source/test bytes, independent rerun, desktop/mobile screenshots, deliberate filter regression rejected, cleanup |

Use original synthetic fixtures, not customer code, personal data, or credentials.
The stories may share the runtime/template and capture helpers, but must
not be relabelings of the same film.

## Boundaries

- Sandbox operations use public Harakiri CLI, SDK, API and dashboard contracts.
  No Kubernetes exec, provider-private endpoint, or OpenSandbox admin credential.
- Docker is only an isolated local published-package client.
- Use a dedicated non-platform-admin demo organization with bounded concurrency.
- Select the model explicitly. Use the same free model for auxiliary title tasks.
  No silent paid fallback or injection of existing LLM provider credentials.
- Record provider/model/version/date and verify reported step costs are zero.
  Free availability is time-sensitive; do not promise a permanent free tier.
- Reject failed or partial work, even if the model emits a success message.
- Preserve real source/output/timing evidence. Editing can remove waiting, not
  invent tool calls, results, speed, isolation, or screenshots.
- Keep raw media, prompts with runtime details, recovery records, cookies,
  tokens and account credentials ignored and private.
- Review an explicit allowlist of sanitized source assets. Scan text, hashes,
  metadata, screenshots, sampled frames and first/last frames before rendering.
- Cleanup in finally/signals and independently verify terminal state and routes.
  TTL is defense in depth, not the cleanup mechanism.
- Keep the user document in `docs/cot/` untouched.
- Do not change GitHub repository visibility or bypass review-environment rules.

## Phases

### Phase 0: Restore Availability And Confirm Runtime
**Status**: Complete

- [x] Diagnose public 502 responses: k0s Ready and application pods Running,
      but all Cloudflare origin port-forwards were absent.
- [x] Restore the existing tmux-managed port-forwards; public web/API/OIDC 200.
- [x] Record maintainer Remotion eligibility confirmation.
- [x] Build `examples/templates/opencode` through published CLI 0.4.0 in the
      demo organization.
- [x] Test `opencode/mimo-v2.5-free`: real write and bash tools, file executed,
      completed steps reported cost 0, sandbox cleaned up.

### Phase 1: Navigation And Landing Restoration
**Status**: Complete

- [x] Restore the original landing route and stylesheet.
- [x] Move video playback to a dedicated public Demos route.
- [x] Add Demos to navigation and mobile navigation.
- [x] Verify deep links, back/forward, filters, chapter seeking and no home media
      downloads in real browsers.
- [x] Link the library from docs and update all old homepage references.

### Phase 2: Reproducible Agent Scenarios
**Status**: Complete

- [x] Add a deliberately broken calculation and immutable test fixture.
- [x] Add synthetic order data and an SDK report example.
- [x] Execute the CLI repair through the published CLI.
- [x] Execute the UI app workflow through actual dashboard controls.
- [x] Execute the report workflow with the published SDK in a clean consumer.
- [x] Save source hashes, model tools/costs, output checks and cleanup evidence.
- [x] Test failure paths and document model availability/privacy limitations.

### Phase 3: Capture And Visual Production
**Status**: Complete

- [x] Extend the bounded recorder for high-resolution action footage.
- [x] Capture each story independently, including meaningful tool work.
- [x] Build story-driven Remotion compositions with readable code and compact
      framing. Avoid stretching a small UI row across a mostly empty slide.
- [x] Review representative frames at normal desktop and mobile player sizes.
- [x] Render complete films, posters, captions and transcripts.
- [x] Verify all source/output hashes, first/last frames, metadata and budgets.
      Target 60-120 seconds/story and <=10 MB/video, <=250 KB/poster.
- [x] Keep only reviewed stories in the public catalog; no fake playable cards.

### Phase 4: Documentation And Delivery
**Status**: Public delivery complete; unattended refresh remains follow-up

- [x] Add one step-by-step tutorial and downloadable source per scenario.
- [x] Update public docs, README, production runbook and candidate release notes.
- [x] Update capture/render/verification scripts and committed-media CI checks.
- [ ] Add a protected unattended refresher for the agent stories; the existing
      opt-in refresher is explicitly retained as legacy infrastructure-only.
- [x] Run focused tests, workspace typecheck/build and docs checks.
- [x] Verify browser UX at 1920, 1440, 390 and 320px; no-JS, failed video,
      reduced motion, navigation and fullscreen/seek behavior.
- [x] Verify production Nginx MIME, byte ranges, cache, missing-file 404 and
      unchanged public OIDC configuration.
- [x] Deploy only the web application, repeat public browser checks, and record
      the actual shipped update. Do not publish npm packages for a demo-only change.
- [ ] Provision protected refresh CI and dedicated credentials after confirming
      the private repository's required-reviewer support.

## Decisions And Evidence

### SDK Walkthrough Revision
**Status**: Complete

The maintainer found `agentCommand` undefined in the SDK film and wants a
longer, detailed introduction to the use case. Expand only the SDK story;
retain the restored homepage, CLI/UI stories, and public Demos location.

- [x] Explain the business task, execution boundaries, synthetic input, full
      prompt, explicit `agentCommand`, free-model config, tracked lifecycle,
      timeouts, independent artifact validation and cleanup in paced chapters.
- [x] Keep the runnable example, film excerpts, tutorial and chapter catalog
      consistent; test the full prompt and shell argument construction.
- [x] Re-execute the published SDK example against a real sandbox with a free
      model. Verify outputs, tool use, zero-cost steps, unchanged input and
      termination; revoke the dedicated capture key afterward.
- [x] Render and inspect the expanded film, captions, posters, transcripts and
      source download. Test layout, media metadata and desktop/mobile playback.
- [x] Deploy the web-only revision and verify public media plus API/OIDC health.

Delivered 298 seconds / 16 chapters. Fresh evidence is
`docs/artifacts/demo/agent-demos-1788619799343/sdk.json`; the sample verified both
downloads, unchanged input, zero reported model cost and runtime termination.
The capture key was revoked. 43 web tests, 22 demo tests and public browser/media
checks pass. Public QA also corrected caption overlap and Cloudflare rewriting
npm versions in static code blocks. Detailed evidence and deployment image are
in the latest SDK section of `docs/test-report.md`.

Protected unattended refresh remains the separate operational follow-up.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-09-05 | Separate Demos menu; original landing restored | Explicit maintainer feedback |
| 2026-09-05 | Three outcome-driven OpenCode stories across CLI/UI/SDK | Maintainer wants real agent work, not a single infrastructure tour |
| 2026-09-05 | Remotion eligibility confirmed | Maintainer statement; former licensing block resolved |
| 2026-09-05 | Explicit free model and zero-cost checks | Avoid paid-provider dependencies and silent paid fallback |
| 2026-09-05 | Restore origin forwards instead of redeploying healthy pods | All public 502s traced to missing local listeners |
| 2026-09-05 | Bounded per-view CDP recordings | Initial global video timing leaked the next tab into clip tails |
| 2026-09-04 | Build-time-only Remotion and native website video | Keep the production frontend small and independent of rendering tools |

Sources checked on 2026-09-05:
- [OpenCode Zen models, pricing and privacy](https://opencode.ai/docs/zen/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [Live model inventory](https://opencode.ai/zen/v1/models)
- [Remotion documentation](https://www.remotion.dev/docs/)

Preflight evidence: ignored `docs/artifacts/demo/opencode-preflight`.
Sandbox `sbx_8vbmrpJRo1` was terminated after independent execution of the
agent-written file. The free model used write and bash tools and reported zero
cost. This proves the runtime prerequisite, not completion of the three demos.

## September 5 Detailed CLI/UI and Browser QA Extension

**Status:** Complete and deployed. Maintainer requests the SDK walkthrough standard for
CLI/UI plus another use case supported by the current release.

- [x] Review E2B official coding-agent, CI/CD, cloud-browser and computer-use guides.
- [x] Expand CLI/UI storyboards and written tutorials with full prompts, setup,
  execution boundaries, results, failures and cleanup; derive chapter times.
- [x] Execute a new browser-QA agent example through published SDK 0.4.0.
  Keep app fixtures unchanged, rerun generated tests independently, require a
  deliberate filter regression to fail, download real screenshots and clean up.
- [x] Add a fourth captioned Remotion film, tutorial, source archive and provenance.
- [x] Check story/source consistency, render all changed films, inspect frames,
  run browser QA on desktop/mobile and verify public deployment and OIDC config.
- [x] Update production runbook, release notes, test report and reproduction docs.

Research (2026-09-05):
- https://docs.e2b.dev/use-cases/coding-agents
- https://docs.e2b.dev/agents/opencode
- https://docs.e2b.dev/use-cases/ci-cd
- https://docs.e2b.dev/use-cases/remote-browser
- https://docs.e2b.dev/use-cases/computer-use

Decision: browser QA combines test generation and browser validation using
current Harakiri primitives. It is not E2B compatibility, a managed cloud-browser
service, a virtual desktop, or a shipped CI integration. E2B's cloud-browser
guide uses external Kernel infrastructure; our example runs Chromium inside the
sandbox. The stock OpenCode template needs browser dependencies installed for
this example; show and document that prerequisite, including cold-start cost.
Use only synthetic data and an explicitly free model, with no paid fallback.

Delivery: CLI 4m32s/14 chapters, UI 4m22s/13 chapters, SDK 4m58s/16 chapters,
browser QA 5m26s/16 chapters. New browser runtime `sbx_aYyX7gxwG4` passed an
independent rerun and rejected the broken-filter mutation. All runtimes were
terminated and the recording key revoked. Web image
`harakiri-web:four-demos-20260905` is live with unchanged OIDC runtime config.
43 web/27 demo tests, full media/OCR verification, and local/built/public browser
and server QA pass. See `docs/test-report.md` for exact hashes and rollback.
This extension is complete; the plan stays active only for its existing
protected unattended-refresh follow-up. No package release accompanies this
source update.

## Remaining Risks

- Free models can change, rate-limit, or stop working. Refresh checks must fail
  honestly and require another explicitly free model, never silently use billing.
- Free-provider data policies apply. Use only the public synthetic fixtures.
- Dashboard terminal bootstrap messages can include provider session IDs.
  Exclude that private chrome through honest cropping, not invented UI.
- OCR is sampled defense; visual review remains required.
- The current port-forward process is tmux-managed, not supervised across host
  restart. Platform startup remains an operator concern; document recovery.
- The repository is private and has only harbor/npm GitHub environments.
  Protected refresh setup remains uncompleted.

## Completion Notes

The three real agent stories and public delivery are complete and verified.
Keep this plan active for the remaining protected unattended agent-refresh
automation, as detailed in the delivery checkpoint below.

## September 5 Initial Delivery Checkpoint

The current user-facing scope is deployed at https://sb.harakiri.io/#demos.
The original landing route/styles match HEAD. Three separate OpenCode tasks
ran successfully with the published CLI/SDK and real UI controls. Films are
76s (CLI), 73s (UI), and 70s (SDK), each under 1 MiB. All model steps reported
zero cost, inputs/tests were verified, runtimes terminated, and the demo key
was revoked. Free model availability remains time-sensitive.

Public browser QA passes across desktop/mobile, reduced motion, playback,
chapters, fullscreen, back/forward, no-JS and failure states. Production media
MIME, byte ranges, cache behavior and missing-file 404 pass. 43 web tests,
17 demo tests, typechecks/build, docs checks and Helm lint pass.

The deployment exposed two additional defects, now corrected: missing tmux
windows prevented origin recovery, and the Helm-mounted Nginx config lacked
media locations. New forwards retry after pod replacement. The chart adds
media locations and a web-runtime checksum. The existing OIDC runtime config
was verified byte-for-byte unchanged; API/auth services were not redeployed.

Image: harakiri-web:agent-demos-20260905, locally imported into k0s.
See docs/test-report.md for exact image/evidence hashes and rollback details.
No npm publication, Harbor image publication, commit, or push was performed.

The plan remains active only for protected unattended agent-refresh automation.
Do not claim that GitHub environments or live refresh were configured. This
follow-up does not block watching or reproducing the delivered tutorials.

### Remaining Operational Debt

September 7 placement review: keep this plan in `active/` for protected
unattended agent refresh. The September 5 tmux limitations below are historical:
the [delivery plan](delivery-readiness-and-persistent-workspaces.md) subsequently
added independent launchd supervision and verified pod/process handoff. Host
login/reboot acceptance remains open there. rc.3 release cleanup does not imply
that demo-refresh credentials or its protected environment have been provisioned.

- Host reboot still requires restoring the tmux session. This change reconnects
  new forwards after pod replacement, not an absent host startup service.
- Existing forward windows are not interrupted to migrate their running command.
  The web window now uses the retry loop; all new windows use it.
- The existing application bundle still emits Vite's >500 kB warning. Remotion
  is not included in it; broader route splitting is outside this update.
