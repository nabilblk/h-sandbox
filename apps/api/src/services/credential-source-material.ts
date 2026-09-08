import type {
  CredentialProviderProfileId,
  CredentialSecretSourceType,
  CredentialVaultBinding,
  CustomCredentialProfile,
  DynamicSandboxCredentialBody,
  ExternalReferenceSandboxCredentialBody,
  HarakiriEncryptedSandboxCredentialBody
} from "@harakiri/shared";
import { credentialProviderPresetCatalog } from "@harakiri/shared";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import {
  issueDynamicCredential,
  issueDynamicCredentialForSystem,
  type DynamicCredentialMaterialResult
} from "./dynamic-credential-issuers.js";
import {
  resolveExternalSecretReferenceMaterial,
  resolveExternalSecretReferenceMaterialForSystem,
  type ExternalSecretMaterialResult
} from "./external-secret-references.js";
import type { Query } from "./query.js";
import {
  resolveCredentialSecretMaterial,
  resolveCredentialSecretMaterialForSystem,
  type CredentialSecretMaterialResult,
  type DecryptWorkspaceCredentialSecret
} from "./workspace-credential-secrets.js";

export type ResolvableCredentialSourceBody =
  | HarakiriEncryptedSandboxCredentialBody
  | ExternalReferenceSandboxCredentialBody
  | DynamicSandboxCredentialBody;

export type ResolvedCredentialSourceMaterial = {
  sourceType: Extract<CredentialSecretSourceType, "harakiri_encrypted" | "external_ref" | "dynamic">;
  sourceRef: string;
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: CustomCredentialProfile | null;
  credentialName: string;
  secretValue: string;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  expiresAt: string | null;
  sourceMetadata: Record<string, unknown>;
};

const credentialNameForProfile = (
  providerPresetId: CredentialProviderProfileId,
  binding: CredentialVaultBinding
) => providerPresetId === "custom"
  ? binding.name
  : credentialProviderPresetCatalog[providerPresetId].credentialName;

export type CredentialSourceMaterialFailure =
  | { kind: "secret_forbidden" }
  | { kind: "secret_not_found" }
  | { kind: "secret_disabled" }
  | { kind: "secret_required"; message: string }
  | { kind: "secret_decryption_unavailable"; message: string }
  | { kind: "external_reference_forbidden" }
  | { kind: "external_reference_not_found" }
  | { kind: "external_reference_disabled" }
  | { kind: "external_resolution_not_found"; message: string }
  | { kind: "external_resolution_forbidden"; message: string }
  | { kind: "external_resolution_invalid"; message: string }
  | { kind: "external_resolver_unavailable"; message: string }
  | { kind: "dynamic_issuer_forbidden" }
  | { kind: "dynamic_issuer_not_found" }
  | { kind: "dynamic_issuer_disabled" }
  | { kind: "dynamic_issue_not_found"; message: string }
  | { kind: "dynamic_issue_forbidden"; message: string }
  | { kind: "dynamic_issue_invalid"; message: string }
  | { kind: "dynamic_issuer_unavailable"; message: string }
  | { kind: "invalid_binding"; message: string };

export type CredentialSourceMaterialResult =
  | { kind: "ok"; material: ResolvedCredentialSourceMaterial }
  | CredentialSourceMaterialFailure;

export type CredentialSourceMaterialDependencies = {
  query?: Query;
  decryptSecret?: DecryptWorkspaceCredentialSecret;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

export const isResolvableCredentialSourceBody = (
  body: { sourceType?: string }
): body is ResolvableCredentialSourceBody =>
  body.sourceType === "harakiri_encrypted"
  || body.sourceType === "external_ref"
  || body.sourceType === "dynamic";

const mapWorkspaceFailure = (
  result: Exclude<CredentialSecretMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialFailure => {
  if (result.kind === "forbidden") return { kind: "secret_forbidden" };
  if (result.kind === "not_found") return { kind: "secret_not_found" };
  if (result.kind === "disabled") return { kind: "secret_disabled" };
  if (result.kind === "value_required") return { kind: "secret_required", message: result.message };
  if (result.kind === "decryption_unavailable") {
    return { kind: "secret_decryption_unavailable", message: result.message };
  }
  return { kind: "invalid_binding", message: result.message };
};

const mapWorkspaceMaterial = (
  sourceRef: string,
  result: Extract<CredentialSecretMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialResult => ({
  kind: "ok",
  material: {
    sourceType: "harakiri_encrypted",
    sourceRef,
    name: result.secret.name,
    providerPresetId: result.secret.providerPresetId,
    customProfile: result.secret.customProfile,
    credentialName: credentialNameForProfile(result.secret.providerPresetId, result.secret.binding),
    secretValue: result.secretValue,
    fakeEnv: result.secret.fakeEnv,
    binding: result.secret.binding,
    expiresAt: null,
    sourceMetadata: {
      providerPresetId: result.secret.providerPresetId,
      version: result.secret.version
    }
  }
});

const mapExternalFailure = (
  result: Exclude<ExternalSecretMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialFailure => {
  if (result.kind === "forbidden") return { kind: "external_reference_forbidden" };
  if (result.kind === "not_found") return { kind: "external_reference_not_found" };
  if (result.kind === "disabled") return { kind: "external_reference_disabled" };
  if (result.kind === "resolver_not_found") return { kind: "external_resolution_not_found", message: result.message };
  if (result.kind === "resolver_forbidden") return { kind: "external_resolution_forbidden", message: result.message };
  if (result.kind === "resolver_invalid") return { kind: "external_resolution_invalid", message: result.message };
  if (result.kind === "resolver_unavailable") return { kind: "external_resolver_unavailable", message: result.message };
  if (result.kind === "duplicate") return { kind: "invalid_binding", message: "external secret reference is duplicated" };
  return { kind: "invalid_binding", message: result.message };
};

const mapExternalMaterial = (
  sourceRef: string,
  result: Extract<ExternalSecretMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialResult => ({
  kind: "ok",
  material: {
    sourceType: "external_ref",
    sourceRef,
    name: result.reference.name,
    providerPresetId: result.reference.providerPresetId,
    customProfile: result.reference.customProfile,
    credentialName: credentialNameForProfile(result.reference.providerPresetId, result.reference.binding),
    secretValue: result.secretValue,
    fakeEnv: result.reference.fakeEnv,
    binding: result.reference.binding,
    expiresAt: null,
    sourceMetadata: {
      providerPresetId: result.reference.providerPresetId,
      resolverType: result.reference.resolverType,
      versionRef: result.versionRef
    }
  }
});

const mapDynamicFailure = (
  result: Exclude<DynamicCredentialMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialFailure => {
  if (result.kind === "forbidden") return { kind: "dynamic_issuer_forbidden" };
  if (result.kind === "not_found") return { kind: "dynamic_issuer_not_found" };
  if (result.kind === "disabled") return { kind: "dynamic_issuer_disabled" };
  if (result.kind === "issuer_not_found") return { kind: "dynamic_issue_not_found", message: result.message };
  if (result.kind === "issuer_forbidden") return { kind: "dynamic_issue_forbidden", message: result.message };
  if (result.kind === "issuer_invalid") return { kind: "dynamic_issue_invalid", message: result.message };
  if (result.kind === "issuer_unavailable") return { kind: "dynamic_issuer_unavailable", message: result.message };
  if (result.kind === "duplicate") return { kind: "invalid_binding", message: "dynamic credential issuer is duplicated" };
  return { kind: "invalid_binding", message: result.message };
};

const mapDynamicMaterial = (
  sourceRef: string,
  result: Extract<DynamicCredentialMaterialResult, { kind: "ok" }>
): CredentialSourceMaterialResult => ({
  kind: "ok",
  material: {
    sourceType: "dynamic",
    sourceRef,
    name: result.issuer.name,
    providerPresetId: result.issuer.providerPresetId,
    customProfile: null,
    credentialName: credentialProviderPresetCatalog[result.issuer.providerPresetId].credentialName,
    secretValue: result.value,
    fakeEnv: result.issuer.fakeEnv,
    binding: result.issuer.binding,
    expiresAt: result.expiresAt,
    sourceMetadata: {
      ...result.metadata,
      providerPresetId: result.issuer.providerPresetId
    }
  }
});

const resolveWorkspaceSource = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; body: HarakiriEncryptedSandboxCredentialBody },
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const secretId = input.body.secretId.trim();
  if (!secretId) return { kind: "invalid_binding", message: "credential secret id is required" };
  const result = await resolveCredentialSecretMaterial(
    { organizationId: input.organizationId, actorUserId: input.actorUserId, actorApiKeyId: input.actorApiKeyId, secretId },
    { query: dependencies.query, decryptSecret: dependencies.decryptSecret }
  );
  return result.kind === "ok" ? mapWorkspaceMaterial(secretId, result) : mapWorkspaceFailure(result);
};

const resolveExternalSource = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; body: ExternalReferenceSandboxCredentialBody },
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const referenceId = input.body.referenceId.trim();
  if (!referenceId) return { kind: "invalid_binding", message: "external secret reference id is required" };
  const result = await resolveExternalSecretReferenceMaterial(
    { organizationId: input.organizationId, actorUserId: input.actorUserId, actorApiKeyId: input.actorApiKeyId, referenceId },
    { query: dependencies.query, resolvers: dependencies.externalSecretResolvers }
  );
  return result.kind === "ok" ? mapExternalMaterial(referenceId, result) : mapExternalFailure(result);
};

const resolveDynamicSource = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; body: DynamicSandboxCredentialBody },
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const issuerId = input.body.issuerId.trim();
  if (!issuerId) return { kind: "invalid_binding", message: "dynamic credential issuer id is required" };
  const result = await issueDynamicCredential(
    { organizationId: input.organizationId, actorUserId: input.actorUserId, actorApiKeyId: input.actorApiKeyId, issuerId },
    { query: dependencies.query, issuers: dependencies.dynamicCredentialIssuers }
  );
  return result.kind === "ok" ? mapDynamicMaterial(issuerId, result) : mapDynamicFailure(result);
};

export const resolveCredentialSourceMaterial = (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; body: ResolvableCredentialSourceBody },
  dependencies: CredentialSourceMaterialDependencies = {}
) => {
  if (input.body.sourceType === "harakiri_encrypted") {
    return resolveWorkspaceSource({ ...input, body: input.body }, dependencies);
  }
  if (input.body.sourceType === "external_ref") {
    return resolveExternalSource({ ...input, body: input.body }, dependencies);
  }
  return resolveDynamicSource({ ...input, body: input.body }, dependencies);
};

const resolveSystemWorkspaceSource = async (
  organizationId: string,
  sourceRef: string,
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const result = await resolveCredentialSecretMaterialForSystem(
    { organizationId, secretId: sourceRef },
    { query: dependencies.query, decryptSecret: dependencies.decryptSecret }
  );
  return result.kind === "ok" ? mapWorkspaceMaterial(sourceRef, result) : mapWorkspaceFailure(result);
};

const resolveSystemExternalSource = async (
  organizationId: string,
  sourceRef: string,
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const result = await resolveExternalSecretReferenceMaterialForSystem(
    { organizationId, referenceId: sourceRef },
    { query: dependencies.query, resolvers: dependencies.externalSecretResolvers }
  );
  return result.kind === "ok" ? mapExternalMaterial(sourceRef, result) : mapExternalFailure(result);
};

const resolveSystemDynamicSource = async (
  organizationId: string,
  sourceRef: string,
  dependencies: CredentialSourceMaterialDependencies
): Promise<CredentialSourceMaterialResult> => {
  const result = await issueDynamicCredentialForSystem(
    { organizationId, issuerId: sourceRef },
    { query: dependencies.query, issuers: dependencies.dynamicCredentialIssuers }
  );
  return result.kind === "ok" ? mapDynamicMaterial(sourceRef, result) : mapDynamicFailure(result);
};

export const resolveCredentialSourceMaterialForSystem = (
  input: {
    organizationId: string;
    sourceType: CredentialSecretSourceType;
    sourceRef: string;
  },
  dependencies: CredentialSourceMaterialDependencies = {}
): Promise<CredentialSourceMaterialResult> => {
  if (input.sourceType === "harakiri_encrypted") {
    return resolveSystemWorkspaceSource(input.organizationId, input.sourceRef, dependencies);
  }
  if (input.sourceType === "external_ref") {
    return resolveSystemExternalSource(input.organizationId, input.sourceRef, dependencies);
  }
  if (input.sourceType === "dynamic") {
    return resolveSystemDynamicSource(input.organizationId, input.sourceRef, dependencies);
  }
  return Promise.resolve({
    kind: "invalid_binding",
    message: `credential source type ${input.sourceType} is not rehydratable`
  });
};
