import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { recoveryFiles, telemetryComponents, verifyRecoverySet } from "./recovery-contracts.mjs";
import { coldRecovery } from "./recovery.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(recoveryFiles.map(name => [name, Buffer.from(`synthetic-${name}`)]));
const identity = { runId: "12345-1", source: "a".repeat(40) };
const manifest = {
  version: 1, ...identity, recoveryPoint: "2026-11-10T00:00:00.000Z", tenantMappingSha256: hash("mapping"),
  files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)])),
  volumes: Object.fromEntries(telemetryComponents.map(name => [name, {
    name: `state-harakiri-observe-${name}-0`, uid: "12345678-1234-1234-1234-123456789abc"
  }]))
};

test("coordinated recovery requires a complete same-run, same-source checksummed set", () => {
  verifyRecoverySet(manifest, name => files[name], identity);
  for (const field of ["runId", "source"]) {
    assert.throws(() => verifyRecoverySet({ ...manifest, [field]: "other" }, name => files[name], identity), /identity/);
  }
  for (const name of recoveryFiles) {
    assert.throws(() => verifyRecoverySet(manifest, file => file === name ? Buffer.from("changed") : files[file], identity), /checksum/);
    const copy = structuredClone(manifest);
    delete copy.files[name];
    assert.throws(() => verifyRecoverySet(copy, file => files[file], identity), /identity/);
  }
  const extra = { ...manifest, files: { ...manifest.files, "../private": hash("unexpected") } };
  assert.throws(() => verifyRecoverySet(extra, () => assert.fail("Must reject before reading files"), identity), /identity/);
});

test("recovery cannot select an unrelated volume or omit tenant mapping evidence", () => {
  for (const component of telemetryComponents) {
    const copy = structuredClone(manifest);
    copy.volumes[component].name = "user-workspace";
    assert.throws(() => verifyRecoverySet(copy, name => files[name], identity), /volume identity/);
  }
  assert.throws(() => verifyRecoverySet({ ...manifest, tenantMappingSha256: "" }, name => files[name], identity), /identity/);
  for (const value of ["", undefined, "---", "a".repeat(39)]) {
    assert.throws(() => verifyRecoverySet({ ...manifest, source: value }, name => files[name], { ...identity, source: value }), /identity/);
  }
  assert.throws(() => verifyRecoverySet({ ...manifest, recoveryPoint: "yesterday" }, name => files[name], identity), /identity/);
});

test("cold recovery rejects an unowned cluster before API, database or filesystem access", async () => {
  const error = new Error("unowned cluster");
  await assert.rejects(coldRecovery({ guard() { throw error; } }, {
    get client() { assert.fail("No client call before cluster ownership"); }
  }), cause => cause === error);
});
