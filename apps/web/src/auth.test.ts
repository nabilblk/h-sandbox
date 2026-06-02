import assert from "node:assert/strict";
import test from "node:test";
import { AuthSessionExpiredError, createAuthSession } from "./auth.js";

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
};

const installBrowser = (hash = "#dashboard/sandboxes") => {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const location = { origin: "http://app.test", pathname: "/", hash };
  const window = {
    location,
    localStorage,
    sessionStorage,
    addEventListener: (name: string, listener: (event: unknown) => void) => {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
    },
    removeEventListener: (name: string, listener: (event: unknown) => void) => listeners.get(name)?.delete(listener),
    scrollTo: () => undefined
  };
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "location", { value: location, configurable: true });
  const emitStorage = (key: string, newValue: string) => {
    for (const listener of listeners.get("storage") ?? []) listener({ key, newValue });
  };
  return { window, localStorage, sessionStorage, emitStorage };
};

const createClient = (options: { authenticated?: boolean; refreshFails?: boolean } = {}) => {
  const calls = {
    init: [] as unknown[],
    login: [] as unknown[],
    logout: [] as unknown[],
    updateToken: [] as number[],
    clearToken: 0
  };
  const client = {
    authenticated: options.authenticated ?? false,
    token: options.authenticated ? "initial-token" : undefined,
    tokenParsed: options.authenticated ? { sub: "user-1", email: "lyra@k.ai", name: "Lyra Ito" } : undefined,
    idToken: options.authenticated ? "id-token" : undefined,
    idTokenParsed: options.authenticated ? { sub: "user-1", email: "lyra@k.ai", name: "Lyra Ito" } : undefined,
    onAuthSuccess: undefined,
    onAuthRefreshSuccess: undefined,
    onAuthRefreshError: undefined,
    onAuthLogout: undefined,
    onTokenExpired: undefined,
    init: async (initOptions: unknown) => {
      calls.init.push(initOptions);
      return client.authenticated;
    },
    login: async (loginOptions: unknown) => {
      calls.login.push(loginOptions);
    },
    logout: async (logoutOptions: unknown) => {
      calls.logout.push(logoutOptions);
    },
    updateToken: async (minValidity?: number) => {
      calls.updateToken.push(minValidity ?? 5);
      if (options.refreshFails) throw new AuthSessionExpiredError();
      client.authenticated = true;
      client.token = minValidity === -1 ? "forced-refresh-token" : "fresh-token";
      return true;
    },
    clearToken: () => {
      calls.clearToken += 1;
      client.authenticated = false;
      client.token = undefined;
    },
    loadUserProfile: async () => ({ email: "lyra@k.ai" })
  };
  return { client, calls };
};

test("auth session initializes Keycloak, removes legacy localStorage tokens, and derives profile from token claims", async () => {
  const { localStorage } = installBrowser();
  localStorage.setItem("harakiri_access_token", "legacy");
  localStorage.setItem("harakiri_profile", "{}");
  const { client, calls } = createClient({ authenticated: true });
  const session = createAuthSession(() => client);

  const snapshot = await session.init();

  assert.equal(snapshot.status, "authenticated");
  assert.deepEqual(snapshot.profile, { sub: "user-1", email: "lyra@k.ai", name: "Lyra Ito" });
  assert.equal(localStorage.getItem("harakiri_access_token"), null);
  assert.equal(localStorage.getItem("harakiri_profile"), null);
  assert.equal(await session.getAccessToken(30), "fresh-token");
  assert.deepEqual(calls.updateToken, [30]);
  assert.equal((calls.init[0] as { pkceMethod?: string; flow?: string }).pkceMethod, "S256");
  assert.equal((calls.init[0] as { flow?: string }).flow, "standard");
  assert.equal((calls.init[0] as { checkLoginIframe?: boolean }).checkLoginIframe, false);
});

test("sign-in stores a safe return route and delegates login to Keycloak", async () => {
  const { sessionStorage } = installBrowser("#dashboard/templates");
  const { client, calls } = createClient({ authenticated: false });
  const session = createAuthSession(() => client);

  await session.signIn();

  assert.equal(sessionStorage.getItem("harakiri_auth_return_route"), "dashboard/templates");
  assert.equal((calls.login[0] as { redirectUri?: string }).redirectUri, "http://app.test/");
  assert.equal((calls.login[0] as { scope?: string }).scope, "openid email profile");
});

test("sign-in accepts public changelog as a safe return route", async () => {
  const { sessionStorage } = installBrowser("#changelog");
  const { client } = createClient({ authenticated: false });
  const session = createAuthSession(() => client);

  await session.signIn();

  assert.equal(sessionStorage.getItem("harakiri_auth_return_route"), "changelog");
});

test("sign-in preserves a protected route remembered before check-sso redirects", async () => {
  const { sessionStorage } = installBrowser("#landing");
  sessionStorage.setItem("harakiri_auth_return_route", "dashboard/sandboxes");
  const { client } = createClient({ authenticated: false });
  const session = createAuthSession(() => client);

  await session.signIn("landing");

  assert.equal(sessionStorage.getItem("harakiri_auth_return_route"), "dashboard/sandboxes");
});

test("refresh failure clears the session and exposes an expired state", async () => {
  installBrowser();
  const { client } = createClient({ authenticated: true, refreshFails: true });
  const session = createAuthSession(() => client);

  await assert.rejects(() => session.getAccessToken(30), AuthSessionExpiredError);

  assert.equal(session.snapshot().status, "expired");
  assert.equal(session.snapshot().profile, null);
});

test("sign-out uses provider logout with a Harakiri post-logout redirect", async () => {
  const { sessionStorage } = installBrowser("#dashboard/sandboxes");
  const { client, calls } = createClient({ authenticated: true });
  const session = createAuthSession(() => client);
  sessionStorage.setItem("harakiri_auth_return_route", "dashboard/sandboxes");

  await session.signOut();

  assert.equal(sessionStorage.getItem("harakiri_auth_return_route"), null);
  assert.deepEqual(calls.logout[0], { redirectUri: "http://app.test/#landing", logoutMethod: "GET" });
  assert.equal(session.snapshot().status, "signing-out");
  assert.equal(globalThis.location.hash, "#dashboard/sandboxes");
});

test("storage logout events clear an authenticated tab", async () => {
  const { emitStorage } = installBrowser();
  const { client } = createClient({ authenticated: true });
  const session = createAuthSession(() => client);
  await session.init();

  emitStorage("harakiri_auth_event", JSON.stringify({ event: "logout", at: Date.now() }));

  assert.equal(session.snapshot().status, "anonymous");
  assert.equal(session.snapshot().profile, null);
});
