# Harakiri Sandbox v0.4.0: Credential Vault

**Release state:** Released; k0s supported, restricted OpenShift requires operator action
**Updated:** 2026-09-04

## Added

- Provider-neutral credential attachments with write-only inline values.
- Built-in presets for OpenAI, Anthropic, OpenRouter, GitHub, GitLab, npm, and
  PyPI publishing.
- Required and optional template credential slots, including exact-host custom
  private API profiles and immutable version snapshots.
- Envelope-encrypted workspace credentials with rotation, disable/enable,
  deletion, usage summaries, and admin/member-use policy.
- Kubernetes Secret references with operator allowlists and get-only RBAC.
- GitHub App installation issuers for short-lived repository-scoped tokens.
- Create-time, running-sandbox, inspect, test, refresh, rehydrate, and detach
  workflows across API, TypeScript SDK, CLI, and dashboard.
- Metadata-only organization audit history and background provider-state
  reconciliation.
- Fail-closed credential-aware outbound policy and create rollback.

## Upgrade Requirements

1. Apply migrations `025` through `034`.
2. Configure a 32-byte `CREDENTIAL_VAULT_KEY` or versioned keyring before using
   encrypted workspace custody.
3. Verify OpenSandbox runs the supported Credential Vault sidecar in `dns+nft`
   mode.
4. Enable Kubernetes external resolution and GitHub App issuance only when the
   corresponding operator credentials and policy are ready.
5. Keep API and scheduler on the same Harakiri image version.

Existing sandboxes and templates remain valid. Templates without credential
slots have no new launch requirement. Credential-bearing creation is
synchronous; integrations that request async creation must remove that option
or attach after the sandbox is running.

## Runtime Limits

- Inline ephemeral values cannot be rehydrated after provider state loss.
- The shipped external resolver is Kubernetes Secret; direct HashiCorp Vault
  and cloud-manager resolvers are extension points, not shipped adapters.
- The shipped dynamic issuer is GitHub App installation.
- Current OpenSandbox `dns+nft` needs `NET_ADMIN`; restricted OpenShift is
  operator-action-required.
- Transparent service-mesh sidecars are unsupported in the sandbox network
  namespace.
- Private image pulls use template registry credentials, not runtime Vault.

The authoritative status is
[Credential Vault Compatibility And Support](../credential-vault-support.md).
Verification evidence is recorded in [Test Report](../test-report.md).
