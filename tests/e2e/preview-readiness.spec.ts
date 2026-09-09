import { expect, test, type Page } from "@playwright/test";
import { defaultWorkspace } from "../../apps/web/src/workspace";

// Browser contract fixtures. These are not evidence of native runtime isolation.
async function setup(page: Page) {
  const organization = defaultWorkspace({ email: "preview@example.test", name: "Preview" });
  await page.route("**/src/auth.ts", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class AuthSessionExpiredError extends Error {}
    const snapshot = { status: 'authenticated', profile: { email: 'preview@example.test', name: 'Preview' } };
    export const auth = { init: async () => snapshot, snapshot: () => snapshot, subscribe: (listener) => { listener(snapshot); return () => {}; },
      getAccessToken: async () => 'preview-browser-fixture', isAuthenticated: () => true, profile: () => snapshot.profile,
      clearLocalSession() {}, rememberReturnRoute() {}, consumeReturnRoute: () => null, peekReturnRoute: () => null, signIn() {}, signOut() {} };
  ` }));
  await page.route("**/v1/me", (route) => route.fulfill({ json: {
    user: { id: "preview", email: "preview@example.test", fullName: "Preview", onboardingCompletedAt: "2026-09-09T00:00:00Z" },
    organization, membership: { role: "member" }, capabilities: { canManageSettings: false, canManageMembers: false, canManageCredentialSecrets: false }
  } }));
  await page.route("**/v1/org/settings", (route) => route.fulfill({ json: { organization } }));
}

for (const width of [1440, 390, 320]) test(`usage loading, failure, retry and empty states fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode: "failed" | "loaded" | "empty" = "failed";
  let release!: () => void;
  const initial = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/v1/usage", async (route) => {
    await initial;
    if (mode === "failed") return route.fulfill({ status: 503, json: { error: "unavailable", message: "Usage temporarily unavailable" } });
    return route.fulfill({ json: {
      sandboxesSpawned: mode === "empty" ? 0 : 7, concurrentNow: 5,
      computeHours: 12345, avgColdStartMs: 54321, avgRuntimeSeconds: 98765, concurrentPeak: 99999, series: [5, 5, 5],
      statusBreakdown: mode === "empty" ? [] : [{ label: "running", value: 5 }, { label: "idle", value: 2 }],
      topTemplates: mode === "empty" ? [] : [{ label: "a-long-template-reference-with-a-version-and-an-organization", value: 7 }]
    } });
  });
  await page.goto("/#dashboard/metrics");
  await expect(page.getByRole("status")).toHaveText("Loading usage...");
  await expect(page.getByRole("button", { name: "Refreshing" })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Usage temporarily unavailable");
  await expect(page.locator(".usage-totals dd").first()).toHaveText("Unavailable");
  mode = "loaded";
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".usage-totals dd")).toHaveText(["7", "5", "2"]);
  await expect(page.locator(".usage-history")).toContainText("not enforced");
  await expect(page.locator(".usage-history svg")).toHaveCount(0);
  await expect(page.locator(".usage-page")).not.toContainText("99999");
  mode = "failed";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Showing the last successful response");
  await expect(page.locator(".usage-totals dd").first()).toHaveText("7");
  await page.screenshot({ path: `docs/artifacts/oss-usage-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mode = "empty";
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("No sandbox records.", { exact: true })).toBeVisible();
  await expect(page.locator(".usage-totals dd")).toHaveText(["0", "0", "0"]);
  await expect(page.getByText("History unavailable", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("commands submit runtime metadata defaults and preserve an explicitly edited directory", async ({ page }) => {
  await setup(page);
  const starts: Array<{ cwd: string }> = [];
  await page.route("**/v1/sandboxes/*", (route) => route.fulfill({ json: { sandbox: {
    id: "sbx_preview", name: "Non-workspace template", status: "running", template: "python", ttlSeconds: 300,
    createdAt: "2026-09-09T00:00:00Z", runtimeMetadata: { workdir: "/app", provider: { capabilities: [] }, ports: { default: [] } }
  } } }));
  await page.route("**/v1/sandboxes/*/commands", async (route) => {
    if (route.request().method() === "POST") { starts.push(route.request().postDataJSON()); return route.fulfill({ status: 503, json: { error: "unavailable", message: "Fixture command not executed" } }); }
    return route.fulfill({ json: { commands: [] } });
  });
  await page.route("**/v1/sandboxes/*/terminal/attach-ticket", (route) => route.fulfill({ status: 501, json: { error: "unsupported" } }));
  await page.goto("/#dashboard/sandboxes/sbx_preview");
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await expect(page.getByLabel("Working directory")).toHaveValue("/app");
  await page.getByLabel("Command", { exact: true }).fill("pwd");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0].cwd).toBe("/app");
  await page.getByLabel("Working directory").fill("/tmp");
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await expect(page.getByLabel("Working directory")).toHaveValue("/tmp");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(() => starts.length).toBe(2);
  expect(starts[1].cwd).toBe("/tmp");
});

test("documentation downloads return content rather than an SPA shell", async ({ page, request }) => {
  for (const path of ["/llms.txt", "/llms-full.txt", "/docs/quickstart.md", "/docs/developer-preview.md"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).not.toContain("<html");
    expect(body).toMatch(/^# |^<!--/);
    expect(response.headers()["content-type"]).not.toContain("text/html");
  }
  const index = await request.get("/docs/index.json");
  expect((await index.json()).length).toBeGreaterThan(30);
  await page.goto("/#docs/developer-preview");
  await page.getByRole("link", { name: "Markdown", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/developer-preview\.md$/);
  await expect(page.locator("body")).toContainText("# Developer Preview");
});
