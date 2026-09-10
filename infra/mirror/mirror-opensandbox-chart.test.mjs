import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./mirror-opensandbox-chart.sh", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "harakiri-chart-mirror-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const calls = join(root, "calls.jsonl");
  writeFileSync(join(bin, "helm"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const input = args[0] === "registry" ? fs.readFileSync(0, "utf8") : "";
fs.appendFileSync(process.env.HELM_CALLS, JSON.stringify({ args, input }) + "\\n");
if (args[0] === "pull") {
  if (process.env.FAIL_PULL === "1") process.exit(1);
  fs.writeFileSync(path.join(args[args.indexOf("--destination") + 1], "opensandbox-" + process.env.OPEN_SANDBOX_CHART_VERSION + ".tgz"), "offline fixture");
}
`, { mode: 0o700 });
  const env = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, HELM_CALLS: calls,
    CLIENT_REGISTRY_URL: "https://registry.example.test/", HARBOR_PROJECT: "sandbox-mirror",
    CLIENT_REGISTRY_USERNAME: "robot$mirror", CLIENT_REGISTRY_PASSWORD: "sample-registry-value",
    OPEN_SANDBOX_UPSTREAM_CHART: "https://artifacts.example.test/opensandbox-0.2.2.tgz",
    OPEN_SANDBOX_CHART_VERSION: "0.2.2", FAIL_PULL: "0"
  };
  return {
    env,
    run: () => spawnSync("bash", [script], { env, encoding: "utf8", timeout: 10000 }),
    calls: () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse) : []
  };
}

test("chart mirroring uses the selected registry and stdin auth without installing anything", (t) => {
  const context = fixture(t);
  const result = context.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = context.calls();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args, ["registry", "login", "registry.example.test", "--username", "robot$mirror", "--password-stdin"]);
  assert.equal(calls[0].input, context.env.CLIENT_REGISTRY_PASSWORD);
  assert.deepEqual(calls[1].args.slice(0, 3), ["pull", context.env.OPEN_SANDBOX_UPSTREAM_CHART, "--destination"]);
  assert.deepEqual(calls[2].args, ["push", join(calls[1].args[3], "opensandbox-0.2.2.tgz"), "oci://registry.example.test/sandbox-mirror/charts"]);
  assert.equal(existsSync(calls[1].args[3]), false, "temporary archive must be removed");
  assert.ok(!JSON.stringify(calls.map((entry) => entry.args)).includes(context.env.CLIENT_REGISTRY_PASSWORD));
  assert.ok(!(result.stdout + result.stderr).includes(context.env.CLIENT_REGISTRY_PASSWORD));
});

test("a missing destination fails before contacting Helm", (t) => {
  const context = fixture(t);
  delete context.env.CLIENT_REGISTRY_URL;
  assert.notEqual(context.run().status, 0);
  assert.deepEqual(context.calls(), []);
});

test("failed chart downloads never publish and still remove scratch data", (t) => {
  const context = fixture(t);
  context.env.FAIL_PULL = "1";
  assert.notEqual(context.run().status, 0);
  const calls = context.calls();
  assert.deepEqual(calls.map((entry) => entry.args[0]), ["registry", "pull"]);
  assert.equal(existsSync(calls[1].args[3]), false);
});
