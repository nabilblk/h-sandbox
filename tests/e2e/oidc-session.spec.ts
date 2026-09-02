import { expect, test, type Page } from "@playwright/test";

const WEB_URL = process.env.HARAKIRI_WEB_URL ?? "http://127.0.0.1:15173";
const KEYCLOAK_USER = process.env.KEYCLOAK_USER ?? "lyra@k.ai";
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD ?? "harakiri-dev";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const isLoopbackUrl = (value: string) => {
  try {
    const host = new URL(value).hostname;
    return loopbackHosts.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
};

const recordLoopbackRequests = (page: Page) => {
  const urls: string[] = [];
  const record = (url: string) => {
    if (isLoopbackUrl(url)) urls.push(url);
  };
  page.on("request", (request) => record(request.url()));
  page.on("requestfailed", (request) => record(request.url()));
  return urls;
};

async function finishKeycloakLogin(page: Page) {
  if (await page.locator('input[name="username"]').isVisible({ timeout: 15_000 }).catch(() => false)) {
    await page.locator('input[name="username"]').fill(KEYCLOAK_USER);
    await page.locator('input[name="password"]').fill(KEYCLOAK_PASSWORD);
    await page.locator("#kc-login").click();
  }
}

test("web OIDC session uses memory-only tokens and provider logout", async ({ page }) => {
  await page.goto(`${WEB_URL}/?oidc=${Date.now()}#dashboard/sandboxes`, { waitUntil: "domcontentloaded" });

  const signIn = page.getByRole("button", { name: /^Sign in/ });
  if (await signIn.isVisible({ timeout: 15_000 }).catch(() => false)) await signIn.click();
  await finishKeycloakLogin(page);

  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("harakiri_access_token"))).toBeNull();

  await page.locator(".account-trigger").click();
  await expect(page.getByText("Sign out of Harakiri and Keycloak")).toBeVisible();
  await page.getByText("Sign out of Harakiri and Keycloak").click();
  await page.waitForURL(/#landing$/, { timeout: 45_000 });

  await page.goto(`${WEB_URL}/?signedout=${Date.now()}#dashboard/sandboxes`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible({ timeout: 45_000 });
});

test("hosted OIDC flow does not call loopback API or auth URLs", async ({ page }) => {
  test.skip(isLoopbackUrl(WEB_URL), "hosted-only regression: local web URLs are allowed to call local services");

  const loopbackRequests = recordLoopbackRequests(page);
  await page.goto(`${WEB_URL}/?hosted_oidc=${Date.now()}#dashboard/sandboxes`, { waitUntil: "domcontentloaded" });

  const signIn = page.getByRole("button", { name: /^Sign in/ });
  if (await signIn.isVisible({ timeout: 15_000 }).catch(() => false)) await signIn.click();
  await finishKeycloakLogin(page);

  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible({ timeout: 45_000 });
  await page.goto(`${WEB_URL}/#onboarding`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible({ timeout: 45_000 });
  await page.locator(".account-trigger").click();
  await page.getByText("Sign out of Harakiri and Keycloak").click();
  await page.waitForURL(/#landing$/, { timeout: 45_000 });

  expect(loopbackRequests).toEqual([]);
});
