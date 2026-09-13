# TypeScript SDK Candidate and Web Delivery

September 13, 2026. This is a source merge and web/documentation delivery, **not
a new npm release**. Published SDK/CLI `0.5.0-rc.10` and their dist-tags are unchanged.

## Source and Review

[PR 48](https://github.com/nabilblk/h-sandbox/pull/48) merged as
`72e16beec03bbc9696abc4a8edc7abf37de6e9c2`. Its source tree matches the reviewed
head `1e882c6eef5c7dd861322729d3f14ec3892d1e0a`. The candidate adds the documented
sandbox-object conveniences, bounded observation, route credential containment
and recovery metadata described in the [migration guide](../sdk-developer-experience.md).

Two review regressions were reproduced and fixed before merge:

- Binary downloads now fill a preallocated `Uint8Array`, avoiding an intermediate
  per-byte JavaScript array. A supported 16 MiB artifact is checked byte-for-byte
  under a 128 MiB Node heap. Size limits, byte counts and SHA-256 checks remain.
- The actual headless OpenCode example again forwards the explicitly selected
  optional `ANTHROPIC_API_KEY`. A loopback API fixture executes the example with
  and without a dummy provider key and verifies readiness, command submission,
  the narrow environment mapping and confirmed cleanup. No paid or free model
  inference is claimed by these tests.

Local verification passed 95 SDK tests, 26 installed-package contract tests plus
the two new fixtures, public declaration/example checks and 83 CLI tests. An
earlier CLI attempt collided with a concurrent local SDK rebuild; the sequential
rerun passed. The tracked-file secret scan found no issues.

All 12 [final PR checks](https://github.com/nabilblk/h-sandbox/actions/runs/34760627289)
passed, including separate Node 20/22 installed-package jobs and
[native acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/34760627317).
The [retained native receipt](../operations/evidence/sdk-dx-34760627317.json) records
all 13 gates and cleanup on an isolated GitHub-hosted amd64 cluster, using the
candidate tarball against pinned API `0.5.0-rc.9`. It retains its actual PR-merge
checkout identity and tarball hash; neither is relabeled as a published package.
[Main CI](https://github.com/nabilblk/h-sandbox/actions/runs/34761108305) also passed.

## Web Artifact and Deployment

The [web-only Harbor build](https://github.com/nabilblk/h-sandbox/actions/runs/34761129519)
passed through the existing protected environment. Anonymous downloads verified
both architecture manifests and image configuration labels against the merged
source. No API image, chart or npm package was republished.

| Artifact | Identity |
| --- | --- |
| Web tag | `sdk-dx-20260913-72e16beec03b` |
| Multiarch index | `sha256:ba3499b904cc5678816bcb77cfa3c46bf28de5fbe8ed264f113a15526e4a85dd` |
| amd64 manifest | `sha256:d906479077da4f95f174e39292133cf3d0308c2dcc6ac3dda4a8584087416063` |
| arm64 manifest | `sha256:3ad1b81b05b466e52bc08da8c0d8e4528c2d9f7e6b197bbd3c87c9bc9845473a` |
| Existing chart/application | `0.5.0-rc.10` |
| Public Harakiri Helm revision | `43` |

The exact existing chart archive and private saved values reproduced revision 42
before deployment. Explicit kubeconfig, namespace UID and node checks selected
the public lab, not the default customer cluster. A structured rendered diff
allowed only the web container image to change. After the upgrade, deployment
specifications/UIDs and ConfigMap/Secret content/UIDs in the application, Keycloak,
provider and ingress namespaces matched the baseline except for that image.
Private rollback values were retained with owner-only permissions. No database
migration, cluster restart, credential change or destructive acceptance ran in
the lab.

## Public Verification and Boundaries

The new [TypeScript guide](https://sb.harakiri.io/#docs/typescript-sdk) and its
[Markdown export](https://sb.harakiri.io/docs/typescript-sdk.md) are live, with an
explicit unreleased-candidate notice. Browser checks found no page-level overflow
at 1440, 390 or 320 pixels. All six code blocks rendered with syntax colors; the
desktop and mobile first viewports were visually inspected. No browser errors
were reported while inspecting the guide.

The first public request caught a brief 502 during the web pod/port-forward
handoff. A later 530/502 interruption affected multiple public origins while all
local origins remained healthy. The existing tunnel logged QUIC timeouts and
`network is unreachable`. Restarting only its supervised `harakiri-dev` process
restored four tunnel connections. No tunnel configuration or Kubernetes workload
was changed for that recovery. This was not a zero-downtime delivery or proof of
long-term tunnel reliability.

After recovery, web, API health and public OIDC discovery returned 200 in three
consecutive checks. A fresh browser sign-in reached the actual public Keycloak
login form using authorization-code flow, PKCE S256 and the redirect URI
`https://sb.harakiri.io/`; it did not redirect to localhost. This check did not
submit a user's password or claim a newly completed authenticated session.

The [execution plan](../exec-plans/active/typescript-sdk-developer-experience.md)
remains active for an authorized preview-package release/migration decision and
real integration feedback. The deployment receipt and retained evidence change
no bundled frontend assets and need no second image build.
