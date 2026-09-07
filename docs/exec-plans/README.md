# Execution Plans

Placement reviewed September 8, 2026. A deployed candidate is not evidence that
all acceptance gates are complete. Historical completed and abandoned plans stay
in [completed](completed/); unfinished work stays in [active](active/).

## Active

| Plan | Delivered | Still required |
| --- | --- | --- |
| [Delivery readiness and persistent workspaces](active/delivery-readiness-and-persistent-workspaces.md) | Workspace and live-output preview; rc.3 deployed to k0s with migration 036; matching npm SDK/CLI on `next` | Commands working-directory follow-up, fresh restricted OpenShift storage acceptance, complete template architecture checks, host and coherent DB/PVC recovery; unattended npm trusted publishing remains operational debt |
| [Real product demos](active/real-product-demo-remotion.md) | Public CLI, UI, SDK and browser-QA demos, tutorials and transcripts | Protected unattended agent-refresh credentials, CI environment and live acceptance |

## Recently Completed

- [Documentation redesign deployment](completed/documentation-redesign-deployment.md):
  web-only Harbor image deployed to public k0s revision 26, with public browser
  and OIDC acceptance. See the [delivery receipt](../release-notes/2026-09-08-documentation-redesign-delivery.md).
- [Documentation experience](completed/documentation-experience.md): restructured
  public docs, rewritten vision, responsive diagrams, highlighted examples and
  desktop/mobile browser acceptance; subsequently deployed by the plan above.

There are 30 plans in `completed/`, including the explicitly abandoned and
superseded OpenSandbox boundary plan. Neither active plan should be archived
until its remaining required work is verified. See the
[rc.3 delivery receipt](../release-notes/0.5.0-rc.3-delivery.md) for release evidence
and the exact distinction between Harbor/GitHub delivery and npm availability.
