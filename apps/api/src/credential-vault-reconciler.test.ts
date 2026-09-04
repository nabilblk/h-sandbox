import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import {
  claimCredentialInspectionWork,
  claimCredentialReconciliationWork,
  reconcileCredentialVault
} from "./services/credential-vault-reconciler.js";
import {
  inspectSandboxCredentials,
  refreshSandboxCredential,
  rehydrateSandboxCredentials
} from "./services/credential-vault.js";

const runtimeProvider: RuntimeProvider = {
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    credentialVault: true,
    credentialVaultPatch: true,
    credentialVaultSanitizedRead: true
  },
  create: async () => { throw new Error("not used"); },
  list: async () => [],
  get: async () => null,
  delete: async () => undefined,
  renew: async () => undefined,
  run: async () => { throw new Error("not used"); },
  files: async () => { throw new Error("not used"); },
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async () => { throw new Error("not used"); }
};

test("claimCredentialReconciliationWork atomically leases a bounded due batch", async () => {
  let statement = "";
  let parameters: unknown[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    statement = text;
    parameters = params;
    return {
      rows: [{
        organizationId: "org_1",
        sandboxId: "sbx_1",
        attachmentId: "sca_1",
        status: "injected"
      }]
    };
  };

  const work = await claimCredentialReconciliationWork(query as never, 7);

  assert.equal(work.length, 1);
  assert.deepEqual(parameters, [7, 300, 60]);
  assert.match(statement, /FOR UPDATE OF attachment SKIP LOCKED/);
  assert.match(statement, /refresh_attempted_at = now\(\)/);
  assert.match(statement, /source_type = 'dynamic'/);
  assert.match(statement, /status = 'requires_reinjection'/);
});

test("claimCredentialInspectionWork leases active sandboxes at a bounded interval", async () => {
  let statement = "";
  let parameters: unknown[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    statement = text;
    parameters = params;
    return { rows: [{ organizationId: "org_1", sandboxId: "sbx_1" }] };
  };

  const work = await claimCredentialInspectionWork(query as never, 4);

  assert.deepEqual(work, [{ organizationId: "org_1", sandboxId: "sbx_1" }]);
  assert.deepEqual(parameters, [4, 300]);
  assert.match(statement, /FOR UPDATE OF sandbox SKIP LOCKED/);
  assert.match(statement, /provider_checked_at = now\(\)/);
  assert.match(statement, /sandbox\.status IN \('running', 'idle'\)/);
});

test("reconcileCredentialVault refreshes dynamic work and rehydrates each stale sandbox once", async () => {
  const refreshed: string[] = [];
  const rehydrated: string[] = [];
  const query = async (text: string) => {
    if (!text.includes("WITH candidates AS")) throw new Error(`unexpected query: ${text}`);
    return {
      rows: [
        { organizationId: "org_1", sandboxId: "sbx_dynamic", attachmentId: "sca_dynamic", status: "injected" },
        { organizationId: "org_1", sandboxId: "sbx_stale", attachmentId: "sca_stale_1", status: "requires_reinjection" },
        { organizationId: "org_1", sandboxId: "sbx_stale", attachmentId: "sca_stale_2", status: "requires_reinjection" }
      ]
    };
  };
  const refresh = (async (input: { attachmentId: string }) => {
    refreshed.push(input.attachmentId);
    return { kind: "ok", attachment: {} as never, vault: {} as never };
  }) as typeof refreshSandboxCredential;
  const rehydrate = (async (input: { sandboxId: string }) => {
    rehydrated.push(input.sandboxId);
    return { kind: "ok", attachments: [], vault: null, rehydrated: 2, skipped: 0, failed: 0 };
  }) as typeof rehydrateSandboxCredentials;

  const report = await reconcileCredentialVault({
    query: query as never,
    runtimeProvider,
    refresh,
    rehydrate,
    recordEvent: async () => undefined,
    recordAudit: async () => undefined
  });

  assert.deepEqual(refreshed, ["sca_dynamic"]);
  assert.deepEqual(rehydrated, ["sbx_stale"]);
  assert.deepEqual(report, {
    claimed: 3,
    inspectionClaimed: 0,
    inspected: 0,
    refreshed: 1,
    rehydrated: 2,
    skipped: 0,
    failed: 0,
    errors: []
  });
});

test("reconcileCredentialVault inspects provider state before claiming reinjection work", async () => {
  const sequence: string[] = [];
  const providerWithInspection: RuntimeProvider = {
    ...runtimeProvider,
    getCredentialVault: async () => ({ revision: 1, credentials: [], bindings: [] })
  };
  const query = async (text: string) => {
    if (text.includes("SET provider_checked_at = now()")) {
      return { rows: [{ organizationId: "org_1", sandboxId: "sbx_missing" }] };
    }
    if (text.includes("SET refresh_attempted_at = now()")) {
      assert.deepEqual(sequence, ["inspect"]);
      return {
        rows: [{
          organizationId: "org_1",
          sandboxId: "sbx_missing",
          attachmentId: "sca_missing",
          status: "requires_reinjection"
        }]
      };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  const inspect = (async () => {
    sequence.push("inspect");
    return { kind: "ok", attachments: [], vault: { revision: 1, credentials: [], bindings: [] } };
  }) as typeof inspectSandboxCredentials;
  const rehydrate = (async () => {
    sequence.push("rehydrate");
    return { kind: "ok", attachments: [], vault: null, rehydrated: 1, skipped: 0, failed: 0 };
  }) as typeof rehydrateSandboxCredentials;

  const report = await reconcileCredentialVault({
    query: query as never,
    runtimeProvider: providerWithInspection,
    inspect,
    rehydrate,
    recordEvent: async () => undefined,
    recordAudit: async () => undefined
  });

  assert.deepEqual(sequence, ["inspect", "rehydrate"]);
  assert.equal(report.inspectionClaimed, 1);
  assert.equal(report.inspected, 1);
  assert.equal(report.rehydrated, 1);
});

test("reconcileCredentialVault reports failed work without leaking provider errors", async () => {
  const query = async () => ({
    rows: [{ organizationId: "org_1", sandboxId: "sbx_1", attachmentId: "sca_1", status: "injected" }]
  });
  const refresh = (async () => {
    throw new Error("provider refresh failed for token [REDACTED]");
  }) as typeof refreshSandboxCredential;

  const report = await reconcileCredentialVault({
    query: query as never,
    runtimeProvider,
    refresh,
    recordEvent: async () => undefined,
    recordAudit: async () => undefined
  });

  assert.equal(report.failed, 1);
  assert.equal(report.errors[0], "sca_1: credential reconciliation failed");
});
