# TypeScript SDK Acceptance

This suite installs an **unpublished candidate tarball**, not SDK source imports,
against the pinned published API baseline in `../acceptance/versions.json`.
The [workflow](../../.github/workflows/sdk-acceptance.yml) runs on fresh
GitHub-hosted Ubuntu amd64 runners. It never publishes packages or deploys to the lab.

Do not run `run.mjs`, the shared bootstrap, or shared cleanup on a workstation.
They reject macOS, non-amd64, self-hosted runners and inherited kubeconfigs.
The shared harness checks cluster UID, private kubeconfig and ownership labels
before mutations. Runtime commands go through Harakiri, never Kubernetes exec.

The fixture tests finite and checked execution, text/binary files, typed filtering,
capacity rejection, process reconnect and cancellation, a protected HTTP route,
local Git clone, workspace reattachment and per-sandbox confirmed cleanup.
Source bootstrap fails against a closed loopback port in the owned sandbox.
Provider unavailability is injected only in the runner-owned deployment to prove
that cleanup cannot falsely report released capacity. The fault fixture requests
deletion once, restores the provider, and uses read-only termination observation
until the short-lived runtime expires and authoritative absence is confirmed.
Restoring connectivity or reaching a local TTL alone is not a release proof;
the suite does not replay an uncertain deletion or clear capacity records.

A deliberately incompatible log cursor proves the public unreplayable-output
error contract. It does **not** establish arbitrary provider log-retention bounds.
OpenCode's pinned image is used model-free: no LLM keys, free-model dependency or
inference-quality claim. Git's distributed bootstrap claim remains out of scope.

The companion package job builds with the repo-required Node 22 and executes
the installed consumer tests and declarations under both Node 20 and Node 22.
Public evidence contains only allowlisted gate names, statuses, durations and
artifact/source identities. Raw exceptions, credentials and kubeconfigs remain
private and are removed by the always-run cleanup step.

Safe local checks:

```sh
node --test infra/acceptance/safety.test.mjs infra/sdk-acceptance/*.test.mjs
pnpm --filter @h-sandbox/sdk test:package
```

Package publication, merging and release acceptance remain separate decisions.
