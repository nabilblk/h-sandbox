import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { callOpenSandbox, OpenSandboxHttpError } from "../../apps/api/src/providers/runtime/opensandbox-client.js";
import { runExecdCommand } from "../../apps/api/src/providers/runtime/opensandbox-execd.js";

const claimName = `harakiri-workspace-smoke-${randomUUID()}`;
const image = process.env.WORKSPACE_SMOKE_IMAGE || "python:3.12-slim";
const evidence = resolve(process.env.WORKSPACE_SMOKE_EVIDENCE || "../../docs/artifacts/workspace-provider");
const sandboxes: string[] = [];
const waitFor = async (id: string, missing = false) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const sandbox = await callOpenSandbox<{ status: { state: string } }>(`/v1/sandboxes/${id}`);
      if (!missing && sandbox.status.state.toLowerCase() === "running") return;
      if (/failed|error/i.test(sandbox.status.state)) throw new Error(`Provider state ${sandbox.status.state}`);
    } catch (error) {
      if (missing && error instanceof OpenSandboxHttpError && error.status === 404) return;
      throw error;
    }
    await delay(1000);
  }
  throw new Error(`Provider ${missing ? "deletion" : "readiness"} timed out`);
};

mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, "claim.json"), JSON.stringify({ claimName, createdAt: new Date().toISOString(), purpose: "disposable-provider-acceptance" }, null, 2));
try {
  for (let run = 0; run < 2; run++) {
    const sandbox = await callOpenSandbox<{ id: string }>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({ image: { uri: image }, entrypoint: ["sleep", "600"], timeout: 600,
        resourceLimits: { cpu: "500m", memory: "512Mi" }, metadata: { "harakiri.test": "persistent-workspace" },
        volumes: [{ name: "workspace", mountPath: "/workspace", readOnly: false,
          pvc: { claimName, createIfNotExists: run === 0, deleteOnSandboxTermination: false, storage: "1Gi", accessModes: ["ReadWriteOnce"] } }]
      })
    });
    sandboxes.push(sandbox.id);
    await waitFor(sandbox.id);
    const result = await runExecdCommand({ opensandboxId: sandbox.id, cwd: "/workspace", timeoutMs: 30000,
      command: run === 0 ? "printf persisted-workspace > /workspace/marker.txt && cat /workspace/marker.txt" : "cat /workspace/marker.txt" });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "persisted-workspace");
    await callOpenSandbox(`/v1/sandboxes/${sandbox.id}`, { method: "DELETE" });
    await waitFor(sandbox.id, true);
    console.log(`Sandbox ${run + 1}: persistence ${run === 0 ? "write" : "reuse"} and deletion passed`);
  }
  writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ passed: true, claimName, sandboxes, image, checkedAt: new Date().toISOString(), retained: true }, null, 2));
} finally {
  for (const id of sandboxes) {
    try { await callOpenSandbox(`/v1/sandboxes/${id}`, { method: "DELETE" }); }
    catch (error) { if (!(error instanceof OpenSandboxHttpError && error.status === 404)) console.error("Cleanup failed for smoke sandbox", id); }
  }
  console.log(`Retained smoke claim: ${claimName}. Operator cleanup is separate from runtime API acceptance.`);
}
