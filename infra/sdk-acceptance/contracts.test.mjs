import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runnerIdentity } from "../acceptance/safety.mjs";
import { fixtureFailureLocation, sdkGateReceipt, sdkGates } from "./receipt.mjs";

test("SDK acceptance rejects the local host and self-hosted runners", () => {
  assert.throws(() => runnerIdentity({}, "darwin", "arm64"));
  assert.throws(() => runnerIdentity({ GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" }, "linux", "x64"));
});

test("public SDK evidence cannot include clients, credentials or arbitrary gate names", () => {
  assert.equal(new Set(sdkGates).size, sdkGates.length);
  for (const name of sdkGates) assert.deepEqual(sdkGateReceipt(name, 12, { token: "never-exported" }), { gate: name, status: "passed", durationMs: 12 });
  assert.throws(() => sdkGateReceipt("token-containing-name", 12));
  assert.throws(() => sdkGateReceipt(sdkGates[0], -1));
});

test("the installed runtime fixture uses only the public package and no local cluster access", () => {
  const source = fs.readFileSync(new URL("./workflows.mjs", import.meta.url), "utf8");
  assert.match(source, /from "@h-sandbox\/sdk"/);
  assert.doesNotMatch(source, /from ["']\.\.?\//);
  assert.doesNotMatch(source, /child_process|kubectl|k0s|KUBECONFIG|process\.env/);
  assert.match(source, /wait: true, timeoutMs: 180000/);
  assert.match(source, /deletionRequested\.has\(sandbox\.id\)/);
  assert.match(source, /retained\.waitForTermination\(\{ timeoutMs: 240000 \}\)/);
});

test("failure location exports only numeric fixture coordinates, never paths or exception content", () => {
  assert.deepEqual(fixtureFailureLocation({ stack: "credential-value at file:///private/path/sdk-workflows.mjs:31:9" }), { fixtureLine: 31, fixtureColumn: 9 });
  assert.deepEqual(fixtureFailureLocation({ stack: "credential-value at file:///other/module.mjs:8:12" }), {});
  assert.deepEqual(fixtureFailureLocation(new Error("withheld")), {});
  const failure = new AggregateError([new Error("cleanup-secret")], "private-message", {
    cause: { stack: "original-secret at file:///private/sdk-workflows.mjs:142:7" }
  });
  failure.stack = "private-path at file:///private/sdk-workflows.mjs:171:32";
  assert.deepEqual(fixtureFailureLocation(failure), {
    fixtureLine: 171, fixtureColumn: 32, cause: { fixtureLine: 142, fixtureColumn: 7 }
  });
});
