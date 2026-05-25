import type { ApiKeySummary, CreateApiKeyResponse } from "@harakiri/shared";
import { createApiKey } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
  revokedAt?: Date | string | null;
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
  revokedAt: toIsoOrNull(row.revokedAt)
});

export const listApiKeys = async (
  input: { organizationId: string },
  query: Query = defaultQuery
): Promise<ApiKeySummary[]> => {
  const result = await query<ApiKeyRow>(
    `SELECT id, name, prefix, last_four AS "lastFour", created_at AS "createdAt",
            last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
     FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC`,
    [input.organizationId]
  );
  return result.rows.map(mapApiKey);
};

export const createApiKeyRecord = async (
  input: { organizationId: string; name: string },
  options: { query?: Query; keyFactory?: ApiKeyFactory } = {}
): Promise<CreateApiKeyResponse> => {
  const query = options.query ?? defaultQuery;
  const key = (options.keyFactory ?? createApiKey)("live");
  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (organization_id, name, key_hash, prefix, last_four)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, prefix, last_four AS "lastFour", created_at AS "createdAt"`,
    [input.organizationId, input.name, key.hash, key.prefix, key.lastFour]
  );
  return { key: mapApiKey(result.rows[0]), token: key.token };
};

export const revokeApiKey = async (
  input: { organizationId: string; apiKeyId: string },
  query: Query = defaultQuery
) => {
  const result = await query(
    "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND organization_id = $2",
    [input.apiKeyId, input.organizationId]
  );
  return Boolean(result.rowCount);
};
