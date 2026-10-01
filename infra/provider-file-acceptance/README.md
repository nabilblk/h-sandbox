# Provider File Transfer Acceptance

This entrypoint is only for a fresh GitHub-hosted native amd64 runner. It uses
the same runner, kubeconfig, namespace ownership and private-material cleanup
guards as `infra/acceptance/`. It refuses the Mac, ARM, self-hosted runners and
ambient cluster contexts. Do not run bootstrap or `run.mjs` against a lab.

The workflow first consumes the immutable standalone `0.5.0-rc.9` installation,
published SDK, and pinned OpenCode image. It reproduces the same 1 MiB upload
failure observed against `0.5.0-rc.10` in Python PR #66. Then it builds the source
API image on that runner, loads it into that runner's containerd, and upgrades
only the API-image consumers using the same published chart. PostgreSQL,
Keycloak, runtime and web remain the baseline. No image, chart or package is
pushed. No external deployment is changed.

The public API checks exact binary round trips at zero bytes, 1 KiB, 1 MiB and
16 MiB, independently calculates SHA-256 inside the runtime, checks rejection
above the configured limit, parent creation, modes, literal dollar paths, large UTF-8 writes, and
staging cleanup. Native binary downloads are bounded by the artifact limit,
including responses without a Content-Length header. Local tests additionally inject failed transfers and validate
atomic replacement against a temporary filesystem on Linux.

Only `standalone-acceptance-report.json` is uploaded. It contains source/image
identities, known error classifications, sizes, checksums and cleanup status,
not raw diagnostics, file contents, tokens, passwords, or kubeconfigs. The
workflow always deletes owned resources and removes private fixture material.

Hermetic checks, safe locally:

```sh
node --test infra/acceptance/safety.test.mjs infra/acceptance/browser-session.test.mjs infra/provider-file-acceptance/*.test.mjs
pnpm --filter @harakiri/api typecheck
pnpm --filter @harakiri/api exec node --test --import tsx src/opensandbox-files*.test.ts src/opensandbox.test.ts
```

Passing this workflow qualifies an **unpublished source candidate**, not a
released Python-compatible server. Release and Python requalification remain
separate decisions.
