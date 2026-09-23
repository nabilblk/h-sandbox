# Harakiri SDK Examples

Choose the SDK version before choosing a recipe. The current published preview
is `0.5.0-rc.10`; unversioned npm installation selects stable `0.4.0`, which lacks
workspaces, execution readiness and capacity APIs. Examples on `main` can also
use **unreleased** TypeScript additions. They are not all rc.10 examples.

Use your installation's API and a server-side scoped key, never browser credentials:

```bash
export HARAKIRI_API_URL=https://sandbox-api.example.com
export HARAKIRI_API_KEY=hk_your_scoped_key
```

## Published SDK

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.10
```

Start with the complete, published-package-tested programs in the public docs:

- [First task](https://sb.harakiri.io/#docs/quickstart): retain the accepted ID, wait for execution readiness, verify a result and confirm cleanup.
- [Worker](https://sb.harakiri.io/#docs/hands-on-tutorials?section=integrate-harakiri-into-a-worker): idempotent creation, task verification and explicit cleanup failures. Source: `sdk-worker-tutorial/index.mjs`.
- [Files and artifacts](https://sb.harakiri.io/#docs/filesystem-artifacts): compute a real SHA-256 and verify downloaded bytes.
- [Persistent workspace](https://sb.harakiri.io/#docs/persistent-workspaces): reuse a checkpoint across two sandboxes, reconnect output without resubmitting work, then archive retained storage.
- [OpenCode](https://sb.harakiri.io/#docs/opencode-template): independent headless and authenticated server programs, with explicit model and credential setup.

These programs print success only after checking their result and observing
sandbox termination **and capacity release**. Failed cleanup reports the ID to
inspect. A crashed process still needs TTL, reconciliation and operator recovery;
`finally` cannot guarantee deletion during an outage.

The server program also pins `@opencode-ai/sdk@1.15.13`. Its rc.10 example is
deliberately GET-only because the legacy route adapter does not preserve every
Fetch `Request` field. The unreleased adapter below addresses that limitation.
Headless inference requires a model available in your OpenCode installation:
set `OPENCODE_MODEL`; optional `ANTHROPIC_API_KEY` is explicitly forwarded. Free
model availability is not guaranteed. Never log model credentials or raw agent output.

For an immutable snapshot of the older repository examples, use the
[v0.5.0-rc.10 tag](https://github.com/nabilblk/h-sandbox/tree/v0.5.0-rc.10/examples),
not moving `main`. The corrected tutorials above supersede old cleanup patterns.
Recorded agent demos use their documented historical `0.4.0` setup; their videos
and evidence are not demonstrations of the new SDK.

## Unreleased TypeScript Recipes

The following recipes on `main` require the built candidate, **not npm rc.10**:

| Recipe | Task |
| --- | --- |
| `sdk-typescript-quickstart` | Environment configuration, checked command results and confirmed cleanup |
| `sdk-files` | Text and verified byte helpers |
| `sdk-sandbox-object` | Reconnect to and operate on a sandbox handle |
| `sdk-dev-server` | Tracked process, HTTP readiness and scoped route fetch |
| `sdk-opencode-headless` | Checked agent execution with optional provider credentials |
| `sdk-persistent-workspace` | Workspace handles and resumable output observation |

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/sdk build
mkdir -p /tmp/harakiri-sdk-candidate
pnpm --filter @h-sandbox/sdk pack --pack-destination /tmp/harakiri-sdk-candidate
```

Install the resulting tarball in your consuming project. Its filename/version
may still say rc.10; **the local archive, not that version string, identifies the
candidate**. Do not replace it with an npm install of the same version.

```bash
npm install /tmp/harakiri-sdk-candidate/h-sandbox-sdk-0.5.0-rc.10.tgz
```

See the [migration and failure-recovery guide](../docs/sdk-developer-experience.md)
for response compatibility, typed creation errors, cancellation, redirects and
Git bootstrap replay limits. No mutation is automatically retried.

## Framework Integration Candidate

The optional [Deep Agents TypeScript backend](../packages/deepagents/README.md)
adds sandbox tools to the existing LangChain/LangGraph ecosystem. It is an
**unreleased source candidate**, requiring the SDK and adapter tarballs from the
same checkout. It is not bundled into the SDK or available through npm yet.

Start with [run-repair.ts](../packages/deepagents/examples/run-repair.ts): one
file imports the real Deep Agents SDK, attaches Harakiri, lets your chosen model
repair a tiny Git repository, verifies the original tests and retrieves a diff
before confirmed cleanup. Agent reasoning stays in your application; only its
sandbox-backed tools run remotely. Custom tools are not automatically sandboxed.

Examples live in `packages/deepagents/examples` so optional framework dependencies
stay separate. The secondary `run-checkpoint.ts` example demonstrates model-free
approval and command reconnection, not agent reasoning. See the
[architecture and operational boundaries](../docs/integrations/deepagents.md).

## Other Reference Examples

The repository also includes `sdk-basic-command`, `sdk-preview-route`,
`sdk-restricted-egress`, `sdk-template-build`, `sdk-git-workflow`,
`sdk-credential-vault`, `sdk-private-api-vault`, `sdk-opencode-server` and
`sdk-execution-capacity`. These demonstrate individual integration contracts;
check their prerequisites and use the complete tutorials for cleanup ownership.
Do not treat a successful `killSandbox` response as confirmation of runtime absence.

Template sources live under `examples/templates`: `base-linux`,
`python-3.12-data`, `node-20-app`, `browser-chromium`, `open-agents-dev`, and
`opencode`.

## Documentation Regression Checks

`pnpm --filter @harakiri/web docs:test-sdk` installs the pinned public packages
in a temporary consumer and executes the exact displayed programs against a
loopback HTTP fixture. It tests API contracts and failure handling, not a live
runtime or model. CI runs the check on Node 20 and 22; installed candidate
package tests remain a separate gate.
