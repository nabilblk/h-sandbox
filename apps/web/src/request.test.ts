import assert from "node:assert/strict";
import test from "node:test";
import { AuthSessionExpiredError, type AuthSession } from "./auth.js";
import { ApiResponseError, createRequester, readBoundedJson } from "./api-client/request.js";

test("bounded JSON responses stop reading beyond the byte budget", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(100)); },
    cancel() { cancelled = true; }
  }));
  await assert.rejects(readBoundedJson(response, 150), /transfer limit/);
  assert.equal(cancelled, true);
  assert.deepEqual(await readBoundedJson(new Response('{"ok":true}'), 11), { ok: true });
  await assert.rejects(readBoundedJson(new Response("{}"), 2, AbortSignal.abort(new Error("cancelled"))), /cancelled/);
});

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

for (const forcedRefresh of [false, true]) {
  test(`cancellation interrupts ${forcedRefresh ? "forced" : "initial"} token refresh without replaying after late authentication`, async () => {
    let calls = 0;
    let resolveToken!: (token: string) => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const session = makeSession([]);
    let tokens = 0;
    session.getAccessToken = () => {
      if (forcedRefresh && tokens++ === 0) return Promise.resolve("old-token");
      entered();
      return new Promise<string>((resolve) => { resolveToken = resolve; });
    };
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => {
      calls++;
      return new Response('{"error":"unauthorized"}', { status: 401 });
    } });
    const controller = new AbortController();
    const result = createRequester(session)("/v1/me", { signal: controller.signal });
    await waiting;
    const reason = new Error("Request timed out. Refresh to try again.");
    controller.abort(reason);
    await assert.rejects(result, (error) => error === reason);
    resolveToken("late-token");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls, forcedRefresh ? 1 : 0);
  });
}

test("cancelling one caller does not cancel another caller's shared authentication", async () => {
  let resolveToken!: (token: string) => void;
  const pending = new Promise<string>((resolve) => { resolveToken = resolve; });
  const session = makeSession([]);
  let tokenCalls = 0;
  session.getAccessToken = () => { tokenCalls++; return pending; };
  let sends = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => {
    sends++;
    return new Response('{"ok":true}');
  } });
  const request = createRequester(session);
  await assert.rejects(request("/v1/me", { signal: AbortSignal.abort(new Error("already cancelled")) }), /already cancelled/);
  assert.equal(tokenCalls, 0);
  const controller = new AbortController();
  const cancelled = request("/v1/me", { signal: controller.signal });
  const surviving = request("/v1/me");
  controller.abort(new Error("cancelled caller"));
  await assert.rejects(cancelled, /cancelled caller/);
  resolveToken("shared-token");
  assert.deepEqual(await surviving, { ok: true });
  assert.equal(sends, 1);
});

test("late authentication rejection remains handled after caller cancellation", async () => {
  let rejectToken!: (cause: Error) => void;
  const session = makeSession([]);
  session.getAccessToken = () => new Promise<string>((_resolve, reject) => { rejectToken = reject; });
  const controller = new AbortController();
  const result = createRequester(session)("/v1/me", { signal: controller.signal });
  controller.abort(new Error("cancelled caller"));
  await assert.rejects(result, /cancelled caller/);
  rejectToken(new Error("late refresh failure"));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

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
