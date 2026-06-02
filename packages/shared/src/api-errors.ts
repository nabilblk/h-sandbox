export const sandboxRuntimeApiErrorCodes = [
  "sandbox_not_found",
  "sandbox_not_running",
  "sandbox_terminated",
  "sandbox_command_not_found",
  "sandbox_env_not_replayable",
  "sandbox_provision_failed",
  "sandbox_route_limit_exceeded",
  "organization_route_limit_exceeded",
  "runtime_command_unsupported",
  "runtime_command_unavailable",
  "runtime_terminal_unsupported",
  "runtime_terminal_unavailable",
  "runtime_file_operation_unsupported",
  "runtime_file_operation_failed",
  "runtime_files_unavailable",
  "sandbox_terminal_session_not_found",
  "sandbox_command_session_not_found",
  "sandbox_terminal_attach_closed",
  "sandbox_command_timeout",
  "file_not_found",
  "file_permission_denied",
  "invalid_file_path",
  "sandbox_file_artifact_invalid",
  "sandbox_file_artifact_invalid_base64",
  "sandbox_file_artifact_too_large",
  "sandbox_file_artifact_size_mismatch",
  "sandbox_file_artifact_checksum_mismatch",
  "egress_policy_invalid",
  "egress_preset_not_allowed",
  "egress_custom_domains_disabled",
  "egress_rule_limit_exceeded",
  "egress_provider_unavailable",
  "route_not_found",
  "route_not_ready",
  "route_proxy_requires_token_route",
  "route_token_required",
  "route_proxy_upstream_unreachable",
  "route_access_mode_conflict",
  "template_not_found",
  "template_not_ready",
  "template_image_digest_unresolved"
] as const;

export type SandboxRuntimeApiErrorCode = typeof sandboxRuntimeApiErrorCodes[number];

export const unsupportedCapabilityApiErrorCodes = [
  "runtime_command_unsupported",
  "runtime_terminal_unsupported",
  "runtime_file_operation_unsupported"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type UnsupportedCapabilityApiErrorCode = typeof unsupportedCapabilityApiErrorCodes[number];

export const providerUnavailableApiErrorCodes = [
  "sandbox_provision_failed",
  "runtime_terminal_unavailable",
  "runtime_command_unavailable",
  "runtime_files_unavailable",
  "egress_provider_unavailable",
  "route_proxy_upstream_unreachable"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type ProviderUnavailableApiErrorCode = typeof providerUnavailableApiErrorCodes[number];

export const timeoutApiErrorCodes = [
  "sandbox_command_timeout"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type TimeoutApiErrorCode = typeof timeoutApiErrorCodes[number];

export const sandboxConflictApiErrorCodes = [
  "sandbox_not_running",
  "sandbox_terminated",
  "route_not_ready",
  "route_proxy_requires_token_route",
  "route_access_mode_conflict",
  "template_not_ready",
  "template_image_digest_unresolved",
  "sandbox_env_not_replayable",
  "sandbox_terminal_attach_closed"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type SandboxConflictApiErrorCode = typeof sandboxConflictApiErrorCodes[number];

export const runtimePolicyApiErrorCodes = [
  "egress_policy_invalid",
  "egress_preset_not_allowed",
  "egress_custom_domains_disabled",
  "egress_rule_limit_exceeded",
  "route_token_required",
  "route_access_mode_conflict",
  "sandbox_route_limit_exceeded",
  "organization_route_limit_exceeded"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type RuntimePolicyApiErrorCode = typeof runtimePolicyApiErrorCodes[number];

export const isKnownSandboxRuntimeApiErrorCode = (code: string | undefined): code is SandboxRuntimeApiErrorCode =>
  Boolean(code && (sandboxRuntimeApiErrorCodes as readonly string[]).includes(code));
