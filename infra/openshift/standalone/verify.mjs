import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function verifyRuntime(client, { template, record = () => {} }) {
  assert.ok(template, "Select a reviewed, arbitrary-UID-compatible Harakiri image template");
  const { capabilities } = await client.getRuntimeCapabilities();
  const disabled = ["egressPolicy", "credentialVault", "credentialVaultPatch", "credentialVaultSanitizedRead", "lifecyclePause", "lifecycleResume", "lifecycleSnapshot", "createFromSnapshot"];
  for (const name of disabled) assert.equal(capabilities.find((item) => item.name === name)?.state, "unavailable", `${name} must be unavailable before testing this restricted profile`);
  const idempotencyKey = randomUUID();
  record({ stage: "creating", idempotencyKey });
  const sandbox = await client.sandboxes.create({ template, name: "openshift-install-check", ttlSeconds: 600, wait: false, idempotencyKey });
  record({ stage: "created", sandboxId: sandbox.id, idempotencyKey });
  let failure;
  let uid;
  try {
    await sandbox.wait({ timeoutMs: 180000 });
    const result = await sandbox.run("id -u", { timeoutMs: 10000 });
    assert.equal(result.exitCode, 0);
    uid = Number(result.stdout.trim());
    assert.ok(Number.isInteger(uid) && uid > 0, "Sandbox must execute as a non-root UID");
    const bytes = new Uint8Array(1024 * 1024).fill(73);
    await sandbox.files.write("openshift-check.bin", bytes);
    assert.deepEqual(await sandbox.files.readBytes("openshift-check.bin"), bytes);
    record({ stage: "execution-verified", sandboxId: sandbox.id, uid, binaryBytes: bytes.length });
  } catch (error) { failure = error; }
  try {
    await sandbox.kill({ wait: true, timeoutMs: 90000 });
    record({ stage: "terminated", sandboxId: sandbox.id });
  } catch (error) {
    record({ stage: "cleanup-unconfirmed", sandboxId: sandbox.id });
    throw new AggregateError([...(failure ? [failure] : []), error], `Cleanup unconfirmed for ${sandbox.id}; retain the ID and investigate through Harakiri`);
  }
  if (failure) throw failure;
  return { schemaVersion: 1, profile: "openshift-restricted", apiSmoke: "passed", sandboxId: sandbox.id, uid,
    checks: ["capability-discovery", "readiness", "non-root-command", "binary-file-roundtrip", "confirmed-termination"],
    qualification: "pending-browser-admission-and-isolation-checks" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.env.HARAKIRI_OPENSHIFT_TEST, "1", "Set HARAKIRI_OPENSHIFT_TEST=1 only for an approved isolated OpenShift deployment");
    const { HarakiriClient } = await import("@h-sandbox/sdk");
    const client = HarakiriClient.fromEnv({ requestTimeoutMs: 30000 });
    const report = await verifyRuntime(client, { template: process.env.HARAKIRI_TEMPLATE, record: (event) => console.error(JSON.stringify(event)) });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    // SDK errors can contain remote output. Keep it out of shareable acceptance receipts.
    console.error("OpenShift API smoke failed. Preserve the reported sandbox ID/idempotency key and inspect privately; no qualification was granted.");
    process.exitCode = 1;
  }
}
