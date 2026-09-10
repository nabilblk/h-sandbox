# Execution Plans

Placement reviewed September 10, 2026. A deployed candidate is not evidence that
all acceptance gates are complete. Historical completed and abandoned plans stay
in [completed](completed/); unfinished work stays in [active](active/).

## Active

| Plan | Delivered | Still required |
| --- | --- | --- |
| [OSS Developer Preview launch](active/oss-developer-preview-launch.md) | Public source, reviewed credentials/material, protected release entry points, rc.8 native arm64 install/upgrade/file recovery, truthful preview, docs exports; independent evaluation and LinkedIn/X publication owner-reported complete | Security-report notification receipt, broader live member acceptance, consented three-team and second-week outcomes; no duplicate prelaunch evaluation |
| [Delivery readiness and persistent workspaces](active/delivery-readiness-and-persistent-workspaces.md) | Workspaces/live commands and workdir correction in rc.8; standalone arm64 native acceptance and coordinated database/file-volume restore; all six template architecture/manifest pipelines passed September 9; customer package/docs separated September 10 | Native amd64 for advertised support, remaining catalog/matrix coverage, real encrypted Vault recovery/provider-loss repair, host/rollback validation; customer OCP bundle excluded |
| [Real product demos](active/real-product-demo-remotion.md) | Four agent workflow films plus separately completed full-frame UI tour; public tutorials/transcripts, restored vertical menu | Protected unattended agent-refresh credentials, CI environment and live acceptance; lower priority than core product reliability |

The OSS launch has happened; it is no longer the next unstarted milestone.
The owner reports positive reception, not measured repeat adoption. Existing
plans remain active for their actual unfinished gates, not because source or
packages are unpublished. Current npm `next` is rc.8; `latest` is still 0.4.0.
The latest [documented lab delivery](../release-notes/2026-09-10-kubernetes-docs-delivery.md)
is revision 36 after a web-only Kubernetes documentation update. That delivery
checked the live site and preserved the backend; it is not fresh-install evidence.

## Customer Delivery Boundary

The owner clarified that the former customer package is a
version-specific datacenter integration bundle containing Harakiri Sandbox,
BackgroundAgent and their dependencies. It belongs to a separate customer
delivery track, not the OSS installation contract or an OSS/Python release gate.
Those tasks are separated, not marked completed or canceled.

Portable standalone installation, reusable chart/images and truthful security
requirements remain OSS work. Generic restricted OpenShift compatibility is an
optional support target to select independently, using Harakiri-only acceptance.
The owner subsequently approved the [repository extraction](../customer-deployment-separation.md).
The preserved package now has private ownership and CI; public installation
guides no longer require it. The [OpenShift guide](../install-openshift.md)
describes standalone prerequisites and explicitly unverified profile limits.
No customer installation, version upgrade or Brain update accompanies extraction.

## Recommended Next Work

These are backlog recommendations, **not started or approved implementation**.
Keep one engineering plan in execution at a time:

1. Close small reporting/support handoffs, retain the accepted independent
   evaluation, and turn consented launch feedback into reproducible issues.
   Settle safe old-stable versus candidate upgrade/maintenance guidance.
   The [Kubernetes installation guide](../install-kubernetes.md) is now public;
   use operator feedback to improve it. Documentation/browser acceptance is not
   a fresh-install certification.
2. Plan atomic organization capacity admission across create, asynchronous
   provision, restore, resume, retries and uncertain cleanup. The shipped
   `concurrencyLimitEnforced: false` disclosure is not enforcement. Require
   database concurrency tests, native acceptance and coherent API/SDK/CLI/UI docs.
3. Complete named release/profile acceptance and reproducible publication through
   the standalone OSS delivery work. Distinguish native amd64 support from the
   now-passing image architecture jobs; retain narrower recovery evidence.
   Customer OCP/BackgroundAgent acceptance is not required for this milestone.
4. Replace unavailable history with actual bounded observations, not billing.
   Configure and prove npm trusted publishing, broader artifact verification,
   registry headroom monitoring and an explicitly scoped stable-release path.
5. Make a focused Python SDK the next major integration capability once the
   capacity contract, one supported distribution path and concrete adopter need
   are established. Then select one framework adapter from actual demand.

Do not make every runtime capability, HA profile, template brand or demo refresh
a prerequisite for Python. Additional providers, pools, memory forks, broad MCP,
large artifacts and richer event infrastructure need evidence of a blocked
workflow. BackgroundAgent remains an external consumer, not an acceptance
dependency. Harakiri is the sandbox control plane; OpenSandbox is its current
real execution adapter, not its product identity.

## Recently Completed

- [Kubernetes documentation deployment](completed/kubernetes-docs-deployment.md):
  protected source merge, CI web-image publication, guarded image-only Helm
  revision 36, live documentation/media/browser/OIDC acceptance and receipt.
  Credentials, public origins and non-web workloads unchanged.
- [Kubernetes installation documentation](completed/kubernetes-installation-docs.md):
  North Star/source assessment, visible Self-hosting page and operator entry
  points, corrected stale chart instructions, generated Markdown and browser
  acceptance. Authoring involved no installation, deployment or Brain edits;
  the separate delivery above subsequently published the page.
- [Customer deployment extraction](completed/customer-deployment-extraction.md):
  preserved source published in a private repository, independent CI and
  clean-clone acceptance, OSS guides/tooling/tests separated, legacy local state
  unchanged. The owner subsequently requested OSS source publication; no
  installation, release or Brain update accompanies it.
- [Post-launch backlog reconciliation](completed/post-launch-backlog-reconciliation.md):
  planning-only source/release review, current vault backlog and historical
  checkpoints, reconciled active-plan status. No implementation, deployment,
  release or new feature exec plan started.
- [Demo sidebar default](completed/demos-sidebar-default.md): restored vertical
  desktop library, kept optional wide mode and complete video frame; local and
  public five-viewport acceptance recorded in the
  [tour/sidebar receipt](../release-notes/2026-09-09-ui-product-tour-delivery.md).
- [UI product tour](completed/ui-product-tour.md) and
  [deployment](completed/ui-product-tour-deployment.md): full-frame 334-second,
  17-chapter film and verified web-only publication; no new SDK/chart version.
- [Authorization release](completed/authorization-release.md): rc.4 published to
  Harbor/GitHub/npm `next`, audience configured before migration 037, final k0s
  revision 28 with a separately published web correction. Real public role/key,
  OpenSandbox SDK/CLI and browser acceptance passed; test resources cleaned.
  See the [delivery receipt](../release-notes/0.5.0-rc.4-delivery.md).
- [Authorization consolidation](completed/authorization-consolidation.md):
  scoped key principals, server role/scope policy, JWT API audience, live
  revocation and matching UI/docs. Local API/PostgreSQL, browser and SDK/CLI dev
  conformance passed. Subsequently published and deployed by the release above.
- [Documentation redesign deployment](completed/documentation-redesign-deployment.md):
  web-only Harbor image deployed to public k0s revision 26, with public browser
  and OIDC acceptance. See the [delivery receipt](../release-notes/2026-09-08-documentation-redesign-delivery.md).
- [Documentation experience](completed/documentation-experience.md): restructured
  public docs, rewritten vision, responsive diagrams, highlighted examples and
  desktop/mobile browser acceptance; subsequently deployed by the plan above.

The [archive](completed/) includes the explicitly abandoned/superseded
OpenSandbox boundary plan; its historical ambitions are not all delivered
capabilities. No active plan should be archived until remaining required work is
verified or explicitly re-scoped. See the [rc.8 delivery receipt](../release-notes/0.5.0-rc.8-delivery.md)
and [public-source receipt](../release-notes/2026-09-09-public-launch.md) for exact
release/support boundaries. The initial September 10 backlog reconciliation was
planning-only. The subsequently approved customer extraction is separately
recorded above. Initial publication covered the private repository; the owner
then requested committing and pushing the OSS cleanup. Neither step is an OSS
release, cluster change or new roadmap feature.
