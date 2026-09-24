# Deep Agents 0.1.0 Preview Delivery

Status on September 24, 2026: implementation qualified and merged; npm publication
is deferred at the maintainer's request. Local login works. A separate publication
approval expired and a fresh attempt was cancelled before approval; the registry
still reports no package. Actual CI publication is also unfinished. This receipt
does not announce npm availability yet.

## Scope

The optional `@h-sandbox/deepagents` backend connects Deep Agents' shell and
filesystem tools to Harakiri through its public SDK. The agent loop, model
credentials and checkpoints remain in the application. Custom local tools are
not automatically isolated. The tested peer pair is SDK `0.5.0-rc.11` and Deep
Agents `1.14.0`; Node 20 and 22 are the qualified consumer targets.

This is an independently versioned client integration, not a server, chart or
database release. SDK/CLI `next` remains `0.5.0-rc.11`; `latest` remains `0.4.0`.
No lab/customer deployment, local cluster, external model credential or private
research file is part of this delivery.

## Reviewed Source and Tests

- [PR #54](https://github.com/nabilblk/h-sandbox/pull/54) merged as
  `7511609752f5cc06cc282efb3532c140103c544b` after
  [required CI](https://github.com/nabilblk/h-sandbox/actions/runs/36008399126)
  passed, including all 46 browser tests and Node 20/22 package consumers.
- [Native SDK/framework acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/36007730164)
  passed all 15 gates, including independent model-result verification, key
  revocation and confirmed cleanup/private-material removal. It tested PR merge
  source `c99f93af841876af11fcd1e2799840b74ffcdbb9` against the pinned published
  API baseline `0.5.0-rc.9`. The only later source difference was one browser
  assertion; package code, manifest and runtime fixtures were unchanged.
- [Shared installation/recovery regression](https://github.com/nabilblk/h-sandbox/actions/runs/36007730084)
  passed all 11 gates and cleanup. This includes encrypted Vault and workspace
  recovery, provider interruption, source usage/schema rehearsal, logout and
  revocation. It is not a new published-server-pair or restricted OpenShift
  certification.
- A clean merged checkout passed 38 anonymous release-candidate contracts and
  strict public declaration/example checks against the actual registry SDK.
  These local contracts do not invoke a model or access a live runtime.

The digest-pinned Qwen3 4B Instruct repair used runner-local, CPU-only Ollama,
with cloud inference disabled and no paid-model key. Five responses requested
one listing, two reads and one edit, with no invalid calls or truncation.
The original tests remained unchanged, independent tests passed, a nonempty
implementation diff was retrieved, and runtime cleanup was confirmed.
This is one small repair, not a model-quality or production reliability benchmark.

`@langchain/ollama@1.3.0` rejects Deep Agents' text-block tool messages. A tested,
text-only compatibility class exists only in the acceptance harness, not in the
adapter. Applications must select a compatible model integration; see the
[technical guide](../integrations/deepagents.md). Earlier failed runs remain
documented in the [SDK rc.11 receipt](0.5.0-rc.11-delivery.md).

## Artifact Identity

| Artifact | SHA-256 |
| --- | --- |
| Native-qualified adapter archive | `ffda9322129c88d47131ee23a8c8b8e829be868ce3f782a996e34ed87330ee58` |
| Local Node 22.23.2 bootstrap archive | `5dd345cd03bb1a8e0a5c37a2fdfc4a49a7981d89334162cd5178b0946bceee46` |
| Native SDK receipt | `3ac75b19584b1e233f33fa5dfdae37162250e3eca55feab23fae3938ba763fe6` |
| Installation/recovery receipt | `15067b31c8d3487e66d228c2e590c000efa0c5dd845ed5b3bf93986bc2cbc7ee` |

The two adapter archives have identical contents. With the same Node version,
changing only gzip's macOS/Linux OS header byte **in memory** reproduces the
native digest. The publication archive is not edited to hide its build origin.
Node 26 also produces a different compression stream; local tooling was not
globally changed. Publication identity and postpublication checks are recorded
only after the registry accepts the package.

## Publication Gates

1. Publish qualified rc.0 once through the maintainer's interactive npm session.
2. Verify the package anonymously and configure its own GitHub Trusted Publisher:
   repository `nabilblk/h-sandbox`, workflow `npm-release.yml`, environment `npm`,
   direct publishing permission. Existing SDK/CLI publishers are unchanged.
3. Publish a distinct adapter-only rc.1 through OIDC. Verify actual anonymous
   registry consumers on Node 20/22; do not mistake trust exchange for publication.
4. Record the registry integrity, release source and real publication run, then
   publish release notes and replace candidate-only installation instructions.

The [npm runbook](../integrations/npm-packages.md) covers authentication, bootstrap,
source/channel guards, package-specific OIDC and read-only failure recovery.
No npm token is added to CI, and no successful publish is blindly retried.
