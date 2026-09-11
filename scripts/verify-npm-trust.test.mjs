import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyNpmTrust } from "./verify-npm-trust.mjs";

const env = {
  GITHUB_ACTIONS: "true",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://run-actions-3-azure-eastus.actions.githubusercontent.com/idtoken?api-version=2.0",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-request-credential"
};
const identity = "test-oidc-identity";
const exchange = () => ({ token_type: "oidc", token: "test-short-lived-credential", expires: new Date(Date.now() + 60_000).toISOString() });

test("trust verification exchanges both package identities without publishing or leaking tokens", async () => {
  const calls = [], logs = [];
  const result = await verifyNpmTrust({ env, log: (line) => logs.push(line), fetchImpl: async (url, init) => {
    calls.push({ url: String(url), ...init });
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return calls.length === 1 ? Response.json({ value: identity }) : Response.json(exchange(), { status: 201 });
  } });
  assert.deepEqual(result, ["@h-sandbox/sdk", "@h-sandbox/cli"]);
  assert.equal(calls.length, 3);
  const oidcUrl = new URL(calls[0].url);
  assert.equal(oidcUrl.searchParams.get("audience"), "npm:registry.npmjs.org");
  assert.equal(oidcUrl.searchParams.get("api-version"), "2.0");
  assert.equal(calls[0].headers.authorization, `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`);
  for (const [index, name] of result.entries()) {
    assert.equal(calls[index + 1].url, `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`);
    assert.equal(calls[index + 1].method, "POST");
    assert.deepEqual(calls[index + 1].headers, { authorization: `Bearer ${identity}` });
    assert.equal(calls[index + 1].body, undefined);
  }
  assert.doesNotMatch(JSON.stringify({ result, logs }), /test-request-credential|test-oidc-identity|test-short-lived-credential/);
  assert.match(logs.at(-1), /direct publishing remains to be tested/);
});

test("verification requires GitHub OIDC and refuses credential-forwarding URLs before fetching", async () => {
  for (const badEnv of [
    {}, { ...env, GITHUB_ACTIONS: "false" }, { ...env, ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
    ...["invalid", "http://run.actions.githubusercontent.com/idtoken", "https://attacker.example/idtoken",
      "https://actions.githubusercontent.com.attacker.example/idtoken", "https://user@run.actions.githubusercontent.com/idtoken",
      "https://run.actions.githubusercontent.com:8443/idtoken"].map(ACTIONS_ID_TOKEN_REQUEST_URL => ({ ...env, ACTIONS_ID_TOKEN_REQUEST_URL }))
  ]) {
    await assert.rejects(verifyNpmTrust({ env: badEnv, fetchImpl: async () => assert.fail("must not fetch"), log: () => assert.fail("must not log") }));
  }
});

test("OIDC and npm failures fail closed without logging credential-bearing response bodies", async () => {
  for (const stage of ["identity", "sdk", "cli"]) {
    for (const status of [302, 400, 401, 403, 404, 429, 500]) {
      let calls = 0;
      const failAt = ["identity", "sdk", "cli"].indexOf(stage) + 1;
      await assert.rejects(verifyNpmTrust({ env, log: () => {}, fetchImpl: async () => {
        calls++;
        if (calls === failAt) return new Response(identity, { status });
        return calls === 1 ? Response.json({ value: identity }) : Response.json(exchange(), { status: 201 });
      } }), (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /test-oidc-identity/);
        return true;
      });
      assert.equal(calls, failAt);
    }
  }
});

test("malformed, missing and transport-error responses never count as verified", async () => {
  for (const payload of [null, {}, { value: " " }]) {
    await assert.rejects(verifyNpmTrust({ env, log: () => {}, fetchImpl: async () => Response.json(payload) }), /did not return an OIDC identity/);
  }
  for (const payload of [null, {}, { ...exchange(), token: "" }, { ...exchange(), token: " " },
    { ...exchange(), token: 123 }, { ...exchange(), token: {} }]) {
    let calls = 0;
    await assert.rejects(verifyNpmTrust({ env, log: () => {}, fetchImpl: async () => {
      calls++;
      return calls === 1 ? Response.json({ value: identity }) : Response.json(payload, { status: 201 });
    } }), /did not return an exchange token/);
    assert.equal(calls, 2);
  }
  for (const fetchImpl of [async () => { throw new Error(identity); }, async () => new Response(identity)]) {
    await assert.rejects(verifyNpmTrust({ env, log: () => {}, fetchImpl }), (error) => {
      assert.match(error.message, /request or JSON response unavailable/);
      assert.doesNotMatch(error.message, /test-oidc-identity/);
      return true;
    });
  }
});

test("exchange success does not depend on optional response metadata", async () => {
  for (const payload of [{ token: exchange().token }, { ...exchange(), token_type: "Bearer" }]) {
    let calls = 0;
    assert.deepEqual(await verifyNpmTrust({ env, log: () => {}, fetchImpl: async () => {
      calls++;
      return calls === 1 ? Response.json({ value: identity }) : Response.json(payload, { status: 201 });
    } }), ["@h-sandbox/sdk", "@h-sandbox/cli"]);
    assert.equal(calls, 3);
  }
});

test("verification and publication are mutually exclusive protected workflow jobs", () => {
  const workflow = readFileSync(new URL("../.github/workflows/npm-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /verify_only:[\s\S]*?type: boolean\s+default: false/);
  const verification = workflow.split("\n  verify-trust:\n")[1]?.split("\n  publish:\n")[0];
  const publication = workflow.split("\n  publish:\n")[1];
  assert.ok(verification && publication);
  assert.match(verification, /if: \$\{\{ inputs\.verify_only \}\}/);
  assert.match(publication, /if: \$\{\{ !inputs\.verify_only \}\}/);
  for (const job of [verification, publication]) {
    assert.match(job, /needs: validate/);
    assert.match(job, /environment: npm/);
    assert.match(job, /id-token: write/);
    assert.match(job, /ref: \$\{\{ needs\.validate\.outputs\.sha \}\}/);
  }
  assert.match(verification, /node scripts\/verify-npm-trust\.mjs/);
  assert.doesNotMatch(verification, /npm publish|pnpm publish|dist-tag|NODE_AUTH_TOKEN|NPM_TOKEN/);
});
