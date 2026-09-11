import { check, origins, until } from "./context.mjs";

const scopes = ["sandboxes:read", "sandboxes:write", "templates:read", "templates:write", "workspaces:read", "workspaces:write", "credentials:use", "credentials:manage", "org:read", "audit:read"];

export async function operatorSession(ctx) {
  const { chromium } = await ctx.loadClients();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  let bearer = "";
  let pkce = false;
  const keyIds = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === origins.api && url.pathname.startsWith("/v1/")) {
      const header = request.headers().authorization;
      if (header?.startsWith("Bearer ")) bearer = header;
    }
    if (url.origin === origins.auth && url.pathname.endsWith("/protocol/openid-connect/auth")) {
      pkce = url.searchParams.get("response_type") === "code" && url.searchParams.get("code_challenge_method") === "S256" && Boolean(url.searchParams.get("code_challenge"));
    }
  });
  const request = async (route, method = "GET", body, expected = 200) => {
    check(route.startsWith("/v1/"), "Operator request outside the installed API");
    check(bearer, "Browser has not authenticated");
    const response = await fetch(`${origins.api}${route}`, {
      method, headers: { authorization: bearer, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000)
    });
    check(response.status === expected, `Operator ${method} ${route}: HTTP ${response.status}, expected ${expected}`);
    return response.status === 204 ? null : response.json();
  };
  const login = async () => {
    bearer = "";
    await page.goto(`${origins.web}/#dashboard/sandboxes`);
    const username = page.locator('input[name="username"]');
    await until("Sign-in entry", async () => {
      if (await username.isVisible()) return true;
      const button = page.getByRole("button", { name: /^Sign in/i }).first();
      if (await button.isVisible()) { await button.click(); return true; }
      return false;
    }, 60000);
    await username.waitFor();
    const credentials = ctx.read("operator-login.json");
    await username.fill(credentials.username);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator("#kc-login").click();
    await until("OIDC callback", () => Boolean(bearer), 60000);
    check(pkce, "Browser did not use the authorization code flow with S256 PKCE");
    await until("Account view", async () => (await page.getByRole("heading", { name: "Welcome to Harakiri." }).isVisible()) || (await page.locator('[aria-label^="Account:"]').first().isVisible()));
    const storedToken = await page.evaluate(() => localStorage.getItem("harakiri_access_token"));
    check(storedToken === null, "An access token was persisted in localStorage");
    return request("/v1/me");
  };
  const logout = async () => {
    await page.locator('[aria-label^="Account:"]').first().click();
    await page.getByRole("button", { name: "Sign out of Harakiri and Keycloak" }).click();
    await until("Logout return", () => new URL(page.url()).origin === origins.web && !page.url().includes("dashboard"), 45000);
    bearer = "";
    // A fresh authorization request must show the password form, not silently reuse SSO.
    await page.goto(`${origins.web}/#dashboard/sandboxes`);
    await page.getByRole("button", { name: /^Sign in/i }).first().click();
    await page.locator('input[name="password"]').waitFor();
  };
  try {
    const account = await login();
    check(account.membership.role === "admin", "Fresh operator is not organization admin");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("textbox", { name: "Organization name", exact: true }).fill("Standalone acceptance");
    await page.getByRole("textbox", { name: "Slug", exact: true }).fill(`acceptance-${ctx.identity.id}`);
    await page.getByRole("button", { name: "Continue" }).click();
    const keyResponse = page.waitForResponse(response => response.url() === `${origins.api}/v1/api-keys` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create key", exact: true }).click();
    const onboardingKey = await keyResponse;
    check(onboardingKey.status() === 201, "Onboarding API key creation failed");
    keyIds.push((await onboardingKey.json()).key.id);
    // The standalone catalog is intentionally empty; import a verified template next.
    await page.getByRole("button", { name: "Open dashboard" }).click();
    await page.locator('[aria-label^="Account:"]').first().waitFor();
    await request(`/v1/api-keys/${keyIds[0]}`, "DELETE");
    const created = await request("/v1/api-keys", "POST", {
      name: "isolated-acceptance", scopes, expiresAt: new Date(Date.now() + 6 * 3600000).toISOString()
    }, 201);
    keyIds.push(created.key.id);
    ctx.save("client-key.json", { token: created.token, id: created.key.id });
    const { HarakiriClient } = await ctx.loadClients();
    const client = new HarakiriClient({ apiUrl: origins.api, apiKey: created.token });
    const { capacity } = await client.capacity();
    check(capacity.state === "enforced" && capacity.inUse === 0, "Fresh capacity inventory is not empty and enforced");
    await request("/v1/org/settings", "PATCH", { maxConcurrency: 1, expectedCapacityRevision: capacity.revision });
    const identity = await request("/v1/me");
    check(identity.user.onboardingCompletedAt, "Onboarding completion was not persisted");
    ctx.save("account.json", { userId: identity.user.id, organizationId: identity.organization.id, keyId: created.key.id });
    return { browser, page, request, login, logout, client, keyIds, oidcOnboarding: true, pkceS256: true };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
