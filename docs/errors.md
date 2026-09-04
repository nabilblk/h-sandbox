# Errors And Troubleshooting

Harakiri returns structured API errors and the SDK maps common categories to
typed exceptions. Integrations should branch on stable error codes and SDK error
classes, not on human messages.

## API Error Shape

```json
{
  "error": "runtime_files_unavailable",
  "message": "Filesystem provider is unavailable.",
  "details": {
    "provider": "opensandbox"
  }
}
```

Every API response still uses the HTTP status code for coarse handling. The
`error` field is the stable product code for application decisions.

## SDK Error Classes

| Class | Typical status | Use |
| --- | --- | --- |
| `HarakiriAuthenticationError` | 401 | Missing or invalid API key. |
| `HarakiriAuthorizationError` | 403 | API key or user lacks workspace permission. |
| `HarakiriValidationError` | 400 | Invalid request shape, path, checksum, or egress target. |
| `HarakiriNotFoundError` | 404 | Sandbox, command, route, template, or file was not found. |
| `HarakiriConflictError` | 409 | Operation conflicts with current state, such as a terminated sandbox. |
| `HarakiriRateLimitError` | 429 | Retry after backoff. |
| `HarakiriTimeoutApiError` | 408 or timeout code | Operation did not finish inside the requested timeout. |
| `HarakiriUnsupportedCapabilityError` | 501 | The current provider does not expose this feature. |
| `HarakiriProviderUnavailableError` | 502/503/504 | Runtime provider or provider sidecar is unavailable. |
| `HarakiriCommandEndedError` | command terminal state | A waited command failed, exited, or was killed before the expected state. |

## Retry Policy

Retry with idempotency when:

- sandbox create failed after a transient 502/503/504
- `wait` timed out but the sandbox or command may still be running
- route readiness polling times out while the server may still be starting
- provider logs, metrics, files, or egress sidecar are temporarily unavailable

Do not blindly retry when:

- the API returns validation errors such as invalid path, invalid egress target,
  artifact checksum mismatch, or resource limit exceeded
- the sandbox status is `terminated`
- template image policy or resource limit checks fail
- authentication or authorization fails

## Common Errors

| Code or symptom | Meaning | Fix |
| --- | --- | --- |
| `api_key_invalid` | The CLI/SDK key is missing, revoked, or malformed. | Create a new API key, then run `harakiri login` or update env vars. |
| `sandbox_not_found` | The sandbox ID is not in the current workspace. | Store Harakiri sandbox IDs, not provider IDs; confirm workspace/API key. |
| `sandbox_terminal_state_conflict` | The sandbox cannot run the requested operation. | Check status. Terminated sandboxes cannot run commands. |
| `runtime_command_unsupported` | Provider command transport is unavailable. | Inspect `harakiri capabilities`; use a supported runtime provider. |
| `runtime_file_operation_unsupported` | Provider file operation is unavailable. | Use a template/provider that exposes file operations; do not fall back to pod exec. |
| `runtime_files_unavailable` | File side of the provider is degraded. | Retry later and show degraded state in UI instead of an empty fake directory. |
| `sandbox_file_artifact_invalid_base64` | Upload body is not canonical base64. | Encode bytes with standard base64 and retry. |
| `sandbox_file_artifact_size_mismatch` | `sizeBytes` does not match decoded content. | Compute decoded byte length before upload. |
| `sandbox_file_artifact_checksum_mismatch` | `sha256` does not match decoded content. | Recompute `sha256:<hex>` over the raw bytes. |
| `sandbox_file_artifact_too_large` | Decoded content exceeds `SANDBOX_FILE_ARTIFACT_MAX_BYTES`. | Compress, split, or wait for streaming/signed URL transfer support. |
| `route_proxy_upstream_unreachable` | The token route proxy cannot reach the sandbox server. | Bind the server to `0.0.0.0`, expose the right port, and retry readiness. |
| `egress_provider_unavailable` | Egress sidecar policy endpoint is not ready. | Show degraded egress state; retry after the sandbox is fully running. |
| `credential_vault_unsupported` | Active runtime provider does not expose Credential Vault. | Hide vault workflows or use an OpenSandbox profile with Credential Vault enabled. |
| `credential_vault_provider_unavailable` | The provider vault sidecar could not be reached. | Wait for sandbox readiness, check provider capabilities, and retry without leaking the credential. |
| `credential_vault_egress_conflict` | Runtime egress is not attested safe for credential injection, including DNS-only mode. | Enable OpenSandbox `dns+nft` and Credential Proxy; do not fall back to open outbound access. |
| `credential_vault_create_requires_sync` | Create-time credentials were sent with async creation. | Remove `wait:false`, `Prefer: respond-async`, or `waitTimeoutMs`, or create first and attach later. |
| `credential_vault_invalid_binding` | Credential binding or test target does not match the supported shape. | Use explicit hosts, HTTPS schemes, valid methods, and matching paths. |
| `credential_vault_required_slot_missing` | A template has required credential slots that were not mapped at sandbox creation. | Send `credentialMappings` for every required template slot. |
| `credential_vault_secret_required` | A vault attach request did not include a real value. | Use SDK process env, CLI `--from-env`, or CLI `--from-stdin`. |
| `credential_vault_attachment_not_found` | The attachment ID is not active in the sandbox. | Refresh `harakiri vault list` or SDK `credentials.list()`. |
| `credential_preset_not_found` | The requested provider preset ID does not exist. | Run `harakiri vault presets` or SDK `credentialPresets.list()` and retry with a listed ID. |
| `credential_secret_not_found` | The workspace credential secret ID does not exist in this organization. | Refresh `harakiri vault secrets list` or SDK `credentialSecrets.list()`. |
| `credential_secret_duplicate` | An active workspace credential secret already uses that name. | Use a different name, rotate the existing secret, or delete the old metadata record first. |
| `credential_secret_forbidden` | The caller is not allowed to manage workspace credential secrets. | Use an organization admin account or admin-owned API key. |
| `credential_secret_invalid` | Workspace credential secret metadata, fake env, binding, or provider preset input is invalid. | Use a known preset, fake env values that cannot equal the submitted secret, and a supported binding shape. |
| `credential_secret_encryption_unavailable` | Harakiri could not encrypt the submitted value. | Configure the control-plane secret key and retry. Do not retry by logging or storing the raw value elsewhere. |
| `credential_secret_decryption_unavailable` | Harakiri could not decrypt a stored workspace secret for runtime injection. | Verify the control-plane secret key and key-rotation state before retrying. |
| `credential_secret_disabled` | The workspace credential secret is disabled. | Enable or rotate the secret before attaching it to a sandbox. |
| `credential_secret_value_required` | Create or rotate was called without a non-empty secret value. | Use SDK process env, CLI `--from-env`, `--from-stdin`, or `--prompt`. |
| `external_secret_reference_not_found` | The external reference ID does not exist in this workspace. | Refresh the external-reference list and use a current ID. |
| `external_secret_reference_duplicate` | An active external reference already uses that name. | Update the existing reference or choose a different name. |
| `external_secret_reference_forbidden` | The caller cannot manage or use the reference, or its Kubernetes locator is outside the operator allowlist. | Use an admin account for management; share the reference for member use or update the Helm allowlist. |
| `external_secret_reference_invalid` | The reference name, resolver, locator, or update body is malformed. | Validate the locator fields and submit at least one update field. |
| `external_secret_reference_disabled` | The reference is disabled and cannot resolve material. | Enable it before attaching it or mapping it to a template slot. |
| `external_secret_resolution_not_found` | The referenced Kubernetes Secret or key does not exist. | Create the Secret/key in an allowed namespace, then run reference validation again. |
| `external_secret_resolution_forbidden` | Kubernetes denied the API service account or an operator policy rejected the locator. | Grant only `get` on approved Secret names and verify namespace/name/prefix Helm values. |
| `external_secret_resolution_invalid` | The resolved Secret value is empty or cannot be used as credential material. | Replace the selected Secret key with a non-empty value and validate again. |
| `external_secret_resolver_unavailable` | The configured resolver is disabled or temporarily unavailable. | Enable the Kubernetes resolver, inspect API connectivity/RBAC, and retry validation. |
| `dynamic_credential_issuer_not_found` | The dynamic issuer ID does not exist in this workspace. | Refresh `harakiri vault issuers list` and use a current ID. |
| `dynamic_credential_issuer_forbidden` | The caller cannot manage or use the issuer. | Use an admin for management or explicitly share the issuer for member use. |
| `dynamic_credential_issuer_disabled` | The issuer is disabled and cannot mint or refresh material. | Enable and validate it before attachment. |
| `dynamic_credential_issuer_unavailable` | The platform issuer is disabled, incomplete, timed out, or unreachable. | Configure the GitHub App client ID/private key and verify provider connectivity. |
| `dynamic_credential_issue_invalid` | Scope or issued token metadata failed validation. | Correct installation ID, repository names, and bounded permissions, then validate again. |
| `audit_event_forbidden` | The caller is not an organization admin. | Hide organization audit controls for members and use an admin identity. |
| `git_runtime_unsupported` | The sandbox image lacks `git`. | Use a template that includes Git or build a custom template. |
| `git_network_access_failed` | Git host is blocked or unreachable. | Add the `git-hosting` egress preset or allow required hostnames. |
| `template_not_ready` | Template has no ready digest-pinned version. | Build or import the template and wait for a successful version. |
| `template_image_policy_violation` | Image or Dockerfile base image violates workspace policy. | Use an allowed registry/prefix or update workspace policy. |

## CLI Troubleshooting

```bash
harakiri config
harakiri capabilities
harakiri status sbx_... --json
harakiri command status sbx_... cmd_... --json
harakiri routes sbx_... --json
harakiri egress sbx_...
```

Use `--json` in scripts. Human output can change to improve readability, while
JSON output follows the public API contract.

## Dashboard Troubleshooting

- Sandboxes: check status, TTL, runtime metadata, and source status.
- Terminal: reconnect if the attach ticket expired.
- Files: provider source and warnings show whether the provider is degraded.
- Logs: command logs are command-scoped; sandbox logs show runtime/provider
  diagnostics when available.
- Metrics: provider metrics can be unavailable while persisted control-plane
  metrics remain visible.
- Network: test outbound access from the running sandbox and inspect route
  readiness separately from server readiness.
- Credential Vault: use `harakiri vault list` to confirm the attachment is
  active, then `harakiri vault test` against a URL that matches the binding.
  If the test reports `not_injected`, reattach the ephemeral credential.
- External references: run `harakiri vault external validate <reference-id>`.
  Validation returns sanitized state only; inspect the API pod's Kubernetes
  RBAC and resolver allowlists when it reports denied or unavailable.

## Provider Boundary

Do not fix Harakiri API errors by reaching into Kubernetes pods or provider
internal endpoints from application code. The supported integration contract is
Harakiri API, SDK, CLI, and documented route URLs.
