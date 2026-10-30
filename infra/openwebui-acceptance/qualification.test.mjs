import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { gates } from "./receipt.mjs";
import { compatibility, model } from "./stack.mjs";

const cleanupNames = ["chatBrowser", "adapter", "runtimes", "workspaces", "key", "browser", "docker", "portForwards"];

function verify(receipt, record) {
  assert.equal(receipt.kind, "openwebui-native");
  assert.equal(receipt.published, false);
  assert.equal(receipt.architecture, "amd64");
  assert.equal(receipt.status, "configured_gates_passed");
  assert.match(receipt.source, /^[a-f0-9]{40}$/);
  assert.match(receipt.runId, /^\d+-\d+$/);
  assert.equal(receipt.source, record.source);
  assert.equal(receipt.runId, record.runId);
  assert.equal(record.workflowUrl, `https://github.com/nabilblk/h-sandbox/actions/runs/${receipt.runId.split("-")[0]}`);
  assert.deepEqual(receipt.openwebui, compatibility.openwebui);
  assert.deepEqual(receipt.openTerminal, compatibility.openTerminal);
  assert.deepEqual(receipt.model, model);
  assert.equal(receipt.results.length, gates.size);
  assert.deepEqual(new Set(receipt.results.map(result => result.gate)), gates);
  for (const result of receipt.results) assert.equal(result.status, "passed", result.gate);
  for (const name of ["api", "apiWithRegistryCa", "web", "adapter", "terminal"])
    assert.match(receipt.images[name].imageConfigDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(receipt.runnerProcesses.status, "passed");
  assert.equal(receipt.runnerProcesses.checks.length, cleanupNames.length);
  assert.deepEqual(new Set(receipt.runnerProcesses.checks.map(check => check.name)), new Set(cleanupNames));
  for (const check of receipt.runnerProcesses.checks) assert.equal(check.status, "passed", check.name);
  assert.deepEqual(receipt.cleanup, { status: "passed", privateMaterialRemoved: true });
}

test("recorded native qualification matches a complete retained source receipt, never a release claim", () => {
  const record = compatibility.nativeAcceptance;
  if (record === null) {
    assert.equal(compatibility.status, "candidate-not-qualified");
    return;
  }
  assert.equal(compatibility.status, "source-qualified-unreleased");
  assert.match(record.receipt, /^docs\/operations\/evidence\/openwebui-\d+\.json$/);
  const bytes = fs.readFileSync(new URL(`../../${record.receipt}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), record.receiptSha256);
  verify(JSON.parse(bytes), record);
});

test("partial runs, missing cleanup and changed upstream pins cannot qualify the integration", () => {
  const receipt = {
    kind: "openwebui-native", published: false, architecture: "amd64", status: "configured_gates_passed",
    source: "a".repeat(40), runId: "123-1", openwebui: compatibility.openwebui,
    openTerminal: compatibility.openTerminal, model,
    results: [...gates].map(gate => ({ gate, status: "passed" })),
    images: Object.fromEntries(["api", "apiWithRegistryCa", "web", "adapter", "terminal"].map(name =>
      [name, { imageConfigDigest: `sha256:${"b".repeat(64)}` }])),
    runnerProcesses: { status: "passed", checks: cleanupNames.map(name => ({ name, status: "passed" })) },
    cleanup: { status: "passed", privateMaterialRemoved: true }
  };
  const record = { source: receipt.source, runId: receipt.runId, workflowUrl: "https://github.com/nabilblk/h-sandbox/actions/runs/123" };
  verify(receipt, record);
  for (const mutate of [
    value => { value.status = "failed"; },
    value => { value.results.pop(); },
    value => { value.results[0].status = "failed"; },
    value => { value.results[0].gate = value.results[1].gate; },
    value => { value.runnerProcesses.checks.pop(); },
    value => { value.runnerProcesses.checks[0].status = "failed"; },
    value => { value.cleanup.privateMaterialRemoved = false; },
    value => { value.openwebui.version = "unqualified"; },
    value => { value.model.digest = "unqualified"; },
    value => { value.published = true; }
  ]) {
    const invalid = structuredClone(receipt);
    mutate(invalid);
    assert.throws(() => verify(invalid, record));
  }
});
