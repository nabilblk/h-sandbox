import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import {
  reinjectCredentialSourceAttachments,
  revokeCredentialSourceAttachments
} from "./services/credential-source-lifecycle.js";
import type {
  detachSandboxCredential,
  rehydrateSandboxCredentials
} from "./services/credential-vault.js";
import type { Query } from "./services/query.js";

const input = {
  organizationId: "org_test",
  sourceType: "harakiri_encrypted" as const,
  sourceRef: "vlt_test",
  actorUserId: "user_admin",
  actorLabel: "admin@example.com",
  reason: "source_disabled" as const
};

const runtimeProvider = {} as RuntimeProvider;
const noop = async () => undefined;

const queryFor = (attachments: Array<{ id: string; sandboxId: string; sandboxStatus: string }>) => {
  const finalized: string[] = [];
  const query: Query = async <T>(text: string, params: unknown[] = []) => {
    if (text.includes("FROM sandbox_credential_attachments attachment")) {
      return { rows: attachments as T[] };
    }
    if (text.includes("UPDATE sandbox_credential_attachments")) {
      finalized.push(String(params[2]));
      return { rows: [] as T[], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { query, finalized };
};

test("source revocation detaches live attachments and finalizes paused metadata", async () => {
  const harness = queryFor([
    { id: "sca_live", sandboxId: "sbx_live", sandboxStatus: "running" },
    { id: "sca_paused", sandboxId: "sbx_paused", sandboxStatus: "paused" }
  ]);
  const detached: string[] = [];
  const events: string[] = [];
  const audits: string[] = [];
  const detach = (async (request: { attachmentId: string; reason?: string }) => {
    detached.push(`${request.attachmentId}:${request.reason}`);
    return { kind: "ok", attachment: {} as never, vault: null };
  }) as typeof detachSandboxCredential;

  const result = await revokeCredentialSourceAttachments(input, {
    query: harness.query,
    runtimeProvider,
    detach,
    recordEvent: async (_organizationId, sandboxId) => { events.push(sandboxId); },
    recordAudit: async (_organizationId, _actorUserId, _actorLabel, _action, _targetType, sandboxId) => {
      audits.push(String(sandboxId));
    }
  });

  assert.deepEqual(result, { kind: "ok", detached: 2 });
  assert.deepEqual(detached, ["sca_live:source_disabled"]);
  assert.deepEqual(harness.finalized, ["sca_paused"]);
  assert.deepEqual(events, ["sbx_paused"]);
  assert.deepEqual(audits, ["sbx_paused"]);
});

test("source revocation fails loudly when a live provider cannot remove a credential", async () => {
  const harness = queryFor([
    { id: "sca_failed", sandboxId: "sbx_live", sandboxStatus: "running" }
  ]);
  const detach = (async () => ({
    kind: "provider_unavailable",
    message: "upstream included super-secret-value"
  })) as typeof detachSandboxCredential;

  const result = await revokeCredentialSourceAttachments(input, {
    query: harness.query,
    runtimeProvider,
    detach,
    recordEvent: noop,
    recordAudit: noop
  });

  assert.equal(result.kind, "incomplete");
  if (result.kind !== "incomplete") return;
  assert.equal(result.detached, 0);
  assert.deepEqual(result.failedAttachmentIds, ["sca_failed"]);
  assert.doesNotMatch(result.message, /super-secret-value/);
  assert.deepEqual(harness.finalized, []);
});

test("source revocation does not claim success during a sandbox transition", async () => {
  const harness = queryFor([
    { id: "sca_resuming", sandboxId: "sbx_resuming", sandboxStatus: "resuming" }
  ]);
  const detach = (async () => ({
    kind: "sandbox_not_running",
    status: "resuming"
  })) as typeof detachSandboxCredential;

  const result = await revokeCredentialSourceAttachments(input, {
    query: harness.query,
    runtimeProvider,
    detach,
    recordEvent: noop,
    recordAudit: noop
  });

  assert.equal(result.kind, "incomplete");
  if (result.kind === "incomplete") assert.deepEqual(result.failedAttachmentIds, ["sca_resuming"]);
  assert.deepEqual(harness.finalized, []);
});

test("source reinjection marks every attachment and rehydrates each active sandbox once", async () => {
  const query: Query = async <T>(text: string, params: unknown[] = []) => {
    assert.match(text, /status = 'requires_reinjection'/);
    assert.match(text, /refresh_attempted_at = NULL/);
    assert.deepEqual(params, ["org_test", "harakiri_encrypted", "vlt_test"]);
    return {
      rows: [
        { id: "sca_one", sandboxId: "sbx_live", sandboxStatus: "running" },
        { id: "sca_two", sandboxId: "sbx_live", sandboxStatus: "running" },
        { id: "sca_paused", sandboxId: "sbx_paused", sandboxStatus: "paused" }
      ] as T[]
    };
  };
  const calls: string[] = [];
  const rehydrate = (async (request: { sandboxId: string }) => {
    calls.push(request.sandboxId);
    return { kind: "ok", attachments: [], vault: null, rehydrated: 2, skipped: 0, failed: 0 };
  }) as typeof rehydrateSandboxCredentials;

  const result = await reinjectCredentialSourceAttachments({
    organizationId: "org_test",
    sourceType: "harakiri_encrypted",
    sourceRef: "vlt_test",
    actorUserId: "user_admin",
    actorLabel: "admin@example.com"
  }, {
    query,
    runtimeProvider,
    rehydrate,
    recordEvent: noop,
    recordAudit: noop
  });

  assert.deepEqual(result, { kind: "ok", marked: 3, rehydrated: 2, deferred: 1 });
  assert.deepEqual(calls, ["sbx_live"]);
});

test("source reinjection fails loudly while leaving marked work retryable", async () => {
  const query: Query = async <T>() => ({
    rows: [{ id: "sca_failed", sandboxId: "sbx_failed", sandboxStatus: "idle" }] as T[]
  });
  const rehydrate = (async () => ({
    kind: "unsupported",
    message: "credential provider unavailable"
  })) as typeof rehydrateSandboxCredentials;

  const result = await reinjectCredentialSourceAttachments({
    organizationId: "org_test",
    sourceType: "external_ref",
    sourceRef: "xsr_test",
    actorUserId: "user_admin",
    actorLabel: "admin@example.com"
  }, {
    query,
    runtimeProvider,
    rehydrate,
    recordEvent: noop,
    recordAudit: noop
  });

  assert.equal(result.kind, "incomplete");
  if (result.kind !== "incomplete") return;
  assert.deepEqual(result.failedSandboxIds, ["sbx_failed"]);
  assert.doesNotMatch(result.message, /credential provider unavailable/);
});
