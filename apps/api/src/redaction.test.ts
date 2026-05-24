import assert from "node:assert/strict";
import test from "node:test";
import { appendBuildLog } from "./build-logs.js";
import { REDACTED, isSensitiveKey, redactRecord, redactText } from "./redaction.js";

test("redactText removes API keys, bearer tokens, assignments, and URL passwords", () => {
  const input = [
    "hk_live_secretvalue",
    "Authorization: Bearer abc.def.ghi",
    "OPEN-SANDBOX-API-KEY=super-secret",
    "postgres://user:password@db/harakiri"
  ].join(" ");

  const redacted = redactText(input);

  assert(!redacted.includes("hk_live_secretvalue"));
  assert(!redacted.includes("abc.def.ghi"));
  assert(!redacted.includes("super-secret"));
  assert(!redacted.includes("user:password@"));
  assert(redacted.includes(REDACTED));
});

test("redactRecord redacts sensitive keys recursively while preserving shape", () => {
  assert.equal(isSensitiveKey("registry_password"), true);
  assert.deepEqual(
    redactRecord({
      normal: "value",
      registry_password: "pw",
      nested: {
        apiToken: "token",
        command: "curl -H 'x-api-key: hk_test_nested' https://example.test"
      }
    }),
    {
      normal: "value",
      registry_password: REDACTED,
      nested: {
        apiToken: REDACTED,
        command: `curl -H 'x-api-key=${REDACTED}' https://example.test`
      }
    }
  );
});

test("appendBuildLog stores redacted messages", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const client = {
    async query(text: string, params: unknown[]) {
      calls.push({ text, params });
      if (text.includes("COALESCE")) return { rows: [{ next: 3 }] };
      return { rows: [] };
    }
  };

  await appendBuildLog(client as never, "bld_secret", "stderr", "failed with token=secret-value and hk_live_abc123");

  const insert = calls.at(-1);
  assert(insert);
  assert.equal(insert.params[0], "bld_secret");
  assert.equal(insert.params[1], 3);
  assert.equal(insert.params[2], "stderr");
  assert.equal(insert.params[3], `failed with token=${REDACTED} and ${REDACTED}`);
});
