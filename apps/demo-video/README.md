# Harakiri Demo Video Workspace

Private, build-time Remotion 4.0.520 workspace. No Remotion runtime is shipped
in the public website. Maintainer eligibility confirmed September 5, 2026.

## Current Library

- cli-agent-repair: 76 seconds, published CLI + OpenCode repair + immutable tests.
- ui-agent-app: 73 seconds, real dashboard + agent-generated app + tested preview.
- sdk-agent-report: 298 seconds, 16 chapters covering the use case, execution
  boundary, full prompt/command, tracked job, two downloaded artifacts and cleanup.

See [the production runbook](../../docs/demo-production-runbook.md) for identity,
free-model policy, privacy, recovery, rendering, publishing and CI constraints.

```sh
pnpm --filter @harakiri/demo-video capture:agents
pnpm --filter @harakiri/demo-video capture:ui
pnpm --filter @harakiri/demo-video prepare:workflows /path/to/cli.json /path/to/sdk.json /path/to/ui.json
pnpm demo:studio
pnpm demo:render
pnpm demo:verify
```

Capture uses a dedicated organization. Every failure must clean up before another
attempt. Full traces and recovery files stay ignored in docs/artifacts/demo.
Published source manifests live in public/workflows. Rendered distribution files
live in apps/web/public/demos.

The generated films show real output with waiting removed, not benchmarks.
CLI text is replayed, SDK excerpts are condensed, and dashboard footage is real.
Films are silent, with English captions and complete written tutorials.
Check costs and data policies again before selecting a free model for a new run.

The SDK outline is shared with its written tutorial and player timestamps in
apps/web/src/sdk-demo-walkthrough.ts. Its prompt and shell command are tested
against the runnable example. SDK storyboard preparation requires a matching
fresh evidence hash, unchanged input, verified report and a nonempty summary.

## Tests

```sh
pnpm --filter @harakiri/demo-video test
pnpm --filter @harakiri/demo-video recording:check
pnpm --filter @harakiri/demo-video browser:qa http://localhost:5185
pnpm --filter @harakiri/demo-video server:qa http://localhost:5190
```

The server test targets a production Nginx container, not Vite. Inspect representative
stills and browser screenshots after every storyboard change.

Legacy capture/render/approve commands remain for the initial infrastructure tour.
Its footage and source schema are separate from the new agent workflows, and its
hero loop is no longer mounted on the homepage. The legacy CI refresher does not
refresh the agent library. Unattended agent recording is not enabled.
