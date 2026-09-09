# Execution Plan: Full-Frame UI Product Tour

**Created**: 2026-09-09
**Status**: Completed
**Owner**: Codex, with maintainer review of publication

## Goal

Produce a real UI-led product tour that explains Harakiri as the sandbox control
plane for agent applications. Preserve the entire application viewport at normal
browser zoom, including navigation, dialogs and runtime tabs. The existing four
agent demos remain available; the homepage remains unchanged.

## Decisions and Boundaries

- Reuse the pinned Remotion 4.0.520, real browser/CDP capture, FFmpeg, caption,
  provenance and browser-QA techniques. Do not reconstruct UI in slides or crop
  panels. A separate composition avoids changing historical agent movies.
- Record 1920x1080 at 100% browser zoom and render the same dimensions with
  contain sizing. No zoom, pan, stretched UI or synthetic interaction results.
- Use a synthetic project and dedicated demo organization. Runtime actions use
  Harakiri APIs/UI only; no Kubernetes sandbox exec. No customer project or paid
  model is required. This tour is not represented as a new AI-agent benchmark.
- Tell one coherent story: select an environment, retain project files, launch,
  inspect and run work, control network access, observe, replace the runtime,
  verify retained files and clean up. Showcase only verified supported controls.
- Keep explanatory text outside the application image: synchronized guide below
  the player, chapter navigation, optional native captions and written guide.
  Cursor indicators may replay actual recorded input positions, not invent actions.
- Capture no credentials, personal profiles, private endpoints or agent reasoning.
  Review source footage and rendered boundary frames before publication, with
  continuous DOM privacy checks and sampled OCR; record the review limits.
- Captions-only matches existing demos. No narration or music is claimed.
- Discoverability belongs in Demos and docs, not the landing page. Source and
  local preview delivery do not imply public deployment or a new npm release.

## Phases

### 1. Audit and Story
**Status**: Complete
- [x] Inspect existing composition, capture, provenance, player and verification code.
- [x] Verify current UI, dedicated demo identity, runtime/template and storage capacity.
- [x] Define timed chapters with observable outcomes and explicit limitations.
- [x] Correct narrowly related misleading controls before recording; never hide
  a product defect through cropping or a fabricated screenshot.

### 2. Real Capture
**Status**: Complete
- [x] Implement bounded full-viewport recording with source identity, checksums,
  exact dimensions, cursor timing and recoverable owned-resource inventory.
- [x] Execute the UI story against a real provider, with deterministic assertions.
- [x] Verify runtime termination, workspace release/archive and capture-key revocation.
- [x] Review source footage and reject sensitive content before public preparation.

### 3. Composition and Website
**Status**: Complete
- [x] Add separate full-frame Remotion composition, explicit evidence schema/tests,
  renderer, poster, WebVTT, transcript and reproducible production instructions.
- [x] Add tour to Demos and docs with synchronized external guide and a wide-player
  mode that preserves aspect ratio; keep existing deep links and films intact.
- [x] Render the actual movie and record artifact hashes/size/duration.

### 4. Acceptance and Handoff
**Status**: Complete
- [x] Test schema, boundaries, chapters/captions, render dimensions and source hashes.
- [x] Inspect rendered full-frame scenes, beginning/end and every transition;
  scan source and rendered frames for secrets and unexpected infrastructure.
- [x] Browser-test desktop/mobile playback, seeking, captions, full-width/fullscreen,
  transcript, fallback, no overlap and unchanged homepage media behavior.
- [x] Update production runbook and plan with actual evidence, limitations and
  deployment status. Leave a working local preview URL and movie for review.

## Completion Notes

The 334-second, 17-chapter tour is rendered, integrated and browser-tested.
Web/demo tests (71 + 30), both typechecks, web build, documentation checks,
artifact verification, five-viewport tour QA and all five films' browser
regressions passed. Source/output checksums and 51 sampled rendered frames
were verified. The final source scan included new files and archives and returned
zero findings after seven exact, independently recomputed source-hash exceptions.

The recording proves live commands, preview reachability, outbound policy and
identical report bytes after workspace reuse. Both runtimes/routes are inactive;
recording keys are revoked, recording accounts disabled and workspaces archived
with files retained. The full-frame player, external guide, optional captions,
transcript and reproducible source are available in Demos/docs, not the homepage.

See the [acceptance report](../../ui-product-tour-verification.md) and
[production runbook](../../demo-production-runbook.md). Related historical plan:
[real-product-demo-remotion.md](../active/real-product-demo-remotion.md).
Local review: http://127.0.0.1:19497/#demos/ui-product-tour. Not deployed, committed,
pushed or released by this task. The owner can review before public distribution.

Follow-up: the owner requested publication after local review. The
[deployment plan](ui-product-tour-deployment.md) and
[delivery receipt](../../release-notes/2026-09-09-ui-product-tour-delivery.md)
record the subsequent commit and verified public web deployment.

## Findings During Capture

- Removed fabricated `142ms` cold-start, unused resource selector, fixed `4 seats`
  and stale `v0.41.2 / operational` labels from the actual UI, not the footage.
  Template-owned resources and sandbox lifetime are now explicit.
- Historical demo credentials no longer worked. Recording uses new synthetic,
  isolated organization identities, never the owner's workspace.
- Node 20 is a minimal image without curl, wget or Python. The access test returns
  `blocked_or_unreachable` even when the actual cause is no installed probe tool.
  This tour explicitly installs curl and certificate roots using an included
  shell script through Commands. No provider bypass or cluster change is involved.
  A separate live preflight verified all three hosts in Internet mode; in the
  restricted preset, registry.npmjs.org and nodejs.org succeeded, example.com failed.
  Follow-up: distinguish missing-probe-tool diagnostics in the product response.
- Discarded attempts remain private. Their runtimes were terminated and storage
  archived; archived files are retained and still consume allocation.
- Current narrative: 17 chapters, 334 seconds, captions-only with external guide.
