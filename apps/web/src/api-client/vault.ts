import type {
  AuditEventsResponse,
  CreateCredentialSecretBody,
  CreateDynamicCredentialIssuerBody,
  CreateExternalSecretReferenceBody,
  CredentialProviderPresetResponse,
  CredentialProviderPresetsResponse,
  CredentialSecretResponse,
  CredentialSecretsResponse,
  DynamicCredentialIssuerResponse,
  DynamicCredentialIssuersResponse,
  ExternalSecretReferenceResponse,
  ExternalSecretReferencesResponse,
  InspectSandboxCredentialsResponse,
  RotateCredentialSecretBody,
  SandboxCredentialsResponse,
  RefreshSandboxCredentialResponse,
  RehydrateSandboxCredentialsResponse,
  DetachSandboxCredentialResponse,
  TestSandboxCredentialBody,
  TestSandboxCredentialResponse,
  UpdateCredentialSecretBody,
  UpdateDynamicCredentialIssuerBody,
  UpdateExternalSecretReferenceBody
} from "@harakiri/shared";
import { request } from "./request";

const credentialSecretsPath = (includeDeleted?: boolean) =>
  includeDeleted ? "/v1/credential-secrets?includeDeleted=true" : "/v1/credential-secrets";

type AuditEventFilters = {
  targetType?: string;
  targetId?: string;
  actionPrefix?: string;
  limit?: number;
  offset?: number;
};

const auditEventsPath = (filters: AuditEventFilters) => {
  const query = new URLSearchParams();
  if (filters.targetType) query.set("targetType", filters.targetType);
  if (filters.targetId) query.set("targetId", filters.targetId);
  if (filters.actionPrefix) query.set("actionPrefix", filters.actionPrefix);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  return `/v1/audit-events${query.size ? `?${query.toString()}` : ""}`;
};

export const vaultApi = {
  auditEvents: (filters: AuditEventFilters = {}) =>
    request<AuditEventsResponse>(auditEventsPath(filters)),
  sandboxCredentials: (sandboxId: string) =>
    request<SandboxCredentialsResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials`),
  inspectSandboxCredentials: (sandboxId: string) =>
    request<InspectSandboxCredentialsResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials/inspect`, { method: "POST" }),
  refreshSandboxCredential: (sandboxId: string, attachmentId: string) =>
    request<RefreshSandboxCredentialResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials/${encodeURIComponent(attachmentId)}/refresh`, { method: "POST" }),
  rehydrateSandboxCredentials: (sandboxId: string) =>
    request<RehydrateSandboxCredentialsResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials/rehydrate`, { method: "POST" }),
  detachSandboxCredential: (sandboxId: string, attachmentId: string) =>
    request<DetachSandboxCredentialResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }),
  testSandboxCredential: (sandboxId: string, attachmentId: string, body: TestSandboxCredentialBody = {}) =>
    request<TestSandboxCredentialResponse>(`/v1/sandboxes/${encodeURIComponent(sandboxId)}/credentials/${encodeURIComponent(attachmentId)}/test`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  credentialPresets: () => request<CredentialProviderPresetsResponse>("/v1/credential-presets"),
  credentialPreset: (id: string) => request<CredentialProviderPresetResponse>(`/v1/credential-presets/${encodeURIComponent(id)}`),
  credentialSecrets: (includeDeleted = false) => request<CredentialSecretsResponse>(credentialSecretsPath(includeDeleted)),
  createCredentialSecret: (body: CreateCredentialSecretBody) =>
    request<CredentialSecretResponse>("/v1/credential-secrets", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateCredentialSecret: (id: string, body: UpdateCredentialSecretBody) =>
    request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  rotateCredentialSecret: (id: string, body: RotateCredentialSecretBody) =>
    request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/rotate`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  disableCredentialSecret: (id: string) =>
    request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/disable`, { method: "POST" }),
  enableCredentialSecret: (id: string) =>
    request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/enable`, { method: "POST" }),
  deleteCredentialSecret: (id: string) =>
    request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  externalSecretReferences: (includeDeleted = false) =>
    request<ExternalSecretReferencesResponse>(`/v1/external-secret-references${includeDeleted ? "?includeDeleted=true" : ""}`),
  createExternalSecretReference: (body: CreateExternalSecretReferenceBody) =>
    request<ExternalSecretReferenceResponse>("/v1/external-secret-references", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateExternalSecretReference: (id: string, body: UpdateExternalSecretReferenceBody) =>
    request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  validateExternalSecretReference: (id: string) =>
    request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  disableExternalSecretReference: (id: string) =>
    request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/disable`, { method: "POST" }),
  enableExternalSecretReference: (id: string) =>
    request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/enable`, { method: "POST" }),
  deleteExternalSecretReference: (id: string) =>
    request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}`, { method: "DELETE" }),
  dynamicCredentialIssuers: (includeDeleted = false) =>
    request<DynamicCredentialIssuersResponse>(`/v1/dynamic-credential-issuers${includeDeleted ? "?includeDeleted=true" : ""}`),
  createDynamicCredentialIssuer: (body: CreateDynamicCredentialIssuerBody) =>
    request<DynamicCredentialIssuerResponse>("/v1/dynamic-credential-issuers", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateDynamicCredentialIssuer: (id: string, body: UpdateDynamicCredentialIssuerBody) =>
    request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  validateDynamicCredentialIssuer: (id: string) =>
    request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  disableDynamicCredentialIssuer: (id: string) =>
    request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/disable`, { method: "POST" }),
  enableDynamicCredentialIssuer: (id: string) =>
    request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/enable`, { method: "POST" }),
  deleteDynamicCredentialIssuer: (id: string) =>
    request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}`, { method: "DELETE" })
};
