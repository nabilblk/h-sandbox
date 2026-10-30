# OpenWebUI Source Qualification

**Status: source-qualified; not a released integration.**
[Run 41008469790](https://github.com/nabilblk/h-sandbox/actions/runs/41008469790)
passed all 22 native gates in one run, all eight in-process cleanup checks and
external cluster/private-material cleanup. Desktop and mobile captures were
inspected. Independent adopter acceptance and published-artifact qualification
remain open. Earlier failed runs are retained below, not combined into this result.

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

- Qualified branch source: `d353053b5f545151f6226056fef44e06bdce6bad`;
  actual tested PR merge checkout: `3c3e914a3d4a8e097ff7141f3035f8cbe17e87aa`.
- [Complete sanitized receipt](evidence/openwebui-41008469790.json), SHA-256
  `3e48d76701e9cc3c7d366f135a9097ef704a27ae5f43263efc00a13980e3279a`.
- Inspected [desktop report](evidence/openwebui-41008469790-desktop.png)
  (1440x1000) and [mobile SVG preview](evidence/openwebui-41008469790-mobile.png)
  (390x844). The embedded chart fits its 350px HTML viewport; the mobile preview
  stays within the viewport. No uncaught browser JavaScript error was observed.
- The receipt records exact OpenWebUI/Open Terminal identities, model digest and
  sampling settings, prompt hash and five runner-local image-config digests.
  These are not published registry manifests, signatures or release provenance.
- One real chat submission produced CSV, JSON and PNG with two native tool calls
  and zero observed tool failures. The report was independently checked against
  `{"North":17,"South":7,"total":24}`. The harness supplied no Python implementation,
  replacement model artifacts or replayed model responses. One successful workflow
  is not a model reliability benchmark or deterministic-output guarantee.

### Earlier Failed Runs

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
runs remain recorded; the complete passing receipt above covers this revised scenario.

## Exercised Boundaries

Run 41008469790 passed native administrator setup, finite cold start, shell
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

The two separate image audit jobs for run 41008469790 passed the gate of zero
**fixable** high/critical findings. Their inventories still contain:

| Image | Total findings | Unfixed high/critical | Inventory SHA-256 |
| --- | ---: | ---: | --- |
| Adapter | 244 | 57 | `a0da57f6c100c6788143b8d9434cdcc9806394ef2cfffe3bf80dcca67989c2e0` |
| Open Terminal template | 430 | 80 | `bf1b90a544c93a4c6cc8a308b83bfff82b56a1645e8a2e6c968fe46d4ef14453` |

These inventories describe separately built scan candidates, not byte-identical
runtime images or a complete audit of OpenWebUI/Ollama. Passing the gate is not a
vulnerability-free claim. Review the full inventories and upstream advisories
before choosing a production risk policy. GitHub retains these scan artifacts
for 14 days; a release must retain its own exact-image inventory.

## Remaining Gates

- Have an independent operator follow the guide in a fresh environment. The
  [handoff checklist](../../integrations/openwebui/README.md#independent-self-service-handoff)
  specifies the evidence; maintainer-run CI does not replace it.
- Obtain explicit merge/publication/deployment instructions, select versions,
  produce immutable artifacts and verify anonymous installation of those exact
  artifacts before announcing a release.

No running Mac/k0s lab, customer environment, BackgroundAgent installation or
public website was changed by this qualification. The
[execution plan](../exec-plans/active/protected-services-openwebui.md) remains active.
