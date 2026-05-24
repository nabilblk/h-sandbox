import assert from "node:assert/strict";
import test from "node:test";
import { recordAuditEvent } from "./audit.js";

test("recordAuditEvent redacts metadata and accepts system actors", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: [], rowCount: 0 };
    }
  };

  await recordAuditEvent(
    {
      organizationId: "00000000-0000-0000-0000-000000000001",
      actorUserId: null,
      actorLabel: "harakiri-template-builder",
      action: "template.build.success",
      targetType: "template_build",
      targetId: "bld_123",
      metadata: {
        templateId: "tpl_123",
        registry_password: "super-secret"
      }
    },
    client
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO audit_events/);
  assert.equal(calls[0].params[1], null);
  assert.equal(calls[0].params[2], "harakiri-template-builder");
  assert.deepEqual(calls[0].params[6], {
    templateId: "tpl_123",
    registry_password: "[redacted]"
  });
});
