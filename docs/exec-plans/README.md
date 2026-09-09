# Execution Plans

Placement reviewed September 9, 2026. A deployed candidate is not evidence that
all acceptance gates are complete. Historical completed and abandoned plans stay
in [completed](completed/); unfinished work stays in [active](active/).

## Active

| Plan | Delivered | Still required |
| --- | --- | --- |
| [OSS Developer Preview launch](active/oss-developer-preview-launch.md) | Unreleased source: truthful usage/capacity, workdir fix, docs exports, hardened checks, dependency remediation; clean contributor setup, 572 tests and 20 browser tests pass. September 9: approved live admin password/session remediation verified, reporting contact and initial triage assigned | Reporting receipt confirmation, release review/protection, remaining material review, fresh native install, new immutable release, approved opening/announcement and three-team adoption |
| [Delivery readiness and persistent workspaces](active/delivery-readiness-and-persistent-workspaces.md) | Workspace/live-output rc.4 on k0s with migration 037 and matching npm packages; Commands workdir source correction verified September 9 | Workdir candidate/native acceptance, fresh restricted OpenShift storage acceptance, complete template architecture checks, registry headroom, host and coherent DB/PVC recovery; unattended npm trusted publishing remains operational debt |
| [Real product demos](active/real-product-demo-remotion.md) | Public CLI, UI, SDK and browser-QA demos, tutorials and transcripts | Protected unattended agent-refresh credentials, CI environment and live acceptance |

The owner selected OSS Developer Preview as the next umbrella milestone. It
reuses the other plans without waiving their unfinished production-support
gates. Source publication, a usable preview, public announcement and independent
adoption have separate acceptance; creating the plan does not change visibility.

## Recently Completed

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

There are 32 plans in `completed/`, including the explicitly abandoned and
superseded OpenSandbox boundary plan. No active plan should be archived
until its remaining required work is verified. See the
[rc.4 delivery receipt](../release-notes/0.5.0-rc.4-delivery.md) for release evidence
and the exact distinction between this candidate and remaining stable gates.
