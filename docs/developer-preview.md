# Developer Preview: Installation and Evaluation

Harakiri is a self-hosted sandbox control plane for trusted development
teams. The current implementation is a Developer Preview, not an unlimited
public execution service, managed-service SLA or certified hostile multi-tenant
platform. Source opening, usable installation and broad announcement are
separate gates in the [launch plan](exec-plans/active/oss-developer-preview-launch.md).

Runtime execution sits behind a provider interface. OpenSandbox is the currently
integrated execution provider; additional adapters or a first-party runtime are
future possibilities, not capabilities advertised by this preview.

## Select a Version

The current candidate is **0.5.0-rc.8**. Use its
[delivery receipt](release-notes/0.5.0-rc.8-delivery.md) for the exact artifact
coordinates, documentation image correction and acceptance scope. SDK/CLI `next`
points to rc.8; `latest` remains `0.4.0`. Do not use the older stable tag as a
substitute for the scoped authorization release. Source changes are not
automatically published or deployed.

The native reference cluster verified anonymous chart, image and npm access,
operator-owned credentials, real runtime workflows and retained-file recovery.
The receipt distinguishes fresh-install versions from subsequent upgrades and
arm64 runtime execution from multiarch image builds. Both rc.8 npm tarballs
matched registry SHA-512 integrity. The owner has authorized source publication;
the [launch review](oss-launch-review.md) records the actual visibility checkpoint
and remaining safety confirmations. Authorization is not proof that anonymous
source access or a public announcement has happened.

## Operator Path

The [native Kubernetes installation guide](../infra/preview/README.md) contains
the exact dependency manifests, private configuration generation, chart pulls,
Helm commands and cleanup boundaries. It uses a separate cluster and no
development passwords. Its release receipt records actual acceptance results.

1. Choose the exact Kubernetes version, node architecture, ingress/TLS scheme
   and storage class. Record cluster-admin versus namespace-only requirements.
   Do not infer amd64 runtime acceptance from arm64 tests or a multiarch index.
2. Review [release artifacts](release-artifacts.md), the chart's
   [configuration](../infra/charts/harakiri/README.md),
   [runtime boundaries](opensandbox-boundaries.md) and
   [persistent-storage operations](persistent-workspace-operations.md).
3. Install or supply PostgreSQL and Keycloak with **new operator-owned secrets**.
   Use separate database ownership per service. Configure public issuer,
   audience `harakiri-api`, PKCE and HTTPS redirect/logout URLs for your domain.
   Disable dev authentication and boot seeding. Do not import a development
   user into an internet-facing realm.
4. Install a pinned OpenSandbox runtime and the matching control-plane bundle.
   Put registry credentials and encryption keys in operator-managed Secrets,
   not committed Helm values. Follow the selected version's values and migration
   order; do not repair an install with undocumented patches or localhost URLs.
5. Validate health, real browser login/logout, member restrictions and scoped
   API keys. Run the deterministic workflow below before adding model access.
6. Test an upgrade with retained files. Back up and restore database metadata,
   encryption keys and workspace volumes coherently. Uninstall only your test
   release after confirming its PVC retention/reclamation policy.

This checklist does not replace the clean versioned install/upgrade/recovery
receipt. The owner confirms independent evaluation is already complete; its
environment and results are not invented or attributed to maintainer testing.

## Developer Path

Use your installation's URL and your own scoped key. Runtime operations use
Harakiri's API, never direct pod access. The private `@harakiri/shared` package
is not a consumer dependency.

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.8
npm install -g @h-sandbox/cli@0.5.0-rc.8
harakiri --version
```

Start with the [CLI/TypeScript quickstart](https://sb.harakiri.io/#docs/quickstart).
Then evaluate the published packages using this outcome checklist:

- Authenticate; discover provider capabilities and available templates.
- Allocate a workspace, create a sandbox and seed a small repository fixture.
- Run deterministic tests, reconnect to output and retrieve a result artifact
  or an authenticated preview route.
- Terminate the runtime; wait for workspace release; attach a replacement
  sandbox and verify the retained file contents.
- Try a forbidden operation with a read-only key; revoke that key and verify
  denial. Delete only the resources owned by the test.
- Optionally run the existing OpenCode task and independently check its output.
  Free-model availability is checked at execution time, not guaranteed.

Use [existing conformance scripts](../tests/conformance) and
[runnable examples](../examples), not a BackgroundAgent installation. Distinguish
mock/dev-provider results from native OpenSandbox evidence. Record setup and
task times separately without assuming a predetermined time-to-first-task.

## Capability and Trust Limits

| Area | Preview boundary |
| --- | --- |
| Authorization | Human admin operations remain separate from scoped API-key principals. Key scopes do not grant more than the creator's current role |
| Capacity | `maxConcurrency` is a target only; atomic admission is not implemented. Restrict evaluators and resource consumption operationally |
| Usage | Retained record counts are available. Historical peaks/concurrency, billed compute, measured runtime and cold-start observations are unavailable |
| Workspace | Exclusive file-volume attachment; no retained processes, shared concurrent mount or automatic backup |
| Vault/egress | Require provider-supported enforcement. No plaintext-secret or Kubernetes-exec fallback. Credential revocation does not erase existing files or cancel detached work |
| Restricted OpenShift | No SCC modifications are promised. Vault/mutable egress requiring `NET_ADMIN` are unsupported; full restricted-profile acceptance remains pending |
| Artifacts | Exact receipts and checksums, not blanket provenance/signature or vulnerability-free claims |

The usage correction shipped in the current candidate adds `coverage` and empty `series` to
`GET /v1/usage`. Deprecated numeric fields stay zero for compatibility; consult
`coverage.unavailableMetrics` before rendering them. Missing coverage on older
servers does not establish accurate history. See [API semantics](api.md).

## Contribute and Report

[CONTRIBUTING](../CONTRIBUTING.md) describes the secret-free core validation path.
Use [SECURITY](../SECURITY.md) for private vulnerability reporting, not a public
issue. Include exact versions and sanitized reproduction steps; exclude
credentials, private code and customer information. Existing demos are historical
recordings with edited waiting time, not current performance benchmarks.
