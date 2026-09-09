# UI Product Tour Verification

Date: 2026-09-09. Delivery: source, rendered media and local website preview.
No production deployment, package release or Git publication is implied.

## Deliverable

The default Demos entry is a 5m34s UI tour with 17 chapters. The separate
`ui-product-tour` Remotion composition preserves the entire 1920x1080 application
viewport at normal zoom. It does not crop navigation, dialogs or runtime tabs.
Small pointer rings replay recorded inputs. Native captions are optional; the
synchronized written guide sits outside the image. There is no voiceover.

The homepage and four historical agent films are unchanged. The new entry has
its own deep link, Getting Started documentation, Markdown export, no-JavaScript
tutorial, transcript, example ZIP and provenance. Remotion remains build-time only.

- Local review: http://127.0.0.1:19497/#demos/ui-product-tour
- Film: `apps/web/public/demos/ui-product-tour/video.mp4`
- Format: H.264, 1920x1080, 30 fps, 334 seconds, 3,381,493 bytes.
- SHA-256: `04a3307f5765b5acd8afc00d8a2759b8233e2e5b9f6fed08541b851bea7ece10`.
- Recording: September 9, local source preview against the live Harakiri API.
  Public provenance identifies the source revision and recorded frontend hashes.

## Real Workflow Evidence

The synthetic release-check project exercises the current provider through
Harakiri UI/API contracts. No Kubernetes sandbox exec, customer project or model
account is used. This is a control-plane tour, not a new agent benchmark.

1. Selected the ready Node 20 template and created 1 GiB persistent storage.
2. Launched the first runtime with that workspace and an explicit lifetime.
3. Used Terminal, prepared connectivity tools and inspected uploaded files.
4. Ran three deterministic checks through Commands, retained output and returned
   to the same command without rerunning it.
5. Started an HTTP service and verified its actual public preview.
6. Verified example.com was initially reachable. After applying the Node packages
   preset, the registry remained reachable and the unlisted site did not.
7. Inspected actual lifecycle logs and a current CPU/memory snapshot.
8. Terminated compute, waited for storage release and created a different runtime
   attached to the same workspace. The retained report passed verification and
   had identical SHA-256 bytes; it was not regenerated.
9. Terminated both runtimes, verified inactive routes, archived retained storage
   and revoked the recording key. All four isolated recording-attempt accounts
   were subsequently disabled, their sessions logged out and their keys revoked.

Private capture, cleanup and validation evidence is under ignored
`docs/artifacts/demo/ui-product-tour/`. Raw account credentials and discarded
takes are not distributed. Only reviewed source clips and explicit fixture files
are included in public media.

## Checks

- Web tests: 71 passed. Demo-video tests: 30 passed.
- Web and demo-video TypeScript checks passed; production web build passed.
  The existing main-chunk size warning remains; no Remotion browser dependency
  was introduced.
- Artifact verification: source/output hashes, codec, dimensions, timings,
  caption/tutorial consistency and exact ZIP contents passed.
- Render review: 51 decoded frames covering every chapter's beginning, middle
  and end, plus poster, checked with OCR/pixels. Desktop/mobile screenshots and
  important result scenes were visually inspected. This is sampled inspection,
  not a claim of manual review of every encoded frame.
- Dedicated tour browser checks passed at 1920x1080, 1440x1000, 390x844,
  320x568 and 844x390. Checked full-frame decoded pixels, all 17 chapter seeks on
  desktop, synchronized guide, previous/next controls, captions, native
  fullscreen, wide-player toggle, unclipped control text and no horizontal overflow.
- All five Demos entries passed the existing desktop, wide, mobile, narrow and
  reduced-motion regression suite, including every chapter/caption on desktop,
  deep links, history, filtering, tutorial navigation and failure/no-JS states.
- The homepage does not load demo media. Documentation link validation passed.
- Candidate source scan: Gitleaks 8.30.1, 985 tracked/new files including the tour
  and source archives, zero findings after reviewing seven source SHA-256 false
  positives in both evidence manifests. Each exception is exact-value and
  manifest-path scoped. The unrelated `docs/cot/` document was left untouched
  and excluded. Private capture evidence is ignored, not public media.

## Boundaries and Follow-Up

- Full-frame mobile playback necessarily reduces text size. Native fullscreen,
  landscape viewing and the written guide remain available; no crop is substituted.
- Provisioning/release waits between chapters and fixture upload are disclosed
  edits. Recorded interactions play at normal speed.
- The minimal Node image lacks an access-test tool. The included preparation
  script installs curl and certificate roots through Commands. Restricted
  non-root installations should include these dependencies in the template.
- The current access-test endpoint may label missing probe tools as
  `blocked_or_unreachable`. This diagnostic distinction remains a product
  follow-up, not a claim that the tour fixed that endpoint.
- Workspace archive retains files and storage allocation. Physical deletion is
  an operator action; no broad storage cleanup was performed.
- Captured capabilities depend on the selected provider/operator profile. The
  tour does not promise universal runtime parity, historic billing measurements,
  process restoration or indefinite command-log retention.

Reproduction and recording operations: [production runbook](demo-production-runbook.md).
Completed plan: [full-frame UI product tour](exec-plans/completed/ui-product-tour.md).
