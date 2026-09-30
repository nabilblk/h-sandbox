# Execution Plan: Sandbox Detail Navigation and Logs

**Created**: 2026-09-30
**Author**: Codex
**Status**: Completed
**Estimated effort**: Under 2 hours

## Context
The sandbox detail sidebar only renders a back button, leaving no direct way to
switch sandboxes. Log event names overflow a fixed 82px column into messages.
Restore the intended workspace navigation and readable logs without changing
runtime behavior or touching the running cluster.

## Success Criteria
- [x] A visible, searchable desktop sandbox list supports direct switching and current selection.
- [x] Loading, refresh failures, long names and mobile navigation remain usable.
- [x] Switching retains the selected tab but never retains another sandbox's pane state.
- [x] Long log events, sources and messages never overlap on desktop or mobile.
- [x] Focused browser regressions, screenshots, web tests, typecheck and build pass.

## Phases

### Phase 1: Diagnose
**Status**: Complete
- [x] Confirm missing sidebar markup and fixed-width log overflow.
- [x] Inspect routing, API contracts and isolated browser fixture conventions.

### Phase 2: Implement
**Status**: Complete
- [x] Add an organization-scoped recent sandbox switcher using the existing API.
- [x] Isolate per-sandbox detail state while retaining the chosen tab.
- [x] Fix log column sizing, wrapping and narrow-screen presentation.

### Phase 3: Verify
**Status**: Complete
- [x] Exercise direct switching, search, refresh, failures and delayed responses.
- [x] Assert text containment and inspect desktop/mobile screenshots.
- [x] Run web checks and archive this plan with results.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-30 | Use the existing bounded list endpoint, label it recent, and retain the selected sandbox | No backend contract expansion; do not imply an exhaustive inventory | Unbounded list or new pagination API |
| 2026-09-30 | Preserve tab selection; key detail state by sandbox ID | Direct switching must not leak logs, commands or terminal state across sandboxes | Reset every switch to Terminal |
| 2026-09-30 | Use mocked authenticated browser fixtures | Validate real UI behavior without creating sandboxes or changing the lab | Live account/runtime mutations |

## Tech Debt Incurred
None. The existing list API remains bounded to 200 recent records; the selected
sandbox is retained even when older. This is explicitly labelled in the UI.

## Completion Notes
Delivered a searchable, independently scrolling desktop sandbox sidebar with
current/active/history sections, statuses, full-name tooltips, refresh/retry and a
native mobile switcher. Navigation retains the selected tab and resets all
per-sandbox pane state. A failed detail read no longer removes navigation or
leaves an indefinite loading screen.

Logs now reserve suitable event width, wrap at event separators, grow source
badges vertically, preserve message newlines and place messages below metadata
on narrow viewports. All content remains selectable; no event or message is
silently truncated to avoid overlap.

Verification on 2026-09-30:
- 13 new Playwright cases passed, including 1920/1440/1024/768/390/320px layout,
  long names/events/sources/messages, keyboard/history navigation, 200 recent
  rows plus an older selection, failure/retry and delayed-response isolation.
- 47 existing browser contracts passed: documentation, capacity, authorization,
  preview readiness and usage observations. Total: 60 local browser tests.
- 105 web tests, web typecheck and production build passed. The build retains
  its existing non-failing bundle-size warning.
- Agent-browser desktop/mobile screenshots were inspected, direct switching
  retained Logs, and no browser page errors were reported. Review screenshots:
  `/tmp/harakiri-sandbox-detail-review-desktop.png` and
  `/tmp/harakiri-sandbox-detail-review-mobile.png`.
- Added the new suite to the existing credential-free CI browser job. CI has
  not been triggered; all evidence above is local.

No live runtime calls, cluster changes, commits, publication or deployment.
The unrelated untracked `docs/cot/` directory was left untouched.
