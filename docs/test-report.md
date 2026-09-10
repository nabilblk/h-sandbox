# Test Report

Date: 2026-05-23
Last updated: 2026-09-10

Target cluster: `harakiri-k0s` via `infra/k0s/harakiri.kubeconfig`.

Cluster targets and deployment results below are historical receipts, not a
current health check. The September 10 extraction did not access Kubernetes.

## 2026-09-10 Customer Deployment Extraction

The [customer package](customer-deployment-separation.md) is preserved in a
separate private repository at `ccff7eac6a57f8bc911adbdbfe2dbf290203911d`.
Its implementation/manifests/default versions are unchanged; twelve preserved
source/license files match the original SHA-256 inventory. Only tracked source
was transferred, without generated state or credentials.

- All 11 customer tests passed locally, from an independent clean clone and in
  [private CI](https://github.com/nabilblk/harakiri-deployments/actions/runs/34472934232).
  The tests need no sibling checkout or service credentials.
- All 12 focused OSS installation, realm, mirroring, template and supervision
  checks passed. The mirroring tests use a local fake Helm executable; no
  registry write or deployment was performed.
- Helm `4.2.0` lint passed for Harakiri, its existing OpenShift values and the
  maintained runtime chart. The new standalone guide's values rendered nine
  resources: four non-root deployments, no SCC/RBAC grants or rendered Secrets,
  exact public OIDC origins and matching route service port names.
- YAML parsing, documentation links, shell syntax and `git diff --check` passed.
  Gitleaks `8.30.1` found no leaks in the private package or scoped changed OSS
  files. Unrelated ignored material was not scanned or transferred.
- The three original ignored local files retained their paths, inodes, sizes
  and modification times. Their contents were not read or regenerated.

No product-runtime/browser acceptance, fresh OpenShift installation, SCC change,
credential rotation, release or deployment was attempted. `oc` is not installed
on this shell's PATH. Historical customer installation gaps below remain open
in the customer track, not an OSS release gate. No Brain files were accessed.

## Deployed URLs

- Public Web: `https://sb.harakiri.io`
- Public API: `https://sb-api.harakiri.io`
- Public Keycloak: `https://sb-auth.harakiri.io`
- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`
- OpenSandbox gateway: `http://127.0.0.1:18085`

## 2026-09-05 Detailed CLI/UI And Browser QA: Deployed

The public library at https://sb.harakiri.io/#demos now contains four detailed
walkthroughs. The original homepage remains unchanged and downloads no video.

| Workflow | Duration | Chapters | MP4 bytes |
| --- | --- | --- | --- |
| CLI invoice repair | 4m32s | 14 | 2982884 |
| UI app creation and preview | 4m22s | 13 | 2902629 |
| SDK report generation | 4m58s | 16 | 3529436 |
| Browser-QA agent | 5m26s | 16 | 3737958 |

CLI/UI reuse their verified September 5 executions, now with full task prompts,
model configuration, boundaries, failure handling, independent checks and
cleanup. The UI command is complete in both the film and tutorial, without an
undefined prompt variable. Written tutorials, captions, transcripts, source ZIP,
no-JavaScript pages and derived chapter times match all four films.

### New Browser-QA Execution

- Published SDK 0.4.0, OpenCode 1.15.13 and explicit mimo-v2.5-free main/small
  models; template `tplv_WAT-i38tzyOn`.
- Sandbox `sbx_aYyX7gxwG4`, captured `2026-09-05T17:23:43.964Z`.
- Actual cold Playwright/Chromium installation: 175 seconds. Both Node servers,
  the agent and browser run inside the sandbox; no public route or Kubernetes
  exec is used.
- OpenCode wrote `qa.mjs`. Ten tool events completed and eight model steps
  reported cost 0. Private reasoning remains excluded from public artifacts.
- The caller deleted old outputs, reran the generated suite and downloaded
  fresh desktop 1280x720 and mobile 390x844 screenshots.
- Exact report: initialRows 3, passedNames [Portal], restoredRows 3,
  mobileOverflow false. Original app/server bytes remained unchanged.
- The same generated test rejected a second fixture whose filter always
  returns all rows. Exit 1, ERR_ASSERTION: actual Portal/Search/Billing versus
  expected Portal. Test bytes remained identical.
- The runtime was terminated. The dedicated API key was revoked and verified
  to return 401; no active demo sandboxes remained.
- Reviewed evidence: ignored
  `docs/artifacts/demo/browser-qa-1788628765889/browser.json`;
  SHA-256 `ce58e8d9dea92f3713315f85bfe49093584bc0594161a947080b1f7f80485a05`.

Earlier attempts were not published: an orphaned server did not survive its
short command, one valid light screenshot tripped an overly strict variance
check, and another generated test timed out waiting for the broken filter.
The worker now uses a tracked server, image checks preserve light UI detail,
and the prompt requires immediate Node assertions. All failed runtimes were
cleaned up. The final complete example was rerun successfully, not patched
after capture to manufacture successful output.

### Verification

- 43 web tests and 27 demo tests pass; web/demo typechecks, web build,
  docs link check and `git diff --check` pass.
- `pnpm demo:verify` passes, including the legacy film plus all workflow
  hashes, codec/dimensions/durations, byte budgets, captions and OCR scans.
- Source consistency tests compare complete prompts and shell quoting with
  runnable examples. Negative tests reject changed input/tests, wrong reports,
  nonzero cost, missed mutations and infrastructure errors.
- Browser QA passes against local Vite, the built Nginx image and public HTTPS:
  1920/1440/390/320 widths, reduced motion, native playback, all 59 chapters,
  captions, fullscreen, filters, back/forward, no-JS and failure states.
- Chapter DOM layout measurements and actual screenshot inspection pass.
  Playback pixel checks sample the content panel after reveal at sufficient
  resolution to preserve text in light-background UI footage.
- Built/public server QA passes MIME, cache revalidation, byte ranges,
  missing-file 404 and actual video/poster/text/source ZIP hash comparisons.
- Public sign-in reaches sb-auth.harakiri.io and renders the username form.
  Web, API health and OIDC discovery return 200; issuer remains the public URL.

### Deployment And Rollback

Web-only k0s image: `harakiri-web:four-demos-20260905`.

- Image index: `sha256:262e404bb9f43735e42d54f9393c9e3076487ed6092b564d9026e449bffce589`.
- Manifest: `sha256:dfd5ddd39bc5eb4fefa27333d70af14e6c443e092734318a723cb216543df8af`.
- Running image config: `sha256:f27e477d793ed8e12fe62bb72620ed635224f25d4b2ab7dbf5382ae1c17764e7`.
- Runtime config.js is byte-identical:
  `2336f0b14e1df176229dfa7ff69cd22f42140e4e02d9034edc3a39347160af3a`.

The pod handoff caused a brief public 502 while the existing host forward
reconnected; readiness and subsequent public browser/server tests pass.
API, Keycloak, database, SMTP, ingress and Helm values were not changed.

Rollback:

```sh
kubectl --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri set image deployment/harakiri-web web=harakiri-web:sdk-walkthrough-20260905-r2
kubectl --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri rollout status deployment/harakiri-web --timeout=120s
```

No npm/Harbor publication was performed. Protected unattended
capture remains separate unfinished operational work. The existing Vite
large-chunk warning remains; Remotion is not bundled into the production app.
Research and scope boundaries are in `docs/demo-use-case-research.md`.

## 2026-09-05 Expanded SDK Walkthrough: Previous Deployment

The SDK film is now **4m58s, 16 chapters, 3529436 bytes**, replacing the initial
70-second edit. It introduces the daily order-export use case, distinguishes
worker/sandbox/external provider responsibilities, shows the full prompt at
1:58 and defines `agentCommand` at 2:22 before using it. Later chapters explain
execution/wait/TTL timeouts, real tools, both downloads, independent assertions,
cleanup and recovery. The tutorial, transcript, captions and source ZIP match.

### Fresh Real Execution

- Published SDK 0.4.0 in a clean consumer; OpenCode 1.15.13, explicit
  `opencode/mimo-v2.5-free`, template version `tplv_WAT-i38tzyOn`.
- Sandbox `sbx_bhLG-Y-O4M`, recorded `2026-09-05T14:50:45.937Z`.
- OpenCode read the fixture, wrote `analyze.py`, executed it and read the output.
  All six tool events completed; all five completed model steps reported cost 0.
- Downloaded report: exactly 3 paid orders, 29600 revenue cents and 1 refund.
  Input bytes unchanged. Both `report.json` and nonempty `summary.md` saved
  locally. Summary prose is not claimed to be semantically validated.
- Termination verified; dedicated capture key revoked and rejected with 401.
  Private evidence: `docs/artifacts/demo/agent-demos-1788619799343/sdk.json`.
  Raw reasoning traces stay private and are not included in the public film.

### Verification And Corrections

- 43 web tests and 22 demo tests; web/demo typechecks, production build,
  documentation links and full `pnpm demo:verify` passed.
- Tests compare the displayed prompt/command to the actual runnable source,
  verify shell quoting with apostrophes/metacharacters, reject inconsistent
  evidence and keep the shared chapter outline at exactly 298 seconds.
- Remotion stills and browser review checked the introduction, full prompt,
  command and file-download scenes. Public Playwright checks pass at 1920,
  1440, 390 and 320px plus reduced motion, including all 16 SDK chapter buttons,
  active captions, playback, no-JS instructions, fullscreen and error states.
- Caption review caught default cues covering code. Cues are now shorter,
  omit duplicate headings and use restrained sizing; code remains visible.
- Public HTML checks caught Cloudflare rewriting `sdk@0.4.0` as an email.
  Static code blocks now use per-block `email_off` markers; no zone-wide setting
  was changed. No-JS browser QA asserts the exact copyable npm install command.
- Revisioned asset URLs prevent cached old films/captions. Public media and
  source ZIP hashes match the build. MIME, 206 seeking and missing-file 404 pass.
- The existing Vite >500 kB application-bundle warning remains; Remotion is
  still build-time-only and is not part of that application bundle.

### Deployment

Only the web deployment was updated to
`harakiri-web:sdk-walkthrough-20260905-r2`, locally imported into k0s.
Image index: `sha256:1b1b83b21bd8b5f7a5012fb1368feb1832dce3767cbd51c02c505a68150cc781`.
Rollback to the prior library: `harakiri-web:agent-demos-20260905`.
No API/Keycloak/database redeployment or Harbor/npm publication occurred.
Runtime `config.js` SHA-256 remains
`2336f0b14e1df176229dfa7ff69cd22f42140e4e02d9034edc3a39347160af3a`.

Initial probes during pod/forward handoff saw brief 502 responses. The retrying
forward recovered automatically; the complete public suite was rerun after
readiness and passed. Web, API health and OIDC discovery return HTTP 200.
This is not a zero-downtime or host-reboot-autostart claim.

## 2026-09-05 Initial Agent Demo Library: Deployed

The maintainer confirmed Remotion eligibility and requested a separate Demos
menu, the original homepage, and real agent work across CLI, UI, and SDK.
The earlier candidate below is historical and superseded by this direction.

Deployed `harakiri-web:agent-demos-20260905` to the k0s web deployment only.
Image index: `sha256:c93a451a80f0605a54d405fed3b0e4cc7176b36d37f884a7c7aca49b238a3463`.
Previous image for rollback: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.4.0`.
This is a locally imported lab image, not a published Harbor/npm/Helm release.
Source changes were pending at this initial deployment checkpoint.

### Real Agent Acceptance

| Workflow | Sandbox | Verified Outcome | Film |
| --- | --- | --- | --- |
| CLI repair | `sbx_HjBaG_WiEN` | 3 failing tests before; all 4 pass after; original test SHA unchanged | 76s, 894136 bytes |
| Dashboard app | `sbx_bJeXe1PAXr` | Agent-created server/HTML; public health 200; real filter assertions; UI Kill | 73s, 840905 bytes |
| SDK report | `sbx_C5vqvkQpM0` | Published SDK 0.4.0; 3 paid orders, 29600 revenue cents, 1 refund; input unchanged | 70s, 786508 bytes |

Exact UI sandbox ID and template version are in
`apps/web/public/demos/ui-agent-app/provenance.json`; all three use OpenCode
1.15.13 and template version `tplv_WAT-i38tzyOn`. The explicit main/small model
is `opencode/mimo-v2.5-free`. Every completed step reported cost 0. All created
demo sandboxes were terminated and the dedicated API key was revoked/denied 401.
No paid model, Kubernetes exec or provider-admin credential was used.

Private evidence: `docs/artifacts/demo/agent-demos-1788611974760`,
`agent-demos-1788612151153`, and `ui-agent-1788612807022`. Failed recording
attempts were cleaned up; none are presented as successful recordings. The SDK
capture was corrected to retain logs before termination; fetching them after
termination returned 404. Public assets exclude private reasoning traces.

### Website And Media Verification

- Original landing route and stylesheet match HEAD exactly; no homepage video
  element or media request. Only the public navigation adds Demos.
- Three public deep links, filters, chapter seeking, pause/play, captions,
  fullscreen API, browser back/forward and tutorial navigation passed.
- Playwright passed on Vite, the production Nginx image and public HTTPS at
  1920, 1440, 390 and 320px, including reduced motion, failed video, missing
  demo, no-JavaScript tutorials, nonblank video pixels and no horizontal overflow.
- Public MIME, byte-range 206, media/source downloads and missing-media 404
  passed. Origin media caching is 3600 seconds; the existing Cloudflare edge
  policy returns up to 14400 seconds with must-revalidate.
- `pnpm demo:verify`: source/output hashes, allowlists, dimensions, codecs,
  durations, captions, posters, chapter/boundary-frame OCR and size budgets pass.
- 43 web tests and 17 demo tests pass; web/demo typechecks, web production build,
  docs link check, Helm lint and bounded recording regression pass.
- Each film has standalone HTML tutorial, English captions, transcript,
  provenance and an explicit-source ZIP including the template smoke script.
- Remotion remains build-time only. Films are silent. CLI output is replayed
  from recorded text, SDK snippets are condensed excerpts, and UI footage is
  real, tightly cropped capture. No speed benchmark is claimed.

### Availability And Deployment Fixes

Initial Cloudflare 502s traced to absent local origin forwards. The k0s node,
API, database, Keycloak and OpenSandbox pods were healthy. Existing forwards
were restored without redeploying those services.

The first web rollout reproduced a second issue: its selected pod disappeared,
the web forward exited, and the helper skipped recovery because the tmux session
already existed. The helper now creates missing windows without stopping healthy
forwards, and new forwards retry after a pod connection ends. During the next
web rollout, the web forward reconnected automatically. Host reboot still needs
the startup command; no LaunchAgent or system-wide service was installed.

The Helm-mounted Nginx config initially overrode the image's media locations.
The chart now serves demo MIME types, ranges and real missing-file 404s, with a
web-runtime checksum so future chart changes trigger the web rollout. The live
ConfigMap received only its chart-rendered nginx.conf. `config.js` was asserted
byte-for-byte unchanged, SHA-256
`2336f0b14e1df176229dfa7ff69cd22f42140e4e02d9034edc3a39347160af3a`.
Public web, API health and OIDC discovery return 200; all auth URLs remain public.

Unattended agent-refresh CI remains follow-up work. The current opt-in refresh
workflow is explicitly labeled legacy; it does not refresh the three agent films.

## 2026-09-05 Initial Product Demo Candidate (Historical)

Status at the initial checkpoint: verified locally but not deployed. This scope
and its pending licensing checkpoint were superseded by the maintainer's feedback
and the agent library documented above. The homepage redesign was not shipped.

The approved evaluation capture is `product-demo-20260905022217`, using
published CLI/API `0.4.0`, sandbox `sbx_AZV1nzslkv`, and template
`open-agents-dev` version `tplv_AviW_b5F4if4`. One successful run verified CLI
creation, three uploads, native Bash attach, a tracked Node HTTP server,
matching public-route health, dashboard Terminal/Filesystem/Logs/Metrics/Network,
termination, and inactive routes. The capture retains actual event timestamps,
source media hashes, API specification hash and deployed web bundle hash.
The source revision identifies the base Git revision of the working tree; this
initial evaluation capture was produced before the implementation was committed.
Review is explicitly recorded as `Codex visual review`, not human approval.

The final acceptance audit rejected the initial capture
`product-demo-20260905012253`: its global video/wall-clock alignment let several
clips include the next dashboard tab in their trailing frames. The replacement
records bounded Chrome screencasts and stops before navigation. Its seven clips
passed first/last-frame inspection and sampled OCR. The terminal's top crop was
trimmed by eight pixels using the original frames; no output values were edited.
The local changing-page regression test also passed, proving that a later
navigation cannot enter an already-recorded clip. Old footage is superseded and
must not be published.

An independent tutorial run used fresh sandbox `sbx_EQJB0tTXTa`, the published
CLI and the documented flags without capture-specific environment variables.
Attach, files, server startup, HTTP `200`, route listing and cleanup passed.
Run `product-demo-20260905014008` was interrupted with SIGTERM after creation:
exit `143`, sandbox terminated and disposable CLI container removed. A separate
recovery invocation against that run also passed, proving idempotence.
An API-401 recovery test confirmed that failure remains visible through a
nonzero exit while the local CLI container is still removed.

All demo sandboxes were confirmed terminal. The temporary org-scoped API key
was revoked and a request with it returned `401`. The dedicated non-platform-admin
identity, organization, ready template and terminated history are intentionally
retained for later recordings. No user CLI configuration was overwritten.

| Website Asset | Exact Bytes | Verified Format |
| --- | ---: | --- |
| Full walkthrough | 716033 | 68s, 1920x1080, 30fps, H.264/yuv420p, video-only |
| Hero loop | 87736 | 14s, 1920x1080, 30fps, H.264/yuv420p, video-only |
| Full poster | 35388 | WebP |
| Hero poster | 19184 | WebP |

`pnpm demo:verify` passed strict schema, hashes, sampled OCR, credential/private
URL scans, image metadata, nonblank decoded frames, media dimensions, duration,
codec, stream count, asset permissions, captions, and size budgets. It also
verified first/last frames, rejected unexpected files/symlinks, and matched
provenance, captions, transcript and tutorial against the reviewed sources.
Both complete videos were rendered with Remotion `4.0.520`; representative
decoded frames were visually inspected again after the replacement capture.

Browser QA passed on Vite and the actual Nginx image at 1920x1080, 1440x1000,
1280x600, 390x844, and 320x568, plus reduced motion at 390x844. Checks included
play/pause, seeking, canvas-pixel decoding, captions, tutorial navigation,
no horizontal overflow, visible next-section content, narrow-screen button
fit, failed media, and no-JavaScript fallback. Agent-browser also verified
keyboard activation of the tutorial and reported no page errors.

The web candidate is `harakiri-web:product-demo-20260905`, manifest
`sha256:41c61fe8f0d1bda04b171e0f32b51dd7a9f90384bd1f0873226ae9f5a056a43e`.
Its eight public assets returned `200` with correct MIME/cache headers. A video
range request returned `206` and exactly 1024 bytes; missing media returned
`404`, not the SPA document. The acceptance pass caught and fixed a provenance
file permission error before deployment. `/config.js` retained the public
Harakiri API and Keycloak hosts, with no localhost issuer.

Workspace checks passed: frozen install, typecheck, build, documentation links,
OpenAPI, examples, template checks, Credential Vault boundary, and local packed
SDK/CLI consumer smoke. Tests passed: shared `16`, SDK `48`, CLI `70`, API `288`,
web `43`, demo contract/scanning `14`, and demo HTTP fixture `1`. The existing
Vite warning for the monolithic >500KB browser chunk remains; Remotion is not
part of that runtime bundle or the API/web Docker build context.

Reproducible acceptance commands:

```bash
pnpm demo:test
pnpm --filter @harakiri/demo-video recording:check
pnpm demo:render
pnpm demo:verify
pnpm typecheck
pnpm build
pnpm --filter @harakiri/demo-video server:qa http://localhost:5190
pnpm --filter @harakiri/demo-video browser:qa http://localhost:5190
pnpm docs:check
pnpm publish:local-check
```

Raw recovery, cleanup reports, and browser screenshots remain private/ignored
under `docs/artifacts/demo`. Public source evidence is under
`apps/demo-video/public/capture`; optimized website output is under
`apps/web/public/demo`. Production publication must repeat server/browser checks
on `https://sb.harakiri.io` after the licensing/review checkpoint. The new GitHub
workflows are source-validated only; protected environment settings and secrets
have not been provisioned or exercised on GitHub Actions. The private repository
has no `demo-refresh` environment. Confirm that its subscription supports
required reviewers for private environments before enabling the explicit
`HARAKIRI_DEMO_CAPTURE_ENABLED` repository opt-in; do not use an unprotected
environment as a substitute.

At handoff, existing public web, API health, and Keycloak discovery all returned
`200`. The disposable Nginx QA container was removed. Vite on port `5185` and
Remotion Studio on port `3300` are intentionally retained for local review.

## 2026-09-04 Hands-on Tutorial Acceptance

The six workflows in `docs/tutorials.md` were executed against the public
Harakiri API and the current k0s-backed OpenSandbox runtime. Each workflow used
only the public CLI or the published `@h-sandbox/sdk@0.3.1` package, asserted an
observable result, and removed its sandboxes and temporary API key.

| Scenario | Acceptance result |
| --- | --- |
| Data job | Uploaded CSV and Python files, executed the job, downloaded the result, and matched `orders=3 total=68`. |
| Private preview | Started a detached HTTP server; the public route returned `401` anonymously and `200` with its route token. |
| Restricted egress | The Python package preset allowed PyPI, denied Google, and allowed GitHub after an explicit hostname rule. |
| Git workspace | Installed Git in portable Ubuntu, cloned a public repository, created a branch, wrote and committed a file, and ended clean. |
| Snapshot restore | Preserved a marker across pause/resume, created a ready snapshot, restored a second sandbox, and found the same marker. |
| SDK worker | Installed the published SDK in a clean npm consumer, created an idempotent job, waited, wrote and ran code, validated output, and terminated it in `finally`. |

The acceptance pass corrected three easy-to-miss integration details. CLI
creation prints progress before the ID, so scripts extract the line beginning
with `sbx_`. Git is configured to honor a provider-supplied `SSL_CERT_FILE`
when outbound interception is enabled. The SDK tutorial uses methods present in
the currently published package instead of relying on an unreleased facade.

Cleanup verification reported zero active tutorial API keys and zero active
tutorial sandboxes after the run.

The public tutorial page was deployed to k0s in web image manifest
`sha256:db34e8270158ea7e5ac4be1c774305ab53b500ecf8ccf51032d274714dda4d7a`
with container image ID
`sha256:b240171b165afafff33e8348128c8f9775f63527307316551f8d55d3ae83f310`.
Agent-browser verified all six scenarios and all six result checks at viewport
widths 1440, 1280, 1200, 1024, 768, 760, and 390 pixels. No tested viewport had
page-level horizontal overflow. The final endpoint check returned HTTP `200`
for public web, API health, and Keycloak discovery, and all Harakiri namespace
pods were Ready.

## 2026-09-04 Credential Vault Release Candidate

Credential Vault was validated against the deployed k0s stack after the final
API refactor. Harakiri Helm revision `16` runs OpenSandbox Helm chart `0.2.2`
with `opensandbox/server:v0.2.3`, `opensandbox/controller:v0.2.0`,
`opensandbox/ingress:v1.0.10`, and runtime egress image
`opensandbox/egress:v1.1.7` in `dns+nft` mode.

The deployed Harakiri API, scheduler, and template-builder use image manifest
`sha256:a760e6a1af23c58aedc590b5b3c3054b8fc88887f83ff0472d14623ba7ecb9f2`
and container image ID
`sha256:d55660a5e3423e2d491b6b0c6908ff7cd043d635c8eaf4af5b65de44e144f2c2`.
The final web image uses manifest
`sha256:e5602879361a8e819a5fcfa7124505878b7d7430f30450bf3bbe262abb675c35`
and container image ID
`sha256:e351c58fb7064d6d7dc0ea4f59f775a1d001c2e40991390e141041551510ddce`.
All Harakiri and OpenSandbox workloads were Ready after rollout.

Local and provider-free validation passed:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm conformance:dev
pnpm openapi:check
pnpm docs:check
pnpm credential-vault:check
pnpm examples:check
pnpm templates:check
pnpm package:assert
git diff --check
```

Workspace tests passed with `16` shared, `48` SDK, `40` web, `288` API,
and `70` CLI tests. Provider-free conformance applied migrations `025` through
`034` to a clean database and passed packed SDK and CLI consumers with dev
sandbox `sbx_D5iLnIlnxI`.

The real OpenSandbox lifecycle smoke passed with sandbox
`sbx_wJOXVNiQAO`. It proved write-only encrypted custody, fake env values,
runtime-only header injection, live rotation convergence, duplicate and
ambiguous binding rejection, destination denial, pause/resume rehydration,
source-disable revocation, Kubernetes external-reference resolution and
deletion revocation, ephemeral reinjection state, terminated-sandbox failure,
and raw-value absence from API, logs, audit records, and runtime metadata.

The public CLI smoke passed with sandbox `sbx_WFdSKylaId`. It used an isolated
home directory and temporary API key to create a workspace source, launch and
inspect a credential-bearing sandbox, rotate the live source, attach and detach
an ephemeral value, revoke the source, query scoped audit events, and scan all
captured CLI output for raw generated values.

Browser acceptance covered admin desktop/mobile Vault views and a temporary
member account. The member navigation omitted Vault and Members, the launch
dialog listed only an explicitly shared workspace source, and sandbox
`sbx_CEhAIV_LY3` reported its OpenAI attachment as `injected` and present in the
runtime. The desktop and mobile views had no horizontal overflow or value-copy
surface. This is live agent-browser acceptance; durable web component tests
cover navigation capability checks and source mapping, while a standalone
member Playwright fixture remains future test-harness work.

The final deployment-backed Playwright suite passed `2/2` in `36.2s`. The
first scenario exercised real dashboard, API, packed CLI, and SDK sandbox
creation plus terminal, filesystem, logs, metrics, templates, docs, and
cleanup. The second exercised Keycloak provider logout, explicit re-login,
completed-user onboarding bypass, and authenticated Get started routing. That
gate found and fixed a first-click OIDC defect: explicit sign-in from a public
page had initialized Keycloak with passive `check-sso`, which returned
`login_required` before an interactive login could start. First-time explicit
sign-in now initializes with `login-required`; passive boot checks continue to
use `check-sso`.

Restricted OpenShift chart lint and render passed with the dedicated profile.
The rendered Harakiri configuration sets
`OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "0"` and contains no
`SecurityContextConstraints`. Credential-bearing restricted/custom runtime
policies remain operator-action-required because current OpenSandbox
`dns+nft` needs `NET_ADMIN`; Harakiri does not create or modify an SCC.

Cleanup removed every temporary sandbox, source, external reference, member,
Keycloak user, and API key created by these checks. The only remaining
non-terminal sandbox was the pre-existing paused
`python-3.12-data-runner` (`sbx_E0kDpE1cxI`), which was not modified.

## Commands Verified

- OpenSandbox-native lifecycle persistence checkpoint on 2026-09-02:
  implemented Phase 2 lifecycle persistence through OpenSandbox-native APIs
  only. Harakiri now exposes pause, resume, snapshot create/list/get/delete,
  and create-from-snapshot through `/v1`, SDK methods, CLI commands, dashboard
  actions, and website/docs content. Public snapshot IDs use Harakiri
  `snp_...` identifiers while provider snapshot IDs stay internal. Runtime
  capabilities now include `lifecyclePause`, `lifecycleResume`,
  `lifecycleSnapshot`, `snapshotList`, `snapshotDelete`, and
  `createFromSnapshot`. PostgreSQL migration `024_sandbox_snapshots.sql` stores
  snapshot provenance, provider refs, retention metadata, and restore source
  state. The k0s deployment uses OpenSandbox Helm chart `0.2.2` with
  `opensandbox/server:v0.2.3`, `opensandbox/controller:v0.2.0`,
  `opensandbox/execd:v1.1.0`, `opensandbox/egress:v1.1.7`,
  `opensandbox/ingress:v1.0.10`, and image-committer `v0.1.1`.
  Snapshot persistence required a node-reachable local registry
  (`192.168.5.15:5000/harakiri/snapshots` in the validated Lima/k0s run) and a
  guarded containerd socket compatibility link for the pinned OpenSandbox
  controller image. Validation passed:
  `pnpm --filter @harakiri/web test`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web build`,
  `pnpm -w typecheck`,
  `pnpm -w test` (shared 11 tests, SDK 35, web 29, API 178, CLI 38),
  `pnpm -w build`,
  `pnpm openapi:check`,
  `pnpm examples:check`,
  `pnpm templates:check`,
  `pnpm package:assert`,
  `pnpm publish:local-check`,
  `pnpm conformance:dev`,
  `pnpm smoke:lifecycle`,
  `pnpm smoke:lifecycle-persistence`,
  `pnpm ports:status`, public endpoint checks for
  `https://sb.harakiri.io`, `https://sb-api.harakiri.io/health`, and
  `https://sb-auth.harakiri.io/realms/harakiri/.well-known/openid-configuration`,
  a source-boundary scan for Kubernetes runtime shortcuts, and
  `git diff --check`. A final cleanup pass split the lifecycle service into
  smaller responsibility-focused helpers and kept the provider path strictly on
  OpenSandbox APIs. The current source was redeployed to k0s as Harakiri Helm
  revision 12 with API image ID
  `sha256:19e616a13cd8de66115f4bc3bac30bbf52e4cc28013097acdcc73dc4e3237ad3`
  and web image ID
  `sha256:f2a7c6fa7646dd868e48fa69fa2dcdb497b3f94cbc49fba6495b1365025cd63c`.
  Post-deploy `pnpm smoke:lifecycle` created, reconnected, renewed, exposed a
  route for, and killed sandbox `sbx_Ljt6rd-yxx`. The final real persistence
  smoke created source sandbox `sbx_NFsT1T6F9B`, paused and resumed it, created
  snapshot `snp_qZJc_A_2FQ`, restored sandbox `sbx_-YRnUUKJOv`, verified the
  marker file after resume and restore, then deleted the snapshot and both
  sandboxes. Browser smoke with `agent-browser` loaded direct detail URL
  `#dashboard/sandboxes/sbx_HHIJscLJ8b` through hosted Keycloak OIDC, verified
  the terminal attach ticket, opened the Snapshots tab, created ready snapshot
  `snp_q4evtQhliK`, confirmed browser API calls used
  `https://sb-api.harakiri.io`, and cleaned up the snapshot, sandbox, and
  temporary API key. A direct-link routing bug was fixed so normal authenticated
  URL navigation wins over stale session-storage return routes; stored return
  routes are now consumed only for actual OIDC callbacks.
- OSS 0.4.0 artifact/install documentation checkpoint on 2026-09-02:
  release artifact ownership is now documented in `docs/release-artifacts.md`,
  including Harakiri images/chart, public npm packages, mirrored OpenSandbox
  images, the mirrored OpenSandbox chart, template images, and optional
  BackgroundAgent integration artifacts. The OpenShift docs were cleaned around
  the canonical one-namespace package `OCP-install/harakiri-security/`; the
  older root installer now delegates to that package and the stale root
  manifests were removed. Restricted OpenShift behavior is explicit:
  `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0` omits the no-op allow-all
  OpenSandbox `networkPolicy` so open-network sandboxes can run without the
  egress sidecar, while restricted/custom/blocked egress remains dependent on a
  client-approved NET_ADMIN-capable runtime profile or a future OpenSandbox
  restricted-v2-compatible egress mode. Validation passed:
  `pnpm --filter @harakiri/api test` (172 tests),
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm openapi:check`,
  `pnpm templates:check`,
  `pnpm examples:check`,
  `pnpm publish:local-check`,
  `helm lint infra/charts/harakiri`,
  `helm template harakiri infra/charts/harakiri -n harakiri --set
  secret.data.DATABASE_URL=postgres://ci`,
  `helm template opensandbox
  https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz
  -n opensandbox-system -f infra/k8s/opensandbox/opensandbox-values.yaml`,
  rendered OpenShift Harakiri and OpenSandbox values under
  `OCP-install/harakiri-security/`, `bash -n` for the OCP installer scripts, and
  `git diff --check`. Render checks confirmed OpenSandbox `server:v0.2.3`,
  `controller:v0.2.0`, `execd:v1.1.0`, `egress:v1.1.7`, `ingress:v1.0.10`,
  image-committer `v0.1.1`, OpenSandbox server port `8080`, chart-mounted web
  `config.js`, nginx listening on `8080`, and
  `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY="0"` in the restricted OpenShift
  Harakiri ConfigMap.
- OSS 0.4.0 Phase 1 runtime checkpoint on 2026-09-02:
  OpenSandbox was upgraded in k0s from the old `0.1.x` line to Helm chart
  `0.2.2` with running control deployments
  `opensandbox/server:v0.2.3`, `opensandbox/controller:v0.2.0`, and
  `opensandbox/ingress:v1.0.10`. Runtime pods created by the upgraded server
  use `opensandbox/execd:v1.1.0` and `opensandbox/egress:v1.1.7` from the
  OpenSandbox release configuration. Docker Hub is now the default upstream
  image source and Harbor remains the documented mirror path for air-gapped
  installs. The Harakiri k0s deployments were running
  `127.0.0.1:5000/harakiri/system/api:dev` for API, scheduler, and template
  builder, and `127.0.0.1:5000/harakiri/system/web:dev` for web.
  `GET https://sb.harakiri.io/` returned HTTP 200,
  `GET https://sb-api.harakiri.io/health` returned `{"status":"ok"}`, public
  Keycloak discovery returned HTTP 200 with issuer
  `https://sb-auth.harakiri.io/realms/harakiri`, and
  `GET http://127.0.0.1:15173/config.js` returned public runtime URLs for
  `https://sb-api.harakiri.io`, `https://sb.harakiri.io`, and
  `https://sb-auth.harakiri.io`.
  Strict runtime validation passed with no
  `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE` waiver:
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:filesystem`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:process`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:renew`, and
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:lifecycle` passed earlier in the
  same upgrade pass. Egress was diagnosed as an OpenSandbox creation-time
  sidecar issue: sandboxes created without any `networkPolicy` do not receive
  the mutable egress sidecar, so later open-to-restricted mutation can fail.
  Harakiri now sends a no-op open `networkPolicy` whenever a sandbox has an
  egress policy, including open mode. A live initially-open sandbox
  `sbx_NGUioiP8eh` had both `sandbox` and `egress` containers, `GET
  /v1/sandboxes/:id/egress` reported provider `available=true`, and `PATCH
  /v1/sandboxes/:id/egress` to restricted returned provider mode `enforcing`
  with enforcement mode `dns+nft`.
  A token-route readiness regression was also fixed: packaged CLI route wait
  had been resolving `/` against the API origin root instead of preserving the
  route-proxy path, causing a final 401 on
  `harakiri expose --access token --wait`. The SDK route URL helper now
  resolves relative paths against the full route URL, and the CLI test harness
  asserts that `--wait` probes `/v1/route-proxy/.../route-health` with
  `x-harakiri-route-token`. Live packaged-CLI verification created temporary
  sandbox `sbx_3kUYF6cknt`, served port `5173`, exposed a token route at
  `https://sb-api.harakiri.io/v1/route-proxy/...-5173/`, waited on `/`, and
  reached `ready` through `opensandbox-gateway`.
  Additional checks passed:
  `pnpm --filter @harakiri/api test` (171 tests),
  `pnpm --filter @h-sandbox/sdk test` (34 tests),
  `pnpm --filter @h-sandbox/cli test` (36 tests),
  `pnpm --filter @h-sandbox/sdk build`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm test`,
  `pnpm typecheck`,
  `pnpm openapi:check`,
  `pnpm publish:local-check`,
  `git diff --check`,
  `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1 pnpm conformance:sdk`, and
  `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1 pnpm conformance:cli`. The conformance
  run installed packed tarballs into temporary consumer projects, exercised
  create/run/files/artifacts/detached commands/token routes/route fetch,
  metrics, logs, egress, renew, and kill, created CLI sandbox
  `sbx_I5XkZrzFHl`, and cleaned up
  its temporary API key. Hosted OIDC browser regression passed with
  `HARAKIRI_WEB_URL=https://sb.harakiri.io pnpm exec playwright test
  tests/e2e/oidc-session.spec.ts`; the spec covers provider login, dashboard
  redirect, onboarding redirect for a completed user, provider logout, memory
  only tokens, and fails if a hosted browser request hits `localhost`,
  `127.0.0.1`, or `*.localhost`. Remaining 0.4.0 release gaps are live
  OpenShift one-namespace install revalidation and release notes.
- September wake-up validation on 2026-09-01:
  Phase 0 baseline validation passed for the main product surface with one
  provider-runtime exception. Local checks passed:
  `pnpm install --frozen-lockfile`, `pnpm openapi:check`,
  `pnpm templates:check`, `pnpm examples:check`, `pnpm test`,
  `pnpm typecheck`, `pnpm build`, `pnpm package:assert`,
  `pnpm publish:local-check`, `pnpm publish:postcheck`,
  `helm lint infra/charts/harakiri`, Helm render with and without ingress, and
  `git diff --check`. npm registry checks confirmed `@h-sandbox/sdk@0.3.1` and
  `@h-sandbox/cli@0.3.1` as the latest published packages; both package
  install smoke tests passed from the public registry.
  k0s is running on `lima-harakiri-k0s` with Kubernetes `v1.36.3+k0s`.
  `pnpm ports:status` reported API, web, Keycloak, Mailpit, OpenSandbox,
  gateway, and ingress HTTPS forwards up. Public `GET
  https://sb-api.harakiri.io/health` returned `{"status":"ok"}`, public
  Keycloak discovery reported issuer `https://sb-auth.harakiri.io/realms/harakiri`,
  and `https://sb.harakiri.io/` returned HTTP 200. The Cloudflare tunnel
  `harakiri-dev` is connected through tunnel
  `cc00f00a-b780-4a82-a2f3-6436c8b412b9`; `cloudflared` is active but old
  (`2026.3.0`, recommended update `2026.8.3`).
  Runtime smoke passed with `pnpm smoke`. Live SDK and CLI conformance passed
  with `HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE=1
  HARAKIRI_CONFORMANCE_ROUTE_FETCH=1
  HARAKIRI_CONFORMANCE_ROUTE_BASE_URL=http://127.0.0.1:18082 pnpm conformance`.
  The SDK/CLI flows covered create, wait, run, files, artifacts, detached
  commands, token routes, route fetch, metrics, logs, renew, and cleanup. A
  dedicated CLI attach smoke created sandbox `sbx_r20aLsWuo0`, attached through
  the CLI PTY path, printed `phase0-attach-ok`, and exited cleanly.
  Strict egress mutation was not healthy in the local k0s runtime at that time:
  creating a sandbox with restricted egress stores the policy and `GET
  /v1/sandboxes/:id/egress` reports `restricted` with rules, but `PATCH
  /v1/sandboxes/:id/egress` returns `egress_provider_unavailable`. Kubernetes
  showed the OpenSandbox egress sidecar image
  `sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/egress:v1.0.12`
  stuck pulling, leaving diagnostic pods at `0/2 PodInitializing`. The test
  pods were force-deleted after their BatchSandbox CRs were gone. This is a
  runtime dependency issue, not a regression in commands/files/routes/logs.
  Browser smoke with `agent-browser` verified hosted landing, public Keycloak
  login, dashboard redirect without onboarding loop, Templates navigation, Docs
  `Vision and architecture`, and logout back to `#landing`. Browser resource
  inspection found no `localhost` or `127.0.0.1` API/Auth calls. Screenshot:
  `/tmp/harakiri-phase0-public.png`. OpenShift/CRC was not live-validated:
  `crc status` reported the VM and OpenShift stopped, and `oc` was unavailable
  on the current PATH. At that time, one deployment-model risk remained: the
  k0s deployment was still the older kustomize-shaped runtime, not the current
  Helm web-runtime ConfigMap shape; `/config.js` was blank even though the
  deployed bundle was built with public API/Auth URLs.
- Integration conformance checkpoint on 2026-06-04:
  Added SDK and CLI conformance smokes that install packed package tarballs and
  use only public package surfaces. The SDK smoke imports `@h-sandbox/sdk` from
  a temporary consumer project; the CLI smoke installs `@h-sandbox/sdk` and
  `@h-sandbox/cli` into a temporary npm prefix and runs the installed
  `harakiri` binary. The flow covers sandbox create/wait/run, filesystem
  operations, artifact upload/download checksum metadata, detached command
  lifecycle, token route expose/list/fetch, metrics, logs, egress policy update
  and probe, renew, and cleanup. During live testing, conformance exposed a
  real route-proxy bug: token routes backed by OpenSandbox gateway were fetched
  through the gateway service without the required `OpenSandbox-Ingress-To`
  header. The API route proxy now detects `opensandbox-gateway` routes and uses
  the internal gateway URL with the official route header. The CLI route command
  now keeps `expose --json` stdout parseable by sending route progress to
  stderr. Verification passed:
  `pnpm --filter @harakiri/api test -- routes-runtime.test.ts sandbox-runtime-service.test.ts`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @h-sandbox/cli test -- command.test.ts`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm deploy:k0s`, `pnpm ports:restart && pnpm ports:status`,
  `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1 HARAKIRI_CONFORMANCE_ROUTE_BASE_URL=http://127.0.0.1:18082 pnpm conformance`,
  `pnpm publish:local-check`, `pnpm typecheck`, and `git diff --check`. The
  deployed API image digest was
  `sha256:51cb54b71cb09e065c978e15917435c2e4ff3d6da615d185870d4ac5145490c9`
  and the web image digest was
  `sha256:2c58a18b01559bdd803ebb2f006250681e9a14232f7230aa0f0b375f0770bbb5`.
  Local forwards for API, web, Keycloak, Mailpit, OpenSandbox, gateway, and
  ingress HTTPS were all up, and `GET http://127.0.0.1:18082/health` returned
  `{"status":"ok"}`.
- OpenCode free-model live checkpoint on 2026-06-02:
  Official OpenCode Zen docs list free limited-time models including
  `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free`,
  `opencode/nemotron-3-super-free`, and `opencode/big-pickle`. A live
  Harakiri sandbox test first created sandbox `sbx_Dfq8k_UEsd` from the
  `opencode` template with open egress and no Anthropic/OpenAI key; running
  `opencode run --model opencode/deepseek-v4-flash-free` returned the marker
  `HARAKIRI_FREE_MODEL_OK` and the sandbox was killed. The `llm-apis` egress
  preset was then updated to include `opencode.ai`, docs/examples were changed
  to default to `OPENCODE_MODEL=opencode/deepseek-v4-flash-free`, and package
  versions were bumped to `0.3.1`. Verification passed:
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/shared build`,
  `pnpm --filter @h-sandbox/sdk test`,
  `pnpm --filter @h-sandbox/sdk typecheck`,
  `pnpm --filter @h-sandbox/sdk build`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web build`,
  `pnpm examples:check`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm openapi:check`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm --filter @h-sandbox/cli test`,
  `node packages/cli/dist/index.js --version` returning `0.3.1`,
  `pnpm publish:local-check`,
  `pnpm publish:dry-run`, and `git diff --check`. The updated public stack was
  deployed with `KUBECONFIG=$PWD/infra/k0s/harakiri.kubeconfig pnpm
  env:harakiri:deploy-public`, rolling API image
  `sha256:14852d53f5cfb66434cb31eb709bfa1d24cd70eb14e9e9b9b6ca2d6197a11033`
  and web image
  `sha256:cee4d5bc2d46d4be72e0d0ed7bb646bd57145e765d659ebdb43ec5201a23c74a`.
  `pnpm ports:restart && pnpm ports:status` reported all forwards up. Public
  `GET https://sb-api.harakiri.io/health` returned `{"status":"ok"}`; k0s pods
  `harakiri-api-7f499695cd-pfb24`,
  `harakiri-web-64f5b87c5c-ttcgr`,
  `harakiri-scheduler-d5f5cbdfd-f5gqv`, and
  `harakiri-template-builder-6bb5f4bf95-wlg6k` were running. The deployed web
  bundle `/assets/index-BWfKNpxx.js` contained
  `opencode/deepseek-v4-flash-free` and `opencode.ai`. A second live test
  created sandbox `sbx_aDPmogv-Gh` with `egress: { mode: "restricted",
  presets: ["llm-apis"] }`; `getSandboxEgress` reported `mode=restricted`,
  `rules=3`, and `presets=llm-apis`, and `opencode run --model
  opencode/deepseek-v4-flash-free` returned
  `HARAKIRI_RESTRICTED_FREE_MODEL_OK`. The sandbox was killed and the temporary
  API key was revoked. npm publish completed for `@h-sandbox/sdk@0.3.1` and
  `@h-sandbox/cli@0.3.1`; `npm view` returned `0.3.1` for both packages, and
  `pnpm publish:postcheck` passed against the registry.
- OpenCode SDK premium parity checkpoint on 2026-06-02:
  `pnpm --filter @h-sandbox/sdk test`, `pnpm --filter @h-sandbox/sdk
  typecheck`, `pnpm --filter @h-sandbox/sdk build`, `pnpm examples:check`,
  `pnpm --filter @h-sandbox/cli test`, `pnpm --filter @h-sandbox/cli
  typecheck`, `pnpm --filter @h-sandbox/cli build`,
  `node packages/cli/dist/index.js --version`, `pnpm --filter @harakiri/web
  typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`,
  `pnpm publish:local-check`, and `pnpm publish:dry-run` passed after adding
  generic SDK route helpers and checked OpenCode examples. The CLI version
  command printed `0.3.0`. The SDK now exposes `routes.getUrl`,
  `routes.exposeAndWait`, `routes.headers`, `routes.fetch`,
  `routes.waitForHttp`, `routeAccessHeaders`, `createRouteFetch`, and
  `waitForRouteHttp`; examples now cover headless OpenCode runs and
  `opencode serve` through `@opencode-ai/sdk` using Harakiri route-token
  headers plus OpenCode basic auth. Public docs were redeployed to k0s with
  `KUBECONFIG=$PWD/infra/k0s/harakiri.kubeconfig pnpm
  env:harakiri:deploy-public`, rolling API image
  `sha256:0711c386199a35bc77994474b23393075dc7ada917786d0a338eeea17447bc02`
  and web image
  `sha256:910694c81f58d4fb483aff18715872d56f502b01d6f50827db5ff03e7ee923c0`.
  `pnpm ports:restart` and `pnpm ports:status` reported API, web, Keycloak,
  Mailpit, OpenSandbox, gateway, and ingress HTTPS forwards up. Local
  `GET http://127.0.0.1:18082/health` and public
  `GET https://sb-api.harakiri.io/health` returned `{"status":"ok"}`. k0s pods
  `harakiri-api-78874f57d5-ppbjq`,
  `harakiri-web-9cc869656-w9zbz`,
  `harakiri-scheduler-58b855b489-mcf67`, and
  `harakiri-template-builder-5dbcb7db56-vcwrr` were running. The public web
  bundle `/assets/index-CR1dsM1z.js` contained `@opencode-ai/sdk`,
  `routes.exposeAndWait`, and `routes.fetch`. npm publish completed for
  `@h-sandbox/sdk@0.3.0` and `@h-sandbox/cli@0.3.0`; `npm view` returned
  `0.3.0` for both packages, and `pnpm publish:postcheck` passed against the
  registry.
- OpenCode agent template checkpoint on 2026-06-02:
  `bash -n examples/templates/opencode/smoke.sh`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web build`,
  `pnpm --filter @h-sandbox/cli build`, and `git diff --check` passed after
  adding the `examples/templates/opencode` template and product docs. Docker
  build and local smoke passed with
  `docker build -t harakiri/opencode-template:local examples/templates/opencode`
  and
  `docker run --rm harakiri/opencode-template:local harakiri-opencode-smoke`;
  the smoke verified Node `v22.22.3`, npm `10.9.8`, pnpm `11.5.1`, Yarn
  `1.22.22`, OpenCode `1.15.13`, and the local OpenCode `/global/health`
  endpoint. The deployed k0s control-plane build passed with build
  `bld_ppJrSvnyfHwk`, version `tplv_-376iyv9hyCi`, image digest
  `sha256:504986d309a5180a99a43e0a1db53b00d9cf26b187f78822d1642df1dfff7ccd`,
  runtime pull preflight `ok`, and node pre-pull `ok`. Deployed template smoke
  passed with sandbox `sbx_cXi36oFlNJ` and terminated the smoke sandbox. A live
  route smoke created sandbox `sbx_pJWRng2-EZ`, started
  `opencode serve --hostname 0.0.0.0 --port 4096`, exposed port `4096` through
  `https://sb-api.harakiri.io/v1/route-proxy/...`, verified OpenCode
  `/global/health` through Harakiri route-token access plus OpenCode basic
  auth, and cleaned up the sandbox and temporary API key.
- Public docs and npm integration checkpoint on 2026-06-01:
  `pnpm --filter @harakiri/web test`, `pnpm --filter @harakiri/web
  typecheck`, `pnpm --filter @harakiri/web build`, and `git diff --check`
  passed after correcting the product docs and template detail SDK snippet to
  use the published `@h-sandbox/sdk` and `@h-sandbox/cli` packages.
  `KUBECONFIG=$PWD/infra/k0s/harakiri.kubeconfig pnpm
  env:harakiri:deploy-public` rebuilt and deployed API image
  `sha256:fd3ad1808fcb4bee76f690d0210a822f57b5aae39ac0e0940ae1cf8ab0ca4afa`
  and web image
  `sha256:b076e258cf0deb177b67c6ab77e2af4a5eb2bdb064b6f1cd8e0e9613ede4f221`.
  The public deployment wrapper preserved `https://sb-api.harakiri.io`,
  `https://sb.harakiri.io`, and `https://sb-auth.harakiri.io` build-time
  URLs. `pnpm ports:restart` was required because the Cloudflare tunnel maps
  exact `sb*` hostnames to local forwards; after restart, `pnpm ports:status`
  reported API, web, Keycloak, Mailpit, OpenSandbox, gateway, and ingress HTTPS
  forwards up. Public `GET https://sb-api.harakiri.io/health` returned
  `{"status":"ok"}`, the Keycloak OIDC issuer returned
  `https://sb-auth.harakiri.io/realms/harakiri`, and the deployed web bundle
  `/assets/index-Ck-rm_Li.js` contained `SDK and CLI`, `@h-sandbox/sdk`, and
  `@h-sandbox/cli` with no stale `@harakiri/sdk` or localhost API/Auth URL.
  A browser smoke opened the public landing page, clicked Read the docs, opened
  SDK and CLI, verified the npm package names and `runSandbox`, and saved
  `/tmp/harakiri-sdk-cli-docs-deployed.png`.
- `pnpm deploy:k0s` passed after building the official OpenSandbox ingress component locally as `opensandbox-ingress:local` for the k0s node architecture.
- `pnpm typecheck` passed across the workspace.
- `pnpm test` passed all package tests.
- `pnpm build` passed for shared, API, web, CLI, and SDK packages.
- Template Dockerfile builder checkpoint on 2026-05-24: `pnpm typecheck`,
  `pnpm test`, `pnpm build`, `git diff --check`, and
  `pnpm smoke:template-build` passed after deploying the Kaniko-based k0s
  builder.
- Rootless BuildKit default checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/api build`,
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/sdk test`,
  `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/web test`,
  `pnpm typecheck`,
  `bash -n infra/scripts/template-build-smoke.sh`,
  `git diff --check`,
  and `pnpm smoke:template-build` passed after redeploying API image
  `sha256:3e4ce24870a9f37435ae543f43026401083b6c42fc46a312ad5b5a695c6bb321`.
  The smoke created build `bld_61ukPTP4u_EF`, version
  `tplv_e-Xyjz2FiZEt`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_Vf-5JG5-U8`; the launched sandbox returned
  `harakiri-built`. The smoke also asserted
  `template_builds.metadata.builder = buildkit`,
  `template_builds.metadata.builderDetails.provider = buildkit`, runtime pull
  preflight `status = ok`, and builder Job/Pod/node metadata. Follow-up
  cleanup audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `templates_named_smoke=0`.
- Sandbox renew and OpenSandbox transport-split checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test` reported 133/133 passing, `pnpm --filter
  @harakiri/api typecheck`, `pnpm openapi:check`, `bash -n
  infra/scripts/renew-smoke.sh`, and `git diff --check` passed after aligning
  Harakiri renew with the current OpenSandbox `/renew-expiration` contract and
  splitting the OpenSandbox provider into client, execd, files, logs, metrics,
  routes, types, and facade modules. `deploy-k0s.sh` rolled the API to pod
  `harakiri-api-64f95d457d-dg6l5`; the registry manifest digest was
  `sha256:2092d5d8655daea6a262b4c53f00179a0f3d61fdf7d5007a2ffaee60809da793`
  and the pod image ID was
  `sha256:66847f882e1c4967e81b7f1877b55013c47a5fc7f32074a530084f2d46472ce8`.
  `pnpm smoke:renew` passed with sandbox `sbx_sbvBX7hsBO` and latest renew
  operation `succeeded` with `expiresAt=2026-05-24T22:01:28.361Z`; `pnpm smoke`
  passed with sandbox `sbx_FgPGFJbKgS`; `pnpm smoke:route` passed with sandbox
  `sbx_fCL_SdS6jO` and route
  `https://61469404-5306-4bc4-9a12-d6d307bc5ba4-3000.harakiri.io`; and a live
  runtime-panel API probe passed with sandbox `sbx_RKPnWkAAGV`, reporting
  `files=12 cwd=/`, `logs=15`, and `metrics_cpu=2 metrics_mem=2362`. Follow-up
  cleanup audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `ready_routes=0`.
- Sandbox lifecycle synchronous-interface checkpoint on 2026-05-24: after
  strengthening `tests/e2e/harakiri.spec.ts`, `pnpm --filter @harakiri/cli
  build`, `git diff --check -- tests/e2e/harakiri.spec.ts`, and
  `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright test
  tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox workflows"`
  passed against the deployed k0s stack. The e2e now asserts Web create lands
  on a running detail page, API default create returns `201` with no pending
  operation, CLI default create prints `sealed.` and not `queued.`, and SDK
  default create returns a running sandbox with no pending operation. Cleanup
  audit reported `active_sandboxes=0`, `active_smoke_keys=0`, and
  `running_real_e2e=0`; latest real-flow sandboxes were
  `sbx_1N2qvnovDG` (web), `sbx_RuQeZB0DHn` (CLI), and `sbx_iR508mdojC` (SDK),
  all terminated.
- Authenticated web modularization checkpoint on 2026-05-24: the same deployed
  Web/API/CLI/SDK e2e was extended to cover sandbox detail runtime tabs,
  filesystem/default-root behavior, logs, metrics API data, network empty
  state, templates List/Builds tabs, and docs navigation across Quickstart,
  Template builds, and API reference. The targeted command
  `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright test
  tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox workflows"`
  passed with 1/1 tests. Screenshots were saved at
  `/tmp/harakiri-auth-runtime-tabs.png`,
  `/tmp/harakiri-auth-template-tabs.png`, and
  `/tmp/harakiri-auth-docs.png`; visual review confirmed the extracted routes
  still use the existing centralized design tokens and restrained product UI.
  Follow-up checks passed: `pnpm --filter @harakiri/web test` reported 10/10,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/web
  build`, and `git diff --check`. Cleanup audit reported
  `active_sandboxes=0`, `active_smoke_keys=0`, and `running_real_e2e=0`.
- OSS documentation and governance checkpoint on 2026-05-24: added
  `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `.github/pull_request_template.md`, bug/feature issue templates,
  `docs/README.md`, `docs/development.md`, and `docs/extensions.md`; package
  manifests now declare `Apache-2.0`. `README.md` now leads with the portable
  OSS contributor path, the core runbook links out to
  `infra/scripts/env/harakiri/README.md` for maintainer Cloudflare/DNS details,
  and website docs now show packaged CLI installation plus the published
  `/openapi.json` contract. Verification passed:
  `pnpm --filter @harakiri/web test` (10/10),
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/cli test` (24/24),
  `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/sdk test` (7/7),
  `pnpm --filter @harakiri/api test` (133/133),
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/shared test` (5/5),
  `pnpm openapi:check`, `pnpm build`, and `git diff --check`.
- Phase 10 route portability checkpoint on 2026-05-24: route host/key/url
  generation now lives in `apps/api/src/providers/runtime/route-targets.ts`.
  The OpenSandbox route helper, sandbox runtime fallback path, operation-worker
  fallback path, and development runtime provider all use the configured
  `SANDBOX_ROUTE_BASE_DOMAIN` and `SANDBOX_ROUTE_PUBLIC_SCHEME` instead of
  duplicating `sandbox.localhost`. Verification passed:
  `pnpm --filter @harakiri/api test` (135/135),
  `pnpm --filter @harakiri/api typecheck`, and targeted `git diff --check`.
- Phase 10 legacy-builder reference audit on 2026-05-24: `rg` found no Kaniko
  mentions in `apps/web`, `packages/cli`, `packages/sdk`, or
  `packages/shared`. Remaining references are scoped to the legacy builder
  implementation/tests, compatibility configuration, ADR/plan history,
  legacy-provider documentation, or historical test-report evidence. Corrected
  the BuildKit source path in `docs/extensions.md` to
  `apps/api/src/builders/buildkit-kubernetes-builder.ts`.
- Phase 10 deployed regression checkpoint on 2026-05-24:
  `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm openapi:check`, and
  `git diff --check` passed. k0s redeploy passed with
  `HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS=0 HARAKIRI_INSTALL_INGRESS_NGINX=0
  bash infra/scripts/deploy-k0s.sh`; API image
  `sha256:670f907f96ed4f2070706f9580ec56401c6cae81c9fc1625ff3cd68e7aaf66de`
  and web image
  `sha256:dcb9a80459c7dddb8490a220635715a37e4db807231e48a2c60475c55ff2869e`
  rolled out. `pnpm ports:restart && pnpm ports:status` reported web, API,
  Keycloak, OpenSandbox, gateway, and ingress HTTPS forwards ready. Live
  ConfigMap values were `PUBLIC_API_URL=http://127.0.0.1:18082`,
  `PUBLIC_KEYCLOAK_URL=http://127.0.0.1:18084`,
  `SANDBOX_ROUTE_BASE_DOMAIN=sandbox.localhost`, and
  `SANDBOX_ROUTE_PUBLIC_SCHEME=https`; wildcard ingress host/TLS were
  `*.sandbox.localhost`.
- Phase 10 live product smokes on 2026-05-24:
  `pnpm smoke` created `sbx_ms9bGwboGN`, executed the Python agent command,
  and killed it; `pnpm smoke:templates` passed for `python-3.12`,
  `python-3.12-data`, and `node-20`; `pnpm smoke:route` exposed
  `https://cbc614c8-63df-407c-abdb-ac50375e9402-3000.sandbox.localhost`;
  `pnpm smoke:template-build` passed with build `bld_0GaloDk6IN3h`, version
  `tplv_qu36CRNsUYSv`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_B43UISTgxk`; `pnpm e2e` passed 2/2 tests for the full
  Web/API/CLI/SDK workflow and completed-user onboarding redirect; and
  `pnpm smoke:route-ingress` exposed
  `https://5873bb35-1b4a-4a10-85fb-6086a88bbf5c-3000.sandbox.localhost`
  through local ingress HTTPS. Cleanup audit reported `active_sandboxes=0`,
  `active_smoke_keys=0`, `ready_routes=0`, and `active_template_builds=0`.
- Phase 9 local OSS contributor proof on 2026-05-24: `docker compose config`
  passed after making PostgreSQL and Keycloak host ports overrideable.
  `LOCAL_KEYCLOAK_PORT=18181 docker compose up -d keycloak` started Keycloak
  with the committed realm import, and
  `http://127.0.0.1:18181/realms/harakiri/.well-known/openid-configuration`
  returned the imported realm metadata; the temporary Keycloak service was then
  stopped. `pnpm db:migrate` and `pnpm db:seed` passed against local
  PostgreSQL, seeding `lyra@k.ai`, the `Lyra Labs` workspace, and demo API key
  `hk_live_demo_lyra_labs_0000000000000000000000000000000000`. A local API
  started with `HARAKIRI_RUNTIME_PROVIDER=dev` accepted the seeded key; from a
  clean temporary home the packaged CLI created sandbox `sbx_IaoHRjGptl`, ran
  `echo local-dev-ok`, exposed port 3000 at
  `http://dev-mpkdozdg-ddiwxg-3000.local-dev.test`, listed routes, and killed
  the sandbox. Local cleanup reported `local_active_sandboxes=0` and
  `local_demo_keys=1`.
- Phase 9 docs-audience audit on 2026-05-24: removed the private absolute
  template path from active docs, changed product and CLI examples to local
  OSS defaults (`127.0.0.1:8080`) or `$HARAKIRI_API_URL`, and confirmed active
  product docs/package help no longer contain the removed comparison target,
  the stale database-centered control-plane phrase, or private paths. Remaining
  `127.0.0.1:18082`, `harakiri.io`, Cloudflare, and legacy-builder references
  are historical test evidence, runbook/deployment examples, completed plans,
  legacy-provider docs, or maintainer environment docs.
- Post-update focused verification on 2026-05-24: `pnpm --filter
  @harakiri/web test` passed 10/10, `pnpm --filter @harakiri/web typecheck`
  passed, `pnpm --filter @harakiri/cli test` passed 24/24, `pnpm --filter
  @harakiri/cli typecheck` passed, `pnpm build` passed across shared, API,
  web, SDK, and CLI packages, `docker compose config` passed, and
  `git diff --check` passed.
- OSS architecture refactor closeout on 2026-05-25: `pnpm test`,
  `pnpm typecheck`, `pnpm openapi:check`, `pnpm build`, `pnpm cli:pack`,
  `docker compose config`, and `git diff --check` passed. The current tree was
  redeployed to k0s with API image
  `sha256:61830fb760d6edcbd5187520e57ac37708848e51360c4e3d0a6b8f7f9b173bd3`
  and web image
  `sha256:770e6482c3555a04827e12e5851f9064d7ee418e55dfdca5ed855511b4fc9ac9`;
  `pnpm ports:restart && pnpm ports:status` reported web, API, Keycloak,
  OpenSandbox, gateway, and ingress HTTPS forwards ready. `pnpm smoke` created
  `sbx_aaHbDz1GNn`, ran the Python agent command, and killed it.
  `pnpm smoke:templates` passed for `python-3.12`, `python-3.12-data`, and
  `node-20`. `pnpm smoke:route` exposed
  `https://9c737267-4d96-42a7-8208-cb4c715b8120-3000.sandbox.localhost`.
  `pnpm smoke:template-build` passed with build `bld_8HI6em_S-xzc`, version
  `tplv_a5jCB8lXdOSG`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  and sandbox `sbx_kRFu4TEK2M`; the launched sandbox returned
  `harakiri-built`. `pnpm e2e` passed 2/2 tests for Web/API/CLI/SDK workflows
  and completed-user onboarding redirect. `pnpm smoke:route-ingress` exposed
  `https://b6b37639-0944-480d-b043-2301e59de8fd-3000.sandbox.localhost`
  through local ingress HTTPS. Cleanup audit reported `active_sandboxes=0`,
  `active_smoke_keys=0`, `ready_routes=0`, and `active_template_builds=0`.
- Documentation checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`, and
  `pnpm build` passed after adding custom template docs. A Playwright docs
  navigation smoke check opened the product docs and verified "Create a custom
  template", "Template builds", "Using templates from SDKs", "Open Agents
  template", "Security model", and "API reference" render with no console
  errors.
- Open Agents documentation checkpoint on 2026-05-24: after redeploying with
  `pnpm deploy:k0s` and restarting port-forwards, a Playwright smoke check
  opened `http://127.0.0.1:15173/#docs`, selected "Open Agents template", and
  verified the deployed product docs include the build command, the
  `harakiri-open-agents-smoke` command, and the route exposure section with no
  console errors.
- Template retention checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed after
  adding scheduler-owned template retention. `pnpm deploy:k0s` rolled out the
  API, scheduler, template builder, and web app; `pnpm ports:restart &&
  pnpm ports:status` restored local access.
- Deployed retention smoke on 2026-05-24: temporary PostgreSQL rows older than
  the configured retention windows were inserted for a disposable organization,
  then the deployed API pod ran `cleanupTemplateRetention()` with builder Job
  deletion disabled. The cleanup report was
  `{"logsDeleted":1,"contextsDeleted":1,"buildsDeleted":1,"versionsRetired":1,"builderJobsDeleted":0}`.
  Follow-up SQL verified the old unversioned build, log, and context were gone,
  the superseded version status was `retired`, and one
  `template.version.retired` audit event existed. The disposable organization
  was deleted afterward.
- Product docs retention smoke on 2026-05-24: a Playwright check opened the
  deployed website at `http://127.0.0.1:15173/#docs`, selected "Template
  builds", verified the Retention section text, and saved
  `/tmp/harakiri-retention-docs.png`.
- Post-retention template build smoke on 2026-05-24: `pnpm smoke:template-build`
  passed against the deployed k0s stack, creating build `bld_E0rhiglTbrCx`,
  version `tplv_qnkIri-5FYCJ`, digest
  `sha256:74b5a99102c137e706c8e064199e9894973a3bb51560a028626bcdd0537b4db3`,
  and sandbox `sbx_qHouzeA-Dq`.
- Runtime pull preflight checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/web build`,
  `pnpm typecheck`, `pnpm test`, and `git diff --check` passed after adding
  the builder preflight Pod. `pnpm deploy:k0s` rolled out API, web, scheduler,
  and template builder images plus RBAC for the Harakiri service account to
  create/delete preflight Pods in the OpenSandbox runtime namespace. Deployed
  config reported
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED=1`,
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE=opensandbox`, and
  `TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS=120000`; `kubectl auth can-i`
  returned `yes` for create pods, delete pods, and get pods/status in the
  `opensandbox` namespace, and `no` for create pods in the `harakiri`
  namespace, as `system:serviceaccount:harakiri:default`.
- Post-preflight template build smoke on 2026-05-24:
  `pnpm smoke:template-build` passed with build `bld_VNGckePUvF_i`, version
  `tplv__g0ItmjuEE3z`, digest
  `sha256:3e5084353510446f3a5d550132273f29a728508d1e059a0596b6742fb3581074`,
  and sandbox `sbx_ql4sfPZSmV`. The streamed build logs included
  `runtime image pull preflight ok in 2077ms`, and the smoke asserted
  `template_builds.metadata.runtimePullPreflight.status = ok`,
  `namespace = opensandbox`, and preflight Pod/node metadata.
- Product docs preflight smoke on 2026-05-24: a Playwright check opened
  `http://127.0.0.1:15173/#docs`, clicked the Template builds and Security
  model docs, verified both mention runtime pull preflight, and saved
  `/tmp/harakiri-preflight-docs.png`.
- Sandbox regression smoke on 2026-05-24: after the template preflight
  deployment, `pnpm smoke` created `sbx_ENlDwrI3qj`, executed the Python agent
  command through OpenSandbox, and killed the sandbox. `pnpm smoke:ttl` created
  `sbx_d8LhpQkS8o` with a 10 second TTL and observed it transition to
  `terminated`. `pnpm smoke:route` exposed
  `https://72658c1d-9ca6-40ee-884d-7b178df4a678-3000.harakiri.io` through the
  OpenSandbox gateway. `pnpm smoke:route-ingress` exposed
  `https://94c8c578-af36-4450-a990-e9e14650a224-3000.harakiri.io` through
  ingress HTTPS.
- `pnpm ports:restart && pnpm ports:status` passed for web, API, Keycloak, OpenSandbox server, and OpenSandbox gateway forwards.
- `pnpm smoke` passed sandbox create, real command execution, and kill through OpenSandbox with adapter fallback disabled.
- `pnpm smoke:ttl` passed scheduler termination of a 10-second Harakiri TTL sandbox while using a provider-safe OpenSandbox lease.
- `pnpm smoke:route` passed exposed-port routing through the OpenSandbox gateway host route.
- `pnpm route:tls-dev` created `opensandbox-system/harakiri-sandbox-wildcard-tls` as a k0s-local wildcard TLS secret.
- `pnpm smoke:route-ingress` passed HTTPS termination through `ingress-nginx` and forwarding to OpenSandbox gateway.
- `pnpm cert-manager:install` installed cert-manager v1.20.2 and rolled out `cert-manager`, `cert-manager-cainjector`, and `cert-manager-webhook`.
- `pnpm env:harakiri:route-preflight` passed for `preflight-3000.harakiri.io`, proving Cloudflare DNS/TLS reaches k0s/OpenSandbox.
- `pnpm env:harakiri:route-public` passed with a real generated route such as `https://0e3a7657-b7a2-426c-9806-ba477796ae30-3000.harakiri.io`.
- `pnpm e2e` passed Keycloak browser login, dashboard API key creation, and real sandbox workflows via Web, API, CLI, and SDK.
- CLI route exposure passed with `harakiri expose <sandbox-id> --port 3000` and `harakiri routes <sandbox-id>`.
- Dashboard Network tab route creation passed in Playwright; screenshot: `/tmp/harakiri-network-tab.png`.
- API route lifecycle passed: repeated `POST /routes` was idempotent and sandbox kill changed the persisted route state to `terminated`.
- Route limit smoke passed: the ninth active route on one sandbox returned `429 sandbox_route_limit_exceeded` with limit `8`.
- Protocol route smoke passed through OpenSandbox gateway for HTTP, SSE, and WebSocket.
- Global CLI install from the local package was verified with `harakiri --version`.
- Template control-plane smoke was verified locally: template create, queued
  build creation, build list, build logs, retry/cancel/promote endpoints, SDK
  methods, and CLI `template init/list/build/builds/logs/promote/inspect`.
- Deployed template API integration smoke on 2026-05-24:
  `pnpm smoke:template-audit` passed with template `audit-smoke-1779603932`,
  build `bld_xIOr1b4m2RiA`, and sandbox `sbx_NileGT1paz`. The smoke verified
  template create/get/versions, sandbox creation by immutable template version
  ID with `sandbox.templateVersionId = tplv_pqARiMBCZ6D4`, build
  create/cancel/get/list/logs, promote alias resolution, archive behavior, and
  audit events.
- Repo docs link audit on 2026-05-24: the README links were expanded to the
  full template contributor/operator doc set, and
  `for path in docs/templates.md docs/template-builds.md docs/template-security.md docs/template-runtime-contract.md docs/api.md docs/architecture.md docs/runbook.md docs/test-report.md; do test -f "$path" || exit 1; done`
  printed `template repo docs links exist`.
- `pnpm smoke:templates` passed after the retention deployment, proving
  `python-3.12`, `python-3.12-data`, and `node-20` catalog templates still
  create, execute a version command, and terminate through the live
  OpenSandbox-backed path.
- Template image-import builder smoke was verified locally on 2026-05-24:
  `processNextImageImportBuild()` claimed a queued `source_type='image'` record,
  resolved `hello-world:latest` to a `sha256:` digest, marked the build
  `success`, created a ready `template_versions` row, updated
  `templates.latest_version_id`, and cleaned up the temporary organization.
- k0s deployment checkpoint on 2026-05-24: `pnpm deploy:k0s` rolled out
  `harakiri-api`, `harakiri-web`, `harakiri-scheduler`, and the new
  `harakiri-template-builder` deployment. A cluster smoke inserted a temporary
  `source_type='image'` build for `hello-world:latest`; the deployed builder
  marked it `success`, stored digest
  `sha256:0e760fdfbc48ba8041e7c6db999bb40bfca508b4be580ac75d32c4e29d202ce1`,
  created a `tplv_...` latest version, and the temp organization was deleted.
- Dockerfile context upload smoke was verified against k0s on 2026-05-24:
  the built `packages/cli/dist/index.js` executable created a temporary
  `source_type='dockerfile'` build, uploaded a tar+gzip context, and PostgreSQL
  stored `template_build_contexts.sha256` as
  `sha256:e39205a9786b61c16fc7ef809abdd07a53d17cf64f1a5c94d5575b9033063d90`,
  with `size_bytes = 188`, `file_count = 2`, and matching
  `template_builds.context_hash`. The build log contained the received-context
  line. The temporary template was deleted and temporary smoke API keys were
  revoked.
- Dockerfile builder execution smoke was verified against k0s on 2026-05-24:
  `harakiri template build` uploaded a tiny Ubuntu Dockerfile context, the
  deployed `harakiri-template-builder` created Kaniko Job
  `hkbld-bld-1c-zku8jjbwt`, Kaniko pushed
  `127.0.0.1:5000/harakiri/templates/kaniko-ubuntu-1779584493@sha256:d9a1f930a7bc244afb17b0ea7b3767bb68117a050e5ee60a476686e0e8d0134c`,
  Harakiri created ready version `tplv_zaEUAKxJoZtB`, and `harakiri create`
  started `sbx_av-gq_64Tk` from that template. `harakiri run
  sbx_av-gq_64Tk --cmd "cat /harakiri-built.txt"` returned
  `harakiri-built`, then the sandbox was killed. A BusyBox variant also proved
  registry pull worked, but failed OpenSandbox bootstrap because the image did
  not provide the expected shell userland.
- `pnpm smoke:template-build` passed against k0s on 2026-05-24, repeating the
  Dockerfile build, digest-pinned ready version, sandbox creation, command run,
  sandbox kill, and temporary API-key cleanup flow. The run produced
  `bld_sUnEbjLxNoSv`, `sbx_C4pV_pBSUF`, and command output
  `harakiri-built`.
- Post-redeploy `pnpm smoke:template-build` passed on 2026-05-24 after updating
  the CLI config parser, Open Agents docs, and website product docs. The run
  produced `bld_yb6B4nHTIwbO`, `sbx_B4m1LnRZaw`, command output
  `harakiri-built`, and left `running_sandboxes=0` and `ready_routes=0`.
- CLI build-follow checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, and `pnpm smoke:template-build` passed after changing
  `harakiri template build` to wait by default, stream build-log lines, and
  print the final build ID, template version ID, image digest, duration, and
  next create command. The k0s smoke produced `bld_0fWVYnUctnhu`,
  `tplv_D61gc5TeRzLe`,
  `sha256:fe1704f4798a46f18499978c6a6b21e30f1ff6fb5849b846e6ec2a33b705a107`,
  `sbx_kQmOmE8_Pt`, command output `harakiri-built`, and left
  `running_sandboxes=0` and `ready_routes=0`.
- Template limits checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status`
  passed after adding configurable template resource limits and per-organization
  queued/building build concurrency limits. `pnpm smoke:template-limits`
  verified over-limit CPU returned `422 template_resource_limit_exceeded` with
  limit `8`, three queued Dockerfile builds were accepted, and the fourth build
  returned `429 template_build_concurrency_limit_exceeded` with active count
  `3`.
- Post-limit regression smokes on 2026-05-24: `pnpm smoke:template-redaction`
  passed with build `bld_PYEGkI934RcB`; `pnpm smoke:template-build` passed with
  build `bld_fdydiFPTsvZg`, version `tplv_kfXM0H0snjT3`, digest
  `sha256:66fe5dffdeadfbac577aaef63ef0deb4eecfe6fc85aa931122441530ac973d19`,
  sandbox `sbx_bSLg9hGTt_`, and command output `harakiri-built`.
- Product docs browser checkpoint on 2026-05-24: a Playwright browser smoke
  opened `http://127.0.0.1:15173/#docs`, verified the Template Builds and
  Security Model pages render the new Limits guidance with no console errors,
  and wrote `/tmp/harakiri-template-limits-docs.png`.
- Post-limit cleanup audit on 2026-05-24: PostgreSQL reported no active
  `smoke-*` API keys, no running/pending/idle sandboxes, no `limits-smoke-*`,
  `redaction-smoke-*`, or `kaniko-smoke-*` templates, and no residual
  `runtime-kaniko-smoke-*` sandbox rows.
- Template image policy checkpoint on 2026-05-24: `pnpm test`, `pnpm
  typecheck`, `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm
  ports:status` passed after adding registry/prefix policy for template images,
  image-import targets, and Dockerfile `FROM` references. `pnpm
  smoke:template-policy` verified a disallowed template image and a disallowed
  Dockerfile base image both returned `422 template_image_policy_violation`
  with `registry_not_allowed`; the run used build `bld_RXxlQudffuo0`.
- Post-policy allowed-build regression on 2026-05-24: `pnpm
  smoke:template-build` passed with build `bld_LOP9MXjryOLD`, version
  `tplv_o1T_F2_bs-nW`, digest
  `sha256:a8dcfb032b3a289e7f9fae262c6a1cbd91fd343e6788caf0236a31cfeaedd7af`,
  sandbox `sbx_ECcuvjlpOu`, and command output `harakiri-built`.
- Product docs image-policy browser checkpoint on 2026-05-24: a Playwright
  browser smoke opened `http://127.0.0.1:15173/#docs`, verified the Template
  Builds and Security Model pages render the new image-policy guidance with no
  console errors, and wrote `/tmp/harakiri-template-image-policy-docs.png`.
- Post-policy cleanup audit on 2026-05-24: PostgreSQL reported no active
  `smoke-*` API keys, no running/pending/idle sandboxes, no
  `image-policy-smoke-*` or `kaniko-smoke-*` templates, and no residual
  `runtime-kaniko-smoke-*` sandbox rows.
- Runtime metadata checkpoint on 2026-05-24: `pnpm test`, `pnpm typecheck`,
  `pnpm build`, `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status`
  passed after expanding OpenSandbox metadata. `pnpm smoke` created
  `sbx_knECzNSYRt`, executed the Python agent command successfully, and killed
  the sandbox. The latest `sandbox.create` audit row stored
  `templateId=python-3.12-data`, `templateVersionId=tplv_python_3_12_data_1`,
  `routePolicy.mode=opensandbox-gateway`, and
  `routePolicy.baseDomain=harakiri.io`. A Playwright docs smoke verified the
  deployed Security Model page renders the runtime metadata guidance with no
  console errors and wrote `/tmp/harakiri-runtime-metadata-docs.png`.
- Post-runtime-metadata cleanup audit on 2026-05-24: PostgreSQL reported no
  active `smoke-*` API keys, no running/pending/idle sandboxes, and no active
  routes.
- Template provenance checkpoint on 2026-05-24: `pnpm test`, `pnpm typecheck`,
  `pnpm build`, `bash -n infra/scripts/template-build-smoke.sh`, and
  `git diff --check` passed after adding SBOM/provenance and scan-status fields
  to `template_versions`. After the final direct-create provenance redaction
  change, API-scoped typecheck, tests, and build also passed. `pnpm deploy:k0s`
  rolled out the migration and final API image, then
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy.
  `pnpm smoke:template-build` produced build `bld_Irc5TpBi26Pr`, version
  `tplv_KXoCKfSfB7KW`, digest
  `sha256:275e67e72da65df11fc9840be2e09f88ca36b38872811f78b144cbf6c5783537`,
  sandbox `sbx_uPuW837AWL`, and command output `harakiri-built`. The smoke also
  verified PostgreSQL stored `scan_status=not_scanned`,
  `provenance.buildId=bld_Irc5TpBi26Pr`, and
  `scan_summary.reason=scanner_not_configured`.
- Template provenance regression checkpoint on 2026-05-24: `pnpm smoke` passed
  after the same deployment, creating `sbx_JIHJDrCu7_`, running the Python agent
  command, and killing the sandbox. A Playwright browser smoke opened
  `http://127.0.0.1:15173/#docs`, selected "Security model", verified the
  deployed product docs include "Provenance" and `scanner_not_configured`, and
  wrote `/tmp/harakiri-version-provenance-docs.png`.
- Post-provenance cleanup audit on 2026-05-24: PostgreSQL reported
  `security_columns=4`, no active smoke API keys, no running/pending/idle
  sandboxes, no `kaniko-smoke-*` templates, no `runtime-kaniko-smoke-*` sandbox
  rows, and `ready_routes=0`.
- Template audit/archive checkpoint on 2026-05-24: `pnpm test`, `pnpm
  typecheck`, `pnpm build`, `bash -n infra/scripts/template-audit-smoke.sh`,
  and `git diff --check` passed after adding shared audit recording, template
  archive lifecycle handling, CLI/SDK archive support, and repo/product docs.
  After the final dashboard Archive gating change, `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, and
  `git diff --check` also passed. `pnpm deploy:k0s` rolled out the changes and
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy.
- Template audit/archive smoke on 2026-05-24: `pnpm smoke:template-audit`
  created template `audit-smoke-1779592676`, version `tplv_LEDIGAz8ZIMP`,
  sandbox `sbx_xakrl7ZAyp`, and build `bld_7cElfT0xdNqG`; it verified
  `template.create`, `sandbox.create`, `template.build.create`,
  `template.build.cancel`, `template.promote`, and `template.archive` audit
  actions, confirmed archived templates are hidden from active lists, and
  confirmed archived aliases cannot create new sandboxes.
- Template builder audit regression on 2026-05-24: `pnpm smoke:template-build`
  created build `bld_OX0O6AhycXhu`, version `tplv_vlbIfShYV_0l`, digest
  `sha256:8df8e8c8192981c9462fa34c50e13d01b9b8b1094756ffcdd154fa3775622de0`,
  and sandbox `sbx_PJOkPeRHEh`; `harakiri run` returned `harakiri-built` and
  the smoke verified the `template.build.success` audit event points at the
  produced version.
- Template archive UI/docs browser checkpoint on 2026-05-24: a Playwright smoke
  created `ui-archive-1779592978983`, verified the deployed Templates List can
  archive a private active template, verified the archived row appears only
  under the Archived filter with Use/Build disabled and no Archive action, and
  wrote `/tmp/harakiri-template-archive-ui.png`. The same browser run verified
  the website docs include the Template Builds archive workflow, Security Model
  audit wording, and API Reference `/v1/templates/:id/archive`, then wrote
  `/tmp/harakiri-template-audit-docs.png`.
- Post-audit/archive cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `smoke_templates=0`,
  `runtime_smoke_rows=0`, and `ready_routes=0`.
- Template List actions checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, and
  `git diff --check` passed after adding deployed dashboard row actions for
  Builds and Promote plus matching repo and website docs. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, and a Playwright browser smoke created `ui-actions-1779593529748`
  with canceled build `bld_kVqM5iyPSoMI`. The smoke verified Builds opens the
  Builds tab filtered to the template, Promote records a `template.promote`
  audit event, and the product docs describe the row actions. Screenshots:
  `/tmp/harakiri-template-list-actions.png` and
  `/tmp/harakiri-template-actions-docs.png`.
- Post-Template-List-actions cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_action_templates=0`, and
  `ready_routes=0`.
- Template List filters checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/shared build`, `pnpm typecheck`, `pnpm --filter @harakiri/web
  build`, `pnpm test`, and `git diff --check` passed after adding API-backed
  owner (`team`/`platform`), runtime family, and active/archived status filters
  to the Templates List. `pnpm deploy:k0s` completed and `pnpm ports:restart &&
  pnpm ports:status` reported every forward healthy. A Playwright browser smoke
  created `ui-filters-1779593948515`, verified `GET /v1/templates` with
  `owner=team&runtimeFamily=custom`, verified the deployed UI filters show the
  team/custom row, hide it under the Platform owner filter, and reveal it again
  under the Archived status after archive. It also verified website docs mention
  visibility, owner, runtime family, and active/archived filtering. Screenshots:
  `/tmp/harakiri-template-list-filters.png` and
  `/tmp/harakiri-template-filters-docs.png`.
- Post-Template-List-filters cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_filter_templates=0`, and
  `ready_routes=0`.
- Template/build metadata table checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/shared build`, `pnpm typecheck`, `pnpm test`, `pnpm --filter
  @harakiri/web build`, and `git diff --check` passed after adding latest build
  status, created timestamp, explicit alias columns, build result version
  fields, and build context summaries. `pnpm deploy:k0s` completed and `pnpm
  ports:restart && pnpm ports:status` reported every forward healthy. A
  Playwright/API smoke created template `ui-meta-1779594902549`, uploaded a
  Dockerfile context for `bld_LjMrhI1CYoDA`, completed image-import build
  `bld_i-8y61uOvxoL`, verified result version `tplv_Tlcw9WJ8AnFD`, validated
  context summary metadata, and verified the deployed Templates List/Builds
  tables plus product docs. Screenshots:
  `/tmp/harakiri-template-metadata-tables.png` and
  `/tmp/harakiri-template-metadata-docs.png`.
- Post-template/build metadata cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_meta_templates=0`, and
  `ready_routes=0`.
- Kubernetes builder runtime metadata checkpoint on 2026-05-24: `pnpm
  typecheck`, `pnpm test`, `pnpm --filter @harakiri/web build`, and `git diff
  --check` passed after persisting Dockerfile builder Job, Pod, Pod UID,
  namespace, and node metadata on successful build records. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, and `pnpm smoke:template-build` passed with build
  `bld_NU6OGPcV7SCW`, version `tplv_QOyx33J2Y_0M`, and sandbox
  `sbx_2WxfrtOc7G`. The smoke now asserts that `template_builds.metadata`
  contains non-empty `builderJobName`, `builderPodName`, and `builderNodeName`.
- Post-builder-runtime-metadata cleanup audit on 2026-05-24: PostgreSQL
  reported `active_smoke_keys=0`, `live_sandboxes=0`,
  `kaniko_smoke_templates=0`, and `ready_routes=0`.
- Template visibility authorization checkpoint on 2026-05-24: `pnpm
  --filter @harakiri/shared build`, `pnpm typecheck`, `pnpm test`, `pnpm
  --filter @harakiri/web build`, and `git diff --check` passed after adding an
  explicit read policy for organization-owned templates plus platform
  `public`/`internal` templates, denying platform `private` templates, and
  blocking build/promote mutations on shared platform templates. `pnpm
  deploy:k0s` completed, `pnpm ports:restart && pnpm ports:status` reported
  every forward healthy, `pnpm smoke:template-visibility` passed with
  `visibility-owned-1779596359` and build `bld_NWrlPdTBm7LY`, and `pnpm
  smoke:templates` passed for `python-3.12`, `python-3.12-data`, and `node-20`.
- Post-template-visibility cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `visibility_templates=0`,
  `ready_routes=0`, and `custom_visibility=internal`.
- Product docs deploy checkpoint on 2026-05-24: `pnpm deploy:k0s` completed,
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy, and
  a Playwright smoke check verified the deployed Docs pages mention
  `--no-wait`, the default build-log follow behavior, and the Template Builds
  status guidance with no console errors.
- Default template catalog checkpoint on 2026-05-24: `pnpm smoke:templates`
  passed against k0s, creating/running/killing `python-3.12`
  (`sbx_5mfgKWOHyk`, `python --version` -> `Python 3.12.13`),
  `python-3.12-data` (`sbx_IDjCpAZASD`, `python --version` ->
  `Python 3.12.13`), and `node-20` (`sbx_-wVMcJAiJV`,
  `node --version` -> `v20.20.2`). A failed intermediate script run had already
  killed its sandbox but left a temporary smoke API key; it was revoked through
  the API. Post-test audit showed no active `smoke-*` API keys, `running_sandboxes=0`,
  and `ready_routes=0`.
- Dashboard New Template checkpoint on 2026-05-24: `pnpm --filter
  @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`, `pnpm
  typecheck`, `pnpm test`, and `git diff --check` passed after adding the
  dashboard New Template modal, browser Dockerfile tar+gzip upload, image
  import flow, clone/fork flow, `harakiri.toml` preview, and product/repo docs.
  `pnpm deploy:k0s` completed, `pnpm ports:restart && pnpm ports:status`
  reported every forward healthy, and a Playwright dashboard smoke logged in
  through Keycloak at `http://127.0.0.1:15173`, created templates from
  Dockerfile, existing image, and clone modes, waited for the queued builds,
  created and ran a sandbox from the Dockerfile-created template, verified the
  website docs mention New Template and `harakiri.toml`, and wrote
  `/tmp/harakiri-new-template-dashboard.png`. A subsequent `pnpm
  smoke:templates` rerun passed for `python-3.12`, `python-3.12-data`, and
  `node-20` after an earlier transient `fetch failed` run left a sandbox that
  was explicitly killed.
- Post-dashboard-New-Template cleanup audit on 2026-05-24: PostgreSQL reported
  `active_smoke_keys=0`, `live_sandboxes=0`, `ui_new_templates=5`,
  `ui_new_active_templates=0`, and `ready_routes=0`. The `ui_new_templates`
  rows are archived build-history records from the dashboard smoke.
- Template failure UX checkpoint on 2026-05-24: `pnpm --filter @harakiri/web
  typecheck`, `pnpm --filter @harakiri/web build`, `pnpm typecheck`, `pnpm
  test`, `pnpm --filter @harakiri/cli build`, and `git diff --check` passed
  after adding dashboard build/log loading states, classified failed-build
  panels, user-facing template troubleshooting docs, and runbook commands for
  builder health, failed pulls, and local registry cleanup. `pnpm deploy:k0s`
  completed and `pnpm ports:restart && pnpm ports:status` reported every
  forward healthy. A Playwright smoke created a `ui-fail-*` image-import build
  against a nonexistent Docker Hub image, waited for the real builder to mark it
  `failed`, selected it in the deployed Builds tab, verified the dashboard
  showed "Registry lookup failed", retained log text, and linked to "Template
  troubleshooting", then wrote `/tmp/harakiri-build-failure-ui.png`. A CLI smoke
  created `cli-fail-1779598270`, build `bld_ghJk7Vmm_o3i`, streamed the
  retained registry error, and exited non-zero with `template build
  bld_ghJk7Vmm_o3i failed: registry did not return a sha256 digest...`.
  `pnpm smoke:templates` also passed after the deployment for `python-3.12`,
  `python-3.12-data`, and `node-20`.
- Post-template-failure-UX cleanup audit on 2026-05-24: PostgreSQL reported
  `active_failure_keys=0`, `live_sandboxes=0`, `ui_fail_active_templates=0`,
  `cli_fail_active_templates=0`, `failed_smoke_builds=5`, and
  `ready_routes=0`. The failed smoke builds are retained archived history for
  failure inspection.
- Template detail checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed after
  adding the dashboard Template detail panel, `GET /v1/template-builds` exact
  `template` filtering, `GET /v1/sandboxes` `template`/`templateVersionId`
  filtering, repo docs, and website product docs. `pnpm deploy:k0s` completed,
  `pnpm ports:restart && pnpm ports:status` reported every forward healthy,
  and deployed API checks against `open-agents-dev` returned one template,
  3 versions, 3 filtered builds, and 2 filtered sandbox runs. An agent-browser
  smoke logged into `http://127.0.0.1:15173` with the Keycloak token, opened the
  deployed Templates page, selected `open-agents-dev`, and verified the Overview
  tab create command and SDK snippet, the Versions tab immutable version data,
  the Config tab generated `harakiri.toml`/redacted build metadata, the Runs tab
  sandbox history, and the website docs. Screenshots:
  `/tmp/harakiri-template-detail-dashboard.png` and
  `/tmp/harakiri-template-detail-runs.png`.
- CLI command test checkpoint on 2026-05-24: `pnpm --filter @harakiri/cli test`
  passed with command-level coverage for `harakiri template build` payloads
  from `harakiri.toml`, image-import build payloads, Dockerfile context upload
  metadata, retained `harakiri template logs` output, and failed build output
  that streams retained logs before exiting non-zero. No website product docs
  changed in this checkpoint because the user-facing CLI behavior was not
  changed.
- CLI help checkpoint on 2026-05-24: `pnpm --filter @harakiri/cli test`,
  `pnpm typecheck`, and
  `pnpm --filter @harakiri/cli exec tsx src/index.ts template build --help`
  passed after adding `harakiri template --help` and `harakiri template build
  --help` examples for init, Dockerfile builds, image imports, build listing,
  promotion, and detached `--no-wait` builds. The help examples match the
  existing README, dedicated Markdown docs, and website product docs examples.
  No website product docs changed in this checkpoint because the documented
  workflow copy already contained the same command names and flags.
- Template scanner hook checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm
  test`, `pnpm --filter @harakiri/web build`, `pnpm deploy:k0s`, `pnpm
  ports:restart && pnpm ports:status`, and `pnpm smoke:template-build` passed
  after adding the optional `TEMPLATE_SCANNER_WEBHOOK_URL` builder hook. The
  smoke produced build `bld_8EAfbnWbvoV9`, version `tplv_Jl5kCn_xal5b`, digest
  `sha256:5a48302ec1196d01aa6cd6d2c277867c27e5efd0770b76b4370dd43b1dd4928f`,
  sandbox `sbx_oUHwUPAzGR`, command output `harakiri-built`, and verified the
  default `scan_status=not_scanned` / `scanner_not_configured` path still works
  when no scanner webhook is configured. A deployed docs browser smoke opened
  `http://127.0.0.1:15173/#docs`, selected "Security model", verified
  "scanner webhook" and `scan_failed` render with no console errors, and wrote
  `/tmp/harakiri-scanner-docs.png`.
- Template UI screenshot checkpoint on 2026-05-24: `pnpm screenshots` passed
  after adding Playwright coverage for the deployed Templates List, Template
  detail panel, Builds tab, Build details panel, New Template modal, and
  mobile/narrow Templates layouts. New artifacts:
  `docs/artifacts/13-templates-list-desktop.png`,
  `docs/artifacts/14-template-detail-desktop.png`,
  `docs/artifacts/15-template-builds-desktop.png`,
  `docs/artifacts/16-template-build-detail-desktop.png`,
  `docs/artifacts/17-new-template-desktop.png`,
  `docs/artifacts/18-templates-mobile.png`, and
  `docs/artifacts/19-new-template-mobile.png`. No website product docs changed
  in this checkpoint because the product behavior and copy were not changed;
  this was automated visual evidence for the existing Templates UI.
- Template operator-docs checkpoint on 2026-05-24: `docs/runbook.md` now
  documents the current k0s local registry configuration, the intended
  production registry credential split, external registry rollout steps,
  builder cleanup commands, and a troubleshooting matrix for queued builds,
  Kaniko failures, registry digest lookup failures, runtime pulls, and registry
  disk growth. No website product docs changed because this checkpoint is
  operator-only guidance and does not change user-facing behavior.
- Template redaction checkpoint on 2026-05-24: `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm deploy:k0s`, `pnpm ports:restart && pnpm ports:status`,
  and `pnpm smoke:template-redaction` passed after adding API redaction for
  secret-shaped build args, metadata, retained build logs, and build errors.
  The deployed smoke created build `bld_B7u6wYY8ZjiC` with
  `registry_password=super-secret`, `apiToken=hk_test_should_not_survive`, and
  `x-api-key: hk_test_nested`; API create/get responses and PostgreSQL retained
  only `[redacted]` markers. Cleanup removed the temporary template and API key;
  post-test audit showed no active `smoke-*` keys, no `redaction-smoke-*`
  templates, `running_sandboxes=0`, and `ready_routes=0`.
- Template registry credentials and namespace checkpoint on 2026-05-24:
  documentation: code docs changed in `README.md`, `docs/api.md`,
  `docs/architecture.md`, `docs/runbook.md`, `docs/template-builds.md`, and
  `docs/template-security.md`; product docs changed in the website Docs route
  inside `apps/web/src/main.tsx`. Verification: `pnpm --filter @harakiri/api
  typecheck`, `pnpm --filter @harakiri/api test` (48 tests), `pnpm --filter
  @harakiri/web build`, and `git diff --check` passed. `pnpm deploy:k0s`
  completed, `pnpm ports:restart && pnpm ports:status` reported every forward
  healthy, the deployed ConfigMap reported
  `TEMPLATE_REGISTRY_REPOSITORY_PREFIX=harakiri/templates` and
  `TEMPLATE_REGISTRY_CREDENTIAL_KEY=harakiri-local-registry-credential-key`,
  and PostgreSQL contained migration
  `012_template_registry_credentials_controls.sql`. `pnpm
  smoke:template-registry-credentials` passed with credential
  `cc0bde8d-8c04-4cac-8620-8ef2884022bf`, verifying encrypted secret storage,
  redacted API responses, list/delete behavior, and registry credential audit
  events. `pnpm smoke:template-build` passed with build `bld_wSmwLpZlJNjq`,
  version `tplv_FkWBYhRSMz6Z`, digest
  `sha256:48772ba2dd5a3b00ed3cc98c2db21f6b1d6376fe4a39917016a746777f6692f9`,
  and sandbox `sbx_7L97fWy7c7`; Kaniko pushed to
  `harakiri/templates/org-20d5e937-4664-4e9e-869c-f12c33e3e46c/...`, runtime
  pull preflight succeeded in 1039ms, and the sandbox returned
  `harakiri-built`. A deployed website docs smoke opened
  `http://127.0.0.1:15173/#docs`, verified "Security model" and "API
  reference" include encrypted registry credential records, the
  organization-scoped registry namespace, `/v1/registry-credentials`,
  `hasEncryptedSecret`, and `lastUsedAt`, then wrote
  `/tmp/harakiri-registry-credentials-docs.png`.
- Runtime env and OpenSandbox image-auth checkpoint on 2026-05-24:
  documentation: code docs changed in `README.md`, `docs/api.md`,
  `docs/architecture.md`, `docs/runbook.md`,
  `docs/template-runtime-contract.md`, `docs/template-security.md`,
  `packages/cli/README.md`, and `packages/sdk/README.md`; product docs changed
  in the website Docs route inside `apps/web/src/main.tsx`. Verification:
  `pnpm --filter @harakiri/api test` passed 49 tests, including OpenSandbox
  request-body coverage for `env` and `image.auth`;
  `pnpm --filter @harakiri/cli test` passed 16 tests, including repeated
  `harakiri create --env KEY=value` payload serialization;
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/sdk typecheck`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/api build`,
  `pnpm --filter @harakiri/cli build`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` passed.
  `pnpm deploy:k0s` completed and `pnpm ports:restart &&
  pnpm ports:status` reported all forwards healthy. `pnpm smoke:sandbox-env`
  passed with sandbox `sbx_1KmCe5IiBB`, proving
  `HARAKIRI_ENV_SMOKE=env-ok` was available inside the live OpenSandbox
  runtime and that the created event recorded the env key plus runtime workdir
  metadata. `pnpm smoke` passed the existing sandbox create/run/kill regression
  with sandbox `sbx_UsmssVePKC`. A built CLI smoke against the deployed API created
  `sbx_mlfm8D4u7u` with `harakiri create --env
  HARAKIRI_ENV_SMOKE=cli-env`, then `harakiri run ... --cmd "printenv
  HARAKIRI_ENV_SMOKE"` returned `cli-env`. Browser smoke checks verified the
  deployed website docs pages for Create sandbox, Template troubleshooting, and
  SDK usage mention sandbox env and private runtime image pulls, and saved
  `/tmp/harakiri-runtime-env-docs.png`. An authenticated dashboard smoke opened
  New sandbox, filled the Environment field, and saved
  `/tmp/harakiri-create-env-modal.png`.
- Open Agents template pilot was verified against k0s on 2026-05-24:
  `harakiri template build examples/templates/open-agents-dev` produced build
  `bld_Tv1jbVKB4TAD` and digest
  `sha256:cd9d020b6842019ccdb55abe2c9f2a63562758158f1ff9221193b269d856317b`.
  `harakiri create --template open-agents-dev --name open-agents-pilot`
  started `sbx_L9XXhArLsj`. `harakiri run sbx_L9XXhArLsj --cmd
  "harakiri-open-agents-smoke"` verified Node/npm, Bun, pnpm, yarn, git, jq,
  Python, Chromium headless, code-server, agent-browser, and `/workspace`
  write access, ending with `harakiri open-agents smoke passed`. A Node HTTP
  server on port `3000` was exposed with `harakiri expose`; the public route
  `https://f9eb0cbc-8a2a-493f-bcb7-6f55c662f32c-3000.harakiri.io` returned
  `open-agents-route`.
- Hot-template image pre-pull checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/cli test`,
  API/CLI/web typechecks, API/CLI/web builds, and `pnpm deploy:k0s` passed.
  The rollout created `clusterrole/harakiri-template-prepull` and
  `clusterrolebinding/harakiri-template-prepull`, then restarted the API, web,
  scheduler, and template-builder deployments. `pnpm smoke:template-prepull`
  queued hot image-import build `bld_HtRr9_WKsVj8`, which reached `success`
  and reported `runtimeImagePrepull.status = ok`, `namespace = opensandbox`,
  `nodes=1`, and `pods=1`. `pnpm smoke:template-build` then built
  `bld_0_ZOOW9YFY9W`, confirmed normal non-hot templates log
  `runtime image pre-pull skipped: not_hot_template`, created sandbox
  `sbx_rr_ndBw3TR`, and read `harakiri-built` from the built image.
  `pnpm smoke` created `sbx_RpGPQuhVGX` and returned the expected model-output
  fixture. Website/product docs and New Template UI were checked with
  Playwright: screenshots saved to `/tmp/harakiri-prepull-docs.png` and
  `/tmp/harakiri-prepull-modal.png`.
- Template init ergonomics checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/cli test`, `pnpm --filter @harakiri/cli typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/cli build`,
  `pnpm --filter @harakiri/web build`, and `pnpm deploy:k0s` passed.
  `pnpm smoke:template-init` generated `harakiri.toml` with `id`, visibility,
  runtime family, CPU, memory, workdir, ports, tags, aliases, start command,
  and ready command; built Dockerfile build `bld_sfuYnrpJxwNO` from that
  generated config; verified hot image pre-pull in the build logs; created
  sandbox `sbx_vGY-peTj7k`; and read `harakiri-init-built` from the image.
  Deployed product docs were verified at `http://127.0.0.1:15173/#docs`, and
  the screenshot was saved to `/tmp/harakiri-template-init-docs.png`.
- Template resolution checkpoint on 2026-05-24:
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/web build`,
  `pnpm deploy:k0s`, and `pnpm ports:restart && pnpm ports:status` passed.
  `pnpm smoke:template-resolution` built/imported template
  `resolution-smoke-1779611825`, produced build `bld_gtxq40lCafPG`, promoted
  version `tplv_E9XIL3SQlb_r` as `stable`, then created sandboxes
  `sbx_OVMEU8K9pj`, `sbx_SFg9SRq7D_`, and `sbx_tp_bQYGkfG` by template name,
  qualified stable alias, and immutable version ID. The smoke asserted all
  three persisted rows used the same `template_id`, `template_version_id`, and
  non-null `template_image_digest`. Deployed product docs were verified at
  `http://127.0.0.1:15173/#docs` for Create sandbox, Create a custom template,
  Template troubleshooting, and SDK usage; screenshot saved to
  `/tmp/harakiri-template-resolution-docs.png`.
- Exact Open Agents template build checkpoint on 2026-05-24:
  `harakiri template build --name open-agents-dev
  examples/templates/open-agents-dev --timeout 1200` passed against the
  deployed k0s control plane. It uploaded context
  `sha256:861aa45def1608cb03b490940711ab7d6c75e103254b4ac33c11fbae212c1918`,
  streamed 1,837 retained build-log rows, created build `bld_jVM724NQnNmB`,
  created version `tplv__Iou2q4mSlAJ`, and recorded image digest
  `sha256:fa85aab0b3528f2c1cee0ca847d8b568eec74d5ddbafb7ac738c86a35957cea1`.
  PostgreSQL verification for that build returned status `success`, CPU `2`,
  memory `2048`, workdir `/workspace`, default ports `3000,5173,4321,8000`,
  builder job `hkbld-bld-jvm724nqnnmb`, and runtime pull preflight status
  `ok`. A sandbox from `open-agents-dev`, `sbx_5JmCr4RTVP`, passed
  `harakiri-open-agents-smoke`, verifying Node/npm, Bun, pnpm, yarn, git, jq,
  Python, Chromium headless, code-server, agent-browser, and writable
  `/workspace`. A Node HTTP server on port `3000` was exposed as
  `https://71a6150f-a59c-4b3e-ae38-0cd28b253c00-3000.harakiri.io`, and the
  k0s HTTPS ingress path returned `open-agents-exact-route`. The updated
  deployed product docs were verified at `http://127.0.0.1:15173/#docs` for
  Create a custom template, Template builds, and Open Agents template; screenshot
  saved to `/tmp/harakiri-open-agents-exact-docs.png`.
- CLI example alignment on 2026-05-24: `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/cli typecheck`, `pnpm --filter @harakiri/cli build`,
  and `pnpm --filter @harakiri/api test` passed after aligning CLI help with
  the exact Open Agents build command used in README, dedicated Markdown docs,
  example docs, and website product docs.
- Template unit-test gate on 2026-05-24: `pnpm --filter @harakiri/api test`
  passed with 56 tests, `pnpm --filter @harakiri/api typecheck` passed,
  `pnpm --filter @harakiri/cli test` passed with 18 tests, and
  `pnpm --filter @harakiri/cli typecheck` passed after adding focused
  regression coverage for template resolution ranking, build state helpers, and
  `harakiri.toml` inline-comment parsing. No README/dedicated Markdown or
  website docs update was required because documented commands, API payloads,
  and product workflows did not change.
- Digest-before-use checkpoint on 2026-05-24: `pnpm --filter @harakiri/api
  test` passed with 57 tests, `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/cli test`,
  and `pnpm build` passed after making template definitions non-runnable until
  a ready digest-pinned version exists. `pnpm deploy:k0s` completed, `pnpm
  ports:restart && pnpm ports:status` showed API, web, Keycloak, OpenSandbox,
  gateway, and HTTPS ingress forwards healthy, `pnpm smoke:templates` passed
  for `python-3.12`, `python-3.12-data`, and `node-20`, and `pnpm
  smoke:template-resolution` passed with build `bld_wVhxf4S6wRPq`, version
  `tplv_KegCr4lbCdJv`, and sandboxes `sbx_cPjesUqjLN`, `sbx_75kl0AKQok`, and
  `sbx_C4pzEc_rN7`. The image-import build resolved `ubuntu:24.04` to
  `docker.io/library/ubuntu@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b`
  before the version became ready. A direct deployed API check created
  `not-ready-1779614241`, confirmed the create response was `building||`, and
  confirmed sandbox creation returned `409 template_not_ready`. PostgreSQL
  showed catalog versions now store digest-pinned image URIs for `python-3.12`,
  `python-3.12-data`, and `node-20`. Product docs were verified in the deployed
  website for ready digest-pinned versions, disabled Use before readiness, and
  `template_not_ready`; screenshot: `/tmp/harakiri-template-digest-docs.png`.
- Documentation example verification on 2026-05-24: the deployed k0s
  documentation path was checked sequentially with `pnpm ports:status`,
  `pnpm smoke:template-init`, `pnpm smoke:template-build`,
  `pnpm smoke:template-resolution`, and `pnpm smoke:route`. The commands cover
  the CLI/API examples repeated in `README.md`, `docs/templates.md`,
  `docs/template-builds.md`, `docs/api.md`, `docs/runbook.md`,
  `examples/templates/open-agents-dev/README.md`, `packages/cli/README.md`,
  and the website product docs. The runs produced `bld_n1NIlOpvAiqY` /
  `tplv_V-WI15BLyvHX` / `sbx_wxY9k-OJJG` for template init,
  `bld_S9NsfBLSoXuR` / `tplv_tStnB58lRiQN` / `sbx_FJhjEVrxvn` for Dockerfile
  build, `bld_R3N_34qo0CI4` / `tplv_y9_dYXlBWyrN` plus sandboxes
  `sbx_H-PVgtFjh7`, `sbx_ySmPIxygBt`, and `sbx_8jC5TzpOZi` for name,
  qualified alias, and immutable version resolution, and route
  `https://fa789b45-a682-44d8-ad0c-19e85dca4294-3000.harakiri.io` from
  `sbx_OgP5i3tPPF`. During the longer sequence OpenSandbox restarted once and
  left runtime CR `93049232-804f-4e27-b2d2-5f3626931a5a` without a Harakiri DB
  row; it was deleted from the `opensandbox` namespace before the final route
  smoke passed. The docs split was audited at the same checkpoint: local
  development, k0s bootstrap, Harakiri.io/Cloudflare checks, local registry
  notes, and production follow-ups live in README/runbook/operator Markdown,
  while website docs remain product-facing.
- Post-test database audit: `running_sandboxes=0`, `ready_routes=0`,
  `resolution_templates=0`; pre-existing active API keys were left untouched.
- Post-digest checkpoint cleanup audit: `active_smoke_keys=0`,
  `live_sandboxes=0`, `resolution_templates=0`, `not_ready_templates=0`, and
  `ready_routes=0`.
- Post-documentation verification cleanup audit: `active_smoke_keys=0`,
  `live_sandboxes=0`, `ready_routes=0`, `resolution_templates=0`,
  `init_templates=0`, `kaniko_templates=0`, and `building_templates=0`.
- OpenSandbox `execd` transport verification on 2026-05-24:
  `pnpm --filter @harakiri/api test` passed with 61 tests,
  `pnpm --filter @harakiri/api typecheck`, `pnpm typecheck`, and
  `git diff --check` passed. `pnpm deploy:k0s` completed and reconfigured
  `harakiri-sandbox-exec` so the live `opensandbox` namespace Role no longer
  grants `pods/exec` or `pods/log`. `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`
  passed with sandbox `sbx_Pv93SLtLHs`; `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm
  smoke:route` passed with route
  `https://96da86f6-ae77-4ceb-86a7-36239ad3685d-3000.harakiri.io`;
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed both deployed browser tests,
  including web terminal, filesystem, logs fallback, CLI run, and SDK run. A
  focused runtime panels probe created `sbx_hzi1DfNZ2-` and passed
  run/files/metrics/logs against the deployed API. Direct OpenSandbox
  diagnostics returned `404 Not Found` for
  `/v1/sandboxes/:id/diagnostics/logs?scope=container`, so Harakiri logs
  currently fall back to real control-plane events.
  Cleanup audit after the verification showed `live_sandboxes=0`,
  `ready_routes=0`, and `active_smoke_keys=0`.
- OpenSandbox runtime upgrade verification on 2026-05-24: the k0s deployment
  was upgraded to OpenSandbox `server:v0.1.14`, `execd:v1.0.17`, and
  `egress:v1.0.12` while keeping the published `opensandbox-0.1.0` chart with
  explicit image/config overrides. The newer server requires `server.api_key`,
  so the k0s values pin it to the local `dev-opensandbox-key`. The stable
  scoped diagnostics endpoint now returns `501 DIAGNOSTICS_NOT_IMPLEMENTED`;
  Harakiri falls back to OpenSandbox's plain-text diagnostics endpoint after a
  supplemental provider-side `pods/log` RoleBinding for
  `opensandbox-system/opensandbox-server`. A focused deployed log probe created
  `sbx_ta1qU8UINb`, confirmed scoped diagnostics `501`, legacy diagnostics
  `200`, and `18` sandbox-source log rows through `GET /v1/sandboxes/:id/logs`.
  `pnpm --filter @harakiri/api test` passed with 63 tests,
  `pnpm --filter @harakiri/api typecheck`, `pnpm typecheck`, and
  `git diff --check` passed. `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`, and
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed against the upgraded k0s
  deployment. Final cleanup audit showed `live_sandboxes=0`, `ready_routes=0`,
  and `active_smoke_keys=0`.
- Filesystem panel regression on 2026-05-24: `open-agents-dev` sandboxes now
  default the filesystem API and UI to the template workdir (`/workspace`) when
  no path is requested. A deployed probe created `sbx_BQXcGz8lq3`, wrote
  `/workspace/visible.txt`, and verified `GET /v1/sandboxes/:id/files` returned
  `cwd=/workspace` with that file. Explicit `path=/` was also verified through
  the OpenSandbox `execd` directory-listing fallback after `/files/search`
  failed on a root recursive search. A browser probe opened the deployed UI for
  `sbx_K7y0PZDLrN`, selected the Filesystem tab, confirmed the toolbar showed
  `/workspace`, and confirmed `visible.txt` was visible. `pnpm --filter
  @harakiri/api test` passed with 64 tests, `pnpm --filter @harakiri/api
  typecheck`, `pnpm --filter @harakiri/web typecheck`, `pnpm typecheck`,
  `git diff --check`, `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`,
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`, and
  `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e` passed. Cleanup audit showed
  `live_sandboxes=0`, `ready_routes=0`, and `active_smoke_keys=0`.

## CLI Demo

The installed `harakiri` CLI was tested against the deployed API with a real dashboard-created API key:

```text
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri create --template python-3.12 --name cli-real-... --ttl 90
harakiri run sbx_... --cmd "python -c \"print('cli-ok')\""
harakiri expose sbx_... --port 3000
harakiri routes sbx_...
harakiri kill sbx_...
```

The run returned `cli-ok`, an `ok runtime=...` line, and the sandbox termination line.

## No Seeded Control Plane Data

- `SEED_ON_BOOT=0`, `AUTH_DEV_ALLOW=0`, and `OPEN_SANDBOX_ALLOW_FALLBACK=0` are deployed in `harakiri-config`.
- The old stable demo API key is no longer present in app, CLI, web, or test fallbacks. It appears only in migration `005_remove_seeded_control_plane_data.sql`, where it is removed.
- Control-plane seed data was removed by migration: users, organizations, API keys, and sandboxes started empty after migration; the template catalog is installed by migration as static runtime metadata.
- Real test records have OpenSandbox UUIDs and no `osbx_` fallback IDs.

## Artifacts

- `docs/artifacts/01-landing-desktop.png`
- `docs/artifacts/02-docs-desktop.png`
- `docs/artifacts/03-signin-desktop.png`
- `docs/artifacts/04-keycloak-login-desktop.png`
- `docs/artifacts/05-keycloak-login-mobile.png`
- `docs/artifacts/06-dashboard-desktop.png`
- `docs/artifacts/07-api-keys-desktop.png`
- `docs/artifacts/08-usage-desktop.png`
- `docs/artifacts/09-onboarding-desktop.png`
- `docs/artifacts/09-onboarding-redirect-desktop.png`
- `docs/artifacts/10-detail-desktop.png`
- `docs/artifacts/11-landing-mobile.png`
- `docs/artifacts/12-dashboard-mobile.png`
- `docs/artifacts/13-templates-list-desktop.png`
- `docs/artifacts/14-template-detail-desktop.png`
- `docs/artifacts/15-template-builds-desktop.png`
- `docs/artifacts/16-template-build-detail-desktop.png`
- `docs/artifacts/17-new-template-desktop.png`
- `docs/artifacts/18-templates-mobile.png`
- `docs/artifacts/19-new-template-mobile.png`
- `docs/artifacts/playwright-report/index.html`

## Route Evidence

- OpenSandbox Helm config is `[ingress] mode = "gateway"` with `gateway.address = "harakiri.io"` and header routing.
- `ingress-nginx` is installed, and `opensandbox-sandbox-routes` maps `*.harakiri.io` to `opensandbox-ingress-gateway`.
- k0s contains TLS secret `opensandbox-system/harakiri-sandbox-wildcard-tls` for local HTTPS ingress verification.
- cert-manager v1.20.2 is installed; `pnpm env:harakiri:route-tls-letsencrypt` can request the wildcard origin certificate once `CLOUDFLARE_API_TOKEN` is available.
- Cloudflare DNS for concrete `*.harakiri.io` names resolves to Cloudflare anycast, TLS is covered by the existing `*.harakiri.io` edge certificate, and the tunnel reaches k0s ingress.

## Known Prototype Limits

- Public sandbox routes are intentionally placed directly under `*.harakiri.io` to use the existing Cloudflare wildcard edge certificate. Exact host rules in Cloudflare Tunnel still take precedence for app/auth/service subdomains.
- Keycloak runs with `start-dev`, a development login fixture user, and the Harakiri login theme mounted from `keycloak-theme-harakiri`.
- PostgreSQL uses local-path storage.
- Filesystem and metrics panels call OpenSandbox `execd` through endpoint
  resolution. Filesystem directories are synthesized from `files/search`
  results when possible. For paths where provider search fails, including `/`
  on the current OpenSandbox image because a recursive search hits system files
  with unknown owners, Harakiri falls back to an OpenSandbox `execd`
  directory-listing command rather than Kubernetes pod exec.
- Runtime logs call OpenSandbox diagnostics when the provider exposes them. The
  upgraded OpenSandbox server returns `501` for the stable scoped diagnostics
  endpoint, so Harakiri falls back to OpenSandbox's deprecated plain-text
  diagnostics endpoint. The k0s manifests grant `pods/log` only to the
  OpenSandbox server service account so that provider endpoint can read runtime
  logs; Harakiri's own service account still has no `pods/log`.
- Command execution and HTTP/SSE/WebSocket route proxying are live.
- Custom template image-import and Dockerfile records are live in the control
  plane and can be completed by the `harakiri-template-builder` worker. Git
  source builds, production registry blob garbage collection, production
  scanner policy, and non-root workspace ownership for custom template images
  remain pending in the active execution plan.

## 2026-05-25 Public harakiri.io Deployment Verification

The public deployment was redeployed with maintainer-environment settings
through:

```bash
pnpm env:harakiri:deploy-public
```

The wrapper keeps the generic k0s deployment defaults portable while setting
the public harakiri.io values for the maintainer lab:

- `PUBLIC_API_URL=https://sb-api.harakiri.io`
- `PUBLIC_KEYCLOAK_URL=https://sb-auth.harakiri.io`
- `SANDBOX_ROUTE_BASE_DOMAIN=harakiri.io`
- `SANDBOX_ROUTE_PUBLIC_SCHEME=https`
- `KEYCLOAK_ISSUER_ALLOWLIST` includes the internal Keycloak service issuer,
  the local port-forward issuer, and
  `https://sb-auth.harakiri.io/realms/harakiri`.

This fixed a browser failure where `https://sb.harakiri.io` was trying to call
the local port-forward Keycloak token endpoint at `http://127.0.0.1:18084`.

Public host checks:

- `https://sb-api.harakiri.io/health` returned `{"status":"ok"}`.
- `https://sb-auth.harakiri.io/realms/harakiri/.well-known/openid-configuration`
  returned issuer `https://sb-auth.harakiri.io/realms/harakiri` and token
  endpoint
  `https://sb-auth.harakiri.io/realms/harakiri/protocol/openid-connect/token`.
- A token endpoint CORS preflight from `https://sb.harakiri.io` returned
  `access-control-allow-origin: https://sb.harakiri.io`.
- The deployed web asset `index-D1ZPtM4z.js` had zero loopback API/Auth URL
  references and contained the public `sb-auth.harakiri.io` and
  `sb-api.harakiri.io` references.

Public end-to-end verification:

```bash
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  HARAKIRI_API_URL=https://sb-api.harakiri.io \
  HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js \
  pnpm e2e
```

Result:

```text
2 passed (27.0s)
```

Public sandbox route verification:

```bash
pnpm env:harakiri:route-public
```

Result:

```text
created sbx_mN4vBfJLIs
route https://98a4f1a0-231d-4cb8-b5ff-1346409c1e36-3000.harakiri.io state=ready provider=opensandbox-gateway
resolved 98a4f1a0-231d-4cb8-b5ff-1346409c1e36-3000.harakiri.io -> 104.21.61.132
route public HTTPS smoke passed
```

Cleanup audit:

```text
active_sandboxes=0
ready_routes=0
active_template_builds=0
active_smoke_keys=0
```

All expected k0s pods in `harakiri` and `opensandbox-system` were ready after
the redeploy. The completed test-only BuildKit Job
`hkbkit-bld-u5u0pbhilq0o` was deleted after verification.

Current deployed pod image IDs:

- API:
  `sha256:d9e0324f336004e2ebd6df6d3a51c3967e0aeac0c871f02772f926fc3280658f`
- Web:
  `sha256:7dda0abaf677c081efa9d8a63219862c4b0164f99b6e6820842e96d4bb94a351`

## 2026-09-02 OSS 0.4.0 CI And Helm Convergence Checkpoint

The provider-free conformance lane now starts the API with
`HARAKIRI_RUNTIME_PROVIDER=dev`, migrates and seeds PostgreSQL, installs packed
`@h-sandbox/sdk` and `@h-sandbox/cli` tarballs into temporary consumer
locations, and runs the same public SDK/CLI conformance scripts used against
k0s and public deployments.

Verification passed:

```bash
docker compose up -d postgres
pnpm conformance:dev
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/api typecheck
pnpm openapi:check
pnpm examples:check
pnpm templates:check
pnpm publish:dry-run
TMP_CHART_DIR="$(mktemp -d)"
helm package infra/charts/harakiri \
  --version 0.0.0-ci.local \
  --app-version 0.0.0-ci.local \
  --destination "${TMP_CHART_DIR}"
helm lint infra/charts/harakiri
helm template harakiri infra/charts/harakiri -n harakiri \
  --set secret.data.DATABASE_URL=postgres://ci
kubectl kustomize infra/k8s
bash -n infra/scripts/deploy-k0s.sh tests/conformance/dev-runtime-smoke.sh
```

Results:

- `pnpm conformance:dev` passed SDK and CLI conformance with sandbox
  `sbx_PNn5ybciax`.
- API test suite passed 172/172 tests.
- OpenAPI, examples, template smoke syntax, npm dry-run, Helm lint/template,
  chart packaging, kustomize render, and shell syntax checks passed.
- `actionlint` is not installed on this machine, so GitHub workflow linting was
  not run locally.

Deployment model change:

- `infra/scripts/deploy-k0s.sh` now installs Harakiri through
  `infra/charts/harakiri` instead of applying raw Harakiri kustomize resources
  and patching the ConfigMap afterward.
- `infra/k8s/kustomization.yaml` now contains only local dependencies and
  OpenSandbox helper manifests. The legacy Harakiri manifest remains as a
  reference while old local clusters are migrated.
- CI now includes separate `dev-conformance` and `release-dry-run` jobs. The
  release dry-run validates npm dry-run publishing, local package tarballs,
  Helm chart packaging, and no-push image builds.

## 2026-09-02 OSS 0.4.0 Release Candidate Validation

Target cluster: `harakiri-k0s` through
`infra/k0s/harakiri.kubeconfig`.

Local validation passed:

```bash
pnpm install --frozen-lockfile
pnpm openapi:check
pnpm templates:check
pnpm examples:check
pnpm typecheck
pnpm test
pnpm build
pnpm package:assert
pnpm publish:local-check
pnpm publish:dry-run
pnpm publish:postcheck
pnpm conformance:dev
helm lint infra/charts/harakiri
helm template harakiri infra/charts/harakiri -n harakiri \
  --set secret.data.DATABASE_URL=postgres://ci
kubectl kustomize infra/k8s
bash -n infra/scripts/deploy-k0s.sh tests/conformance/dev-runtime-smoke.sh \
  scripts/npm-package-smoke.sh scripts/npm-postpublish-smoke.sh
```

Results:

- `pnpm test` passed all workspace tests: shared 11/11, SDK 34/34, web 24/24,
  API 172/172, and CLI 36/36.
- `pnpm conformance:dev` passed SDK and CLI conformance with dev-runtime sandbox
  `sbx_qr6ZOcA2TM`.
- `pnpm publish:dry-run` verified `@h-sandbox/sdk@0.3.1` and
  `@h-sandbox/cli@0.3.1` without publishing.
- `pnpm publish:postcheck` verified the currently published npm packages
  install from npm.
- Helm lint passed with only the non-blocking chart icon recommendation. Helm
  render produced 631 lines and kustomize render produced 1185 lines.
- `actionlint` is not installed on this machine, so GitHub workflow linting was
  not run locally.

k0s/public deploy passed:

```bash
pnpm env:harakiri:deploy-public
pnpm ports:restart
```

Deployed Harakiri pods:

- `harakiri-api-9bb4c8c6-gft6q`
- `harakiri-web-6fcdfd898b-2q69j`
- `harakiri-scheduler-698fb867df-bc2cs`
- `harakiri-template-builder-66fd794bbd-hvmzm`
- `harakiri-registry-6d8dc67678-hwmvt`
- `harakiri-postgres-55b755bf48-np8bm`

OpenSandbox pods:

- `opensandbox-server-5686cb469b-sg2pm`
- `opensandbox-controller-manager-65ccd97cc4-4vw2q`
- `opensandbox-ingress-gateway-7d5b64f59d-q2lp6`

Public endpoint checks passed:

- `https://sb-api.harakiri.io/health` returned `{"status":"ok"}`.
- Keycloak issuer is
  `https://sb-auth.harakiri.io/realms/harakiri`.
- `https://sb.harakiri.io/config.js` returned only public
  `sb.harakiri.io`, `sb-api.harakiri.io`, and `sb-auth.harakiri.io` values.
- The hosted web HTML plus `config.js` had zero matches for `localhost`,
  `127.0.0.1`, `http://`, or local `1808x` ports.

Hosted browser OIDC validation passed:

```bash
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  KEYCLOAK_USER=lyra@k.ai \
  KEYCLOAK_PASSWORD=harakiri-dev \
  pnpm exec playwright test tests/e2e/oidc-session.spec.ts
```

Result: 2/2 tests passed. The browser flow covered login, memory-only tokens,
provider logout, onboarding redirect to dashboard, and no loopback auth/API
requests.

Strict SDK/CLI conformance against k0s passed:

```bash
export HARAKIRI_API_URL=http://127.0.0.1:18082
export HARAKIRI_CONFORMANCE_ROUTE_FETCH=1
export HARAKIRI_CONFORMANCE_ROUTE_BASE_URL=http://127.0.0.1:18082
pnpm conformance
```

Result:

- SDK conformance passed.
- CLI conformance passed with sandbox `sbx_25FY2yOjti` and route provider
  `opensandbox-gateway`.

Deployed runtime smokes passed:

- `pnpm smoke` created, ran, and killed `sbx_CmBLDfWOKO`.
- `pnpm smoke:filesystem` passed against `sbx_tdF2r0cfgv`.
- `pnpm smoke:process` passed against `sbx_1tshzt_QvH`, tracked command
  `cmd_Tvmh2B0_XqsA`, and exposed port `3002`.
- `pnpm smoke:route` passed for
  `https://66ba9e03-bbf1-47f5-aa5b-c2021fcb3818-3000.harakiri.io`.
- `pnpm smoke:templates` passed platform templates `python-3.12`,
  `python-3.12-data`, and `node-20` with sandboxes `sbx_ZPYgA6yfIR`,
  `sbx_uRK0oQ7Q6D`, and `sbx_MZ1tHzCHaU`.

CLI terminal attach validation passed against the real OpenSandbox PTY:

```bash
printf 'echo attach-ok\r\nexit\r\n' | \
  node packages/cli/dist/index.js attach sbx_a1JVR0r5AU --no-raw --cols 80 --rows 24
```

Output included `attach-ok` and the command exited cleanly. This verifies the
provider-open readiness fix for piped CLI attach input.

Known release-candidate gaps:

- OpenShift one-namespace docs are patch-free but still need a clean
  customer-style live verification pass.
- Template image publishing is documented, but template images are not yet
  produced by the same first-class release workflow as the API, web, chart, SDK,
  and CLI.

## 2026-09-07: TTL Renewal and Scheduler Correction

Source acceptance checkpoint after `0.5.0-rc.2`. The subsequent
[rc.3 delivery receipt](release-notes/0.5.0-rc.3-delivery.md) records publication,
deployment and packaged-client acceptance; the checks below preceded that rollout.

- An isolated PostgreSQL 16 database with migrations through 036 passed the
  lease race suite: concurrent renewal/expiration in both orders, duplicate
  schedulers and schedules, failed/ambiguous renewal, recovery from native
  success plus database failure, inactive/cross-tenant access, HTTP error
  responses, idempotent replay, operation-worker execution/fencing, pause races
  and native minimum-TTL preservation. The existing persistent-workspace
  reservation/retention suite also passed (19 tests including the parent test).
- With native OpenSandbox on k0s and fallback disabled, the SDK created
  `sbx_YjCAxjcfx_` with expiry `18:12:47.151Z`, renewed to `18:13:22.207Z`,
  and ran a command 12 seconds beyond the original deadline. No command or
  terminal activity was used to mask the explicit renewal before that check.
  Command activity extended expiry to `18:13:59.213Z`, followed by verified
  termination after activity stopped.
- A separate 10-second sandbox, `sbx_FnT_kZ2ijh`, expired at the product TTL
  while its native minimum create lease still had time remaining.
- A real SDK-authenticated terminal for `sbx_PffHzgp563` kept a 10-second
  sandbox alive beyond its original expiry, then expired after detach.
  A timer-controlled unit test also checks short-TTL heartbeat cadence and
  explicit connection failure when native renewal fails.
- Native provider GET returned 404 for all three test runtimes. Test orgs,
  credentials and API/scheduler processes were removed. No BackgroundAgent,
  populated CRC namespace, SCC or production release was modified.

The repeatable SDK smoke is `pnpm smoke:renew`; allow about three minutes.
See [lease operations](./sandbox-lease-operations.md) for the coordinated upgrade.
Private logs and receipts are ignored under `docs/artifacts/ttl-regression-private/`.

Final source verification: `pnpm test` passed 526 tests (two database-gated tests
skipped there, exercised separately above). Root `typecheck` and `build`, docs
link check, OpenAPI check, Credential Vault boundary check, shell/Node syntax
checks and `git diff --check` passed. The production web build retains its
existing bundle-size warning. A focused regression first reproduced swallowed
503 responses with legacy fallback enabled, then passed after native lease
get/delete/renew stopped masking those errors. Temporary PostgreSQL and both
port forwards were removed. Public web, API health and Keycloak discovery all
returned HTTP 200 after testing; their rc.2 deployment was not changed.
