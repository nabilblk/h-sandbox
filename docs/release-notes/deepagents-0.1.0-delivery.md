# Deep Agents 0.1.0 Preview Delivery

Status on September 24, 2026: the maintainer resumed publication and authorized
the public-docs deployment. The qualified `0.1.0-rc.0` bootstrap is published and
passes anonymous installed-package checks. Its own Trusted Publisher is configured;
[OIDC verification](https://github.com/nabilblk/h-sandbox/actions/runs/36032236601)
passed. A distinct `0.1.0-rc.1` CI publication and the live documentation rollout
remain in progress, not completed claims.

## Scope

The optional `@h-sandbox/deepagents` backend connects Deep Agents' shell and
filesystem tools to Harakiri through its public SDK. The agent loop, model
credentials and checkpoints remain in the application. Custom local tools are
not automatically isolated. The tested peer pair is SDK `0.5.0-rc.11` and Deep
Agents `1.14.0`; Node 20 and 22 are the qualified consumer targets.

This is an independently versioned client integration, not a server, chart or
database release. SDK/CLI `next` remains `0.5.0-rc.11`; `latest` remains `0.4.0`.
The subsequently authorized lab rollout is limited to the web/documentation
image on `harakiri-k0s`. API and chart changes since the deployed rc.10 baseline
are version metadata only, so no API, scheduler, database, identity or runtime
restart is needed. Customer installations, external model credentials and private
research remain outside this delivery.

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
globally changed.

The registry accepted the unmodified rc.0 bootstrap archive with SHA-1
`c74a0eeacca7697e878f4e73df2286f64373786a` and integrity
`sha512-6EIYNQKbwkYNPxmGFwCXmY9MJJ0HN+i8QtgY7JelUv39vxkbJhRS2CAmNBExBjCjWMFfQC+W7qAEv1ssNvL5yA==`.
The first public metadata wait timed out while the registry's package index
propagated. A read-only retry passed anonymous installation, all 38 contracts
and strict declarations. Publication was not retried. This local check ran on
Node 26; the CI release must additionally verify Node 20 and 22.

## Publication Gates

1. Complete: publish qualified rc.0 once through the maintainer's interactive npm session.
2. Complete: verify the package anonymously and configure its own GitHub Trusted Publisher:
   repository `nabilblk/h-sandbox`, workflow `npm-release.yml`, environment `npm`,
   direct publishing permission. Existing SDK/CLI publishers are unchanged.
3. Pending: publish a distinct adapter-only rc.1 through OIDC. Verify actual anonymous
   registry consumers on Node 20/22; do not mistake trust exchange for publication.
4. In progress: record registry integrity, release source and real publication run,
   publish release notes and replace archive-only installation instructions.
5. Pending: deploy the reviewed web image by immutable digest, preserve the live
   installation's values and public authentication origins, then verify the guide,
   Markdown, navigation, responsive layout and changelog through the public URL.

The [npm runbook](../integrations/npm-packages.md) covers authentication, bootstrap,
source/channel guards, package-specific OIDC and read-only failure recovery.
No npm token is added to CI, and no successful publish is blindly retried.
