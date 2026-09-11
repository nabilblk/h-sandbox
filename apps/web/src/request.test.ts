import assert from "node:assert/strict";
import test from "node:test";
import { AuthSessionExpiredError, type AuthSession } from "./auth.js";
import { ApiResponseError, createRequester } from "./api-client/request.js";

const makeSession = (tokens: Array<string | null | Error>): AuthSession => {
  const calls: number[] = [];
  return {
    init: async () => ({ status: "authenticated", profile: null }),
    signIn: async () => undefined,
    signOut: async () => undefined,
    getAccessToken: async (minValidity?: number) => {
      calls.push(minValidity ?? 30);
      const next = tokens.shift();
      if (next instanceof Error) throw next;
      return next ?? null;
    },
    clearLocalSession: () => undefined,
    consumeReturnRoute: () => null,
    peekReturnRoute: () => null,
    rememberReturnRoute: () => undefined,
    isAuthenticated: () => true,
    profile: () => null,
    snapshot: () => ({ status: "authenticated", profile: null }),
    subscribe: () => () => undefined,
    calls
  } as AuthSession & { calls: number[] };
};

test("request refreshes before sending an authenticated API call", async () => {
  const seen = [] as string[];
  Object.defineProperty(globalThis, "fetch", {
    value: async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("authorization") ?? "");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    configurable: true
  });
  const session = makeSession(["fresh-token"]);
  const request = createRequester(session);

  const result = await request<{ ok: boolean }>("/v1/me");

  assert.deepEqual(result, { ok: true });
  assert.deepEqual((session as AuthSession & { calls: number[] }).calls, [30]);
  assert.deepEqual(seen, ["Bearer fresh-token"]);
});

test("request retries one 401 after a forced token refresh", async () => {
  const seen = [] as string[];
  Object.defineProperty(globalThis, "fetch", {
    value: async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("authorization") ?? "");
      if (seen.length === 1) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    configurable: true
  });
  const session = makeSession(["old-token", "new-token"]);
  const request = createRequester(session);

  const result = await request<{ ok: boolean }>("/v1/me");

  assert.deepEqual(result, { ok: true });
  assert.deepEqual((session as AuthSession & { calls: number[] }).calls, [30, -1]);
  assert.deepEqual(seen, ["Bearer old-token", "Bearer new-token"]);
});

test("request retries one transient API network failure", async () => {
  let calls = 0;
  Object.defineProperty(globalThis, "fetch", {
    value: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    configurable: true
  });
  const session = makeSession(["fresh-token"]);
  const request = createRequester(session);

  const result = await request<{ ok: boolean }>("/v1/me");

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("request explains persistent API network failures", async () => {
  Object.defineProperty(globalThis, "fetch", {
    value: async () => {
      throw new TypeError("Failed to fetch");
    },
    configurable: true
  });
  const session = makeSession(["fresh-token"]);
  const request = createRequester(session);

  await assert.rejects(() => request("/v1/me"), /Unable to reach Harakiri API/);
});

test("request surfaces expired sessions as a user-facing error", async () => {
  const session = makeSession([new AuthSessionExpiredError()]);
  const request = createRequester(session);

  await assert.rejects(() => request("/v1/me"), /Session expired/);
});

test("request explains Keycloak network failures before API calls", async () => {
  const session = makeSession([new TypeError("Failed to fetch")]);
  const request = createRequester(session);

  await assert.rejects(() => request("/v1/me"), /Unable to reach Keycloak/);
});

test("unkeyed mutations never retry a lost response; keyed retries preserve the body", async () => {
  const sent: RequestInit[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: string, init: RequestInit) => {
    sent.push(init);
    if (sent.length < 3) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ ok: true }));
  } });
  const request = createRequester(makeSession(["token", "token"]));
  await assert.rejects(request("/v1/sandboxes", { method: "POST", body: "{}" }), /Unable to reach/);
  assert.equal(sent.length, 1);
  await request("/v1/sandboxes", { method: "POST", body: '{"idempotencyKey":"same-intent"}', headers: { "Idempotency-Key": "same-intent" } });
  assert.equal(sent.length, 3);
  assert.equal(sent[1].body, sent[2].body);
  assert.equal(new Headers(sent[2].headers).get("Idempotency-Key"), "same-intent");
});

test("capacity conflicts preserve structured details without retrying", async () => {
  let calls = 0;
  const capacity = { state: "enforced", limit: 2, revision: 1, inUse: 2, available: 0, overLimit: 0, breakdown: { active: 2, reserved: 0, releasing: 0, uncertain: 0 }, observedAt: new Date().toISOString() };
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => {
    calls++;
    return new Response(JSON.stringify({ error: "organization_capacity_exceeded", message: "All slots occupied", capacity }), { status: 409 });
  } });
  const request = createRequester(makeSession(["token"]));
  await assert.rejects(request("/v1/sandboxes", { method: "POST", body: "{}" }), (error: unknown) => {
    assert.ok(error instanceof ApiResponseError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "organization_capacity_exceeded");
    assert.deepEqual(error.details?.capacity, capacity);
    return true;
  });
  assert.equal(calls, 1);
});
