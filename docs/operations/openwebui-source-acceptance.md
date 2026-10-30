# OpenWebUI Source Qualification

**Status: incomplete; not a released integration.** The latest retained run
passes the real-model workflow and all document previews, but fails mobile SVG
navigation and adapter-restart checks. All owned cleanup checks passed. The
responsive test now waits for the actual mobile drawer and always restores the
desktop viewport; a complete rerun is required. Do not combine partial results
from different runs into a passing receipt.

This report covers the optional adapter for unmodified OpenWebUI and generic
Harakiri protected HTTP/WebSocket services. It is not customer OpenShift
certification, independent adopter acceptance or a production deployment.

## Reproduce

Use the [operator guide](../../integrations/openwebui/README.md) and
[compatibility record](../../integrations/openwebui/compatibility.json). The
[contributor guide](../../integrations/openwebui/CONTRIBUTING.md) describes the
owned GitHub-hosted runner and local test entry points. The native runner refuses
a workstation, an ambient kubeconfig and an unrelated cluster. Do not remove
those safeguards to test against a running lab.

The runner installs a published Harakiri baseline, then builds the candidate
API, web, adapter and Open Terminal template. A private, disposable TLS registry
exercises the normal template import and image-pull path. The application reaches
the runtime through Harakiri's public APIs and the provider gateway, never pod
addresses or Kubernetes exec.

## Retained Evidence

- [Run 41006611568](https://github.com/nabilblk/h-sandbox/actions/runs/41006611568):
  branch source `5fb516afdd103088762dcdf7bc1e20138a409e60`, merge checkout
  `b4a3fecbf6d314bdb280bd52d903d66783914894`. Its
  [sanitized receipt](evidence/openwebui-41006611568.json) records 20 passed checks
  and two browser timeouts. One real chat completed with three tool calls and no
  tool failures; exact totals, decoded PNG, native PDF/HTML fixture round trips,
  embedded chart identity and HTML viewport fit passed. The desktop capture was
  inspected. Mobile and restart checks still require a complete passing run.
- [Run 41003628810](https://github.com/nabilblk/h-sandbox/actions/runs/41003628810):
  branch source `1dc65fe8af1801803ec88252e9c9d8ef9834de64`, merge checkout
  `8125219dd982c37ed4dcee0fe77b4aa153c9e541`. Its
  [sanitized receipt](evidence/openwebui-41003628810.json) records 12 passed checks,
  a failed model gate and nine dependent failures. Generated Python had repeated
  errors and exceeded the 900-second deadline; PDF/HTML were absent. All owned
  cleanup passed. It provides no new HTML-layout evidence.
- [Run 41001219049](https://github.com/nabilblk/h-sandbox/actions/runs/41001219049):
  branch source `56e932b3ad320d1b08bdf4a949c729d678c291e3`, tested merge checkout
  `8273ba753b8167f15ee5e8e6111d43e17fc9ee91`, native Linux amd64.
- [Sanitized receipt](evidence/openwebui-41001219049.json): 21 passed, one failed;
  eight in-process cleanup checks and external cleanup passed.
- The receipt records exact OpenWebUI/Open Terminal identities, the Ollama/model
  digest and inference parameters, and five candidate image-config digests.
  Image-config digests identify runner-local builds, not published registry
  manifests, release signatures or provenance attestations.
- The failed check is `native-previews`: HTML viewport overflow. JSON totals,
  decoded PNG, nonblank PDF and the embedded chart's SHA-256 were independently
  checked before that failure. A successful tool wrapper alone was not accepted
  as evidence that a command or report was correct.

In run 41001219049 the model made one chat submission and used actual OpenWebUI terminal tools. It
encountered and corrected three Python execution errors before producing all five
files. The harness supplied no Python implementation, replacement files or model
responses. This is evidence for one observed workflow, not a model reliability
benchmark or deterministic-output guarantee.

## Revised Scenario

`csv-chart-native-documents-v1` separates agent execution from renderer coverage.
The exact prompt SHA-256 is recorded in the compatibility file and new receipts.
One real chat must generate CSV, correct JSON and a decoded PNG. A failure remains
failed; no fixture can supply these three files or satisfy the model gate.

After independently verifying the results, the harness renders labeled PDF/HTML
fixtures and uploads them through the actual OpenWebUI file browser. Their native
previews, byte integrity, embedded-chart identity and viewport fit remain required.
This tests document handling, not model PDF/HTML authorship. The previous failed
runs remain recorded; the revised scenario requires its own complete native run.

## Exercised Boundaries

Run 41001219049 passed native administrator setup, finite cold start, shell
input/ANSI/resize/interrupt/reconnection, text editing, binary SHA-256 round trip,
oversize rejection, user separation, quota denial and adapter restart. It also
passed active-grant revocation, explicit operator grant recovery on the same
runtime, and retained-file recovery after confirmed runtime/storage release.
No uncaught browser JavaScript error was observed.

The upload-failure scenario injects a browser connection reset **before dispatch**
and verifies a visible failure with no automatic replay. It does not prove
rollback of bytes already accepted upstream. Separate real-socket core tests
cover interrupted multipart forwarding after upstream bytes arrive, connection
closure and admission release.

Hostile HTML cannot access the chat parent or browser storage; SVG script content
is blocked. Authenticated relative assets are explicitly rejected by the selected
opaque-origin profile. Self-contained HTML with embedded images is the intended
document format. No same-origin permission, weaker cookie policy or token-bearing
asset URL is introduced to make a preview work.

## Security Inventory

The two separate image audit jobs for run 41001219049 passed the gate of zero
**fixable** high/critical findings. Their inventories still contain:

| Image | Total findings | Unfixed high/critical | Inventory SHA-256 |
| --- | ---: | ---: | --- |
| Adapter | 244 | 57 | `895d0c88be721fe2707c9209cfe1332c73f04951b7c0a3be383def81cbc9bf53` |
| Open Terminal template | 430 | 80 | `809d4f92d3513e53cd2decf25a0f42c363772aed50323a9cb695e739375817b1` |

These inventories describe separately built scan candidates, not byte-identical
runtime images or a complete audit of OpenWebUI/Ollama. Passing the gate is not a
vulnerability-free claim. Review the full inventories and upstream advisories
before choosing a production risk policy. GitHub retains these scan artifacts
for 14 days; a release must retain its own exact-image inventory.

## Remaining Gates

- Complete native qualification and inspect the actual desktop/mobile captures.
- Have an independent operator follow the guide in a fresh environment. The
  [handoff checklist](../../integrations/openwebui/README.md#independent-self-service-handoff)
  specifies the evidence; maintainer-run CI does not replace it.
- Obtain explicit merge/publication/deployment instructions, select versions,
  produce immutable artifacts and verify anonymous installation of those exact
  artifacts before announcing a release.

No running Mac/k0s lab, customer environment, BackgroundAgent installation or
public website was changed by this qualification. The
[execution plan](../exec-plans/active/protected-services-openwebui.md) remains active.
