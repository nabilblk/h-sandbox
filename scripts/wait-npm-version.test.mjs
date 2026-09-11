import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { waitForNpmVersion } from "./wait-npm-version.mjs";

const name = "@h-sandbox/sdk", version = "0.5.0-rc.9";
const published = () => Response.json({ versions: { [version]: { version } } });
const options = request => {
  let clock = 0;
  return { request, timeoutMs: 20, intervalMs: 5, now: () => clock, sleep: async ms => { clock += ms; } };
};

test("public visibility waits through 404 and stale metadata without sending credentials or writes", async () => {
  const responses = [new Response(null, { status: 404 }), Response.json({ versions: {} }), published()];
  let calls = 0;
  const result = await waitForNpmVersion(name, version, options(async (url, input) => {
    assert.equal(url, "https://registry.npmjs.org/%40h-sandbox%2Fsdk");
    assert.equal(input.method, undefined);
    assert.equal(input.headers.authorization, undefined);
    assert.ok(input.signal instanceof AbortSignal);
    calls++;
    return responses.shift();
  }));
  assert.equal(result.version, version);
  assert.equal(calls, 3);
});

test("transient network and registry failures are bounded reads", async () => {
  let calls = 0;
  await waitForNpmVersion(name, version, options(async () => {
    calls++;
    if (calls === 1) throw new TypeError("Network failed");
    if (calls === 2) return new Response(null, { status: 503 });
    return published();
  }));
  assert.equal(calls, 3);
});

test("permanent authorization failures are not retried", async () => {
  let calls = 0;
  await assert.rejects(waitForNpmVersion(name, version, options(async () => { calls++; return new Response(null, { status: 403 }); })), /HTTP 403/);
  assert.equal(calls, 1);
});

test("missing versions time out and explicitly forbid republishing", async () => {
  let calls = 0;
  await assert.rejects(waitForNpmVersion(name, version, options(async () => { calls++; return Response.json({ versions: {} }); })), /Do not republish/);
  assert.equal(calls, 4);
});

test("postpublication smoke clears publishing auth and uses bounded metadata checks", () => {
  const script = readFileSync(new URL("./npm-postpublish-smoke.sh", import.meta.url), "utf8");
  assert.match(script, /unset NODE_AUTH_TOKEN NPM_TOKEN/);
  assert.match(script, /NPM_CONFIG_USERCONFIG=/);
  assert.match(script, /wait-npm-version.mjs/);
  const workflow = readFileSync(new URL("../.github/workflows/npm-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /verify_published_only/);
  assert.match(workflow, /!inputs.verify_only && !inputs.verify_published_only/);
  assert.match(workflow, /HARAKIRI_PUBLISH_VERSION: \$\{\{ needs.validate.outputs.version \}\}/);
});
