import { expect, test } from "@playwright/test";

const WEB_URL = process.env.HARAKIRI_WEB_URL ?? "http://127.0.0.1:15173";
const KEYCLOAK_USER = process.env.KEYCLOAK_USER ?? "lyra@k.ai";
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD ?? "harakiri-dev";

test("web OIDC session uses memory-only tokens and provider logout", async ({ page }) => {
  await page.goto(`${WEB_URL}/?oidc=${Date.now()}#dashboard/sandboxes`, { waitUntil: "domcontentloaded" });

  const signIn = page.getByRole("button", { name: /^Sign in/ });
  if (await signIn.isVisible({ timeout: 15_000 }).catch(() => false)) await signIn.click();
  if (await page.locator('input[name="username"]').isVisible({ timeout: 15_000 }).catch(() => false)) {
    await page.locator('input[name="username"]').fill(KEYCLOAK_USER);
    await page.locator('input[name="password"]').fill(KEYCLOAK_PASSWORD);
    await page.locator("#kc-login").click();
  }

  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("harakiri_access_token"))).toBeNull();

  await page.locator(".account-trigger").click();
  await expect(page.getByText("Sign out of Harakiri and Keycloak")).toBeVisible();
  await page.getByText("Sign out of Harakiri and Keycloak").click();
  await page.waitForURL(/#landing$/, { timeout: 45_000 });

  await page.goto(`${WEB_URL}/?signedout=${Date.now()}#dashboard/sandboxes`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible({ timeout: 45_000 });
});
