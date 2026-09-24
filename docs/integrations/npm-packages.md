# NPM Packages

Harakiri publishes `@h-sandbox/sdk` and `@h-sandbox/cli`. The optional
[Deep Agents adapter](deepagents.md) has an independent version and release
target; it is not implicitly published by an SDK/CLI release. Check its guide
for current availability and the exact supported framework/SDK pair.

`@harakiri/shared` stays internal. Applications use public SDK and adapter
exports, not monorepo source paths. No framework dependencies enter the core SDK.

## Install

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.11
npm install -g @h-sandbox/cli@0.5.0-rc.11
```

Prereleases use `next`. Stable `latest` does not automatically follow them.
Configure `HARAKIRI_API_URL` and `HARAKIRI_API_KEY` for **your installation**.
Supply API keys through server secret configuration, never browser code or Git.

## Local Authentication

For a maintainer's interactive release or package-settings change:

```bash
npm login --registry=https://registry.npmjs.org/ --auth-type=web
npm whoami --registry=https://registry.npmjs.org/
npm org ls h-sandbox --json
```

Complete the browser/2FA prompt yourself. Do not paste credentials into chat,
command history, repository files or CI logs. `whoami` proves identity, not
publish permission or permission to change package security settings. Do not
print your npm configuration to diagnose an authentication failure.

Use npm 11.19.1 for the commands below, matching CI. A one-off invocation avoids
changing global tools: `npm exec --yes --package=npm@11.19.1 -- npm <command>`.
For interactive `npm trust`, npm requires account 2FA and package write access;
bypass-2FA granular tokens are not accepted for that endpoint. See
[npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
Enable account 2FA before refreshing the interactive login. A pre-existing token
does not acquire package-settings permissions when account security changes.

## Existing Packages: Publish Through CI

Use [the protected release workflow](../ci-release.md), not a stored npm token.
It runs on reviewed `main` with the `npm` environment and `id-token: write`.
Source ancestry, immutable version selection and prerelease channels are checked
before entering that environment. A tag push alone does not publish.

```bash
# SDK and CLI share the platform version. Supply a reviewed tag or full SHA.
gh workflow run npm-release.yml --ref main -f package_set=core \
  -f release_ref=v0.5.0-rc.N -f verify_only=true -f tag=next

# Only after trust, CI and release qualification pass:
gh workflow run npm-release.yml --ref main -f package_set=core \
  -f release_ref=v0.5.0-rc.N -f tag=next
```

Replace the illustrative `rc.N` with a real, previously unused reviewed version.
Trust verification only exchanges package-scoped credentials; it does not
publish or change tags. Actual publication must succeed before declaring delivery.

## New Adapter: One-Time Bootstrap

The npm package must exist before configuring its Trusted Publisher. Publish the
**qualified implementation**, never an empty placeholder to reserve the name.
Native tools, independent model-result verification and confirmed runtime cleanup
must have passing receipts first. Keep the manifest private until qualified.

From a clean checkout of merged, reviewed source:

```bash
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/deepagents typecheck
pnpm --filter @h-sandbox/deepagents test
node scripts/test-deepagents-package.mjs --release-candidate
node scripts/assert-publish-worktree.mjs
PACKAGE_DIR="$(mktemp -d)"
pnpm --filter @h-sandbox/deepagents pack --pack-destination "$PACKAGE_DIR"
npm publish "$PACKAGE_DIR"/h-sandbox-deepagents-*.tgz --access public --tag next
node scripts/test-deepagents-package.mjs --published
```

The manifest must have `private` removed and an exact, published SDK peer.
The candidate test installs that SDK from npm, not a workspace replacement.
`--published` installs both packages anonymously and runs the actual framework,
public declarations and displayed examples. These local contracts do not call
a model or runtime; native acceptance is separate.

Then configure only this new package's publisher:

```bash
npm trust github @h-sandbox/deepagents \
  --repo nabilblk/h-sandbox --file npm-release.yml --env npm --allow-publish
npm trust list @h-sandbox/deepagents
```

Use the equivalent npm package Settings form if interactive CLI authentication
is unavailable. The owner is **nabilblk** (GitHub), not **h-sandbox** (npm scope).
Allow direct `npm publish`; a stage-only permission does not authorize it. Do not
replace the SDK/CLI publishers or add a broad publishing token to GitHub.

## Subsequent Adapter Releases

Bump only the adapter version. Preserve the explicitly tested SDK/framework
peers unless a new compatibility run qualifies another pair. Use an immutable
`deepagents-v<version>` tag or the full merged commit SHA:

```bash
gh workflow run npm-release.yml --ref main -f package_set=deepagents \
  -f release_ref=deepagents-v0.1.0-rc.N -f verify_only=true -f tag=next
gh workflow run npm-release.yml --ref main -f package_set=deepagents \
  -f release_ref=deepagents-v0.1.0-rc.N -f tag=next
```

The workflow publishes only the adapter, generates public-source provenance and
checks anonymous registry consumers on Node 20 and 22. No chart, server image,
cluster rollout or SDK/CLI republishing is involved.

## Recover a Verification Failure

Do not retry a successful publish because a later read failed. Preserve the
original evidence and rerun read-only verification with the **same source**:

```bash
gh workflow run npm-release.yml --ref main -f package_set=deepagents \
  -f release_ref=deepagents-v0.1.0-rc.N -f verify_published_only=true -f tag=next
```

This job has no publishing environment or OIDC write permission. A new source
change needs a new version; never overwrite a tag or move `latest` to bypass an
authentication or qualification failure.

- `401` / `ENEEDAUTH` locally: refresh the interactive npm login.
- `403` for trust settings: verify account 2FA, package write access and the
  authentication method. A token can pass `whoami` and still lack this permission.
- CI OIDC failure: compare the package's GitHub owner, repository, workflow filename,
  environment and direct-publish permission. Local login cannot repair CI trust.
- Public package pulls `@harakiri/shared` or a `workspace:` dependency: stop the
  release and inspect the packed manifest.
- Public metadata is temporarily missing: use bounded read-only verification,
  never another publish attempt.
