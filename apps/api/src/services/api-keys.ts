import { allowedApiKeyScopes, defaultApiKeyScopes, apiKeyDefaultLifetimeDays, apiKeyMaxLifetimeDays, type ApiKeyScope, type ApiKeySummary, type CreateApiKeyResponse } from "@harakiri/shared";
import { createApiKey } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";
import { organizationMembershipRole } from "./organization-access.js";
import { AuthorizationError } from "../authorization-error.js";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  scopes: ApiKeyScope[];
  expiresAt: Date | string | null;
  createdByUserId: string | null;
  legacy: boolean;
};

export type ApiKeyFactory = typeof createApiKey;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const mapApiKey = (row: ApiKeyRow): ApiKeySummary => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  lastFour: row.lastFour,
  createdAt: toIso(row.createdAt),
  lastUsedAt: toIsoOrNull(row.lastUsedAt),
  revokedAt: toIsoOrNull(row.revokedAt),
  scopes: row.scopes,
  expiresAt: toIsoOrNull(row.expiresAt),
  createdByUserId: row.createdByUserId,
  legacy: row.legacy
});

type KeyActor = { organizationId: string; actorUserId: string | null };
const requireKeyOwner = async (input: KeyActor, query: Query) => {
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (role !== "admin" && role !== "member") throw new AuthorizationError(403, "forbidden", "A current organization member is required to manage API keys.");
  return role;
};

const keyFields = `id, name, prefix, last_four AS "lastFour", created_at AS "createdAt",
  last_used_at AS "lastUsedAt", revoked_at AS "revokedAt", scopes,
  expires_at AS "expiresAt", created_by_user_id AS "createdByUserId", legacy`;

export const listApiKeys = async (
  input: KeyActor,
  query: Query = defaultQuery
): Promise<ApiKeySummary[]> => {
  const role = await requireKeyOwner(input, query);
  const result = await query<ApiKeyRow>(
    `SELECT ${keyFields} FROM api_keys WHERE organization_id = $1
       AND ($2::boolean OR created_by_user_id = $3) ORDER BY created_at DESC`,
    [input.organizationId, role === "admin", input.actorUserId]
  );
  return result.rows.map(mapApiKey);
};

export const createApiKeyRecord = async (
  input: KeyActor & { name: string; scopes?: readonly string[]; expiresAt?: string },
  options: { query?: Query; keyFactory?: ApiKeyFactory } = {}
): Promise<CreateApiKeyResponse> => {
  const query = options.query ?? defaultQuery;
  const role = await requireKeyOwner(input, query);
  const requested = input.scopes ?? defaultApiKeyScopes;
  const allowed = allowedApiKeyScopes(role);
  if (!requested.length || requested.some((scope) => !allowed.includes(scope as ApiKeyScope))) {
    throw new AuthorizationError(403, "forbidden", "The requested API-key scopes exceed your permissions.");
  }
  const scopes = allowed.filter((scope) => requested.includes(scope));
  const now = Date.now();
  const expiresAt = input.expiresAt ? Date.parse(input.expiresAt) : now + apiKeyDefaultLifetimeDays * 86_400_000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + apiKeyMaxLifetimeDays * 86_400_000) {
    throw new AuthorizationError(400, "validation_error", `Key expiry must be in the future and within ${apiKeyMaxLifetimeDays} days.`);
  }
  const name = input.name.trim();
  if (!name || name.length > 100) throw new AuthorizationError(400, "validation_error", "Key name must contain 1 to 100 characters.");
  const key = (options.keyFactory ?? createApiKey)("live");
  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (organization_id, name, key_hash, prefix, last_four, created_by_user_id, scopes, expires_at, legacy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
     RETURNING ${keyFields}`,
    [input.organizationId, name, key.hash, key.prefix, key.lastFour, input.actorUserId, scopes, new Date(expiresAt).toISOString()]
  );
  return { key: mapApiKey(result.rows[0]), token: key.token };
};

export const revokeApiKey = async (
  input: KeyActor & { apiKeyId: string },
  query: Query = defaultQuery
) => {
  const role = await requireKeyOwner(input, query);
  const result = await query(
    "UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND organization_id = $2 AND ($3::boolean OR created_by_user_id = $4)",
    [input.apiKeyId, input.organizationId, role === "admin", input.actorUserId]
  );
  return Boolean(result.rowCount);
};
