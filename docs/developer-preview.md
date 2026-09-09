# Developer Preview: Installation and Evaluation

Harakiri is a self-hosted OpenSandbox control plane for trusted development
teams. The current implementation is a Developer Preview, not an unlimited
public execution service, managed-service SLA or certified hostile multi-tenant
platform. Source opening, usable installation and broad announcement are
separate gates in the [launch plan](exec-plans/active/oss-developer-preview-launch.md).

## Select a Version

The candidate being prepared is **0.5.0-rc.8**; follow its
[current delivery receipt](release-notes/0.5.0-rc.8-delivery.md) before installing.
The previous delivered candidate is **0.5.0-rc.4**. Its
[delivery receipt](release-notes/0.5.0-rc.4-delivery.md) and
[exact upgrade overlay](release-notes/0.5.0-rc.4-values.yaml): the web correction
is a distinct image. SDK/CLI `next` points to rc.4; `latest` still points to
`0.4.0`. Do not use the older stable tag as a substitute for the scoped
authorization release. Changes in the working tree are not published artifacts.

The rc.4 chart was downloaded anonymously on September 9 with an empty Helm
registry configuration. This verifies chart access, not all container layers,
the OpenCode image or a clean installation. Both rc.4 npm tarballs also downloaded
anonymously and matched registry integrity hashes. GitHub release assets remain private.
Refer to the [launch review](oss-launch-review.md) for the exact verification scope.

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
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.4
npm install -g @h-sandbox/cli@0.5.0-rc.4
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

The unreleased usage correction adds `coverage` and empty `series` to
`GET /v1/usage`. Deprecated numeric fields stay zero for compatibility; consult
`coverage.unavailableMetrics` before rendering them. Missing coverage on older
servers does not establish accurate history. See [API semantics](api.md).

## Contribute and Report

[CONTRIBUTING](../CONTRIBUTING.md) describes the secret-free core validation path.
Use [SECURITY](../SECURITY.md) for private vulnerability reporting, not a public
issue. Include exact versions and sanitized reproduction steps; exclude
credentials, private code and customer information. Existing demos are historical
recordings with edited waiting time, not current performance benchmarks.
