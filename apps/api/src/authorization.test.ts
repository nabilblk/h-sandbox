import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { apiKeyScopes, defaultApiKeyScopes } from "@harakiri/shared";
import { authorizeRequest, hasScope, permits, routePermission } from "./authorization.js";
import { createAuthHandler, revalidatePrincipal, streamAuthValid, verifyAccessToken } from "./auth.js";
import type { AuthContext } from "./auth-context.js";
import { registerRoutes } from "./routes.js";
import { readApiKeyPrincipal } from "./services/api-key-principals.js";
import { resolveCredentialSecretMaterial } from "./services/workspace-credential-secrets.js";
import { canManageCredentials } from "./services/organization-access.js";
import { consumeTerminalAttachTicket, createTerminalAttachTicket } from "./services/terminal-attach-tickets.js";
import { watchTerminalAuthorization } from "./live-authorization.js";
import { commandEvents } from "./services/command-events.js";
import type { SandboxCommandEvent, SandboxCommandSummary } from "@harakiri/shared";
import type { Query } from "./services/query.js";

const user: AuthContext = { authType: "keycloak", userId: "user", organizationId: "org", role: "member", actorLabel: "member@example.com", subject: "sub", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
const key: AuthContext = { authType: "api_key", userId: null, apiKeyId: "key", organizationId: "org", actorLabel: "api-key:key", scopes: [...defaultApiKeyScopes] };
const keyRow = { id: "key", organizationId: "org", scopes: [...apiKeyScopes], expiresAt: new Date(Date.now() + 86400_000), legacy: false, creatorRole: "admin" };
const result = (row?: unknown) => ({ rows: (row ? [row] : []) as never[], rowCount: row ? 1 : 0 });

test("signed access tokens require the API audience, issuer, subject, expiry and approved algorithm", async () => {
  const keys = await generateKeyPair("RS256");
  const settings = { keycloakIssuerAllowlist: ["https://auth.example/realms/test"], keycloakAudience: "harakiri-api", keycloakJwksUrl: undefined, keycloakSigningAlgorithms: ["RS256"] };
  const claims = { iss: settings.keycloakIssuerAllowlist[0], aud: "harakiri-api", sub: "user", exp: Math.floor(Date.now() / 1000) + 600 };
  const sign = (body: Record<string, unknown>) => new SignJWT(body).setProtectedHeader({ alg: "RS256" }).sign(keys.privateKey);
  assert.equal((await verifyAccessToken(await sign(claims), settings, async () => keys.publicKey)).sub, "user");
  for (const patch of [{ aud: "account", azp: "harakiri-web" }, { iss: "https://attacker.example" }, { sub: "" }, { sub: undefined }, { exp: undefined }, { exp: 1 }, { aud: undefined }]) {
    await assert.rejects(verifyAccessToken(await sign({ ...claims, ...patch }), settings, async () => keys.publicKey));
  }
  const other = await generateKeyPair("RS256");
  await assert.rejects(verifyAccessToken(await sign(claims), settings, async () => other.publicKey));
  await assert.rejects(verifyAccessToken(await sign(claims), { ...settings, keycloakSigningAlgorithms: ["ES256"] }, async () => keys.publicKey));
});

test("invalid supplied credentials cannot fall through to development identity", async () => {
  const app = Fastify();
  let queries = 0;
  app.addHook("preHandler", createAuthHandler({ devAllowed: () => true, verify: async () => { throw new Error("invalid"); }, query: async () => { queries++; return result(); } }));
  app.get("/test", async () => ({}));
  try {
    for (const headers of [{ authorization: "Bearer invalid" }, { "x-api-key": "" }, { "x-api-key": "hk_revoked" }]) {
      assert.equal((await app.inject({ url: "/test", headers })).statusCode, 401);
    }
    assert.equal(queries, 1); // Revoked key lookup, no dev-user provisioning.
  } finally { await app.close(); }
});

test("registered API routes each have an explicit authorization policy", async () => {
  const app = Fastify();
  const missing: string[] = [];
  app.addHook("onRoute", (route) => {
    if (["/health", "/v1/bootstrap", "/openapi.json"].includes(route.url) || route.url.startsWith("/v1/route-proxy/")) return;
    for (const method of [route.method].flat()) if (method !== "OPTIONS" && !routePermission(method, route.url)) missing.push(`${method} ${route.url}`);
  });
  try { await registerRoutes(app); await app.ready(); assert.deepEqual(missing, []); }
  finally { await app.close(); }
});

test("server policy rejects member administration, key delegation and unrecognized routes", async () => {
  const app = Fastify();
  let principal: AuthContext = user;
  let writes = 0;
  app.addHook("preHandler", async (req, reply) => { req.auth = principal; return authorizeRequest(req, reply); });
  for (const path of ["/v1/org/settings", "/v1/api-keys", "/v1/sandboxes", "/v1/new-feature"]) app.route({ method: ["GET", "POST", "PATCH"], url: path, handler: async () => { writes++; return {}; } });
  try {
    assert.equal((await app.inject({ method: "PATCH", url: "/v1/org/settings", payload: {} })).statusCode, 403);
    assert.equal(writes, 0);
    principal = { ...user, role: "admin" };
    assert.equal((await app.inject({ method: "PATCH", url: "/v1/org/settings", payload: {} })).statusCode, 200);
    principal = { ...key, scopes: [...apiKeyScopes] };
    for (const url of ["/v1/api-keys", "/v1/org/settings", "/v1/new-feature"]) assert.equal((await app.inject({ method: "POST", url, payload: {} })).statusCode, 403);
    principal = { ...key, scopes: ["sandboxes:write" as const] };
    for (const payload of [{ credentials: [{}] }, { credentialMappings: [{}] }, { workspaceId: "wsp_test" }]) assert.equal((await app.inject({ method: "POST", url: "/v1/sandboxes", payload })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/v1/sandboxes", payload: {} })).statusCode, 200);
    assert.equal(permits({ ...key, scopes: ["sandboxes:read" as const] }, routePermission("GET", "/v1/sandboxes/:id/terminal/attach")), false);
    assert.equal(permits({ ...user, role: undefined }, routePermission("GET", "/v1/org/settings")), false);
  } finally { await app.close(); }
});

test("capacity is tenant-scoped, member-readable and requires org:read on API keys", async () => {
  const app = Fastify();
  let principal: AuthContext | null = user;
  const observedOrganizations: unknown[] = [];
  await registerRoutes(app, {
    requireAuth: async (request, reply) => { if (!principal) { reply.code(401).send({ error: "unauthorized" }); return; } request.auth = principal; },
    query: async (sql, params) => {
      assert.match(sql, /SELECT o.max_concurrency/);
      observedOrganizations.push(params?.[0]);
      return result({ max_concurrency: 2, capacity_state: "enforced", capacity_revision: 1, reserved: 1, active: 1, releasing: 0, uncertain: 0, observed_at: new Date() });
    }
  });
  try {
    const read = await app.inject("/v1/org/capacity?organizationId=attacker-supplied");
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().capacity.inUse, 2);
    assert.deepEqual(observedOrganizations, ["org"]);
    principal = { ...key, scopes: ["sandboxes:read"] };
    assert.equal((await app.inject("/v1/org/capacity")).statusCode, 403);
    assert.equal(observedOrganizations.length, 1);
    principal = { ...key, organizationId: "another-org", scopes: ["org:read"] };
    assert.equal((await app.inject("/v1/org/capacity")).statusCode, 200);
    assert.equal(observedOrganizations.at(-1), "another-org");
    principal = null;
    assert.equal((await app.inject("/v1/org/capacity")).statusCode, 401);
    assert.equal(observedOrganizations.length, 2);
  } finally { await app.close(); }
});

test("key identity never borrows a user; creator demotion, expiry and org changes limit access", async () => {
  const read = (patch = {}) => readApiKeyPrincipal({ id: "key", organizationId: "org" }, async () => result({ ...keyRow, ...patch }));
  const principal = await read();
  assert.equal(principal?.userId, null);
  assert.equal(principal?.actorLabel, "api-key:key");
  assert.ok(principal && hasScope(principal, "credentials:manage"));
  assert.deepEqual((await read({ creatorRole: "member" }))?.scopes, defaultApiKeyScopes);
  assert.deepEqual((await read({ legacy: true, creatorRole: null, expiresAt: null }))?.scopes, defaultApiKeyScopes);
  for (const patch of [{ creatorRole: null }, { organizationId: "other" }, { expiresAt: null }, { expiresAt: new Date(0) }]) assert.equal(await read(patch), null);
  assert.equal(await revalidatePrincipal(user, async () => result()), null);
  assert.equal(await revalidatePrincipal({ ...user, expiresAt: new Date(0).toISOString() }, async () => { throw new Error("must not query"); }), null);
});

test("credential-use keys cannot read admin-only material or mutate sources", async () => {
  let shared = false;
  const query: Query = async (sql) => sql.includes("FROM api_keys ak") ? result({ ...keyRow, scopes: ["credentials:use"] }) : result({ memberUseAllowed: shared, secretCiphertext: "encrypted", secretIv: "iv", secretTag: "tag" });
  const actor = { organizationId: "org", actorUserId: null, actorApiKeyId: "key", secretId: "secret" };
  assert.equal(await canManageCredentials("org", actor, query), false);
  let decrypted = false;
  const options = { query, decryptSecret: () => { decrypted = true; return "value"; } };
  assert.equal((await resolveCredentialSecretMaterial(actor, options)).kind, "forbidden");
  assert.equal(decrypted, false);
  shared = true;
  assert.equal((await resolveCredentialSecretMaterial(actor, options)).kind, "ok");
  assert.equal(decrypted, true);
  assert.equal(await canManageCredentials("org", { ...actor, actorUserId: "user" }, query), false);
  let unknownRoleQueries = 0;
  const unknownRole = await resolveCredentialSecretMaterial(
    { organizationId: "org", actorUserId: "user", secretId: "secret" },
    { query: async () => { unknownRoleQueries++; return result({ role: "unknown" }); }, decryptSecret: () => { throw new Error("must not decrypt"); } }
  );
  assert.equal(unknownRole.kind, "forbidden");
  assert.equal(unknownRoleQueries, 1);
});

test("tickets store key identity; revocation, read-only keys and legacy borrowed identities fail closed", async () => {
  let revoked = false;
  let scopes = ["sandboxes:write"];
  let stored: unknown[] = [];
  let used = false;
  const query: Query = async (sql, params) => {
    if (sql.includes("FROM api_keys ak")) return revoked ? result() : result({ ...keyRow, scopes });
    if (sql.includes("SELECT id, status")) return result({ id: "sbx", status: "running" });
    if (sql.includes("INSERT INTO terminal_attach_tickets")) { stored = params!; return result(); }
    if (used) return result();
    used = true;
    return result({ organizationId: stored[2], userId: stored[3], actorLabel: stored[4], authType: stored[5], apiKeyId: stored[7], authExpiresAt: new Date(String(stored[8])), subject: stored[9] });
  };
  const created = await createTerminalAttachTicket({ sandboxId: "sbx", auth: key }, { query });
  assert.equal(created.kind, "ok");
  assert.equal(stored[3], null); assert.equal(stored[7], "key");
  assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx", ticket: "ticket" }, { query })).kind, "ok");
  assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx", ticket: "ticket" }, { query })).kind, "invalid");
  used = false; revoked = true;
  assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx", ticket: "ticket" }, { query })).kind, "invalid");
  revoked = false; scopes = ["sandboxes:read"];
  assert.equal((await createTerminalAttachTicket({ sandboxId: "sbx", auth: key }, { query })).kind, "forbidden");
  for (const authType of ["invalid", "api_key", "keycloak"]) {
    const bad = await consumeTerminalAttachTicket({ sandboxId: "sbx", ticket: "ticket" }, { query: async () => result({ organizationId: "org", userId: "borrowed", authType, actorLabel: "old" }) });
    assert.equal(bad.kind, "invalid");
  }
});

test("live terminal watchers disconnect on revocation, lost scope, expiry and failed checks", async () => {
  for (const query of [async () => result(), async () => result({ ...keyRow, scopes: ["sandboxes:read"] }), async () => { throw new Error("database down"); }, () => new Promise<never>(() => {})]) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { stop(); reject(new Error("watcher did not disconnect")); }, 1000);
      const stop = watchTerminalAuthorization(key, () => { clearTimeout(timeout); resolve(); }, { query, intervalMs: 5, timeoutMs: 10 });
    });
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error("expiry missed")); }, 1000);
    const stop = watchTerminalAuthorization({ ...user, expiresAt: new Date(Date.now() + 10).toISOString() }, () => { clearTimeout(timeout); resolve(); }, { query: async () => result({ role: "member" }), intervalMs: 500 });
  });
});

test("command streams check refreshed key scopes before reading more output", async () => {
  const request: Pick<FastifyRequest, "auth" | "headers"> = { auth: key, headers: { "x-api-key": "hk_fixture" } };
  let checks = 0, reads = 0;
  const query: Query = async () => result({ ...keyRow, scopes: ++checks === 1 ? ["sandboxes:read"] : ["credentials:use"] });
  const events: Array<SandboxCommandEvent | "heartbeat"> = [];
  for await (const event of commandEvents({
    commandId: "cmd_test", signal: new AbortController().signal, pollMs: 0,
    authorize: async () => await streamAuthValid(request, query) && hasScope(request.auth, "sandboxes:read"),
    readCommand: async () => { reads++; return { id: "cmd_test", status: "running", detached: true, providerCommandId: "native", exitCode: null } as SandboxCommandSummary; },
    readLogs: async () => ({ commandId: "cmd_test", stdout: "first output", stderr: "", cursor: 1 })
  })) events.push(event);
  assert.equal(reads, 1);
  assert.equal((events.at(-1) as { code: string }).code, "unauthorized");
  assert.equal(request.auth.userId, null);
  assert.deepEqual(request.auth.scopes, ["credentials:use"]);
  assert.equal(await streamAuthValid(request, async () => result()), false);
});
