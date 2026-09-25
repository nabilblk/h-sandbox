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
The SDK gates use OpenCode's pinned image without inference. Additional framework
gates install the adapter archive, exercise native Deep Agents shell/file tools,
then run the exact documented repair through LangChain's Ollama integration.
Qwen3 4B Instruct and the CPU-only Ollama container are digest-pinned in `framework.mjs`.
The model listens on runner loopback only; cloud inference is disabled. No LLM
keys or paid provider are used. This small repair is not a model-quality benchmark.
The pinned JavaScript integration disables extended thinking with `think: false`,
verified against its actual invocation parameters before inference. Python's
`reasoning` option is not recognized here. Bounded response/tool-call counters
and exit/TAP counts can appear in sanitized evidence, never model text or tool
arguments. Independent tests and unchanged-test hashes still decide success.
The acceptance-only `TextToolChatOllama` converts text-only tool content blocks
to strings, preserving tool IDs and metadata: `@langchain/ollama@1.3.0` rejects
the standard text blocks returned by Deep Agents `read_file`. Other content is
rejected, never silently dropped. Offline transport contracts cover invocation
and both streaming paths. This does not alter the Harakiri adapter or documented
repair; remove the compatibility class when the pinned provider supports blocks.
The [non-thinking Instruct variant](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
is deliberate: the previously pinned hybrid model's template opens a thinking
block and runs hit the output limit without tool calls. The instruction model
keeps the same 4B footprint, 8K context and 1,024-token response budget. Neither
model selection nor transport normalization weakens the outcome checks.
After long model runs, the harness renews an expired captured operator token
through browser SSO before submitting the final key-revocation request. It does
not retry mutations, extend realm token lifetimes or bypass API authentication.
Git's distributed bootstrap claim remains out of scope.

The companion package job builds with the repo-required Node 22 and executes
the installed consumer tests and declarations under Node 22/24 and legacy Node 20.
Public evidence contains only allowlisted gate names, statuses, durations and
artifact/source identities. Raw exceptions, credentials and kubeconfigs remain
private and are removed by the always-run cleanup step.

Safe local checks:

```sh
node --test infra/acceptance/safety.test.mjs infra/sdk-acceptance/*.test.mjs
pnpm --filter @h-sandbox/sdk test:package
```

Package publication, merging and release acceptance remain separate decisions.

## Persistent Framework Gate

The `framework-durable-recovery` gate runs the documented PostgreSQL/Deep Agents
workflow with separate Node workers, scripted tool decisions and native sandbox
commands. It verifies approval before effects, worker death after acknowledgement,
read-only command recovery, actual server-side TTL cleanup and retained files in
a new runtime. It does not equate a local clock deadline with confirmed expiry
or claim exactly-once effects. The existing real-model repair is a separate gate.

Checkpoint PostgreSQL runs in a labelled, test-owned container on a dynamically
assigned loopback port. Cleanup checks ownership before removing that container.
No checkpoint service is installed into the product or the developer's cluster.
The public receipt reports only the gate result, not database URLs, prompts or
checkpoint contents. The configured suite now has 16 gates; historical 15-gate
receipts are not evidence for the new recovery scenario.
