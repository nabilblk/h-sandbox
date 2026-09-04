import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { jwtVerify } from "jose";
import { createGitHubAppInstallationIssuer } from "./providers/credentials/github-app-installation.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const now = Date.parse("2026-09-03T12:00:00.000Z");
const scope = {
  installationId: "321",
  repositories: ["agent-runtime"],
  permissions: { contents: "write" as const, metadata: "read" as const }
};

const options = (request: typeof fetch) => ({
  enabled: true,
  clientId: "Iv1.harakiri-test",
  privateKey: privateKeyPem,
  apiBaseUrl: "https://github.test/api/v3",
  apiVersion: "2026-03-10",
  timeoutMs: 1_000,
  now: () => now,
  fetch: request
});

test("GitHub App issuer validates an installation with a bounded RS256 App JWT", async () => {
  let requestCount = 0;
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    requestCount += 1;
    assert.equal(String(input), "https://github.test/api/v3/app/installations/321");
    assert.equal(init?.method, "GET");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["X-GitHub-Api-Version"], "2026-03-10");
    assert.equal(headers.Accept, "application/vnd.github+json");
    const token = headers.Authorization.replace("Bearer ", "");
    const verified = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      currentDate: new Date(now)
    });
    assert.equal(verified.payload.iss, "Iv1.harakiri-test");
    assert.equal(verified.payload.iat, now / 1_000 - 60);
    assert.equal(verified.payload.exp, now / 1_000 + 9 * 60);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const issuer = createGitHubAppInstallationIssuer(options(request));
  assert.deepEqual(await issuer.validate(scope), { kind: "ok" });
  assert.equal(requestCount, 1);
});

test("GitHub App issuer requests a scoped installation token and returns only its expiry metadata", async () => {
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://github.test/api/v3/app/installations/321/access_tokens");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      repositories: ["agent-runtime"],
      permissions: { contents: "write", metadata: "read" }
    });
    return Response.json({
      token: "ghs_transient_token",
      expires_at: "2026-09-03T13:00:00Z"
    });
  }) as typeof fetch;

  const issuer = createGitHubAppInstallationIssuer(options(request));
  const result = await issuer.issue(scope);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.value, "ghs_transient_token");
  assert.equal(result.expiresAt, "2026-09-03T13:00:00.000Z");
  assert.deepEqual(result.metadata, {
    issuerType: "github_app_installation",
    installationId: "321",
    repositories: ["agent-runtime"],
    permissions: { contents: "write", metadata: "read" }
  });
});

test("GitHub App issuer fails closed before network access when operator configuration is incomplete", async () => {
  let requested = false;
  const request = (async () => {
    requested = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const issuer = createGitHubAppInstallationIssuer({ ...options(request), enabled: false });

  assert.deepEqual(await issuer.issue(scope), {
    kind: "unavailable",
    message: "GitHub App dynamic credentials are disabled by the operator"
  });
  assert.equal(requested, false);
});

test("GitHub App issuer maps provider failures without returning response bodies", async () => {
  const request = (async () => new Response("sensitive upstream details", { status: 403 })) as typeof fetch;
  const issuer = createGitHubAppInstallationIssuer(options(request));

  assert.deepEqual(await issuer.issue(scope), {
    kind: "forbidden",
    message: "GitHub rejected the App identity or installation access"
  });
});

test("GitHub App issuer rejects malformed successful token responses", async () => {
  const request = (async () => Response.json({ token: "ghs_missing_expiry" })) as typeof fetch;
  const issuer = createGitHubAppInstallationIssuer(options(request));

  assert.deepEqual(await issuer.issue(scope), {
    kind: "invalid",
    message: "GitHub returned an invalid installation token response"
  });
});
