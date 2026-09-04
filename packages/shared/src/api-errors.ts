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
  "credential_vault_unsupported",
  "credential_vault_provider_unavailable",
  "credential_vault_create_requires_sync",
  "credential_vault_invalid_binding",
  "credential_vault_required_slot_missing",
  "credential_vault_secret_required",
  "credential_vault_attachment_not_found",
  "credential_vault_reinjection_required",
  "credential_vault_refresh_not_supported",
  "credential_vault_egress_conflict",
  "credential_preset_not_found",
  "credential_secret_not_found",
  "credential_secret_duplicate",
  "credential_secret_forbidden",
  "credential_secret_invalid",
  "credential_secret_encryption_unavailable",
  "credential_secret_decryption_unavailable",
  "credential_secret_disabled",
  "credential_secret_value_required",
  "external_secret_reference_not_found",
  "external_secret_reference_duplicate",
  "external_secret_reference_forbidden",
  "external_secret_reference_invalid",
  "external_secret_reference_disabled",
  "external_secret_resolution_not_found",
  "external_secret_resolution_forbidden",
  "external_secret_resolution_invalid",
  "external_secret_resolver_unavailable",
  "dynamic_credential_issuer_not_found",
  "dynamic_credential_issuer_duplicate",
  "dynamic_credential_issuer_forbidden",
  "dynamic_credential_issuer_invalid",
  "dynamic_credential_issuer_disabled",
  "dynamic_credential_issue_not_found",
  "dynamic_credential_issue_forbidden",
  "dynamic_credential_issue_invalid",
  "dynamic_credential_issuer_unavailable",
  "audit_event_forbidden",
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
  "runtime_file_operation_unsupported",
  "credential_vault_unsupported"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type UnsupportedCapabilityApiErrorCode = typeof unsupportedCapabilityApiErrorCodes[number];

export const providerUnavailableApiErrorCodes = [
  "sandbox_provision_failed",
  "runtime_terminal_unavailable",
  "runtime_command_unavailable",
  "runtime_files_unavailable",
  "egress_provider_unavailable",
  "credential_vault_provider_unavailable",
  "dynamic_credential_issuer_unavailable",
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
  "sandbox_terminal_attach_closed",
  "credential_vault_refresh_not_supported",
  "credential_vault_egress_conflict"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type SandboxConflictApiErrorCode = typeof sandboxConflictApiErrorCodes[number];

export const runtimePolicyApiErrorCodes = [
  "egress_policy_invalid",
  "egress_preset_not_allowed",
  "egress_custom_domains_disabled",
  "egress_rule_limit_exceeded",
  "credential_vault_invalid_binding",
  "credential_vault_create_requires_sync",
  "credential_vault_required_slot_missing",
  "credential_vault_secret_required",
  "credential_vault_egress_conflict",
  "credential_secret_invalid",
  "credential_secret_disabled",
  "external_secret_reference_invalid",
  "external_secret_reference_disabled",
  "external_secret_resolution_invalid",
  "dynamic_credential_issuer_invalid",
  "dynamic_credential_issuer_disabled",
  "dynamic_credential_issue_invalid",
  "route_token_required",
  "route_access_mode_conflict",
  "sandbox_route_limit_exceeded",
  "organization_route_limit_exceeded"
] as const satisfies readonly SandboxRuntimeApiErrorCode[];

export type RuntimePolicyApiErrorCode = typeof runtimePolicyApiErrorCodes[number];

export const isKnownSandboxRuntimeApiErrorCode = (code: string | undefined): code is SandboxRuntimeApiErrorCode =>
  Boolean(code && (sandboxRuntimeApiErrorCodes as readonly string[]).includes(code));
