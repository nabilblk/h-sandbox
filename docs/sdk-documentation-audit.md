# Public Documentation: TypeScript SDK Consistency Audit

**Audit date:** 2026-09-13. **Correction date:** 2026-09-14.
The seven findings below are the original observations, preserved for traceability.
All seven are corrected and deployed through the subsequently approved web-only
[delivery](release-notes/2026-09-14-sdk-documentation-delivery.md). No new npm package
was published. Historical demo recordings and release notes were not relabelled.

## Correction Results

| Finding | Implemented correction |
| --- | --- |
| 1. Version drift | Current SDK/CLI instructions pin published rc.10; workspace references agree. Stable and unreleased candidate paths are explicit. |
| 2. Recipe mismatch | The examples index identifies all six source-candidate recipes, gives tarball installation steps and links published consumers to tested programs and the immutable release tag. |
| 3. Cleanup | Complete task, worker and workspace programs retain accepted IDs before readiness. They confirm termination and capacity release, preserve primary/cleanup errors, and never print PASS for unconfirmed cleanup. |
| 4. Artifacts | The displayed program computes a real SHA-256, validates transfer metadata and checks the downloaded bytes. The repository SDK reference no longer sends a placeholder digest. |
| 5. OpenCode | Independent headless/server programs preserve optional Anthropic credentials and share one server password with both auth layers. The legacy GET-only adapter limitation is explicit. The CLI health probe sends both credentials and fails fast. |
| 6. Migration | Domain and repository references explain creation error/cause handling, raw response compatibility, observer cancellation, credential-scoped redirects and candidate handles. |
| 7. Regression checks | Exact displayed programs run with pinned registry packages, not workspace links; CI covers Node 20 and 22. Browser tests verify all pages and exported code, including hidden tabs. |

Verification performed locally:

- **18 installed-package scenarios passed on each of Node 20.20.2 and 22.23.2**;
  the same suite also passed on the host's Node 26.0.0. Tests install npm
  `@h-sandbox/sdk@0.5.0-rc.10` and `@opencode-ai/sdk@1.15.13` in temporary
  consumers with synthetic keys and loopback HTTP fixtures.
- Failure cases include post-acceptance readiness failure, nonzero task exit,
  refused/hung cleanup, retained task plus cleanup errors, corrupt checksum,
  workspace release failure without duplicate deletion, missing model setup,
  optional provider credentials, shell quoting and rejected redirects.
- **103 web tests passed**, including identical worker source in the page,
  Markdown guide and repository recipe; current-version and section-link guards;
  and the displayed CLI probe's authentication and failure cleanup.
- **9 Playwright tests passed**, covering **all 43 pages at 1440, 390 and
  320 pixels**, copy controls, language tabs, search, section links and browser
  code parity with every page's Markdown export. No page overflow or page errors.
- Web typecheck and production build passed. All 47 served documentation exports
  (43 pages plus the Markdown/JSON inventories and LLM exports) exactly matched
  the source renderer after regeneration.
  Scoped repository-link checks passed. The tracked-source secret scanner found
  no secrets; it does not cover untracked/private research or remote artifacts.

Implementation: [shared displayed examples](../apps/web/src/sdk-doc-examples.ts),
[installed-package scenarios](../scripts/test-doc-sdk-examples.ts),
[content/version guards](../apps/web/src/sdk-doc-examples.test.ts), and
[browser checks](../tests/e2e/docs-experience.spec.ts).
Run `pnpm --filter @harakiri/web docs:test-sdk` for the package/protocol suite.

The correction checks above are documentation and consumer-contract checks, not
new live storage, sandbox or model acceptance runs. The subsequent authorized
delivery passed hosted native acceptance, published only a web image and verified
the public documentation on k0s; its evidence and scope are in the delivery receipt.
Authentication settings, npm tags and Brain content were unchanged. The SDK
candidate remains unreleased even though its source metadata also says rc.10.

## Original Audit Scope

Reviewed all 43 pages in the [public documentation inventory](https://sb.harakiri.io/docs/index.json), their browser-rendered content and Markdown exports, and the relevant public repository guides and examples. Compared them with npm packages installed in isolation and source at `3d5525e965bf7ed6a66edac583a7c18cf270b241`.

## Findings

### 1. P2: Installation paths select incompatible documentation baselines

The [quickstart](https://sb.harakiri.io/#docs/quickstart) pins `0.5.0-rc.10`, but [SDK and CLI](https://sb.harakiri.io/#docs/sdk-cli), Hands-on tutorials and CLI reference still use unversioned installs. The [workspace reference](https://sb.harakiri.io/#docs/workspace-reference) explicitly installs `0.5.0-rc.3`; a shared notice repeats that baseline across all four workspace pages. These are current navigation destinations, not clearly separated historical documentation.

Live npm `latest` resolves to `0.4.0`; `next` resolves to `0.5.0-rc.10`. Installed-package probes confirmed that stable lacks `workspaces`, `commands.stream`, `capacity()` and `usageHistory()`. Both stable and rc.3 perform lifecycle-only sandbox waits; rc.10 queries execution readiness. Following installation links can therefore remove required methods or reintroduce the cold-start race that later guides say is resolved. For example, Usage observations sends readers to SDK and CLI for connection setup, which installs a package without `usageHistory()`.

**Correction:** one explicit current published baseline across installation guidance, with a distinct unreleased candidate path. Preserve rc.3 as historical provenance or a minimum feature-introduction version, not the default installation instruction. Do not claim that rc.10 includes the unpublished SDK conveniences.

Sources: [SDK installation](../apps/web/src/docs-content.tsx), line 309; [workspace installation](../apps/web/src/workspace-reference-docs.tsx), line 35; [quickstart version](../apps/web/src/getting-started-docs.tsx), line 88.

### 2. P2: The examples index installs a package that cannot run the updated recipes

The public [examples README](https://github.com/nabilblk/h-sandbox/blob/main/examples/README.md) still tells consumers to install `@h-sandbox/sdk` from npm, then presents updated and older examples together. Several recipes now require `HarakiriClient.fromEnv()` and the new file/process helpers. Only the dedicated candidate guide explains their tarball prerequisite; a reader arriving directly through GitHub misses it.

Executing the current `sdk-files` recipe entry with the actual published stable and rc.10 SDKs fails immediately with `HarakiriClient.fromEnv is not a function`. Neither package includes this method. This is a distribution/documentation mismatch, not a failure of the candidate implementation.

**Correction:** identify which recipes require the candidate, give the matching archive installation steps at the examples entry point, and link released consumers to examples from the matching release tag. After publication, update these together to the real new version.

Sources: [examples installation](../examples/README.md), line 16; [updated binary recipe](../examples/sdk-files/index.mjs); [candidate availability](../apps/web/src/typescript-sdk-docs.tsx).

### 3. P2: Cleanup guarantees exceed what the tutorial code does

The [quickstart](https://sb.harakiri.io/#docs/quickstart) promises cleanup on failure, but performs `sandboxes.create({ wait: true })` before entering `try/finally`. A failure after the API accepts creation bypasses cleanup. Replaying that exact displayed code against a synthetic acceptance followed by a readiness failure produced one POST, one readiness GET and no DELETE, with both rc.10 and the candidate.

The [worker tutorial](https://sb.harakiri.io/#docs/hands-on-tutorials) says the sandbox is terminated even when validation throws, yet suppresses every deletion failure with `.catch(() => undefined)`. A reproduction printed its PASS message and returned successfully despite failed deletion. Ordinary `kill()` also acknowledges a request; it does not confirm termination or capacity release. The workspace tutorial records IDs only after synchronous creation returns, exposing the same accepted-creation failure gap.

**Correction:** retain the accepted ID first, perform readiness and work inside cleanup protection, and distinguish task success from confirmed cleanup. Use released read-only confirmation APIs for rc.10 examples; use `kill({ wait: true })` and `waitForTermination()` only in the candidate path. Preserve/report cleanup failures and resource IDs instead of silently declaring release.

Sources: [quickstart creation](../apps/web/src/getting-started-docs.tsx), line 32; [worker cleanup and claim](../apps/web/src/docs-content.tsx), line 276; [workspace scenario](../apps/web/src/workspace-tutorial-docs.tsx), line 31.

### 4. P2: The binary upload example is not valid input

The [Filesystem and artifacts](https://sb.harakiri.io/#docs/filesystem-artifacts) SDK snippet sends `sha256: "sha256:..."` for the bytes of `"ok"`. The actual API schema rejects this value: it requires an algorithm prefix and 64 hexadecimal characters. Extracting the displayed payload and validating it with `fileUploadSchema` failed on `sha256`. There is no checksum-generation instruction in the example.

**Correction:** make the released wire-level example executable by computing the digest from the actual bytes, and explain response verification. Add the candidate `files.write(path, bytes)` / `readBytes(path)` equivalent with an availability label; keep the raw artifact API documented as an advanced transfer contract. Its continued existence is not a bug.

Sources: [artifact snippet](../apps/web/src/docs-content.tsx), line 517; [API validation](../apps/api/src/routes/sandbox-runtime.schema.ts), line 83.

### 5. P2: The public OpenCode server example does not connect its authentication setup

The [OpenCode template](https://sb.harakiri.io/#docs/opencode-template) server SDK block generates a fresh password and uses it for HTTP basic authentication without showing how that same value reaches `OPENCODE_SERVER_PASSWORD` in the server process. It also omits the tracked server startup. Read sequentially, the preceding SDK block has already killed its sandbox. The CLI block starts a password-protected server but its health-wait command supplies no matching basic-auth credentials.

These fragments do not constitute a reproducible authenticated server flow. This is a source-confirmed setup gap; no live OpenCode/model execution was attempted during this audit. The complete repository server example already demonstrates passing one shared password and starting the process, so the public page should derive from a tested complete recipe rather than an unrelated fragment.

**Correction:** separate complete headless and server examples. In the server path, create a fresh sandbox, configure one password, start `opencode serve`, wait with both authentication layers, connect the OpenCode client, and clean up. Show optional provider credentials explicitly without implying host environment inheritance. Preserve model availability caveats.

Sources: [OpenCode SDK and CLI blocks](../apps/web/src/docs-content.tsx), lines 817 and 820; [complete server source](../examples/sdk-opencode-server/index.ts), line 17; [fixed headless source](../examples/sdk-opencode-headless/index.ts).

### 6. P2: Migration-sensitive behavior is documented only on the candidate overview

The candidate guide correctly explains checked execution, accepted-creation errors, scoped route requests and manual redirects. However, the standalone [Errors](https://sb.harakiri.io/#docs/errors-troubleshooting), [Routes](https://sb.harakiri.io/#docs/routes), [Lifecycle](https://sb.harakiri.io/#docs/sandbox-lifecycle) and Git guidance do not identify those candidate differences or direct readers to the relevant migration sections.

This matters even when a consumer preserves existing method names. A direct probe of the legacy `createRouteFetch` function found implicit redirect-follow behavior in published rc.10 and explicit `manual` in the candidate. The accepted-creation reproduction produced `HarakiriSandboxCreationError.sandboxId` in the candidate, not the old underlying error or an `id` field. Source-bootstrap Git failures are also wrapped after acceptance. Code catching only the older API/Git error classes needs to inspect the creation error and its cause.

The domain guides also keep teaching raw IDs, base64 and manual polling without a versioned bridge to the new process, file, route and workspace handles. Those old signatures remain supported; this is an incomplete migration narrative, not grounds to remove compatibility examples.

**Correction:** add concise version-scoped migration guidance in the affected references, with direct links to the candidate sections. Document error inheritance/cause, return shapes, cancellation, redirects and cleanup separately from syntax convenience. Promote the new patterns to defaults only with a matching published package.

Sources: [error reference](../apps/web/src/docs-content.tsx), line 869; [route reference](../apps/web/src/docs-content.tsx), line 545; [Git troubleshooting](../apps/web/src/docs-content.tsx), line 328; [creation wrapping](../packages/sdk/src/index.ts), line 1634; [route redirect policy](../packages/sdk/src/route-access.ts), line 62.

### 7. P3: Documentation checks do not enforce the installed example contract

All 18 focused content, presentation and export tests passed while the reproductions above failed their documented expectations. Existing checks verify syntax, expected phrases, code rendering and links. The workspace checks explicitly assert the stale rc.3 string; the SDK installation check accepts the unversioned install. The quickstart check verifies the presence of `finally`, not whether it protects post-acceptance failures.

**Correction:** retain structural/browser tests, but add a version-to-example matrix and execute designated complete snippets against the package they tell readers to install. Cover acceptance/readiness failure, checked command failure, cleanup failure, checksum validation and authenticated service setup. Reuse recipe source in public pages to reduce independent copies. Do not make every illustrative fragment pretend to be a standalone program.

Sources: [content tests](../apps/web/src/docs-content.test.ts), lines 65 and 124; [quickstart test](../apps/web/src/docs-experience.test.ts), line 112.

## Verified Version Matrix

| Surface | npm latest: 0.4.0 | Workspace guide: rc.3 | npm next: rc.10 | Current source candidate |
| --- | --- | --- | --- | --- |
| `fromEnv`, `readBytes`, process `connect` | Absent | Absent | Absent | Present |
| `workspaces`, `commands.stream` | Absent | Present | Present | Present |
| `capacity`, `usageHistory` | Absent | Absent | Present | Present |
| Default sandbox wait | Lifecycle GET | Lifecycle GET | Readiness GET | Readiness GET |
| Cached status after ordinary `kill()` acknowledgement | Set to terminated | Set to terminated | Preserved | Preserved |
| `sandbox.run({ command })` | `{ result }` | `{ result }` | `{ result }` | `{ result }` |
| `HarakiriSandboxCreationError` | Absent | Absent | Absent | Present |

This matrix describes observed installed packages, not inferred availability from the repository's package.json. The unpublished candidate still carries rc.10 metadata locally; that does not make it identical to the npm rc.10 artifact.

## What Is Already Correct

- The [TypeScript SDK guide](https://sb.harakiri.io/#docs/typescript-sdk) explicitly says the conveniences are unreleased and explains how to evaluate a source-built archive.
- Object-input `run`, raw file envelopes, process `.command`, route `.route` and workspace `.workspace` remain compatibility surfaces. Their appearance is not by itself a defect.
- Recorded agent tutorials identify their original SDK/CLI 0.4.0 and recording date. Keep that historical evidence intact; add a current companion recipe instead of relabeling old footage as a new-SDK run.
- All 43 page routes and individual Markdown files loaded; no missing internal documentation page target was found. All 173 captured code blocks, including hidden tabs, matched their exports. There were 41 JavaScript/TypeScript blocks.
- All 46 checked text exports (43 pages, Markdown index, llms.txt and llms-full.txt) matched the current source renderer exactly. The inconsistency is in authored content, not a stale deployment or broken export pipeline.
- The candidate page's syntax highlighting and availability notice rendered at desktop and mobile sizes. All pages had no document-level horizontal overflow at 1280px; the candidate page was also inspected at 390px. This was not a full mobile UX audit of every page.

## Page Coverage

Every ID below was visited in the browser and fetched as `/docs/<id>.md`. Findings apply to SDK consistency, not certification of every operator or agent workflow.

| Group | Pages visited | SDK consistency outcome |
| --- | --- | --- |
| Getting started | overview; developer-preview; ui-product-tour; quickstart; vision-architecture; sdk-cli; typescript-sdk | Published/candidate boundary is honest on the new guide; installation and cleanup findings remain. |
| Self-hosting | install-kubernetes; backup-recovery; operator-monitoring | Installation pins rc.10. No additional SDK-specific discrepancy identified in these pages. |
| Concepts | execution-capacity; usage-observations; workspaces; authorization; security-model | Capacity/history version requirements are explicit. Workspaces retains the stale rc.3 baseline; setup links can select stable instead of preview. |
| Sandboxes | create-sandbox; sandbox-lifecycle; sandbox-processes; filesystem-artifacts; routes; outbound-access; credential-vault | Raw APIs remain supported. Binary example, cleanup and migration-reference gaps need correction. |
| Templates | custom-templates; template-builds; sdk-usage; opencode-template; open-agents-template; template-troubleshooting | Template aliases are compatible. OpenCode server setup and Git/error migration guidance need alignment. |
| Tutorials | hands-on-tutorials; cli-live-preview; persistent-workspaces; usage-tutorial | Worker cleanup promise and workspace dependency/creation flow need correction. |
| Agent workflows | cli-agent-repair; ui-agent-app; sdk-agent-report; browser-agent-qa | Explicit historical 0.4.0 recordings; preserve their baseline. No paid/free model availability or new live run claimed. |
| Reference | api-reference; cli-reference; workspace-reference; errors-troubleshooting | CLI/workspace installation and error/migration coverage need alignment. |
| Administration | team-members; session-management; workspace-operations | No new SDK-specific issue in members/session docs. Storage operations shares the stale workspace release notice. |

Repository follow-through covered README, examples/README, packages/sdk/README, docs/sdk.md, docs/sdk-developer-experience.md, docs/routes.md, docs/workspace-reference.md and the directly relevant SDK examples/source/tests. It did not recursively audit every historical release note or unrelated repository document.

## Recommended Correction Order

1. Consolidate version guidance and clearly separate published and candidate recipes. Fix public and repository entry points together; no new npm release is needed to make current instructions honest.
2. Correct the executable quickstart, cleanup, artifact and OpenCode examples against their declared package version. Share their source with the documentation where practical.
3. Add the migration bridge across execution, processes, files, routes, workspaces, Git and errors. Keep the new helpers candidate-labelled until publication.
4. Add installed-package documentation regression tests, regenerate exports, and rerun the browser crawl. Preserve historical demo provenance and valid legacy examples.
5. When a new SDK release is approved and actually published, switch the current examples and default installation baseline together, then verify from a clean consumer directory.

## Evidence and Limits

Local crawl, screenshots, isolated npm installs, package probes and exact-snippet reproductions are retained under ignored `docs/artifacts/sdk-docs-audit-20260913/`. Key summaries are `summary.json`, `package-surface.json`, `reproductions.json` and `export-parity.json`. The durable conclusions are recorded above; ignored evidence is not part of a public package.

The current audit used Node v26 on the host. It did not rerun the separate Node 20/22 native acceptance suite. Commands contacted only public documentation and npm for read-only retrieval; snippet execution used synthetic clients or injected transports, never the live sandbox API. No LLM work, credentials, Kubernetes resources, tunnel settings, npm tags or deployments were changed. Brain and private research material were not consulted.
