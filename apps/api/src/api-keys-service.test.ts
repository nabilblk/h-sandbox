import assert from "node:assert/strict";
import test from "node:test";
import { createApiKeyRecord, listApiKeys, revokeApiKey } from "./services/api-keys.js";

test("listApiKeys scopes keys by organization and preserves response shape", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const keys = await listApiKeys(
    { organizationId: "org_keys" },
    async (text, params) => {
      calls.push({ text, params });
      return {
        rowCount: 1,
        rows: [{
          id: "key_1",
          name: "cli",
          prefix: "hk_live_abc",
          lastFour: "wxyz",
          createdAt: "2026-05-24T12:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null
        }] as never[]
      };
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /FROM api_keys WHERE organization_id = \$1/);
  assert.deepEqual(calls[0].params, ["org_keys"]);
  assert.deepEqual(keys, [{
    id: "key_1",
    name: "cli",
    prefix: "hk_live_abc",
    lastFour: "wxyz",
    createdAt: "2026-05-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null
  }]);
});

test("createApiKeyRecord stores only hash metadata and returns the one-time token", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createApiKeyRecord(
    { organizationId: "org_keys", name: "automation" },
    {
      keyFactory: () => ({
        token: "hk_live_returned_once",
        hash: "sha256-token",
        prefix: "hk_live_retu",
        lastFour: "once"
      }),
      query: async (text, params) => {
        calls.push({ text, params });
        return {
          rowCount: 1,
          rows: [{
            id: "key_new",
            name: "automation",
            prefix: "hk_live_retu",
            lastFour: "once",
            createdAt: "2026-05-24T12:00:00.000Z"
          }] as never[]
        };
      }
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO api_keys/);
  assert.deepEqual(calls[0].params, ["org_keys", "automation", "sha256-token", "hk_live_retu", "once"]);
  assert.deepEqual(result, {
    key: {
      id: "key_new",
      name: "automation",
      prefix: "hk_live_retu",
      lastFour: "once",
      createdAt: "2026-05-24T12:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null
    },
    token: "hk_live_returned_once"
  });
});

test("revokeApiKey scopes revocation by organization", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const revoked = await revokeApiKey(
    { organizationId: "org_keys", apiKeyId: "key_revoke" },
    async (text, params) => {
      calls.push({ text, params });
      return { rowCount: 1, rows: [] as never[] };
    }
  );

  assert.equal(revoked, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /UPDATE api_keys SET revoked_at = now\(\)/);
  assert.deepEqual(calls[0].params, ["key_revoke", "org_keys"]);
});
