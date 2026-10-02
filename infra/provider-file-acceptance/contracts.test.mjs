import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installProviderCandidate } from "./candidate.mjs";
import { artifact, fileApi, reproduceBaseline } from "./workload.mjs";

test("candidate installation cannot issue a command before ownership validation", async () => {
  const denied = new Error("not the owned GitHub cluster");
  await assert.rejects(installProviderCandidate({ guard() { throw denied; }, execute() { assert.fail("unguarded mutation"); } }), error => error === denied);
});

test("candidate uses only a runner-local image and the published chart and web", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "provider-candidate-contract-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previousSha = process.env.GITHUB_SHA;
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; if (previousSha === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = previousSha; });
  process.env.GITHUB_SHA = "a".repeat(40);
  globalThis.fetch = async () => new Response(null, { status: 200 });
  const calls = [], saved = {};
  let guards = 0;
  const ctx = {
    identity: { id: "123-1" }, guard() { guards++; }, file: name => path.join(directory, name),
    execute(command, args) {
      assert.ok(guards > 0);
      calls.push([command, args]);
      if (args.includes("inspect")) return `sha256:${"b".repeat(64)}`;
      if (args.includes("save")) fs.writeFileSync(path.join(directory, "provider-candidate.tar"), "test archive");
      return "";
    },
    read(name) {
      if (name === "artifact-manifest.json") return { charts: { harakiri: { archive: "published-chart.tgz" } } };
      assert.equal(name, "harakiri-values.json");
      return { image: { api: { tag: "published" }, web: { tag: "published@sha256:123" } }, config: {} };
    },
    save(name, value) { saved[name] = value; },
    helm(args) { calls.push(["helm", args]); }, async forwardAll() {}
  };
  const result = await installProviderCandidate(ctx);
  assert.equal(result.published, false);
  assert.equal(result.source, process.env.GITHUB_SHA);
  assert.equal(saved["provider-candidate-values.json"].image.web.tag, "published@sha256:123");
  assert.equal(saved["provider-candidate-values.json"].image.api.tag, "provider-files-123-1");
  assert.ok(calls.find(([name]) => name === "helm")[1].includes(path.join(directory, "published-chart.tgz")));
  assert.ok(calls.find(([name, args]) => name === "sudo" && args.includes("import")));
  assert.ok(calls.every(([, args]) => !args.includes("push") && !args.includes("publish")));
  assert.equal(fs.existsSync(path.join(directory, "provider-candidate.tar")), false);
});

test("baseline receipt exposes only known error classification, never upstream messages", async () => {
  let called = 0;
  const result = await reproduceBaseline(async () => ++called === 1
    ? { status: 502, body: { error: "runtime_files_unavailable", message: "argument list too long; PRIVATE-RUNTIME-DETAIL" } }
    : { status: 404, body: { error: "file_not_found" } });
  assert.equal(result.argumentLimitReported, true);
  assert.equal(result.targetUnchanged, true);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  await assert.rejects(reproduceBaseline(async () => ({ status: 200, body: {} })), /did not reproduce/);
});

test("binary fixture checks exact bytes and API uses only loopback with header authentication", async t => {
  const data = artifact(1024);
  assert.equal(Buffer.from(data.contentBase64, "base64").length, 1024);
  assert.equal(Buffer.from(data.contentBase64, "base64")[255], 255);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://127.0.0.1:28482/v1/sandboxes/sbx_owned/files/upload");
    assert.equal(init.headers["x-api-key"], "private-fixture");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ sizeBytes: 1024 });
  };
  assert.equal((await fileApi("private-fixture", "sbx_owned")("/upload", "POST", data)).status, 200);
  assert.throws(() => fileApi("private-fixture", "../foreign"));
});

test("workflow retains native hosted-runner boundary and always-run cleanup", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/provider-file-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /runs-on: ubuntu-24.04/);
  assert.match(workflow, /if: always\(\)\s+run: node infra\/acceptance\/cleanup.mjs/);
  assert.doesNotMatch(workflow, /secrets\.|npm publish|docker push|self-hosted|packages: write/);
  const runner = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
  assert.ok(runner.indexOf("ctx.guard()") < runner.indexOf("await install(ctx)"));
});
