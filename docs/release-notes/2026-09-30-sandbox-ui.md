# Web Maintenance: Sandbox Switching and Readable Logs

September 30, 2026. A dashboard-only maintenance update on the rc.12 web source
line. Core package versions remain unchanged. Publication and deployment evidence
is recorded in the [delivery receipt](2026-09-30-sandbox-ui-delivery.md).

## Changes

- The sandbox detail sidebar lists recent organization sandboxes with names,
  IDs, status, search and refresh. The current sandbox remains available even
  when it is older than the 200-record recent list. Mobile uses a compact switcher.
- Switching sandboxes keeps the selected detail tab and resets sandbox-specific
  state. Delayed responses cannot replace the newly selected sandbox's logs.
  Navigation stays available during detail loading and recoverable failures.
- Long log event names wrap at separators. Source badges grow with their text,
  messages retain newlines, and narrow layouts place messages below metadata.
  Event names and messages are not silently truncated to avoid overlap.
- The public Deep Agents first-task comparison delivered on September 27 remains
  included, with the same executable local/sandbox examples and aligned panels.

## Compatibility

No API behavior, database migration, new runtime permission or provider upgrade
is required. SDK/CLI `0.5.0-rc.12`, Deep Agents `0.1.0-rc.2`, npm channels and
stable release tags are unchanged. The web image is independently deployable;
this release does not publish a new API image or Helm chart.

Preserve the installation's `config.PUBLIC_*`, identity configuration, secrets
and backend image pins during a web-only upgrade. Do not replace existing values
with development defaults. The delivery receipt records the exact web image,
digest and installed-chart rollback point; do not infer a full-product upgrade
from this maintenance release.

## Validation Scope

The implementation passed 60 local browser contracts, including 13 new sidebar
and log regressions, 105 web tests, typecheck and a production build. Browser
coverage includes 320, 390, 768, 1024, 1440 and 1920 pixel widths, delayed
responses, failures/retry, long values and bounded-list scrolling.

These are UI contracts with authenticated fixtures, not new isolation, model,
runtime-provider or customer OpenShift qualification. The release pipeline and
public deployment passed the separate checks recorded in the delivery receipt.
