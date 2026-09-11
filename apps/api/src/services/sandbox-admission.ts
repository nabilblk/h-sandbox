import { createHash, createHmac } from "node:crypto";
import { config } from "../config.js";
import { hasSecretBoxKey, secretBoxKey } from "../secret-box.js";
import type { Query } from "./query.js";
import type { CreateSandboxInput } from "./sandboxes.js";
import { CapacityError, lockOrganizationCapacity } from "./organization-capacity.js";
import { sandboxOperationSelect, type SandboxOperation } from "./sandbox-operations.js";

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => [key, canonical(entry)]));
  return value;
};

export const createIntentFingerprint = (input: CreateSandboxInput, algorithm?: string): string | null => {
  const sensitive = Boolean(Object.keys(input.env).length || input.credentials?.length || input.credentialMappings?.length || input.source);
  const mode = algorithm ?? (hasSecretBoxKey() ? "hmac-v1" : "public-v1");
  if ((sensitive || mode === "hmac-v1") && !hasSecretBoxKey()) return null;
  if (mode !== "hmac-v1" && (sensitive || mode !== "public-v1")) return null;
  const intent = JSON.stringify(canonical({
    template: input.templateRef ?? null, snapshotId: input.snapshotId ?? null,
    workspaceId: input.workspaceId ?? null, name: input.name?.trim() || null,
    ttlSeconds: input.ttlSeconds, env: input.env, egress: input.egress ?? null,
    source: input.source ?? null, credentials: input.credentials ?? [], credentialMappings: input.credentialMappings ?? []
  }));
  // Inline-ephemeral credentials are fingerprinted, never persisted as replay inputs.
  const digest = mode === "hmac-v1"
    ? createHmac("sha256", secretBoxKey(config.controlPlaneSecretKey)).update("harakiri:create-intent:v1\0").update(intent).digest("hex")
    : createHash("sha256").update(intent).digest("hex");
  return `${mode}:${digest}`;
};

export const findAcceptedCreate = async (input: CreateSandboxInput, query: Query): Promise<SandboxOperation | null> => {
  if (!input.idempotencyKey) return null;
  const result = await query<SandboxOperation>(
    `${sandboxOperationSelect} WHERE organization_id=$1 AND kind='provision' AND idempotency_key=$2`,
    [input.organizationId, input.idempotencyKey]
  );
  const operation = result.rows[0];
  if (!operation) return null;
  const stored = operation.request.intentFingerprint;
  if (typeof stored !== "string" || createIntentFingerprint(input, stored.split(":")[0]) !== stored) {
    throw new CapacityError("idempotency_conflict", "This key identifies a different or unverifiable create intent. Inspect the existing operation before choosing a new key.", { operationId: operation.id, sandboxId: operation.sandboxId });
  }
  return operation;
};

export const lockCreateAdmission = async (input: CreateSandboxInput, query: Query) => {
  await lockOrganizationCapacity(input.organizationId, query);
  return findAcceptedCreate(input, query);
};
