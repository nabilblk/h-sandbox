import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const WEB_URL = process.env.HARAKIRI_WEB_URL ?? "http://127.0.0.1:15173";
const KEYCLOAK_USER = process.env.KEYCLOAK_USER ?? "lyra@k.ai";
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD ?? "harakiri-dev";
const ARTIFACT_DIR = path.resolve("docs/artifacts");

async function capture(page: Page, name: string) {
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: true });
}

async function signInFromGate(page: Page) {
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page.getByText("Disposable runtimes, sealed on demand.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Keycloak SSO")).toBeVisible();
  await capture(page, "04-keycloak-login-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "05-keycloak-login-mobile");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('input[name="username"]').fill(KEYCLOAK_USER);
  await page.locator('input[name="password"]').fill(KEYCLOAK_PASSWORD);
  await page.locator("#kc-login").click();
  await page.waitForURL(/#dashboard\/sandboxes$/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
}

async function captureTemplatesWorkspace(page: Page) {
  await page.goto(`${WEB_URL}/#dashboard/templates`);
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(page.locator(".tmpl-row").first()).toContainText("Name");
  await capture(page, "13-templates-list-desktop");

  await page.locator(".tmpl-row[role='button']").first().click();
  await expect(page.getByText("Template detail")).toBeVisible();
  await capture(page, "14-template-detail-desktop");

  await page.locator(".tmpl-tab", { hasText: "Builds" }).click();
  await expect(page.locator(".build-row").first()).toContainText("Status");
  await capture(page, "15-template-builds-desktop");

  await page.locator(".build-row[role='button']").first().click();
  await expect(page.getByText("Build details")).toBeVisible();
  await capture(page, "16-template-build-detail-desktop");

  await page.getByRole("button", { name: /New template/i }).click();
  await expect(page.getByRole("heading", { name: "New template" })).toBeVisible();
  await expect(page.getByText("harakiri.toml")).toBeVisible();
  await capture(page, "17-new-template-desktop");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB_URL}/#dashboard/templates`);
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await capture(page, "18-templates-mobile");

  await page.getByRole("button", { name: /New template/i }).click();
  await expect(page.getByRole("heading", { name: "New template" })).toBeVisible();
  await capture(page, "19-new-template-mobile");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
}

test("capture deployed UI screenshots for visual review", async ({ page }) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${WEB_URL}/#landing`);
  await expect(page.getByRole("heading", { name: /Disposable VMs/ })).toBeVisible();
  await capture(page, "01-landing-desktop");

  await page.goto(`${WEB_URL}/#docs`);
  await expect(page.getByRole("heading", { name: "Quickstart" })).toBeVisible();
  await capture(page, "02-docs-desktop");

  await page.goto(`${WEB_URL}/#dashboard/sandboxes`);
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible();
  await capture(page, "03-signin-desktop");

  await signInFromGate(page);
  await capture(page, "06-dashboard-desktop");

  await captureTemplatesWorkspace(page);

  await page.locator(".side-link", { hasText: "API keys" }).click();
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await capture(page, "07-api-keys-desktop");

  await page.locator(".side-link", { hasText: "Usage" }).click();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await capture(page, "08-usage-desktop");

  await page.goto(`${WEB_URL}/#onboarding`);
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await capture(page, "09-onboarding-redirect-desktop");

  await page.goto(`${WEB_URL}/#dashboard/sandboxes`);
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await page.getByRole("button", { name: /All/i }).click();
  await page.waitForTimeout(500);
  const sandboxRow = page.locator(".sbx-table .sbx-tr", { has: page.locator(".sbx-id") }).first();
  if (await sandboxRow.count()) {
    await sandboxRow.click();
    await expect(page.getByRole("button", { name: "Terminal" })).toBeVisible();
    await capture(page, "10-detail-desktop");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB_URL}/#landing`);
  await expect(page.getByRole("heading", { name: /Disposable VMs/ })).toBeVisible();
  await capture(page, "11-landing-mobile");

  await page.goto(`${WEB_URL}/#dashboard/sandboxes`);
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await capture(page, "12-dashboard-mobile");
});
