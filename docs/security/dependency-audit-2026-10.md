# October 2026 Dependency Audit

Status on 2026-10-14: two published fixes applied; Nabil approved a scoped
exception for the remaining `braces` finding, expiring 2026-11-13 at 00:00 UTC.
The high-severity threshold for every other finding is unchanged.
This is an exposure assessment, not a claim that the dependency is fixed or
that all framework code runs inside a sandbox.

## Published Fixes

| Dependency | Previous | Corrected | Use |
| --- | --- | --- | --- |
| `source-map-js` | 1.2.1 | 1.2.2 | Web and demo build tooling through PostCSS |
| `sharp` | 0.35.4 | 0.35.5 | Demo image verification tooling |

The workspace override establishes the source-map security floor. The direct
`sharp` pin also updates its platform-specific binaries and bundled libvips.
No SDK, framework, API, chart or application version is changed by these fixes.

References: [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

## Remaining Finding

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects `braces` 3.0.3. Deeply nested patterns can exhaust recursive AST walkers.
An uncaught `RangeError` can terminate the calling Node.js process. The latest
published version remains 3.0.3; an audit recommendation of `>=3.0.4` does not
mean that version exists. The [maintainer disputes the advisory](https://github.com/micromatch/braces/issues/70),
but the local bounded reproducer confirms the stack exhaustion.

The affected lockfile paths are:

```text
packages__deepagents>deepagents>fast-glob>micromatch>braces
packages__deepagents>deepagents>micromatch>braces
```

These are development dependencies in this repository, but `deepagents` is a
runtime peer for published adapter consumers. The development label alone is
not a reason to dismiss the finding. Deep Agents 1.14.2 still includes this
dependency tree; a framework upgrade alone does not resolve it.

## Tested Boundary

The assessment targets the supported TypeScript peer, Deep Agents **1.14.0**.
It does not cover arbitrary future releases or custom application tools.

| Path | Behavior | Assessment |
| --- | --- | --- |
| `HarakiriSandboxBackend.glob` | Remote file discovery, followed by the inherited host-side glob-to-regex matcher | Does not call the affected `braces` parser |
| `HarakiriSandboxBackend.grep` | Remote literal search; adapter preserves incomplete-output metadata | Does not call the affected parser |
| Real Deep Agents glob/grep tools with the Harakiri backend | Same remote adapter paths, including deeply nested model-supplied patterns | Tested without entering any `braces` parsing method |
| `micromatch.isMatch` used for permission matching | Uses picomatch rather than brace expansion | Tested separately; not a blanket regex-complexity guarantee |
| Deep Agents `FilesystemBackend` / `LocalShellBackend` glob | Passes patterns to fast-glob with brace expansion | Affected parser is reachable; not covered by remote-backend evidence |
| Core TypeScript SDK, API and Python packages | Do not depend on this framework matcher | Not affected through the two paths above |

Do not add filesystem permission rules to an executable backend and assume
they constrain shell access. The pinned framework rejects that configuration.
The parser-boundary tests are not a claim that any in-process matcher is immune
to all denial-of-service inputs.

## Evidence

`packages/deepagents/test/matcher-security.test.ts`:

1. Reproduces `compile` and `expand` stack exhaustion in child processes with
   a 64 MiB old-space limit, 512 KiB stack, three-second timeout and bounded output.
2. Proves instrumentation detects fast-glob brace expansion using its task
   generator, without scanning the host filesystem or running a local agent.
3. Tests ordinary and nested patterns while making calls to the installed
   `braces` parsing methods throw. It also checks call counts so swallowed
   errors cannot produce a false pass.
4. Runs real framework tools with a scripted model and synthetic remote API.
   There is no live sandbox, model inference, credential or cluster access.

```bash
pnpm --filter @h-sandbox/deepagents build
pnpm --filter @h-sandbox/deepagents exec node --test --import tsx test/matcher-security.test.ts
pnpm audit --audit-level high --json
pnpm security:audit
```

All five exposure tests pass locally. After the published fixes, the raw audit
still exits nonzero with one high finding and reports nine moderate findings.
The reviewed gate prints that full report before evaluating the one exception;
it never labels the dependency fixed. [PR #69](https://github.com/nabilblk/h-sandbox/pull/69)
merged after [repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/38622474759),
all six Node 20/22/24 npm/pnpm framework consumers,
[demo checks](https://github.com/nabilblk/h-sandbox/actions/runs/38622474682) and
[native SDK acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/38622474214)
passed. Native acceptance used a disposable GitHub-hosted fixture, including a
real model repair and cleanup; no existing lab deployment was changed.

## Approved Temporary Exception

Owner and approver: **nabilblk**, explicitly approved on 2026-10-14. Expiry:
**2026-11-13T00:00:00Z**, no more than 30 days after approval. Removal condition:
adopt and qualify an upstream correction, or remove the dependency. Any renewal
requires a new exposure review and explicit maintainer approval, not an automatic
date extension.
Tracked removal: [issue #70](https://github.com/nabilblk/h-sandbox/issues/70).

`scripts/check-dependency-audit.mjs` implements the reviewed gate:

- Runs the real `pnpm audit --audit-level=high --json` and preserves its report.
- Accepts only this GHSA, `braces` 3.0.3, high severity, and exactly the two
  development-only dependency paths above. Missing, additional, duplicated or
  production paths fail; a critical reclassification is not accepted.
- Checks both declared Deep Agents pins and installed framework/matcher
  versions: Deep Agents 1.14.0, fast-glob 3.3.3, micromatch 4.0.8 and braces 3.0.3
  along both dependency branches.
- Rejects registry/process failures, malformed or incomplete reports, expiry,
  other high/critical findings and an obsolete exception after the finding
  disappears. Moderate findings retain the existing reporting threshold.
- Requires the actual remote-search exposure tests in the same required CI job;
  installed-consumer CI also executes them against public framework packages.

Seven policy tests exercise the acceptance case and failure boundaries. The
exception allows this repository's tested workflow to proceed; it does not
remove the vulnerable package, change consumer lockfiles, or qualify arbitrary
local-framework or custom-tool usage.

## Consumer Guidance

Use the Harakiri backend for untrusted agent shell and filesystem operations.
The application still hosts the model loop, matching, custom tools and
checkpoints: installing a sandbox backend does not isolate the entire process.
Run local-backend comparisons only in disposable environments. Do not route
untrusted glob patterns into a local-filesystem backend or custom brace-expansion
tool and assume Harakiri protects the host.

A repository-only pnpm patch or audit decision would not automatically protect
independent npm/pnpm consumers installing the framework peer. Any temporary
exception must state this limitation, have an owner and expiry, check exact
dependency versions and paths, and preserve failures for all other high/critical
findings. The approved exception above follows those limits.
