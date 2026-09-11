import { expect, test, type Page } from "@playwright/test";
import { defaultWorkspace } from "../../apps/web/src/workspace";
import { TEMPLATES, type OrganizationCapacity } from "../../packages/shared/src/index.ts";

// Browser contract fixtures, not evidence of runtime enforcement. PostgreSQL
// concurrency and provider outcome tests live in organization-capacity.test.ts.
async function setup(page: Page, role: "admin" | "member" = "admin") {
  const organization = { ...defaultWorkspace({ email: "capacity@example.test", name: "Capacity" }), maxConcurrency: 2, capacityRevision: 1 };
  const state = {
    capacity: { state: "enforced", limit: 2, revision: 1, inUse: 1, available: 1, overLimit: 0,
      breakdown: { active: 1, reserved: 0, releasing: 0, uncertain: 0 }, observedAt: new Date().toISOString() } as OrganizationCapacity,
    capacityStatus: 200, failCreate: false, uncertainCreate: false, conflict: false,
    creates: [] as Record<string, unknown>[], patches: [] as Record<string, unknown>[]
  };
  await page.route("**/src/auth.ts", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class AuthSessionExpiredError extends Error {}
    const snapshot = { status: 'authenticated', profile: { email: 'capacity@example.test', name: 'Capacity' } };
    export const auth = { init: async () => snapshot, snapshot: () => snapshot, subscribe: (fn) => { fn(snapshot); return () => {}; },
      getAccessToken: async () => 'capacity-ui-fixture', isAuthenticated: () => true, profile: () => snapshot.profile,
      clearLocalSession() {}, rememberReturnRoute() {}, consumeReturnRoute: () => null, peekReturnRoute: () => null, signIn() {}, signOut() {} };
  ` }));
  await page.route("**/v1/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/v1/me") return json({ organization, membership: { role }, user: { id: role, fullName: "Capacity", email: "capacity@example.test", onboardingCompletedAt: new Date().toISOString() }, capabilities: { canManageSettings: role === "admin" } });
    if (path === "/v1/org/capacity") return state.capacityStatus === 200 ? json({ capacity: state.capacity }) : json({ error: "unavailable" }, state.capacityStatus);
    if (path === "/v1/org/settings") {
      if (req.method() === "PATCH") {
        state.patches.push(req.postDataJSON());
        if (state.conflict) return json({ error: "organization_capacity_settings_conflict", message: "Another administrator changed the limit. Reload settings." }, 409);
        Object.assign(organization, req.postDataJSON());
      }
      return json({ organization });
    }
    if (path === "/v1/sandboxes" && req.method() === "POST") {
      state.creates.push(req.postDataJSON());
      if (state.uncertainCreate) {
        state.capacity = { ...state.capacity, inUse: 2, available: 0 };
        return json({ error: "sandbox_provision_failed", message: "Runtime outcome is being verified.", sandbox: { id: "sbx_accepted" }, capacity: state.capacity }, 502);
      }
      if (state.failCreate) {
        state.capacity = { ...state.capacity, inUse: 2, available: 0 };
        return json({ error: "organization_capacity_exceeded", message: "All execution slots are occupied.", capacity: state.capacity }, 409);
      }
      return json({ error: "test_interrupted", message: "Inspect the accepted operation before retrying." }, 503);
    }
    if (path === "/v1/templates") return json({ templates: TEMPLATES });
    if (path === "/v1/workspaces") return json({ workspaces: [], policy: { available: false } });
    return json({ sandboxes: [], counts: {}, secrets: [], references: [], issuers: [] });
  });
  return state;
}

for (const width of [1440, 390, 320]) test(`capacity rejection preserves input and keyboard navigation at ${width}px`, async ({ page }) => {
  const state = await setup(page, "member");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#dashboard/sandboxes");
  await page.getByRole("button", { name: "New sandbox", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New sandbox" });
  await expect(dialog).toBeFocused();
  await dialog.getByPlaceholder("agent-eval-runner").fill("capacity-demo");
  await dialog.getByPlaceholder("HARAKIRI_ENV=dev").fill("PROJECT=test");
  state.failCreate = true;
  await dialog.getByRole("button", { name: "Create sandbox", exact: false }).click();
  await expect(dialog.getByRole("alert")).toContainText("All execution slots");
  await expect(dialog.getByPlaceholder("agent-eval-runner")).toHaveValue("capacity-demo");
  await expect(dialog.getByPlaceholder("HARAKIRI_ENV=dev")).toHaveValue("PROJECT=test");
  await expect(dialog.getByRole("button", { name: "Create sandbox", exact: false })).toBeDisabled();
  await expect(dialog.getByRole("link", { name: "adjust the limit" })).toHaveCount(0);
  expect(state.creates).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
  expect(await dialog.locator(".modal-body").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
  await page.screenshot({ path: `/tmp/harakiri-capacity-create-${width}.png`, fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close new sandbox" })).toBeFocused();
  state.failCreate = false;
  state.capacity = { ...state.capacity, inUse: 1, available: 1 };
  await dialog.getByRole("button", { name: "Refresh capacity" }).click();
  await dialog.getByRole("button", { name: "Create sandbox", exact: false }).click();
  await expect(dialog.getByRole("alert")).toContainText("Inspect the accepted operation");
  expect(state.creates[0].idempotencyKey).toBe(state.creates[1].idempotencyKey);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New sandbox", exact: true }).first()).toBeFocused();
  expect(errors).toEqual([]);
});

test("an uncertain create can retry the unchanged intent at full capacity", async ({ page }) => {
  const state = await setup(page);
  state.uncertainCreate = true;
  await page.goto("/#dashboard/sandboxes");
  await page.getByRole("button", { name: "New sandbox", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New sandbox" });
  const name = dialog.getByPlaceholder("agent-eval-runner");
  await name.fill("recover-this-request");
  await dialog.getByRole("button", { name: "Create sandbox", exact: false }).click();
  await expect(dialog.getByRole("button", { name: "Inspect accepted sandbox" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Retry request" })).toBeEnabled();
  await name.fill("different-request");
  await expect(dialog.getByRole("button", { name: "Create sandbox", exact: false })).toBeDisabled();
  await name.fill("recover-this-request");
  await dialog.getByRole("button", { name: "Retry request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Runtime outcome");
  expect(state.creates).toHaveLength(2);
  expect(state.creates[0]).toEqual(state.creates[1]);
});

test("settings sends only edits and requires explicit reload after a revision conflict", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/#dashboard/settings");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await page.getByLabel("Execution slot limit").fill("3");
  state.conflict = true;
  await save.click();
  await expect(page.getByRole("alert")).toContainText("Another administrator");
  expect(state.patches).toEqual([{ maxConcurrency: 3, expectedCapacityRevision: 1 }]);
  await expect(page.getByLabel("Execution slot limit")).toHaveValue("3");
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Reload settings" }).click();
  await expect(page.getByLabel("Execution slot limit")).toHaveValue("2");
  state.conflict = false;
  await page.locator(".settings-form-grid input").first().fill("Renamed organization");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
  expect(state.patches[1]).toEqual({ name: "Renamed organization" });
});

test("failed refresh preserves last observation; old servers and unknown inventories are explicit", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/#dashboard/settings");
  const summary = page.getByRole("region", { name: "Execution capacity" });
  await expect(summary).toContainText("1 / 2");
  state.capacityStatus = 503;
  await summary.getByRole("button", { name: "Refresh capacity" }).click();
  await expect(summary).toContainText("Last observation");
  await expect(summary).toContainText("1 / 2");
  state.capacityStatus = 404;
  await page.reload();
  await expect(summary).toContainText("unavailable on this server");
  await expect(summary).toContainText("Unknown");
  await expect(summary).not.toContainText("0 / 2");
  state.capacityStatus = 200;
  state.capacity = { ...state.capacity, state: "reconciling", inUse: null, available: null, breakdown: null };
  await summary.getByRole("button", { name: "Refresh capacity" }).click();
  await expect(summary).toContainText("Verifying inventory");
});

for (const width of [1440, 320]) test(`execution capacity docs and settings fit ${width}px`, async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#dashboard/settings");
  await expect(page.getByLabel("Execution slot limit")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `/tmp/harakiri-capacity-settings-${width}.png`, fullPage: true });
  await page.goto("/#docs/execution-capacity");
  await expect(page.getByRole("heading", { level: 1, name: "Execution capacity" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `/tmp/harakiri-capacity-docs-${width}.png`, fullPage: true });
});
