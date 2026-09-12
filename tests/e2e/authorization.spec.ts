import { test, expect, type Page } from "@playwright/test";
import { defaultApiKeyScopes, apiKeyScopes } from "../../packages/shared/src/authorization";
import { TEMPLATES, type CurrentAccountResponse } from "../../packages/shared/src/index";
import { defaultWorkspace } from "../../apps/web/src/workspace";

// UI contract fixtures only. Signed JWTs, server policies and database ownership
// are exercised in apps/api/src/authorization*.test.ts, not mocked here as proof.
async function setup(page: Page, role: "admin" | "member", onboarding = false) {
  const state = { patches: 0, creates: [] as Record<string, unknown>[], failCreate: false, failRevoke: false, keys: [] as Record<string, unknown>[] };
  const organization = defaultWorkspace({ email: "admin@example.test", name: "Example" });
  const account: CurrentAccountResponse = { user: { id: role, fullName: "Example User", email: `${role}@example.test`, onboardingCompletedAt: onboarding ? null : new Date().toISOString() },
    auth: { userId: role, organizationId: organization.id, actorLabel: "Example User" }, role, organization,
    capabilities: { canManageMembers: role === "admin", canManageCredentialSecrets: role === "admin", canManageSettings: role === "admin", canManageAllApiKeys: role === "admin" } };
  await page.route("**/src/auth.ts", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class AuthSessionExpiredError extends Error {}
    const snapshot = { status: 'authenticated', profile: { email: '${role}@example.test', name: 'Example User' } };
    export const auth = { init: async () => snapshot, snapshot: () => snapshot, subscribe: (listener) => { listener(snapshot); return () => {}; },
      getAccessToken: async () => 'ui-fixture', isAuthenticated: () => true, profile: () => snapshot.profile,
      clearLocalSession() {}, rememberReturnRoute() {}, consumeReturnRoute: () => null, peekReturnRoute: () => null, signIn() {}, signOut() {} };
  ` }));
  await page.route("**/v1/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/v1/me") return json(account);
    if (path === "/v1/org/settings") {
      if (req.method() === "PATCH") { state.patches++; if (role !== "admin") return json({ error: "forbidden" }, 403); }
      return json({ organization });
    }
    if (path === "/v1/api-keys") {
      if (req.method() === "POST") {
        const body = req.postDataJSON(); state.creates.push(body);
        if (state.failCreate) return json({ error: "forbidden", message: "Permission changed. Refresh your access." }, 403);
        const key = { id: "key-new", name: body.name, prefix: "hk_live_test", lastFour: "abcd", createdAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null, createdByUserId: role, legacy: false, scopes: body.scopes ?? defaultApiKeyScopes, expiresAt: body.expiresAt ?? new Date(Date.now() + 90 * 86400_000).toISOString() };
        state.keys.push(key); return json({ key, token: "hk_live_ui_fixture_not_a_real_credential_abcd" }, 201);
      }
      return json({ keys: state.keys, allowedScopes: role === "admin" ? apiKeyScopes : defaultApiKeyScopes, canManageAll: role === "admin" });
    }
    if (path === "/v1/api-keys/key-new" && req.method() === "DELETE") {
      if (state.failRevoke) return json({ error: "forbidden", message: "Permission changed." }, 403);
      state.keys[0].revokedAt = new Date().toISOString(); return json({ ok: true });
    }
    if (path === "/v1/me/onboarding/complete") return json({ user: { ...account.user, onboardingCompletedAt: new Date().toISOString() } });
    return json({ sandboxes: [], templates: [], counts: {} });
  });
  return state;
}

test("members have read-only settings and onboarding skips organization writes", async ({ page }) => {
  const state = await setup(page, "member", true);
  await page.goto("/#dashboard/settings");
  await expect(page.getByText("Read-only.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.locator(".settings-fields input").first()).toBeDisabled();
  await expect(page.locator(".side-link", { hasText: "Members" })).toHaveCount(0);
  await expect(page.locator(".side-link", { hasText: "Vault" })).toHaveCount(0);
  await page.goto("/#onboarding");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Organization name")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your first API key." })).toBeVisible();
  expect(state.patches).toBe(0);
  await page.getByRole("button", { name: "Create key", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Hello, sandbox." })).toBeVisible();
  expect(state.creates).toEqual([{ name: "onboarding" }]);
});

test("onboarding never submits its first command for a running but not ready sandbox", async ({ page }) => {
  await setup(page, "member", true);
  let ready = false;
  let commands = 0;
  let readinessChecks = 0;
  const keys: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/v1/templates?*", route => route.fulfill({ json: { templates: [
    { ...TEMPLATES[0], id: "first-shell", status: "ready", latestVersionId: "tplv_shell", workdir: "/app" }
  ] } }));
  await page.route("**/v1/sandboxes", async route => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    await route.fulfill({ status: 202, json: {
      sandbox: { id: "sbx_starting", status: "running" }, status: "pending"
    } });
  });
  await page.route("**/v1/sandboxes/sbx_starting/readiness", route => {
    readinessChecks++;
    return route.fulfill({ json: { sandbox: { id: "sbx_starting", runtimeMetadata: { workdir: "/app" } },
      readiness: { status: ready ? "ready" : "starting", checkedAt: new Date().toISOString() } } });
  });
  const command = { id: "cmd_first", status: "succeeded", exitCode: 0, stdout: "Harakiri is ready\n", stderr: "" };
  await page.route("**/v1/sandboxes/sbx_starting/commands", async route => {
    commands++;
    expect(ready).toBe(true);
    expect(route.request().postDataJSON().cwd).toBe("/app");
    await route.fulfill({ status: 201, json: { command } });
  });
  await page.route("**/v1/sandboxes/sbx_starting/commands/cmd_first", route => route.fulfill({ json: { command } }));
  await page.goto("/#onboarding");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Run first sandbox" }).click();
  await expect.poll(() => readinessChecks).toBeGreaterThanOrEqual(2);
  expect(commands).toBe(0);
  await page.getByRole("button", { name: "Stop waiting" }).click();
  await expect(page.getByText(/Waiting paused/)).toBeVisible();
  ready = true;
  await page.getByRole("button", { name: "Check first task" }).click();
  await expect(page.getByText("First task completed.", { exact: true })).toBeVisible();
  await expect(page.locator(".hterm-body pre")).toHaveText("Harakiri is ready\n");
  expect(commands).toBe(1);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toBeTruthy();
  expect(errors).toEqual([]);
});

test("admin saves settings; scoped key creation, clipboard and confirmed revocation handle errors", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await setup(page, "admin");
  await page.goto("/#dashboard/settings");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.locator(".settings-form-grid input").first().fill("Renamed organization");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
  expect(state.patches).toBe(1);
  await page.goto("/#dashboard/keys");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Create API key" });
  await form.getByLabel("Name", { exact: true }).fill("CI read-only");
  for (const scope of defaultApiKeyScopes.filter((s) => s !== "sandboxes:read")) await form.getByLabel(scope, { exact: true }).uncheck();
  await form.getByLabel("Expires in").selectOption("7");
  state.failCreate = true;
  await form.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Permission changed");
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("CI read-only");
  state.failCreate = false;
  await form.getByRole("button", { name: "Create key", exact: true }).click();
  const once = page.getByRole("dialog", { name: "API key created" });
  await once.getByRole("button", { name: "Copy API key" }).click();
  await expect(once.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("ui_fixture");
  const submitted = state.creates.at(-1)!;
  expect(submitted.scopes).toEqual(["sandboxes:read"]);
  expect(Math.abs(Date.parse(String(submitted.expiresAt)) - Date.now() - 7 * 86400_000)).toBeLessThan(20_000);
  await once.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("hk_live_ui_fixture_not_a_real_credential_abcd")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke CI read-only", exact: true }).click();
  const revoke = page.getByRole("dialog", { name: "Revoke API key" });
  await revoke.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.keys[0].revokedAt).toBeNull();
  await page.getByRole("button", { name: "Revoke CI read-only", exact: true }).click();
  state.failRevoke = true;
  await revoke.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(revoke.getByRole("alert")).toContainText("Permission changed");
  state.failRevoke = false;
  await revoke.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke CI read-only", exact: true })).toBeDisabled();
});

for (const width of [1440, 390, 320]) test(`member key form is accessible and fits ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await setup(page, "member");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#dashboard/keys");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(dialog.getByLabel("credentials:manage", { exact: true })).toHaveCount(0);
  for (const scope of defaultApiKeyScopes) await dialog.getByLabel(scope, { exact: true }).uncheck();
  await dialog.getByLabel("Name", { exact: true }).fill("CI read-only");
  await expect(dialog.getByRole("button", { name: "Create key", exact: true })).toBeDisabled();
  expect(state.creates.length).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
  await page.screenshot({ path: `docs/artifacts/authorization/key-form-${width}.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const role of ["admin", "member"] as const) test(`${role} populated key list stays within a mobile viewport`, async ({ page }) => {
  const state = await setup(page, role);
  const name = "ci-artifact-reader-with-a-long-integration-name";
  state.keys.push({ id: "key-long", name, prefix: "hk_live_test", lastFour: "abcd", createdAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null, createdByUserId: role, legacy: false, scopes: defaultApiKeyScopes, expiresAt: new Date(Date.now() + 86400_000).toISOString() });
  await page.goto("/#dashboard/keys");
  const revoke = page.getByRole("button", { name: `Revoke ${name}`, exact: true });
  await expect(revoke).toHaveText("Revoke");
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toBeFocused();
});

for (const width of [1440, 320]) test(`authorization reference keeps scope names intact at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#docs/authorization");
  const scopes = page.locator(".docs-ownership dt code");
  await expect(scopes).toHaveCount(apiKeyScopes.length);
  for (const scope of await scopes.all()) {
    expect(await scope.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length;
    })).toBe(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("heading", { name: "Permissions", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/artifacts/authorization/docs-permissions-${width}.png`, fullPage: false });
});
