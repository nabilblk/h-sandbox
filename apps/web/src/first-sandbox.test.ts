import assert from "node:assert/strict";
import test from "node:test";
import { TEMPLATES, type SandboxCommandSummary } from "@harakiri/shared";
import { firstSandboxCommand, firstTaskTemplates, readFirstTask, runFirstTask, type FirstSandboxTask, type FirstTaskClient } from "./first-sandbox.js";

function fixture() {
  const state = { creates: 0, submissions: 0, probes: 0, lostResponse: false, pending: true };
  const command = { id: "cmd_first", command: firstSandboxCommand, cwd: "/custom-work", status: "succeeded", stdout: "Harakiri is ready\n", stderr: "", exitCode: 0 } as SandboxCommandSummary;
  const client: FirstTaskClient = {
    createSandbox: async (body) => { state.creates++; assert.equal(body.template, "renamed-template"); assert.equal(body.ttlSeconds, 300); return { sandbox: { id: "sbx_first" }, status: "pending" } as Awaited<ReturnType<FirstTaskClient["createSandbox"]>>; },
    sandboxReadiness: async () => { state.probes++; return { sandbox: { runtimeMetadata: { workdir: "/custom-work" } }, readiness: { status: state.probes === 1 && state.pending ? "starting" : "ready" } } as Awaited<ReturnType<FirstTaskClient["sandboxReadiness"]>>; },
    startCommand: async (_id, submitted, cwd, options) => { state.submissions++; assert.equal(submitted, firstSandboxCommand); assert.equal(cwd, "/custom-work"); assert.equal(options.timeoutMs, 15_000); if (state.lostResponse) throw new Error("response lost"); return { command }; },
    commands: async () => ({ commands: state.submissions ? [command] : [] }),
    command: async () => ({ command })
  };
  let saved: FirstSandboxTask = { templateId: "renamed-template", cwd: "/custom-work", intent: "stable-intent" };
  const dependencies = { client, save: (task: FirstSandboxTask) => { saved = task; }, signal: new AbortController().signal, pause: async () => {} };
  return { state, client, dependencies, saved: () => saved };
}

test("first task uses a selected template and workdir, waits for readiness and completes once", async () => {
  const f = fixture();
  await runFirstTask(f.saved(), f.dependencies);
  await runFirstTask(f.saved(), f.dependencies);
  assert.equal(f.state.creates, 1);
  assert.equal(f.state.submissions, 1);
  assert.equal(f.state.probes, 2);
  assert.equal(f.saved().output, "Harakiri is ready\n");
  assert.equal(f.saved().complete, true);
});

test("lost command response is recovered by reading and never replayed", async () => {
  const f = fixture(); f.state.lostResponse = true;
  await assert.rejects(runFirstTask(f.saved(), f.dependencies), /response lost/);
  assert.equal(f.saved().submitted, true);
  await runFirstTask(f.saved(), f.dependencies);
  assert.equal(f.saved().complete, true);
  assert.equal(f.state.creates, 1);
  assert.equal(f.state.submissions, 1);
});

test("an unknown submission cannot trigger another command", async () => {
  const f = fixture();
  f.client.commands = async () => ({ commands: [] });
  await assert.rejects(runFirstTask({ ...f.saved(), sandboxId: "sbx_first", submitted: true }, f.dependencies), /no command will be resubmitted/);
  assert.equal(f.state.creates, 0);
  assert.equal(f.state.submissions, 0);
});

test("stopping a readiness wait preserves the accepted sandbox for the next check", async () => {
  const f = fixture(); const controller = new AbortController();
  await assert.rejects(runFirstTask(f.saved(), { ...f.dependencies, signal: controller.signal, pause: async () => controller.abort() }), { name: "AbortError" });
  assert.equal(f.saved().sandboxId, "sbx_first");
  assert.equal(f.state.submissions, 0);
  await runFirstTask(f.saved(), f.dependencies);
  assert.equal(f.state.creates, 1);
  assert.equal(f.state.submissions, 1);
});

test("unsupported readiness submits no command", async () => {
  const f = fixture();
  f.client.sandboxReadiness = async () => ({ readiness: { status: "unsupported" } }) as Awaited<ReturnType<FirstTaskClient["sandboxReadiness"]>>;
  await assert.rejects(runFirstTask(f.saved(), f.dependencies), /No command was submitted/);
  assert.equal(f.state.submissions, 0);
});

test("the accepted runtime workdir wins over stale catalog metadata", async () => {
  const f = fixture();
  await runFirstTask({ ...f.saved(), cwd: "/old-catalog-directory" }, f.dependencies);
  assert.equal(f.saved().cwd, "/custom-work");
  assert.equal(f.state.submissions, 1);
});

test("capacity denial preserves the first-task intent and does not execute a command", async () => {
  const f = fixture(), create = f.client.createSandbox;
  const intents: string[] = [];
  f.client.createSandbox = async (body) => { intents.push(body.idempotencyKey); throw new Error("organization_capacity_exceeded"); };
  await assert.rejects(runFirstTask(f.saved(), f.dependencies), /organization_capacity_exceeded/);
  assert.equal(f.saved().sandboxId, undefined); assert.equal(f.state.submissions, 0);
  f.client.createSandbox = async body => { intents.push(body.idempotencyKey); return create(body); };
  await runFirstTask(f.saved(), f.dependencies);
  assert.deepEqual(intents, ["stable-intent", "stable-intent"]);
  assert.equal(f.state.submissions, 1);
});

test("catalog eligibility excludes archived and credential-required templates without relying on Python IDs", () => {
  const template = { ...TEMPLATES[0], id: "renamed", status: "ready", latestVersionId: "tplv_ready", workdir: "/custom-work", credentialSlots: [] };
  assert.deepEqual(firstTaskTemplates([]), []);
  assert.deepEqual(firstTaskTemplates([template, { ...template, status: "archived" }, { ...template, latestVersionId: null }, { ...template, credentialSlots: [{ required: true } as never] }]), [template]);
});

test("stored task accepts only the expected non-secret state shape", () => {
  assert.equal(readFirstTask("broken"), null);
  assert.equal(readFirstTask('{"intent":42}'), null);
  const task = fixture().saved();
  assert.deepEqual(readFirstTask(JSON.stringify(task)), task);
});
