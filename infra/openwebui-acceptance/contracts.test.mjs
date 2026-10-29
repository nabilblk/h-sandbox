import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { ownedDocker, cleanupDocker, compatibility } from "./stack.mjs";
import { publicReceipt, safeFailure } from "./receipt.mjs";
import { runtime } from "./recovery.mjs";
import { inspectImageAudit } from "./image-audit.mjs";

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
  assert.doesNotMatch(source, /\.fulfill\(|routeWebSocket\(|addInitScript\(|mockModel|scripted-model/);
  const stack = read("./stack.mjs");
  assert.doesNotMatch(stack, /skip_verify|NODE_TLS_REJECT_UNAUTHORIZED|--insecure|KUBECONFIG=/);
  assert.match(stack, /model\.digest/);
  assert.match(stack, /--cacert/);
  assert.match(stack, /owned ephemeral registry/);
});

test("failure diagnostics retain only bounded non-sensitive categories", () => {
  assert.deepEqual(safeFailure({ kind: "browser", reason: "ambiguous_locator", message: "PRIVATE" }), { kind: "browser", reason: "ambiguous_locator" });
  assert.deepEqual(safeFailure({ kind: "PRIVATE", reason: "PRIVATE", type: "PRIVATE", status: "PRIVATE" }), { kind: "withheld" });
  assert.deepEqual(safeFailure({ kind: "http", status: 429 }), { kind: "http", status: 429 });
});

test("workflow is read-only, hosted-only, bounded, cleanup-always with explicit public artifact paths", () => {
  const source = read("../../.github/workflows/openwebui-acceptance.yml");
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /head\.repo\.full_name == github\.repository/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /contents: read/);
  for (const dependency of ["apps/api/**", "packages/sdk/**", "packages/shared/**", "pnpm-lock.yaml", "infra/acceptance/**"])
    assert.ok(source.includes(`"${dependency}"`), `Native qualification must follow ${dependency}`);
  assert.match(source, /timeout-minutes: 90/);
  assert.match(source, /if: always\(\)\s+run: node infra\/openwebui-acceptance\/cleanup.mjs/);
  assert.match(source, /if: always\(\)\s+run: node infra\/acceptance\/cleanup.mjs/);
  assert.match(source, /path: \|\s+standalone-acceptance-report.json\s+openwebui-report-desktop.png\n/);
  assert.doesNotMatch(source, /secrets\.|pull_request_target|packages: write|id-token: write|npm publish|self-hosted/);
  for (const match of source.matchAll(/uses: (.+)/g)) assert.match(match[1], /^[\w/-]+@[a-f0-9]{40} # v4$/);
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
