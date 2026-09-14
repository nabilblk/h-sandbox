# SDK Documentation Corrections and Delivery

September 14, 2026. This delivers documentation and example corrections, not a
new SDK/CLI package. Published npm `0.5.0-rc.10` and its dist-tags are unchanged;
the newer TypeScript conveniences remain explicitly labelled as a source candidate.

## Source and Verification

[PR 50](https://github.com/nabilblk/h-sandbox/pull/50) merged as
`35084f1b0084542702993f85a5089ba7e9674113`. Its source tree exactly matches the
reviewed head `165e0c850ab183e366ed5cba249be23acfeafd4d`.

The [documentation audit](../sdk-documentation-audit.md) records all seven fixes:
published/candidate version guidance, matching example installation, confirmed
cleanup and recovery, real artifact checksums, complete authenticated OpenCode
programs, migration references and executable documentation regressions.

All 14 PR checks passed, including
[CI and published-example tests](https://github.com/nabilblk/h-sandbox/actions/runs/34839334871),
[native SDK acceptance and cleanup](https://github.com/nabilblk/h-sandbox/actions/runs/34839334804)
and [demo contracts](https://github.com/nabilblk/h-sandbox/actions/runs/34839334876).
The exact displayed programs passed 18 installed-package scenarios on both
Node 20 and Node 22. They use npm SDK rc.10 and OpenCode SDK 1.15.13 with loopback
protocol fixtures and synthetic credentials, not live model inference. Native
runtime acceptance used a disposable GitHub-hosted amd64 cluster, not the lab.

Local verification also passed 103 web tests, typecheck, production build,
the 18 package scenarios on Node 26 and the tracked-source secret scan.
The local nine-test browser suite covered all 43 pages at 1440, 390 and 320 pixels,
hidden code tabs and Markdown parity. Private research was neither scanned nor
included in the source commit or image build context.

## Artifact and Deployment

[Main CI](https://github.com/nabilblk/h-sandbox/actions/runs/34840170125) and the
[web-only Harbor build](https://github.com/nabilblk/h-sandbox/actions/runs/34840191123)
passed. Anonymous registry requests verified both architecture manifests and
their source-revision labels. The chart job was skipped. No API image, Helm chart
or npm package was republished.

| Artifact | Identity |
| --- | --- |
| Web tag | `sdk-docs-20260914-35084f1b0084` |
| Registry repository | `core.campus.clusterdiali.me/harakiri/harakiri-web` |
| Multiarch index | `sha256:075fa297d9a86a515d56c13194d906c8b6ddac2861fe5762ce8f2cd3c5f7f664` |
| amd64 manifest | `sha256:228c00e1a83ce85ef253c5993886b3cdaccd8d052883312341e1c8c3411aa5d2` |
| arm64 manifest | `sha256:ac443806e0a53505dbe31ab3fef37039bfb9842930b1eecece2f913fa66ed581` |
| Existing chart/application | `0.5.0-rc.10` |
| Chart archive SHA-256 | `9fb11b234041ef55c518850fb60572d66921f4441dc524bbaa67cae6c94428a7` |
| Public Harakiri Helm revision | `44`, previously `43` |

An explicit kubeconfig, namespace UID guards and node readiness checks selected
the public k0s lab, not the default OpenShift context. The exact installed chart
and private saved values reproduced revision 43 before deployment. A structured
rendered diff and server-side Helm dry run allowed only the web container image
to change. The upgrade pinned the image digest and enabled rollback on failure.

After deployment, specifications and UIDs of deployments and content hashes/UIDs
of ConfigMaps and Secrets in the application, Keycloak, provider and ingress
namespaces matched the baseline except for the intended web image. Private
rollback values were retained with owner-only permissions. No database migration,
credential rotation, cluster restart or customer OpenShift mutation was performed.

One public request returned 502 during the old web pod/port-forward handoff.
The existing supervisor reconnected automatically and public access recovered;
no manual tunnel restart or tunnel configuration change was needed. This was
not a zero-downtime deployment or a long-term availability test.

## Public Verification

The corrected [SDK and CLI guide](https://sb.harakiri.io/#docs/sdk-cli),
[quickstart](https://sb.harakiri.io/#docs/quickstart) and
[OpenCode guide](https://sb.harakiri.io/#docs/opencode-template) are live.

- All nine documentation Playwright tests passed against the public site,
  covering all 43 pages at 1440, 390 and 320 pixels, navigation, search, code copy,
  language tabs and exact browser-code/Markdown parity. No page errors or
  document-level overflow were reported.
- All 47 public documentation assets exactly matched the source renderer:
  43 pages, Markdown/JSON inventories and both LLM exports.
- Desktop OpenCode and mobile quickstart screenshots were visually inspected.
- Web, API health and OIDC discovery returned 200 in three consecutive checks.
  Runtime configuration retained all public origins.
- A fresh browser sign-in reached the public Keycloak login form with
  authorization-code flow, PKCE S256 and callback `https://sb.harakiri.io/`.
  No localhost redirect occurred. No password was submitted; this does not
  claim a newly completed authenticated session.

The [SDK plan](../exec-plans/active/typescript-sdk-developer-experience.md) remains
active for a deliberate candidate-package release and integration feedback.
This receipt changes no bundled frontend assets and needs no second image build.
