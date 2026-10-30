import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { EventEmitter } from "node:events";
import { ownedDocker, cleanupDocker, compatibility } from "./stack.mjs";
import { publicReceipt, safeFailure } from "./receipt.mjs";
import { runtime } from "./recovery.mjs";
import { inspectImageAudit } from "./image-audit.mjs";
import { adapterFailures, runtimeState, toolResult } from "./diagnostics.mjs";
import { chatWitness } from "./browser.mjs";
import { model } from "../sdk-acceptance/framework.mjs";

const read = name => fs.readFileSync(new URL(name, import.meta.url), "utf8");

test("container operations require cluster and exact run ownership", () => {
  const calls = [];
  const ctx = { identity: { id: "123-1" }, guard() { calls.push("guard"); }, execute(command, args) {
    calls.push(args);
    if (args[0] === "inspect") return JSON.stringify([{ Config: { Labels: { "harakiri.openwebui.acceptance": "123-1" } } }]);
    return "";
  } };
  ownedDocker(ctx, "adapter", ["restart"]);
  assert.equal(calls[0], "guard");
  assert.deepEqual(calls[1], ["inspect", "harakiri-openwebui-adapter-123-1"]);
  assert.deepEqual(calls[2], ["restart", "harakiri-openwebui-adapter-123-1"]);
  assert.throws(() => ownedDocker(ctx, "foreign", ["rm"]));
  ctx.execute = () => JSON.stringify([{ Config: { Labels: { "harakiri.openwebui.acceptance": "other" } } }]);
  assert.throws(() => ownedDocker(ctx, "adapter", ["restart"]), /unrelated/);
  ctx.guard = () => { throw new Error("unowned cluster"); };
  assert.throws(() => cleanupDocker(ctx), /unowned cluster/);
});

test("cleanup never removes an unlabeled or foreign container", () => {
  const calls = [];
  const ctx = { identity: { id: "123-1" }, guard() {}, execute(command, args) {
    calls.push(args);
    if (args[0] === "ps") return "a".repeat(12);
    if (args[0] === "inspect") return JSON.stringify([{ Config: { Labels: { "harakiri.openwebui.acceptance": "other" } } }]);
    assert.fail("Mutation must not occur");
  } };
  assert.throws(() => cleanupDocker(ctx), /ownership changed/);
  assert.equal(calls.length, 2);
});

test("runtime inventory uses the public template identity and excludes terminated sandboxes", async () => {
  const client = { listSandboxes: async () => ({ sandboxes: [{ id: "sbx_owned", template: "owned", status: "running" }, { id: "sbx_dead", template: "owned", status: "terminated" }, { id: "sbx_foreign", template: "other", status: "running" }] }) };
  assert.equal((await runtime(client, "owned")).id, "sbx_owned");
  await assert.rejects(runtime(client, "missing"), /one live owned/);
});

test("receipt cannot publish private identities, bodies, grants or failure text", () => {
  const receipt = publicReceipt({ source: "a".repeat(40), runId: "123-1", status: "failed", token: "PRIVATE",
    results: [{ gate: "native-shell", status: "passed", evidence: { shellInput: true, output: "PRIVATE", bytes: "PRIVATE", fileSha256: "b".repeat(64) } },
      { gate: "native-model-artifacts", status: "failed", failure: { kind: "exception", check: "PRIVATE", message: "PRIVATE" } }, { gate: "PRIVATE" }],
    runnerProcesses: { status: "passed", checks: [{ name: "docker", status: "passed", token: "PRIVATE" }, { name: "PRIVATE" }] } });
  assert.ok(!JSON.stringify(receipt).includes("PRIVATE"));
  assert.deepEqual(receipt.results[0].evidence, { shellInput: true, fileSha256: "b".repeat(64) });
  assert.equal(receipt.openwebui.image, compatibility.openwebui.image);
  assert.equal(receipt.published, false);
});

test("browser exercises real native paths without fulfilling or substituting model responses", () => {
  const source = read("./browser.mjs");
  assert.match(source, /\/auths\/signup/);
  assert.match(source, /terminal_servers\/verify/);
  assert.match(source, /Send message/);
  assert.match(source, /filechooser/);
  assert.match(source, /HTML Preview/);
  assert.match(source, /xterm-helper-textarea/);
  assert.match(source, /Native foreground command started/);
  assert.match(source, /Native JSON preview rendered/);
  assert.match(source, /getImageData/);
  assert.doesNotMatch(source, /\.fulfill\(|routeWebSocket\(|addInitScript\(|mockModel|scripted-model/);
  const stack = read("./stack.mjs");
  assert.doesNotMatch(stack, /skip_verify|NODE_TLS_REJECT_UNAUTHORIZED|--insecure|KUBECONFIG=/);
  assert.match(stack, /model\.digest/);
  assert.match(stack, /--cacert/);
  assert.match(stack, /owned ephemeral registry/);
});

test("optional self-service model uses the qualified image without a host port", () => {
  const compose = read("../../integrations/openwebui/compose.yaml");
  const service = compose.split("  model:\n", 2)[1].split("\nvolumes:", 1)[0];
  assert.ok(service.includes(`image: ${model.image}`));
  assert.match(service, /profiles: \[local-model\]/);
  assert.match(service, /mem_limit: 6g/);
  assert.doesNotMatch(service, /ports:|privileged:|docker\.sock/);
  const guide = read("../../integrations/openwebui/README.md");
  assert.ok(guide.includes(model.digest));
  assert.ok(guide.includes("http://model:11434"));
});

test("mobile acceptance reopens the file after the native responsive remount", () => {
  const source = read("./files.mjs").split('await page.setViewportSize({ width: 390', 2)[1];
  assert.ok(source.indexOf('getByText("isolation.svg"') < source.indexOf('getByText("Synthetic SVG preview"'));
  assert.match(source, /preview\.x \+ preview\.width <= 390/);
  assert.match(source, /preview\.y \+ preview\.height <= 844/);
});

test("upload failure is an explicit pre-dispatch network fault, not a fake response or partial-write claim", () => {
  const source = read("./files.mjs");
  assert.match(source, /Fetch\.failRequest/);
  assert.match(source, /errorReason: "ConnectionReset"/);
  assert.match(source, /Fetch\.disable/);
  assert.match(source, /failureBeforeDispatch: true/);
  assert.doesNotMatch(source, /Fetch\.fulfillRequest|\.fulfill\(|emulateNetworkConditions/);
});

test("revocation first proves a working reattached shell without relying on prompt replay", () => {
  const source = read("./recovery.mjs");
  const marker = source.indexOf('output.includes("REVOCATION_READY")');
  assert.ok(marker > 0 && source.indexOf("await client.routes.delete", marker) > marker);
  assert.match(source, /printf 'REVOCATION_%s/);
});

test("failure diagnostics retain only bounded non-sensitive categories", () => {
  assert.deepEqual(safeFailure({ kind: "browser", reason: "ambiguous_locator", message: "PRIVATE" }), { kind: "browser", reason: "ambiguous_locator" });
  assert.deepEqual(safeFailure({ kind: "PRIVATE", reason: "PRIVATE", type: "PRIVATE", status: "PRIVATE" }), { kind: "withheld" });
  assert.deepEqual(safeFailure({ kind: "http", status: 429 }), { kind: "http", status: 429 });
  assert.deepEqual(safeFailure({ kind: "acceptance_check", check: "Native cold-start file listing failed" }), { kind: "acceptance_check", check: "Native cold-start file listing failed" });
  assert.deepEqual(safeFailure({ kind: "acceptance_check", check: "PRIVATE" }), { kind: "acceptance_check" });
});

test("native tool witness counts item and snapshot events without retaining output", () => {
  const page = new EventEmitter();
  const witness = chatWitness(page);
  const socket = new EventEmitter();
  socket.url = () => "ws://127.0.0.1:28580/ws/socket.io/?transport=websocket";
  page.emit("websocket", socket);
  const item = { type: "function_call_output", call_id: "PRIVATE", status: "failed", output: [{ text: "PRIVATE" }] };
  for (const data of [{ item }, { output: [item], done: true }]) {
    socket.emit("framereceived", { payload: `42${JSON.stringify(["chat-events", { data: { type: "response:completion", data } }])}` });
  }
  assert.equal(witness.state.toolCalls, 1);
  assert.equal(witness.state.toolFailures, 1);
  assert.equal(witness.state.completed, true);
  assert.ok(!JSON.stringify(witness.state).includes("PRIVATE"));
  assert.equal(witness.output(), "");
  page.emit("pageerror", new Error("PRIVATE"));
  assert.equal(witness.state.browserErrors, 1);
  assert.ok(!JSON.stringify(witness.state).includes("PRIVATE"));
});

test("a completed tool wrapper does not hide a failed process", () => {
  const page = new EventEmitter();
  const witness = chatWitness(page);
  const socket = new EventEmitter();
  socket.url = () => "ws://127.0.0.1:28580/ws/socket.io/?transport=websocket";
  page.emit("websocket", socket);
  const item = { type: "function_call_output", call_id: "PRIVATE", status: "completed",
    output: [{ type: "input_text", text: JSON.stringify({ exit_code: 127, command: "PRIVATE" }) }] };
  socket.emit("framereceived", { payload: `42${JSON.stringify(["chat-events", { data: { type: "response:completion", data: { item } } }])}` });
  assert.equal(witness.state.toolCalls, 1);
  assert.equal(witness.state.toolFailures, 1);
  assert.ok(!JSON.stringify(witness.state).includes("PRIVATE"));
});

test("runtime diagnostics never export source logs, identifiers or unknown failure fields", () => {
  assert.deepEqual(adapterFailures('PRIVATE\n{"failure":"PRIVATE"}\n{"failure":"context_busy","upstreamStatus":409,"message":"PRIVATE"}'),
    [{ code: "context_busy", status: 409 }]);
  const result = runtimeState({ metadata: { name: "PRIVATE" }, status: { phase: "Failed", containerStatuses: [
    { name: "PRIVATE", ready: false, state: { terminated: { reason: "Error", exitCode: 1, message: "PRIVATE" } } }
  ] } }, "PRIVATE: Permission denied for PRIVATE");
  assert.deepEqual(result, { phase: "Failed", containers: [{ ready: false, reason: "Error", exitCode: 1 }], errors: ["Permission denied"] });
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("tool diagnostics distinguish process failure without publishing arguments or output", () => {
  assert.deepEqual(toolResult({ status: "completed", output: [{ type: "input_text", text: JSON.stringify({
    command: "PRIVATE", status: "completed", exit_code: 1, output: "PRIVATE: No such file or directory"
  }) }] }), { failed: false, exitCodes: [1], states: ["completed"], errors: ["No such file or directory"] });
  assert.deepEqual(toolResult({ output: [{ type: "input_text", text: '{"error":"PRIVATE"}' }] }),
    { failed: true, exitCodes: [], states: [], errors: [] });
  assert.deepEqual(toolResult({ status: "completed", output: [{ type: "input_text", text: JSON.stringify({
    status: "done", exit_code: 1, output: "Traceback PRIVATE\nNameError: PRIVATE is not defined"
  }) }] }), { failed: false, exitCodes: [1], states: ["done"], errors: ["Traceback", "NameError"] });
});

test("a failed model gate stays failed while independent native checks continue", () => {
  const source = read("./run.mjs");
  assert.match(source, /scenarioFailed = true/);
  assert.match(source, /status: "failed", failure: publicFailure\(error\)/);
  assert.match(source, /receipt\.status = scenarioFailed \? "failed" : "configured_gates_passed"/);
  const model = source.indexOf('await scenario("native-model-artifacts"');
  const stop = source.indexOf('name: "Stop", exact: true', model);
  assert.ok(model > 0 && stop > model && source.indexOf('await scenario("native-shell"', stop) > stop);
  assert.doesNotMatch(source, /files\.write\(|commands\.run\(/);
});

test("workflow is read-only, hosted-only, bounded, cleanup-always with explicit public artifact paths", () => {
  const source = read("../../.github/workflows/openwebui-acceptance.yml");
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /head\.repo\.full_name == github\.repository/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /contents: read/);
  for (const dependency of ["apps/api/**", "packages/sdk/**", "packages/shared/**", "pnpm-lock.yaml", "infra/acceptance/**", "infra/sdk-acceptance/framework.mjs"])
    assert.ok(source.includes(`"${dependency}"`), `Native qualification must follow ${dependency}`);
  assert.match(source, /timeout-minutes: 90/);
  assert.match(source, /if: always\(\)\s+run: node infra\/openwebui-acceptance\/cleanup.mjs/);
  assert.match(source, /if: always\(\)\s+run: node infra\/acceptance\/cleanup.mjs/);
  assert.match(source, /path: \|\s+standalone-acceptance-report.json\s+openwebui-report-desktop.png\n/);
  assert.doesNotMatch(source, /secrets\.|pull_request_target|packages: write|id-token: write|npm publish|self-hosted/);
  for (const match of source.matchAll(/uses: (.+)/g)) assert.match(match[1], /^[\w/-]+@[a-f0-9]{40} # v4$/);
});

test("native cleanup stops request producers before releasing owned resources", () => {
  const source = read("./run.mjs").split("await finishReceipt(receipt,", 2)[1];
  for (const [before, after] of [["chatBrowser:", "adapter:"], ["adapter:", "runtimes:"], ["runtimes:", "workspaces:"], ["key:", "browser:"]]) {
    assert.ok(source.indexOf(before) >= 0 && source.indexOf(before) < source.indexOf(after));
  }
  assert.match(source, /Owned workspace released before archival/);
});

test("all native modules parse without executing the destructive entrypoint", () => {
  for (const filename of fs.readdirSync(import.meta.dirname).filter(name => name.endsWith(".mjs"))) {
    execFileSync(process.execPath, ["--check", path.join(import.meta.dirname, filename)], { stdio: "pipe" });
  }
});

test("image scan fails closed on missing reports and retains unfixed inventory", () => {
  for (const report of [null, {}, { SchemaVersion: 2, Results: [] }]) assert.throws(() => inspectImageAudit(report));
  const result = inspectImageAudit({ SchemaVersion: 2, ArtifactName: "candidate", Results: [{ Vulnerabilities: [
    { Severity: "HIGH", FixedVersion: "1.1", VulnerabilityID: "CVE-fixture", PkgName: "fixture", InstalledVersion: "1.0" },
    { Severity: "CRITICAL", FixedVersion: "" }, { Severity: "LOW", FixedVersion: "2" }
  ] }] });
  assert.equal(result.total, 3);
  assert.equal(result.serious, 2);
  assert.equal(result.fixableSerious, 1);
});
