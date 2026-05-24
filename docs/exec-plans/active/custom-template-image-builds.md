# Execution Plan: Custom Template Images And Builds

**Created**: 2026-05-23
**Author**: Codex
**Status**: In Progress
**Priority**: {P0-P3}
**Estimated effort**: 5-8 days

## Context
Harakiri currently exposes templates as a mostly static catalog. PostgreSQL has a
`templates` table, but sandbox creation still resolves the requested template
against the hardcoded shared `TEMPLATES` array and sends only `image: { uri }`
plus a default entrypoint to OpenSandbox. This is enough for static base images,
but it does not provide the E2B-like experience where a team can define,
build, inspect, version, and use custom sandbox templates.

The immediate product benchmark is E2B's custom template workflow:

- `e2b.toml` declares template name, ID, Dockerfile, CPU, and memory.
- `e2b template build --name open-agents-dev` builds the custom sandbox image.
- `Sandbox.create("open-agents-dev")` starts a sandbox from the named template.
- The dashboard has a Templates section with List and Builds tabs, search,
  filters, build status, resource columns, visibility, version metadata, and
  row actions.

The local reference template is
`/Users/labs/project/trash/background-agents/e2b-template`, which builds
`open-agents-dev` from `e2bdev/code-interpreter:latest` and adds Chromium, Bun,
`agent-browser`, `code-server`, `jq`, and a writable workspace. The preferred
Harakiri/OpenSandbox direction is to copy the E2B developer workflow while using
native OpenSandbox OCI images underneath. The neighboring
`/Users/labs/project/trash/background-agents/opensandbox-template` is a better
runtime base for Harakiri because it starts from a normal OCI image and defines
the same agent/browser/editor surface without depending on E2B internals.

## Success Criteria
- [ ] A team can run `harakiri template init` and get a Harakiri template config
      equivalent in ergonomics to `e2b.toml`.
- [ ] A team can run `harakiri template build --name open-agents-dev <path>` and
      get a persisted build record with streamed logs, final image digest, CPU,
      memory, default ports, default workdir, and status.
- [ ] A sandbox can be created by template name, stable alias, or immutable
      version ID, and the sandbox record stores the exact template version and
      image digest used.
- [ ] The `open-agents-dev` template builds from the OpenSandbox-native Dockerfile,
      runs in k0s through OpenSandbox, and passes smoke checks for `bun`, `jq`,
      `agent-browser`, Chromium headless, `code-server`, workspace write access,
      terminal commands, logs/files/metrics tabs, and public route exposure.
- [x] The dashboard Templates page has E2B-like List and Builds tabs with search,
      filters, status badges, visibility, CPU, memory, created/updated timestamps,
      latest build/version metadata, and row actions.
- [x] Build failures are visible in API, CLI, and UI with useful error messages
      and retained logs.
- [ ] Template images are reproducible and auditable: mutable tags are resolved
      to immutable digests before use.
- [x] The default static templates continue to work during rollout.
- [x] Repo documentation explains how template definitions, builds, image
      digests, registry credentials, the Kubernetes builder, and OpenSandbox runtime
      integration work.
- [x] Product documentation is available inside the Harakiri website/docs area
      so users can learn the template workflow without reading repository
      internals.
- [ ] Any change to template behavior, CLI flags, API payloads, route exposure,
      or build failure handling updates both repo-facing documentation
      (`README.md` or dedicated `docs/*.md`) and website product documentation,
      or records why one surface is not affected.

## Product And UI Backlog
- [x] Replace the current card-only Templates page with a denser operational
      Templates workspace inspired by the E2B screenshots.
- [x] Add a Templates header with List and Builds tabs, matching the existing
      Harakiri visual language rather than copying E2B branding.
- [x] Add top-right live status and concurrent sandbox count to the Templates
      area, reusing the dashboard count source.
- [x] List tab:
  - [x] Search by template name, ID, or alias.
  - [x] Filter by visibility.
  - [x] Add owner/team, runtime family, and status filters.
  - [x] Table columns: name, ID, CPU, memory, updated, visibility, latest image
        version/digest short hash, and row actions.
  - [x] Add created timestamp and latest build status columns.
  - [x] Show template aliases such as `open-agents-dev` and `team/template`.
  - [x] Show internal/private/public visibility badges.
  - [x] Provide actions for Use, Build, and Copy ID.
  - [x] Provide actions for View builds and Promote.
  - [x] Provide an Archive action for private active templates.
- [x] Builds tab:
  - [x] Search by build ID, template ID, or template name.
  - [x] Filter by status with counts for queued/building/success/failed/canceled.
  - [x] Table columns: status, template, started, duration, build ID, image
        digest, and failure summary.
  - [x] Add template version/result version column.
  - [x] Build detail drawer/page with log stream, Dockerfile metadata, resulting
        digest, and cancel/retry actions.
  - [x] Add build context metadata to build detail.
  - [x] Add Kubernetes builder pod/node metadata to build detail once the worker
        persists that runtime information.
- [x] Template detail page:
  - [x] Overview with default create command and SDK snippets.
  - [x] Versions tab with latest/stable aliases and immutable version IDs.
  - [x] Dockerfile/config tab with redacted build args and env metadata.
  - [x] Runs tab showing recent sandboxes created from the template version.
- [x] New Template flow:
  - [x] Create from Dockerfile upload/path.
  - [x] Create from existing OCI image reference.
  - [x] Clone/fork existing template.
  - [x] Preview generated `harakiri.toml`.
- [x] Empty states for no templates, no builds, and no selected build.
- [x] Add loading/error states for failed build and registry pull failure.

## Documentation Backlog
Documentation is a first-class deliverable for this feature, split between
repo-facing engineering documentation and product-facing website documentation.
It must be planned and verified alongside code, not added as a release-afterthought.

### Documentation Definition Of Done
Every remaining feature checkpoint must ship with both documentation tracks unless
the change is provably invisible to one audience.

- A plan item cannot be marked complete until its checkpoint notes identify the
  documentation outcome for both audiences:
  - Code documentation: `README.md` for top-level discovery, or a dedicated
    Markdown file under `docs/` for contributor, operator, API, database,
    scheduler, builder, routing, deployment, security, or troubleshooting
    details.
  - Product documentation: the Harakiri website docs surface for user-facing
    dashboard, CLI, SDK, template build, template run, route exposure,
    promotion, errors, and troubleshooting workflows.
  - If one audience is unaffected, the checkpoint must state that explicitly.
- Required in every implementation checkpoint:
  1. Code documentation: update `README.md` for top-level contributor/operator
     discovery, or update the relevant dedicated Markdown file under `docs/`
     when the change is specific to API, CLI, database, scheduler, builder,
     routing, deployment, security, or operations.
  2. Product documentation: update the website docs surface for the
     user-facing workflow, including dashboard behavior, CLI/SDK usage,
     template creation/building/running, public routes, promotion, errors, and
     troubleshooting.
  3. Evidence: record the command, API payload, UI path, screenshot, or route
     used to verify the documented behavior in `docs/test-report.md`.
- A checkpoint can skip one track only when the summary explicitly states why
  that audience is unaffected.
- Mandatory documentation outputs:
  - Repo/code documentation: update `README.md` for top-level discovery when the
    workflow changes, and update the relevant dedicated Markdown under `docs/`
    for API, CLI, database, scheduler, builder, routing, deployment, or operator
    details.
  - Product documentation: update the Harakiri website docs surface for any
    user-visible dashboard, CLI, SDK, sandbox route, template build, template
    run, promotion, error, or troubleshooting behavior.
  - Example documentation: update the relevant example README when a template or
    sample project encodes behavior users are expected to copy.
- Documentation must be treated as two separate deliverables:
  - Code documentation: `README.md` for top-level discovery, or a dedicated
    Markdown file under `docs/` for API, CLI, database, builder, routing,
    security, deployment, scheduler, and operator details.
  - Product documentation: the Harakiri website docs surface for user-facing
    workflows, using product language and avoiding internal implementation
    detail unless the user must act on it.
- Code documentation track: update `README.md` or a dedicated Markdown file under
  `docs/` in the same checkpoint as API, CLI, database, scheduler, builder,
  routing, deployment, or operational behavior changes. These docs are the
  source of truth for contributors and operators.
- Product documentation track: update the website docs surface in the same
  checkpoint as user-visible dashboard, CLI, SDK, sandbox routing, template
  creation, template build, failure handling, or troubleshooting behavior
  changes. These docs are the source of truth for Harakiri users.
- If one documentation track is not touched, the checkpoint notes must state why
  it is not affected.
- Verification must include at least one command, API payload, UI path, or route
  from the changed docs, recorded in `docs/test-report.md` before marking the
  related plan item complete.

### Documentation Surface Inventory
- Code documentation must be maintained in `README.md` plus dedicated Markdown
  files under `docs/`: `templates.md`, `template-builds.md`,
  `template-runtime-contract.md`, `template-security.md`, `architecture.md`,
  `api.md`, `runbook.md`, and `test-report.md`.
- Example templates must carry their own local README when they encode a useful
  product pattern. For this plan, `examples/templates/open-agents-dev/README.md`
  should explain what the image contains, how to build it, how to run smoke
  checks, and what limitations are accepted for the prototype.
- Product documentation must be available in the Harakiri website docs surface.
  The current prototype implements this in `apps/web/src/main.tsx` through the
  `Docs` route; if the docs grow, extract the pages into dedicated docs data or
  MDX files without changing the product navigation.
- The two documentation surfaces serve different audiences: repo docs explain
  implementation, operations, and contributor workflows; website docs explain
  user-facing workflows such as creating, building, running, promoting, and
  troubleshooting templates.
- Documentation updates are not complete until examples are rechecked against
  the deployed k0s environment and stale implementation notes, especially
  builder/registry details, are removed.
- Documentation is part of the definition of done for every remaining template
  slice: backend/API changes update `README.md` or dedicated `docs/*.md`, while
  user workflow changes update the website docs surface.
- Code documentation and product documentation are tracked as separate
  deliverables. Completing one does not imply the other is complete.

### Per-Checkpoint Documentation Checklist
Use this checklist before marking any remaining plan item complete:

- Identify whether the checkpoint changes contributor/operator behavior,
  user-facing product behavior, or both.
- For contributor/operator behavior, update `README.md` or the relevant
  dedicated Markdown file under `docs/`.
- For user-facing behavior, update the website docs surface in the app so the
  workflow is discoverable without reading repository internals.
- Record verification evidence in `docs/test-report.md`, including at least one
  of: command output, API payload, UI path, screenshot path, deployed route, or
  k0s smoke script result.
- In the checkpoint summary, name the exact code docs and website docs changed.
  If one documentation track is skipped, state why it was not affected.

### Documentation Workstream Map
| Feature slice | Code documentation | Website product documentation | Verification evidence |
| --- | --- | --- | --- |
| Template config and CLI build workflow | `README.md`, `docs/templates.md`, `docs/template-builds.md`, example README | Templates guide, build guide, SDK usage guide | CLI `template init`, `template build`, `create`, and matching dashboard path |
| Template versioning and aliases | `docs/templates.md`, `docs/api.md`, data model notes in `docs/architecture.md` | Templates list/detail docs explaining latest, stable, aliases, and immutable IDs | API list/get version calls and UI screenshot |
| Dashboard Templates List, Builds, and detail pages | UI notes in `README.md` only if local setup changes; otherwise `docs/templates.md` for behavior | Website docs for List, Builds, build detail, new template, and template detail workflows | Playwright screenshots plus docs link/path check |
| Build failure handling and retries | `docs/template-builds.md`, `docs/runbook.md`, `docs/template-security.md` when policy-related | Troubleshooting page and build failure recovery copy | Failed-build smoke in API, CLI, and UI |
| Runtime image contract and Open Agents template | `docs/template-runtime-contract.md`, `examples/templates/open-agents-dev/README.md` | Open Agents template guide and user-facing runtime expectations | Sandbox smoke for tools, workspace, terminal, logs/files/metrics, and routes |
| Public route exposure for template sandboxes | `docs/templates.md`, `docs/api.md`, `docs/runbook.md`, routing notes in `docs/architecture.md` | User-facing route exposure guide and troubleshooting page | k0s route smoke with documented hostname pattern |
| Registry credentials, cleanup, scanning, retention | `docs/template-security.md`, `docs/runbook.md`, `docs/architecture.md` | Product docs only for user-visible configuration or error recovery | Operator command output and audit/test-report notes |
| Registry namespace and image publishing | `README.md`, `docs/template-builds.md`, `docs/runbook.md`, `docs/template-security.md` | Product docs explaining what users configure, what image names mean, and how to recover from pull/push errors | Registry credential smoke, Dockerfile build smoke, and deployed website docs path |
| Runtime env, workdir limits, and registry auth | `docs/api.md`, `docs/template-runtime-contract.md`, `docs/runbook.md`, `docs/template-security.md` | Product docs explaining sandbox env variables, template workdir expectations, private image pulls, and troubleshooting | API/CLI sandbox create with env, OpenSandbox request-body test, and k0s smoke evidence |

### Documentation Checkpoint Format
Use this format in phase notes, commit summaries, or `docs/test-report.md`
whenever a remaining task is checked off:

```markdown
Documentation:
- Code docs: `README.md`, `docs/template-builds.md`
- Product docs: Website docs > Templates > Template builds
- Verification: `pnpm smoke:template-build`, screenshot `/tmp/...png`
```

This keeps code documentation and product documentation visibly separate while
making it clear that both were reviewed in the same checkpoint.

### Code Documentation: README And Dedicated Markdown
- [x] Repository README updates:
  - [x] Add a quickstart for creating and using a custom template.
  - [x] Document the recommended `harakiri.toml` shape and how it maps to E2B's
        `e2b.toml`.
  - [x] Explain the difference between template definitions, template versions,
        builds, images, aliases, and snapshots.
  - [x] Document local k0s prerequisites: registry, Kaniko/build worker, image pull
        secrets, and OpenSandbox connectivity.
- [x] Dedicated repo markdown docs:
  - [x] Add `docs/templates.md` for developer-facing template concepts and CLI/API
        workflows.
  - [x] Add `docs/template-builds.md` for build pipeline architecture, state
        transitions, logs, failure modes, retries, and cancellation.
  - [x] Add `docs/template-security.md` for registry credentials, secret
        redaction, base-image policy, digest pinning, SBOM/scanning, and audit
        events.
  - [x] Add `docs/template-runtime-contract.md` for image expectations: user,
        workdir, writable paths, entrypoint behavior, ports, envs, `execd`,
        browser automation, code-server, and smoke tests.
  - [x] Update `docs/architecture.md` with the template build subsystem and data
        flow from CLI/UI to Kaniko, registry, PostgreSQL, and OpenSandbox.
  - [x] Update `docs/api.md` with template, version, build, log, promote, and
        cancel endpoints.
  - [x] Update `docs/runbook.md` with operator commands for build-log
        inspection.
  - [x] Update `docs/runbook.md` with builder health, registry cleanup, and
        failed pull debugging commands once the k0s builder exists.
- [x] Example template documentation:
  - [x] Add or verify `examples/templates/open-agents-dev/README.md`.
  - [x] Document the included runtime tools: Bun, Node/npm/pnpm/yarn, Python,
        Chromium, `agent-browser`, `code-server`, git, jq, ripgrep, and shell
        utilities.
  - [x] Document build/run/smoke commands that work against the deployed k0s
        environment.
  - [x] Document prototype runtime limitations such as workspace ownership,
        root/non-root user behavior, and route exposure expectations.
- [ ] Code documentation completion gate:
  - [x] README links to every dedicated template doc needed by a contributor or
        operator.
  - [ ] Dedicated markdown docs include canonical CLI commands, API payload
        examples, environment variables, database/control-plane concepts, and
        k0s deployment notes.
  - [ ] Operator-only guidance stays in repo docs and is not copied into the
        product docs unless users must act on it.
  - [ ] Each remaining API, CLI, database, scheduler, routing, or builder change
        is reflected in `README.md` or the relevant dedicated Markdown file in
        the same checkpoint.

### Product Documentation: Website And In-App Docs
- [x] Website product docs:
  - [x] Add a Templates section to the in-app/docs website navigation.
  - [x] Add "Create a custom template" guide with `harakiri template init`,
        Dockerfile example, `harakiri template build`, and `harakiri create`.
  - [x] Add "Template builds" guide explaining build statuses, logs, retries,
        cancellation, and how to read common errors.
  - [x] Add "Using templates from SDKs" with JS and Python-style examples where
        applicable.
  - [x] Add "Open Agents template" guide covering the `open-agents-dev` runtime,
        included tools, exposed ports, and smoke-test commands.
  - [x] Add "Security model" page covering public/private/internal visibility,
        image digest pinning, registry access, and secret handling.
  - [x] Ensure website docs match Harakiri's design tokens and do not use E2B
        branding or copy.
  - [x] Update website docs once Dockerfile builds are fully wired so they no
        longer describe the Kubernetes builder as future work.
  - [x] Add website troubleshooting content for registry pull failures, failed
        builds, route exposure, and mismatched template aliases.
  - [x] Link relevant product docs from Templates empty states, build detail
        errors, and New Template flow.
- [ ] Product docs must remain user-facing:
  - [ ] Avoid internal-only implementation detail unless it changes what users
        must configure or debug.
  - [ ] Keep examples focused on `harakiri template init`, `harakiri template
        build`, `harakiri create`, route exposure, and template promotion.
  - [ ] Mirror important CLI/API examples from repo docs, but phrase them as
        workflows rather than architecture notes.
- [ ] Website documentation completion gate:
  - [ ] The website includes a complete user path from first custom template to
        running sandbox and public route.
  - [x] The website explains build failures, registry/image pull failures,
        aliases, and route exposure in product language.
  - [x] The Templates UI links users to the relevant website docs from empty,
        failed, and setup-dependent states.
  - [ ] Each remaining user-visible dashboard, CLI, SDK, template build, route,
        or troubleshooting change is reflected in the website docs in the same
        checkpoint.

### Documentation Acceptance Criteria
- [ ] A new user can create and run a custom template using only the website docs.
- [x] A contributor can understand the build pipeline and data model using only
      the README plus dedicated markdown docs.
- [x] The Open Agents example can be built and smoke-tested using only its
      example README plus the top-level template docs.
- [ ] Every documented CLI/API example is verified against the deployed k0s
      environment before the plan is completed.
- [ ] The README and website docs describe the same command names, flags,
      status names, and route behavior.
- [ ] The docs clearly separate local development details from production
      platform guidance.

## Phases

### Phase 1: Current-State Hardening
**Status**: In Progress
- [x] Change API sandbox creation to resolve templates from PostgreSQL instead
      of the static shared `TEMPLATES` array.
- [x] Keep the shared static `TEMPLATES` array only as bootstrap/fallback
      metadata, not as the source of truth for runtime creation.
- [x] Add API tests proving a DB template image and entrypoint are what
      OpenSandbox receives.
- [x] Add a migration that records template CPU, memory, workdir, default ports,
      and runtime family, keeping existing rows compatible.
- [x] Update SDK/CLI types to expose the expanded template fields.
- [x] Verify `python-3.12`, `python-3.12-data`, `node-20`, and existing sandbox
      flows still work.

### Phase 2: Template Version Data Model
**Status**: Complete
- [x] Add `template_versions` with immutable version ID, template ID, image URI,
      image digest, build ID, status, aliases, default entrypoint, resources,
      ports, workdir, env schema, metadata, created/promoted timestamps.
- [x] Add `template_builds` with build ID, organization ID, template ID, status,
      source type, context hash, dockerfile path, build args metadata, log
      storage pointer, image destination, started/completed timestamps, error.
- [x] Add `template_build_logs` or object-storage-backed log references.
- [x] Add `template_registry_credentials` or org-level registry credentials with
      encrypted secret material and least-privilege pull/push scope.
- [x] Store `template_version_id` and `template_image_digest` on `sandboxes`.
- [x] Add indexes for org/template/build status queries used by List and Builds UI.

### Phase 3: Template Build API
**Status**: In Progress
- [x] Add `GET /v1/templates` with DB-backed list filters and pagination.
- [x] Add `POST /v1/templates` to create a template definition.
- [x] Add `GET /v1/templates/:id` and `GET /v1/templates/:id/versions`.
- [x] Add `POST /v1/templates/:id/builds` to enqueue a build from Dockerfile,
      local-uploaded context, Git reference, or existing image reference.
- [x] Add `POST /v1/template-builds/:id/context` for tar+gzip Dockerfile
      context upload with size and sha256 verification.
- [x] Add `GET /v1/template-builds` and `GET /v1/template-builds/:id`.
- [x] Add `GET /v1/template-builds/:id/logs` with polling first and SSE later.
- [x] Add `POST /v1/template-builds/:id/cancel` and retry endpoint.
- [x] Add `POST /v1/templates/:id/promote` to move aliases such as `latest` and
      `stable` to a successful version.
- [x] Enforce sandbox route limits through the route API.
- [x] Enforce configurable template resource limits and per-organization
      queued/building build concurrency limits.
- [x] Complete cross-org template visibility authorization semantics for
      public/private/internal templates.

### Phase 4: k0s Build Infrastructure
**Status**: Complete
- [x] Choose and deploy a local registry for k0s development, with a clear
      production path for external registries.
- [x] Deploy Kaniko in k0s as the Kubernetes-native Dockerfile builder.
- [x] Add a k0s deployment manifest for an image-import builder worker for
      existing OCI image references.
- [x] Deploy and verify the image-import builder worker in the active k0s
      cluster.
- [x] Persist uploaded Dockerfile build contexts in PostgreSQL with verified
      `sha256:` digests for the Kubernetes builder.
- [x] Configure Kaniko cache storage in the local registry so repeated template
      builds can reuse layers.
- [x] Configure registry push/pull credentials and namespace isolation.
- [x] Add image digest resolution for existing OCI image imports, and persist
      the digest before the imported version is marked ready.
- [x] Add image digest capture after Kaniko push, and persist the digest
      before a Dockerfile/Git version can be marked ready.
- [x] Add cleanup policy for unreferenced build cache and abandoned images.
- [x] Add smoke scripts for build infrastructure health.
- [x] Add local image-import worker smoke evidence for digest resolution and
      ready version creation.
- [x] Add k0s Dockerfile builder smoke evidence for Kaniko push, digest-pinned
      version creation, OpenSandbox image pull, command execution, and cleanup.

### Phase 5: OpenSandbox Runtime Integration
**Status**: In Progress
- [x] Resolve sandbox create input from template alias/name/version to an
      immutable `template_version`.
- [x] Pass `image.uri` as a digest-pinned OCI reference to OpenSandbox when the
      selected template version has a digest-pinned image URI.
- [x] Pass default entrypoint, CPU/memory, and metadata to OpenSandbox.
- [x] Pass env, workdir, and registry auth when supported by OpenSandbox.
- [x] Document runtime env, workdir support/limitations, and registry auth in
      repo docs (`docs/api.md`, `docs/template-runtime-contract.md`,
      `docs/runbook.md`, `docs/template-security.md`) and website product docs
      before marking the runtime integration task complete.
- [x] Ensure metadata includes Harakiri sandbox ID, template ID, template version
      ID, image digest, organization ID, and route policy.
- [x] Add preflight validation that the image can be pulled by OpenSandbox before
      marking a version ready.
- [ ] Add optional image pre-pull/warm pool support for hot templates.
- [x] Keep OpenSandbox snapshots as a later acceleration/checkpointing feature,
      not as the initial template build foundation.

### Phase 6: CLI Developer Experience
**Status**: In Progress
- [x] Add `harakiri template init` that writes `harakiri.toml` with fields similar
      to E2B's `e2b.toml`: name, CPU, memory, Dockerfile, ports, workdir,
      start/ready commands, env schema, visibility.
- [x] Add `harakiri template build --name <name> [path]`.
- [x] Add `harakiri template build --source image --image <ref>` for existing
      OCI image imports.
- [x] Package and upload Dockerfile build contexts from the CLI for
      `sourceType=dockerfile` builds.
- [x] Stream build logs in the CLI and print build ID, template version ID, image
      digest, duration, and next create command on success.
- [x] Add `harakiri template list`, `harakiri template builds`, `harakiri template logs`,
      `harakiri template promote`, and `harakiri template inspect`.
- [x] Add `harakiri create --template open-agents-dev` resolution by name/alias.
- [x] Add CLI tests for config parsing, build command payloads, logs formatting,
      and failure output.

### Phase 7: Dashboard Templates UI
**Status**: In Progress
- [x] Refactor the existing Templates view into a tabbed List/Builds workspace.
- [x] Implement the initial List tab table with search, visibility filters, and
      Use/Build/Copy actions.
- [x] Add remaining List filters: owner/team, runtime family, and status.
- [x] Add created timestamp, latest build status, latest version/digest, and
      explicit alias metadata to the Templates List table.
- [x] Add remaining List actions: View builds, Promote, and Archive.
- [x] Implement the Builds tab table and status filter counts.
- [x] Add result template version and build context summary metadata to the
      Builds table/detail flow.
- [x] Add Kubernetes builder pod and node metadata to Dockerfile build detail.
- [x] Add build detail panel with log viewer and retry/cancel actions.
- [x] Wire use-template action to sandbox creation.
- [x] Add New Template flow.
- [x] Add design-token-consistent badges, table density, iconography, and empty
      states based on Harakiri's current theme.
- [x] Add Playwright screenshot coverage for Templates List, Builds, build
      detail, new template, and mobile/narrow layouts.

### Phase 8: Open Agents Template Pilot
**Status**: Complete
- [x] Copy or vendor the OpenSandbox-native `open-agents-dev` Dockerfile into a
      Harakiri examples/templates area.
- [x] Build it through the new Harakiri template build path.
- [x] Publish it as an internal template with 2 CPU, 2048 MB memory, workdir
      `/workspace`, and default ports `3000`, `5173`, `4321`, `8000`.
- [x] Create a sandbox from `open-agents-dev` and verify `bun`, `jq`,
      `agent-browser`, Chromium, `code-server`, git, pnpm/yarn/npm, Python, and
      workspace write access.
- [x] Expose a dev server route and verify public access through the existing
      OpenSandbox gateway/Cloudflare path.
- [x] Record evidence in `docs/test-report.md`.

### Phase 9: Security, Governance, And Operations
**Status**: In Progress
- [x] Add maximum Dockerfile context upload size limits.
- [x] Redact build args, env vars, registry credentials, and secrets in logs.
- [x] Add deny/allow policy for template images, image-import targets, and
      Dockerfile base images.
- [x] Add vulnerability scanning hook and persist scan status on versions.
- [x] Add SBOM/provenance fields even if scanner/signing integration is deferred.
- [x] Add audit events for template create, build, cancel, promote, archive, and
      sandbox creation from a template version.
- [x] Add retention policies for old builds, logs, and image versions.
- [x] Add admin/operator docs for registry credentials, builder cleanup, and
      troubleshooting.

### Phase 10: Documentation
**Status**: In Progress
- [x] Update repository `README.md` with the custom template quickstart and
      links to the deeper template docs.
- [x] Add dedicated repo markdown docs from the Code Documentation backlog.
- [x] Add or verify example-level README documentation for
      `examples/templates/open-agents-dev`.
- [x] Update `docs/api.md`, `docs/architecture.md`, `docs/runbook.md`, and
      `docs/test-report.md`.
- [x] Add product-facing website docs pages from the Product Documentation
      backlog: Templates, Builds, SDK usage, Open Agents template, and Security
      model.
- [x] Add CLI help examples and ensure docs examples match implemented command
      names and JSON payloads.
- [ ] Keep `README.md` and dedicated `docs/*.md` as the canonical engineering
      and operator documentation for contributors.
- [ ] Keep the website docs as the canonical product documentation for users,
      with no dependency on reading repository internals.
- [ ] For every remaining template feature checkpoint, update both documentation
      tracks in the same commit: code docs in `README.md` or dedicated
      `docs/*.md`, and user-facing product docs in the website docs surface.
- [ ] For every remaining template feature checkpoint, explicitly list the
      repo-facing documentation files changed and the website documentation
      pages/sections changed before checking off the related implementation task.
- [ ] Each checkpoint summary names the exact repo docs and website docs changed,
      or states why a code-doc/product-doc surface was not affected.
- [x] Add screenshots or short visual references for Templates List, Builds, and
      build detail where useful.
- [x] Revisit `apps/web/src/main.tsx` website docs after the Dockerfile builder
      lands and remove wording that says Dockerfile builds are pending.
- [x] Add product docs links from the Templates UI where they help users recover
      from empty states, failed builds, and route setup issues.
- [x] Add a documentation verification note to `docs/test-report.md` after
      running the Dockerfile builder CLI/API examples against k0s.
- [x] Run link/path checks for repo docs and website docs.
- [x] Verify the audit/archive documentation slice in both repo docs
      (`README.md` and dedicated `docs/*.md`) and the deployed website docs.

### Phase 11: Verification And Release
**Status**: In Progress
- [ ] Unit tests for schema helpers, template resolution, build state transitions,
      and CLI config parsing.
- [x] Unit tests for template resource and build concurrency policy helpers.
- [x] API integration tests for template create/build/list/logs/promote and
      sandbox creation from an immutable template version.
- [x] k0s smoke test for template visibility authorization: own templates,
      shared platform templates, hidden platform-private templates, hidden
      foreign-org templates, and read-only shared platform mutation behavior.
- [x] k0s smoke test that builds `open-agents-dev`, creates a sandbox, runs
      runtime checks, exposes a route, and deletes the sandbox.
- [x] UI Playwright tests for Templates List/Builds and build detail flows.
- [x] k0s dashboard smoke for New Template Dockerfile upload, existing OCI
      image import, clone/fork, `harakiri.toml` preview, Dockerfile build,
      sandbox create/run from the generated template, and website docs coverage.
- [x] Regression tests for existing sandbox create/run/kill/routes/TTL flows.
- [ ] Verify documentation examples against the deployed k0s environment.
- [ ] Commit and push once deployed and verified in k0s.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-23 | Copy E2B's developer workflow, not the E2B base image dependency | Harakiri runs on OpenSandbox and should produce normal OCI images that OpenSandbox can pull and run. | Use `e2bdev/code-interpreter` directly for all custom templates |
| 2026-05-23 | Make immutable template versions the runtime contract | Sandboxes must be reproducible and auditable; mutable tags are unsafe as the long-term source of truth. | Store only template name and mutable image tag on sandbox records |
| 2026-05-23 | Build OCI images first, defer snapshots | OpenSandbox image-based creation is already working; Kubernetes snapshot semantics need more validation and should become acceleration/checkpointing later. | Implement E2B-style snapshots as the first template primitive |
| 2026-05-23 | Include E2B-like List and Builds UI in the first-class backlog | The user explicitly wants the E2B Templates UI experience, and custom templates are not complete without build visibility. | Ship CLI/API only and add UI later |
| 2026-05-24 | Treat documentation as a first-class phase split between repo engineering docs and website product docs | Users need product docs to use templates, while contributors need README and dedicated markdown to operate the build pipeline. | Keep documentation as loose backlog notes only |
| 2026-05-24 | Require dual-track docs in every remaining checkpoint | Documentation should move with the feature slice that changes behavior so README/dedicated Markdown and website docs stay consistent. | Batch all documentation at the end of the plan |
| 2026-05-24 | Run the Open Agents pilot image as root in the current k0s runtime | OpenSandbox presents `/workspace` as root-owned, and the E2B-like runtime contract requires a writable workspace. | Keep `USER 1001` and fail workspace writes until runtime volume ownership is configurable |
| 2026-05-24 | Make the dashboard Dockerfile path a single-file browser upload for the prototype | Browser-created tar+gzip contexts prove the dashboard flow without implementing directory upload complexity; the CLI remains the full multi-file context path. | Add drag-and-drop directory upload before validating the end-to-end product flow |
| 2026-05-24 | Implement vulnerability scanning as an external webhook hook | Keeps Harakiri scanner-agnostic while persisting scan status/summary on immutable template versions and allowing operators to choose Trivy, Grype, or a custom service later. | Bundle a scanner binary into the builder image; keep only `not_scanned` placeholders |
| 2026-05-24 | Implement retention as scheduler-owned database cleanup plus builder Job pruning | PostgreSQL is the control-plane source of truth; old logs, contexts, unversioned terminal builds, and unused superseded versions can be cleaned safely without deleting auditable version rows or registry blobs. | Delete registry blobs directly from the scheduler; keep all build artifacts indefinitely |
| 2026-05-24 | Gate ready template versions on runtime pull preflight | Resolving a digest is not enough; the k0s runtime path must prove it can pull the final image before users receive a ready version. | Wait for the first real sandbox create to reveal pull failures; run registry-only manifest checks |
| 2026-05-24 | Store registry credentials as encrypted control-plane records plus Kubernetes Secret references | Harakiri needs auditable API-managed credential metadata without returning raw secrets, while Kaniko and runtime pull preflight need least-privilege Kubernetes Secret names for actual image operations. | Store only Kubernetes Secret names; store raw registry tokens in PostgreSQL; use one shared global image pull secret |
| 2026-05-24 | Publish generated template images under organization-scoped registry namespaces | Teams should not share a flat repository path, and build/cache cleanup plus audit trails need a stable namespace derived from organization ID. | Keep `harakiri/templates/<template>` flat paths; use user-provided repository paths only |
| 2026-05-24 | Pass sandbox env and encrypted registry image auth through OpenSandbox; keep workdir as image contract metadata | OpenSandbox create supports env and `image.auth`, but does not expose a stable create-time workdir field. Harakiri can still record the template workdir and require Dockerfile `WORKDIR`/smoke checks. | Build a custom runtime wrapper to `cd` before entrypoint; invent a Harakiri-only workdir field ignored by OpenSandbox |

## Tech Debt Incurred
Risks and debt to watch during implementation:

- Keeping static shared template constants during migration may temporarily
  duplicate source-of-truth behavior.
- A local k0s registry is enough for development but production will need a
  registry architecture decision with auth, scanner integration, and blob
  garbage collection after retained version references are retired.
- Polling build logs is simpler for v1; SSE/WebSocket log streaming should
  follow once the build state model is stable.
- The `open-agents-dev` pilot image currently runs as root because OpenSandbox
  presents `/workspace` as root-owned in k0s. The cleaner fix is passing
  workdir volume ownership or user/group configuration through the
  Harakiri/OpenSandbox runtime adapter.

## Completion Notes
Fill in when complete: what was delivered, what was deferred, deployment/test
evidence, and any follow-up debt.
