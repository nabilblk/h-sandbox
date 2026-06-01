# NPM Packages

Harakiri publishes two public npm packages:

- `@h-sandbox/sdk` for application integrations.
- `@h-sandbox/cli` for local and CI command-line workflows.

`@harakiri/shared` is an internal monorepo package. It is not published and is
not part of the public compatibility contract. Public examples, adapters, and
third-party applications should import only from `@h-sandbox/sdk`.

## Install

```bash
pnpm add @h-sandbox/sdk
npm install -g @h-sandbox/cli
```

Configure both with an API key issued by Harakiri:

```bash
export HARAKIRI_API_URL=https://sb-api.harakiri.io
export HARAKIRI_API_KEY=hk_live_...

harakiri login --api-url "$HARAKIRI_API_URL" --api-key "$HARAKIRI_API_KEY"
```

## Local Package Verification

Before publishing, run the package smoke check from the repository root:

```bash
pnpm publish:local-check
```

The smoke check builds SDK and CLI tarballs, verifies that neither package
references `@harakiri/shared`, installs the SDK in a clean TypeScript project,
installs the CLI with a clean npm prefix, and runs `harakiri --version` and
`harakiri --help`.

For publish dry-runs:

```bash
pnpm publish:dry-run
```

## Release Checklist

1. Confirm npm identity and org ownership:

   ```bash
   npm whoami
   npm org ls h-sandbox
   ```

2. Confirm package names are available or at the expected current version:

   ```bash
   npm view @h-sandbox/sdk version
   npm view @h-sandbox/cli version
   ```

3. Run local quality gates:

   ```bash
   pnpm openapi:check
   pnpm examples:check
   pnpm --filter @h-sandbox/sdk test
   pnpm --filter @h-sandbox/sdk typecheck
   pnpm --filter @h-sandbox/cli test
   pnpm --filter @h-sandbox/cli typecheck
   pnpm publish:local-check
   pnpm publish:dry-run
   ```

4. Publish in order with pnpm from each package directory. This matters in the
   monorepo because pnpm rewrites internal `workspace:*` dependencies to the
   published package version in the packed manifest.

   ```bash
   cd packages/sdk
   pnpm publish --access public

   cd ../cli
   pnpm publish --access public
   ```

   Both packages declare `publishConfig.access=public`, so no extra access flag
   is required. Passing `--access public` is still safe.

   If npm 2FA is enabled for publishing, pass the current one-time code:

   ```bash
   pnpm publish --access public --otp 123456
   ```

   For non-interactive publishing, configure npm with a granular access token
   that has package publish permission for the `h-sandbox` organization and is
   allowed to bypass 2FA for publish operations. A token that only proves
   identity will pass `npm whoami` but still fail publish with:

   ```text
   E403: Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
   ```

5. Verify from npm in clean projects:

   ```bash
   pnpm publish:postcheck
   ```

   This installs the published SDK and CLI from the npm registry into clean
   temporary locations, compiles the TypeScript quickstart, verifies the CLI
   binary, and confirms neither install pulls `@harakiri/shared`.

6. Tag the release and update release notes.

## Troubleshooting

- `ENEEDAUTH`: run `npm login`.
- `E403` on publish: confirm the npm user is an owner of the `h-sandbox` org.
- `E403` mentioning 2FA or bypass 2FA: use `--otp` with a current npm 2FA code,
  or replace the configured token with a granular publish token that can bypass
  2FA for the `h-sandbox` org.
- Package install tries to fetch `@harakiri/shared`: the package boundary is
  broken; run `pnpm publish:local-check` and inspect packed manifests.
- `harakiri` binary missing after install: verify `packages/cli/package.json`
  still has `bin.harakiri = dist/index.js` and that `node scripts/chmod.mjs`
  ran during the CLI build.
- `pnpm publish:postcheck` cannot find a version: npm registry propagation may
  need a short delay, or the publish failed before that package reached npm.
- Public API calls fail after install: run `harakiri config` and confirm
  `HARAKIRI_API_URL` or saved config points to `https://sb-api.harakiri.io`.
