import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { AcceptanceCheckError, sha256, stopOwnedForward } from "./context.mjs";
import { createRuntime, denyAtCapacity, assertRetained, retainedPath } from "./workload.mjs";
import { finishReceipt, publicEvidence, publicFailure } from "./receipt.mjs";
import { literalId, applyOwned } from "./operator.mjs";
import { ownershipLabel } from "./safety.mjs";
import { assertCredentialBoundary, credentialTarget, exampleCredential, placeholder, probeCredential } from "./credential-fixture.mjs";
import { databaseEvidence, eventEvidence, logEvidence, podEvidence } from "./diagnostics.mjs";
import { assertOperatorAccount, operatorRequestOptions } from "./browser.mjs";
import { wrappingKeyCase } from "./recovery.mjs";
import { observeStartup, runtimeStateEvidence } from "./startup.mjs";

test("all harness modules parse without bootstrapping a cluster", () => {
  for (const filename of fs.readdirSync(import.meta.dirname).filter(name => name.endsWith(".mjs"))) {
    execFileSync(process.execPath, ["--check", path.join(import.meta.dirname, filename)], { stdio: "pipe" });
  }
});

test("mutable entry points refuse an ordinary developer shell before running commands", () => {
  const env = { ...process.env, GITHUB_ACTIONS: "false", RUNNER_ENVIRONMENT: "self-hosted" };
  for (const filename of ["bootstrap.mjs", "run.mjs", "cleanup.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, filename)], { env, encoding: "utf8", timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local host|disposable Actions runner|ARM host/);
    assert.doesNotMatch(result.stdout, /gate passed|cluster stopped|Configuration created/);
  }
});

test("public evidence strips keys, backups, nested objects and arbitrary strings", () => {
  const result = publicEvidence({ encryptedVaultUse: true, fileSha256: "a".repeat(64), negativeCases: ["missing", "incorrect", "secret"],
    token: "sensitive", databaseUrl: "sensitive", vault: { value: "sensitive" }, browser: {}, keyRevoked: "sensitive", envelopeSha256: "sensitive" });
  assert.deepEqual(result, { encryptedVaultUse: true, fileSha256: "a".repeat(64), negativeCases: ["missing", "incorrect"] });
  assert.deepEqual(publicFailure({ status: 500, message: "sensitive", body: "sensitive", code: "sensitive" }), { kind: "http", status: 500 });
  assert.ok(!JSON.stringify(publicFailure(new Error("sensitive"))).includes("sensitive"));
  assert.deepEqual(publicFailure(new AcceptanceCheckError("owned check")), { kind: "acceptance_check", check: "owned check" });
  assert.deepEqual(publicFailure(new Error("page.goto: net::ERR_CONNECTION_REFUSED http://user:sensitive@localhost/path?code=sensitive")), { kind: "browser", reason: "connection_refused" });
  assert.deepEqual(publicFailure(new TypeError("sensitive")), { kind: "exception", type: "TypeError" });
  assert.ok(!JSON.stringify(publicFailure({ name: "sensitive", message: "sensitive" })).includes("sensitive"));
  assert.deepEqual(publicFailure({ name: "HarakiriWaitTimeoutError", id: "sensitive", message: "sensitive", lastStatus: "pending" }), { kind: "readiness_timeout", lastStatus: "pending" });
});

test("create replay preserves one intent and fails on duplicate identity", async () => {
  const requests = [];
  const client = { createSandbox: async input => { requests.push(input); return { sandbox: { id: "sbx_owned" } }; }, waitForSandbox: async id => assert.equal(id, "sbx_owned") };
  assert.equal(await createRuntime(client, { templateId: "template", workspaceId: "workspace" }, "owned"), "sbx_owned");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].wait, false);
  let count = 0;
  await assert.rejects(createRuntime({ ...client, createSandbox: async () => ({ sandbox: { id: `sbx_${++count}` } }) }, { templateId: "template", workspaceId: "workspace" }, "owned"), /duplicated/);
});

test("operator onboarding consumes the public account role and capabilities contract", () => {
  assertOperatorAccount({ role: "admin", capabilities: { canManageSettings: true } });
  for (const account of [null, { membership: { role: "admin" } }, { role: "member", capabilities: { canManageSettings: false } }, { role: "admin", capabilities: { canManageSettings: false } }]) {
    assert.throws(() => assertOperatorAccount(account), /not organization admin/);
  }
});

test("bodyless operator requests do not advertise an empty JSON payload", () => {
  for (const method of ["GET", "DELETE"]) {
    const request = operatorRequestOptions("fixture", method);
    assert.equal(request.headers["content-type"], undefined);
    assert.equal(request.body, undefined);
    assert.equal(request.headers.authorization, "fixture");
  }
  const request = operatorRequestOptions("fixture", "PATCH", { maxConcurrency: 1 });
  assert.equal(request.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), { maxConcurrency: 1 });
});

test("owned forward cleanup signals only its dedicated group, with bounded escalation", async () => {
  const child = { pid: 12345, exitCode: null, signalCode: null };
  const signals = [];
  const signal = (pid, name) => { signals.push([pid, name]); if (name === "SIGKILL") child.signalCode = name; };
  const wait = async (label, exited) => { if (!exited()) throw new Error("still stopping"); };
  await stopOwnedForward(child, signal, wait);
  assert.deepEqual(signals, [[-12345, "SIGTERM"], [-12345, "SIGKILL"]]);
  await stopOwnedForward(child, () => assert.fail("Do not signal an exited process"), wait);
  await assert.rejects(stopOwnedForward({ pid: 0, exitCode: null, signalCode: null }, () => assert.fail("Unsafe process group"), wait), /Invalid owned/);
});

test("cleanup failure preserves the gate failure and still finalizes the receipt", async () => {
  const receipt = { status: "failed", results: [{ gate: "oidc-onboarding", status: "failed" }] };
  let forwardsStopped = false;
  await finishReceipt(receipt, { browser: async () => { throw new Error("sensitive"); }, portForwards: async () => { forwardsStopped = true; } });
  assert.equal(forwardsStopped, true);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.runnerProcesses.status, "failed");
  assert.equal(receipt.results[0].gate, "oidc-onboarding");
  assert.ok(receipt.completedAt);
  assert.ok(!JSON.stringify(receipt).includes("sensitive"));
});

test("capacity gate accepts only explicit admission denial, never generic provider failure", async () => {
  const rejects = (status, code) => ({ createSandbox: async () => { throw { status, code }; } });
  await denyAtCapacity(rejects(409, "organization_capacity_exceeded"), "template");
  await denyAtCapacity(rejects(503, "organization_capacity_unavailable"), "template", true);
  for (const [status, code] of [[500, "internal_error"], [401, "unauthorized"], [503, "provider_unavailable"], [409, "workspace_unavailable"]]) {
    await assert.rejects(denyAtCapacity(rejects(status, code), "template", true));
  }
  await assert.rejects(denyAtCapacity({ createSandbox: async () => ({ sandbox: {} }) }, "template"), /above its execution limit/);
});

test("persistence evidence requires matching bytes and an actual workspace working directory", async () => {
  const client = { files: { read: async (id, filename) => { assert.equal(filename, retainedPath); return { content: "retained" }; } }, runSandbox: async () => ({ result: { exitCode: 0, stdout: "/workspace\n" } }) };
  await assertRetained(client, "sandbox", { fileSha256: sha256("retained") });
  await assert.rejects(assertRetained(client, "sandbox", { fileSha256: sha256("changed") }), /Workspace file changed/);
  await assert.rejects(assertRetained({ ...client, runSandbox: async () => ({ result: { exitCode: 0, stdout: "/root\n" } }) }, "sandbox", { fileSha256: sha256("retained") }), /working directory/);
});

test("operator resources refuse an unowned namespace before saving or applying", () => {
  const calls = [];
  const ctx = { identity: { id: "123-1" }, k: args => { calls.push(args); return JSON.stringify({ metadata: { name: "harakiri-preview", labels: { [ownershipLabel]: "other-run" } } }); }, save: () => assert.fail("must not write"), file: () => assert.fail("must not apply") };
  assert.throws(() => applyOwned(ctx, { kind: "Secret", metadata: { name: "fixture", namespace: "harakiri-preview" } }, "fixture.json"));
  assert.equal(calls.length, 1);
  assert.equal(literalId("wsp_owned-123"), "'wsp_owned-123'");
  assert.throws(() => literalId("x';DELETE FROM users;--"));
});

test("credential probe requires HTTPS and sends only the invalid placeholder", async () => {
  assert.equal(credentialTarget, "https://postman-echo.com/basic-auth");
  const client = { runSandbox: async (id, input) => {
    assert.equal(input.env.ACCEPTANCE_API_KEY, placeholder);
    assert.ok(!JSON.stringify(input).includes(exampleCredential()));
    assert.doesNotMatch(input.command, /--insecure|--location|curl -k/);
    assert.match(input.command, /--output \/dev\/null/);
    return { result: { exitCode: 0, stdout: "401" } };
  } };
  await probeCredential(client, "owned", false);
  await assert.rejects(probeCredential(client, "owned", true), /did not inject/);
  await assert.rejects(probeCredential({ runSandbox: async () => ({ result: { exitCode: 0, stdout: "503" } }) }, "owned", false), /not rejected/);
});

test("credential boundary checks never send the source plaintext into a sandbox", async () => {
  const value = exampleCredential();
  const ctx = {};
  let command;
  const client = { credentials: { inspect: async () => ({ vault: { credentials: [{ name: "owned" }] } }) },
    runSandbox: async (id, input) => { command = input.command; return { result: { exitCode: 0, stdout: "False\n" } }; } };
  await assertCredentialBoundary(ctx, client, "owned");
  assert.ok(command.includes(sha256(value)));
  assert.ok(!command.includes(value));
  await assert.rejects(assertCredentialBoundary(ctx, { ...client, credentials: { inspect: async () => ({ value }) } }, "owned"), /exposed source material/);
});

test("missing wrapping material disables legacy fallback without changing other keys", () => {
  const original = { metadata: { resourceVersion: "123", managedFields: [] }, data: { CREDENTIAL_VAULT_KEY: "previous", TEMPLATE_REGISTRY_CREDENTIAL_KEY: "unrelated" } };
  const missing = wrappingKeyCase(original, null);
  assert.equal(missing.data.CREDENTIAL_VAULT_KEY, "");
  assert.equal(missing.data.TEMPLATE_REGISTRY_CREDENTIAL_KEY, "unrelated");
  assert.equal(missing.metadata.resourceVersion, "123");
  assert.equal(missing.metadata.managedFields, undefined);
  assert.equal(original.data.CREDENTIAL_VAULT_KEY, "previous");
  assert.equal(wrappingKeyCase(original, "wrong").data.CREDENTIAL_VAULT_KEY, Buffer.from("wrong").toString("base64"));
});

test("startup evidence excludes workload secrets and preserves client outcomes", async () => {
  assert.deepEqual(runtimeStateEvidence({ spec: { token: "sensitive" }, status: { phase: "Pending", ready: 0, allocated: 1, replicas: 1, conditions: [{ message: "sensitive" }] } }), { phase: "Pending", ready: 0, allocated: 1, replicas: 1 });
  const ctx = { k: () => { throw new Error("sensitive"); } };
  assert.equal(await observeStartup(ctx, async () => "result"), "result");
  await assert.rejects(observeStartup(ctx, async () => { throw new Error("client failure"); }), /client failure/);
  assert.deepEqual(ctx.startupObservations, []);
  const observed = { k: args => JSON.stringify({ items: args.includes("pods") ? [{ metadata: { name: "owned", annotations: { key: "sensitive" } }, status: { phase: "Pending" } }] : [{ status: { phase: "Pending", token: "sensitive" } }] }) };
  await observeStartup(observed, () => new Promise(resolve => setTimeout(resolve, 40)), 5);
  assert.equal(observed.startupObservations.length, 1);
  assert.equal(observed.startupObservations[0].pods[0].phase, "Pending");
  assert.ok(!JSON.stringify(observed.startupObservations).includes("sensitive"));
  const failed = { k: args => args.includes("logs") ? "sleep: invalid time interval 'sensitive'" : JSON.stringify({ items: args.includes("pods") ? [{ metadata: { name: "owned" }, status: { phase: "Running", containerStatuses: [{ name: "sandbox", state: { terminated: { exitCode: 1, reason: "Error", message: "sensitive" } } }] } }] : [] }) };
  await assert.rejects(observeStartup(failed, signal => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })), 5), /bootstrap exited before readiness: 1/);
  assert.equal(failed.startupObservations[0].pods[0].containers[0].exitCode, 1);
  assert.deepEqual(failed.startupObservations[0].errors[0].symptoms, ["invalid_sleep_argument"]);
  assert.ok(!JSON.stringify(failed.startupObservations).includes("sensitive"));
});

test("failure infrastructure evidence excludes container env, annotations and raw messages", () => {
  const evidence = podEvidence({ metadata: { name: "owned", annotations: { secret: "sensitive" } }, spec: { containers: [{ env: [{ value: "sensitive" }] }] }, status: {
    phase: "Pending", containerStatuses: [{ name: "api", restartCount: 2, state: { waiting: { reason: "ImagePullBackOff", message: "sensitive" } } }]
  } });
  assert.equal(evidence.containers[0].reason, "ImagePullBackOff");
  assert.equal(evidence.containers[0].restarts, 2);
  assert.ok(!JSON.stringify(evidence).includes("sensitive"));
});

test("operator diagnostics expose only known states and error categories", () => {
  const text = `error: inconsistent types deduced for parameter $1\ncode: '42P08'\n at /app/apps/api/dist/services/sandbox-operation-worker.js:12:3\nsecret: sensitive`;
  assert.deepEqual(logEvidence(text), { sqlStates: ["42P08"], providerHttpStatuses: [], providerCodes: [], providerLastStates: [], probeHttpStatuses: [], deniedResources: [], symptoms: ["ambiguous_parameter_type"], modules: ["services/sandbox-operation-worker.js"] });
  assert.deepEqual(logEvidence('{"code":"42703","msg":"column sensitive does not exist"}').sqlStates, ["42703"]);
  const evidence = databaseEvidence({ sandboxes: [{ status: "pending", hasRuntimeId: false, name: "sensitive" }],
    operations: [{ kind: "provision", state: "queued", attempts: 0, error: text, request: { key: "sensitive" } }],
    effects: [{ kind: "sensitive", dispatched: false, settled: true }], reservations: [{ phase: "reserved", released: false }],
    workspaces: [{ attached: true, attempted: false, name: "sensitive" }] });
  assert.equal(evidence.operations[0].state, "queued");
  assert.equal(evidence.effects[0].kind, "unknown");
  assert.ok(!JSON.stringify(evidence).includes("sensitive"));
  assert.deepEqual(logEvidence('OpenSandbox 503: {"credential":"sensitive"}').providerHttpStatuses, [503]);
  assert.deepEqual(logEvidence('Timeout waiting for sensitive. Last state: Pending').providerLastStates, ["Pending"]);
  assert.deepEqual(logEvidence('OpenSandbox 500: {"detail":{"code":"KUBERNETES::POD_READY_TIMEOUT","input":"sensitive"}}').providerCodes, ["KUBERNETES::POD_READY_TIMEOUT"]);
  assert.deepEqual(logEvidence(JSON.stringify({ error: 'sensitive cannot list resource "leases" in API group "coordination.k8s.io" in the namespace "sensitive"' })).deniedResources, ["leases"]);
  const event = eventEvidence({ reason: "Failed", count: 3, message: "Failed to pull sensitive with sensitive", involvedObject: { name: "sensitive" } });
  assert.equal(event.reason, "Failed");
  assert.deepEqual(event.details.symptoms, ["image_pull_failed"]);
  assert.ok(!JSON.stringify(event).includes("sensitive"));
  const probe = eventEvidence({ reason: "Unhealthy", message: "Readiness probe failed: HTTP probe failed with statuscode: 503 sensitive", involvedObject: { fieldPath: "spec.containers{egress}", name: "sensitive" } });
  assert.equal(probe.container, "egress");
  assert.deepEqual(probe.details.probeHttpStatuses, [503]);
  assert.ok(!JSON.stringify(probe).includes("sensitive"));
});

test("native workflow has no production secrets, self-hosted labels or broad artifact upload", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/standalone-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /secrets\.|self-hosted|pull_request_target|id-token: write|packages: write/);
  assert.match(workflow, /path: standalone-acceptance-report\.json\n/);
  assert.doesNotMatch(workflow, /path:.*\*/);
  assert.match(workflow, /if: always\(\)\n\s+run: node infra\/acceptance\/cleanup\.mjs/);
});
