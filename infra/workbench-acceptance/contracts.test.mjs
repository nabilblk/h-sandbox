import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { AcceptanceCheckError } from "../acceptance/context.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { installWorkbenchCandidate } from "./candidate.mjs";
import { apiUrl, workbenchUrl, binaryFixture, verifyBytes, ptySize, assertMetrics, scopedAttachHeaders, probeKey } from "./fixtures.mjs";
import { watchTerminal } from "./browser.mjs";
import { publicReceipt } from "./receipt.mjs";

const source = "a".repeat(40);
const read = name => fs.readFileSync(new URL(name, import.meta.url), "utf8");

function candidateContext(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-contract-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previous = process.env.GITHUB_SHA;
  process.env.GITHUB_SHA = source;
  t.after(() => { if (previous === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = previous; });
  t.mock.method(globalThis, "fetch", async url => {
    assert.ok(["http://127.0.0.1:28482/health", "http://127.0.0.1:28480"].includes(url));
    return new Response(null, { status: 200 });
  });
  const calls = [], saved = {};
  const values = { image: { api: { tag: "baseline-api" }, web: { tag: "baseline-web" } },
    config: { AUTH_DEV_ALLOW: "0", KEYCLOAK_ISSUER: "private-issuer", OPEN_SANDBOX_BASE_URL: "private-runtime", TEMPLATE_BUILDER_JOB_IMAGE: "baseline-api", CREDENTIAL_VAULT_KEY: "private-value" },
    secret: { existingSecret: "private-secret" }, registry: { enabled: false }, web: { resources: { limits: { memory: "128Mi" } } } };
  const ctx = {
    identity: { id: "123-1" }, file: name => path.join(directory, name),
    guard() { calls.push(["guard"]); },
    execute(command, args) {
      assert.ok(calls.some(([name]) => name === "guard"));
      calls.push([command, args]);
      if (command === "git") return source;
      if (args.includes("inspect")) return `sha256:${(args.at(-1).includes("-web:") ? "c" : "b").repeat(64)}`;
      if (args.includes("save")) fs.writeFileSync(args[args.indexOf("--output") + 1], "private archive");
      return "";
    },
    read(name) {
      if (name === "artifact-manifest.json") return { charts: { harakiri: { archive: "verified-baseline.tgz" } } };
      assert.equal(name, "harakiri-values.json");
      return values;
    },
    save(name, value) { saved[name] = value; },
    helm(args) { calls.push(["helm", args]); },
    k(args) {
      calls.push(["kubectl", args]);
      return JSON.stringify({ items: ["api", "web", "scheduler", "template-builder"].map(name => ({
        metadata: { labels: { "app.kubernetes.io/component": name } },
        spec: { containers: [{ name, image: `localhost/harakiri/harakiri-${name === "web" ? "web" : "api"}:workbench-123-1`, imagePullPolicy: "Never" }] },
        status: { containerStatuses: [{ name, ready: true }] }
      })) });
    },
    async forwardAll() { calls.push(["forward"]); }
  };
  return { ctx, calls, saved, values, directory };
}

test("candidate refuses commands before ownership validation", async () => {
  const denied = new Error("unowned cluster");
  await assert.rejects(installWorkbenchCandidate({ guard() { throw denied; }, execute() { assert.fail("unguarded command"); } }), error => error === denied);
});

test("candidate requires exact checkout identity before any image build", async t => {
  const { ctx, calls } = candidateContext(t);
  process.env.GITHUB_SHA = "main";
  await assert.rejects(installWorkbenchCandidate(ctx), /exact source SHA/);
  assert.deepEqual(calls, [["guard"]]);
  process.env.GITHUB_SHA = "d".repeat(40);
  await assert.rejects(installWorkbenchCandidate(ctx), /does not match/);
  assert.equal(calls.some(([name]) => name === "docker"), false);
});

test("both source images stay runner-local and preserve generated values and chart", async t => {
  const { ctx, calls, saved, values, directory } = candidateContext(t);
  const before = structuredClone(values);
  const result = await installWorkbenchCandidate(ctx);
  assert.equal(result.source, source);
  assert.equal(result.published, false);
  const builds = calls.filter(([cmd, args]) => cmd === "docker" && args[0] === "build");
  assert.equal(builds.length, 2);
  for (const [index, name] of ["api", "web"].entries()) {
    assert.ok(builds[index][1].includes(`apps/${name}/Dockerfile`));
    assert.ok(builds[index][1].includes("--platform=linux/amd64"));
    assert.ok(builds[index][1].includes(`org.opencontainers.image.revision=${source}`));
    assert.equal(result.images[name].reference, `localhost/harakiri/harakiri-${name}:workbench-123-1`);
    assert.match(result.images[name].imageConfigDigest, /^sha256:[a-f0-9]{64}$/);
  }
  assert.deepEqual(values, before, "baseline must not be mutated");
  const candidate = saved["workbench-values.json"];
  assert.equal(candidate.image.pullPolicy, "Never");
  assert.equal(candidate.image.api.tag, "workbench-123-1");
  assert.equal(candidate.image.web.tag, "workbench-123-1");
  // These are the exact harakiri.image.api/web helper substitutions.
  for (const name of ["api", "web"]) assert.equal(`${candidate.image.registry}/${candidate.image.repository}/${candidate.image[name].name}:${candidate.image[name].tag}`, result.images[name].reference);
  assert.equal(candidate.config.TEMPLATE_BUILDER_JOB_IMAGE, result.images.api.reference);
  const restored = structuredClone(candidate);
  restored.image = before.image;
  restored.config.TEMPLATE_BUILDER_JOB_IMAGE = before.config.TEMPLATE_BUILDER_JOB_IMAGE;
  assert.deepEqual(restored, before);
  assert.ok(calls.find(([name]) => name === "helm")[1].includes(path.join(directory, "verified-baseline.tgz")));
  assert.equal(calls.filter(([name]) => name === "sudo").length, 2);
  for (let index = 0; index < calls.length; index++) {
    if (calls[index][0] === "sudo") assert.equal(calls[index - 1][0], "guard");
  }
  assert.ok(calls.every(([, args = []]) => !args.includes("push") && !args.includes("publish")));
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("lost ownership blocks containerd import and removes the exported archive", async t => {
  const { ctx, calls, directory } = candidateContext(t);
  let checks = 0;
  ctx.guard = () => { calls.push(["guard"]); if (++checks === 3) throw new Error("ownership changed"); };
  await assert.rejects(installWorkbenchCandidate(ctx), /ownership changed/);
  assert.equal(calls.some(([name]) => name === "sudo" || name === "helm"), false);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("candidate cannot pass with published or missing workload pods", async t => {
  const { ctx } = candidateContext(t);
  ctx.k = () => JSON.stringify({ items: [] });
  await assert.rejects(installWorkbenchCandidate(ctx), /not running the imported image/);
});

test("fixture paths cannot target another origin, sandbox or arbitrary endpoint", () => {
  assert.equal(apiUrl("sbx_owned", "metrics"), "http://127.0.0.1:28482/v1/sandboxes/sbx_owned/metrics");
  assert.equal(workbenchUrl("sbx_owned"), "http://127.0.0.1:28480/#dashboard/sandboxes/sbx_owned?tab=overview");
  for (const id of [undefined, "", "../foreign", "sbx_a/../b", "sbx_a?token=x", "https://example.com", "sbx_a#x"]) assert.throws(() => apiUrl(id));
  for (const endpoint of ["//example.com", "../api-keys", "metrics?token=x", "terminal/attach-ticket/extra"]) assert.throws(() => apiUrl("sbx_owned", endpoint));
  assert.throws(() => workbenchUrl("sbx_owned", "unknown"));
});

test("binary fixture crosses the old argument limit and rejects corruption and truncation", () => {
  const fixture = binaryFixture();
  assert.equal(fixture.bytes.length, 1024 * 1024);
  assert.equal(new Set(fixture.bytes).size, 256);
  verifyBytes(Buffer.from(fixture.bytes), fixture);
  const corrupt = Buffer.from(fixture.bytes); corrupt[12345] ^= 1;
  assert.throws(() => verifyBytes(corrupt, fixture), /differ/);
  assert.throws(() => verifyBytes(fixture.bytes.subarray(1), fixture), /differ/);
});

test("PTY evidence requires numeric remote output, not the echoed input command", () => {
  assert.equal(ptySize("$ printf 'WB_SIZE_A:'; stty size", "WB_SIZE_A"), null);
  assert.deepEqual(ptySize("WB_SIZE_A:24 120\r\n$ ", "WB_SIZE_A"), { rows: 24, cols: 120 });
  assert.deepEqual(ptySize("WB_SIZE_B:24 120\nWB_SIZE_B:18 70\n", "WB_SIZE_B"), { rows: 18, cols: 70 });
  for (const text of ["WB_SIZE_A:0 80", "WB_SIZE_A:24 99999", "WB_SIZE_A:fake", "echo WB_SIZE_A:24 80"]) assert.equal(ptySize(text, "WB_SIZE_A"), null);
  assert.throws(() => ptySize("", ".*"));
});

test("terminal witness accepts only the owned loopback socket and retains no payload or ticket", () => {
  const page = new EventEmitter();
  const witness = watchTerminal(page, "sbx_owned");
  const socket = new EventEmitter();
  socket.url = () => "ws://foreign.example/v1/sandboxes/sbx_owned/terminal/attach?ticket=PRIVATE";
  page.emit("websocket", socket);
  assert.equal(witness.state.sockets, 0);
  socket.url = () => "ws://127.0.0.1:28482/v1/sandboxes/sbx_owned/terminal/attach?ticket=PRIVATE";
  page.emit("websocket", socket);
  socket.emit("framesent", { payload: Buffer.from([0, 65, 13]) });
  socket.emit("framereceived", { payload: Buffer.from([1, 66]) });
  socket.emit("framesent", { payload: JSON.stringify({ type: "resize", cols: 80, rows: 24, token: "PRIVATE" }) });
  socket.emit("framesent", { payload: "malformed PRIVATE" });
  socket.emit("close");
  assert.deepEqual(witness.state, { sockets: 1, closed: 1, inputBytes: 2, outputBytes: 1, sizes: [{ cols: 80, rows: 24 }] });
  assert.ok(!JSON.stringify(witness.state).includes("PRIVATE"));
  witness.stop();
  assert.equal(page.listenerCount("websocket"), 0);
  assert.equal(socket.listenerCount("framesent"), 0);
});

test("metrics reject missing fields, synthetic empty values and stale observations", () => {
  const now = Date.now();
  const snapshot = { availableFields: ["cpu", "mem"], observedAt: new Date(now).toISOString(), current: { cpu: 0, mem: 128 } };
  assert.equal(assertMetrics(snapshot, now), now);
  for (const invalid of [{ ...snapshot, observedAt: null }, { ...snapshot, observedAt: new Date(now - 180000).toISOString() }, { ...snapshot, availableFields: [] }, { ...snapshot, current: { cpu: NaN, mem: 128 } }, { ...snapshot, current: { cpu: 0, mem: 0 } }]) assert.throws(() => assertMetrics(invalid, now));
});

test("denial fixture only replaces auth on the exact owned attach POST", () => {
  const request = { url: () => apiUrl("sbx_owned", "terminal/attach-ticket"), method: () => "POST", headers: () => ({ Authorization: "PRIVATE-bearer", cookie: "PRIVATE-cookie", "x-api-key": "old", origin: "http://127.0.0.1:28480" }) };
  assert.deepEqual(scopedAttachHeaders(request, "sbx_owned", "read-only"), { origin: "http://127.0.0.1:28480", "x-api-key": "read-only" });
  for (const url of [apiUrl("sbx_other", "terminal/attach-ticket"), apiUrl("sbx_owned", "commands"), `${request.url()}?x=1`, "https://foreign.example/"]) assert.throws(() => scopedAttachHeaders({ ...request, url: () => url }, "sbx_owned", "read-only"));
  assert.throws(() => scopedAttachHeaders({ ...request, method: () => "GET" }, "sbx_owned", "read-only"));
});

test("key probes use fixed loopback, header-only auth, bounded requests and no redirects", async t => {
  let called = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    called++;
    assert.equal(url, apiUrl("sbx_owned"));
    assert.deepEqual(init.headers, { "x-api-key": "PRIVATE" });
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(null, { status: called === 1 ? 200 : 401 });
  });
  await probeKey("sbx_owned", "PRIVATE");
  await probeKey("sbx_owned", "PRIVATE", 401);
  await assert.rejects(probeKey("sbx_owned", "PRIVATE"), /probe failed/);
  await assert.rejects(probeKey("../foreign", "PRIVATE"));
  assert.equal(called, 3);
});

test("receipt excludes identity, raw failures, browser state and arbitrary evidence", async () => {
  const receipt = { source, runId: "123-1", status: "failed", identity: "PRIVATE", browser: { token: "PRIVATE" },
    candidate: { images: { api: { imageConfigDigest: `sha256:${"b".repeat(64)}`, reference: "PRIVATE" }, web: { imageConfigDigest: "PRIVATE" } } },
    results: [{ gate: "files", status: "passed", evidence: { verifiedBytes: true, sizeBytes: 1024, fileSha256: "c".repeat(64), raw: "PRIVATE", output: "PRIVATE", mem: "PRIVATE" } },
      { gate: "pty", status: "failed", failure: publicFailure(new AcceptanceCheckError("PRIVATE identity ticket url")) }, { gate: "PRIVATE", status: "failed" }] };
  const cleaned = [];
  await finishReceipt(receipt, {
    sandbox() { cleaned.push("sandbox"); throw new AcceptanceCheckError("PRIVATE cleanup"); },
    readOnlyKey() { cleaned.push("readOnlyKey"); }, key() { cleaned.push("key"); },
    browser() { cleaned.push("browser"); }, portForwards() { cleaned.push("portForwards"); }
  });
  assert.equal(receipt.status, "failed");
  assert.equal(cleaned.length, 5);
  const result = publicReceipt(receipt);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.equal(result.runnerProcesses.status, "failed");
  assert.deepEqual(result.results[0].evidence, { verifiedBytes: true, sizeBytes: 1024, fileSha256: "c".repeat(64) });
  assert.deepEqual(result.results[1].failure, { kind: "acceptance_check" });
  const disguised = { private: "PRIVATE", toString: () => "c".repeat(64) };
  assert.deepEqual(publicReceipt({ results: [{ gate: "files", status: "passed", evidence: { fileSha256: disguised, singleSubmission: true, exactlyOnce: true } }] }).results[0].evidence, { singleSubmission: true });
});

test("runner installs both candidates before UI and reuses existing bootstrap/fixture/cleanup", () => {
  const runner = read("./run.mjs");
  assert.ok(runner.indexOf("ctx.guard()") < runner.indexOf("await install(ctx)"));
  assert.ok(runner.indexOf("await install(ctx)") < runner.indexOf("await installWorkbenchCandidate(ctx)"));
  assert.ok(runner.indexOf("await installWorkbenchCandidate(ctx)") < runner.indexOf("await operatorSession(ctx)"));
  assert.ok(runner.indexOf("await operatorSession(ctx)") < runner.indexOf("await importAcceptanceTemplate(ctx"));
  assert.ok(runner.indexOf("await importAcceptanceTemplate(ctx") < runner.indexOf('["files", verifyFiles]'));
  assert.match(runner, /await finishReceipt\(receipt/);
  assert.match(runner, /JSON\.stringify\(publicReceipt\(receipt\)/);
  assert.match(runner, /scopes: \["sandboxes:read"\]/);
  const browser = read("./browser.mjs");
  assert.doesNotMatch(browser, /\.fulfill\(|routeWebSocket\(|addInitScript\(|localStorage|\.screenshot\(|\.evaluate\(/);
  assert.match(browser, /route\.continue\(\{ headers: scopedAttachHeaders/);
  assert.doesNotMatch(runner, /AUTH_DEV_ALLOW|prepareEmptyCatalog|query\(|kubectl.*exec/);
});

test("workflow is manual/own-PR, native, read-only, pinned, cleanup-always and receipt-only", () => {
  const workflow = read("../../.github/workflows/workbench-acceptance.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /run: node infra\/acceptance\/bootstrap.mjs/);
  assert.match(workflow, /if: always\(\)\s+run: node infra\/acceptance\/cleanup.mjs/);
  assert.match(workflow, /path: standalone-acceptance-report.json\n/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|self-hosted|packages: write|id-token: write|docker push|npm publish|path:.*\*/);
  const uses = [...workflow.matchAll(/uses: (.+)/g)].map(match => match[1]);
  assert.equal(uses.length, 4);
  for (const action of uses) assert.match(action, /^[\w/-]+@[a-f0-9]{40} # v4$/);
});

test("all new modules parse without executing the native entrypoint", () => {
  for (const filename of fs.readdirSync(import.meta.dirname).filter(name => name.endsWith(".mjs"))) {
    execFileSync(process.execPath, ["--check", path.join(import.meta.dirname, filename)], { stdio: "pipe" });
  }
});
