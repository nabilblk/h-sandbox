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

## Provider Boundary

Do not fix Harakiri API errors by reaching into Kubernetes pods or provider
internal endpoints from application code. The supported integration contract is
Harakiri API, SDK, CLI, and documented route URLs.
