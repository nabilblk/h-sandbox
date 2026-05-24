import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarakiriClient } from "../../packages/sdk/src/index";

const execFileAsync = promisify(execFile);

const WEB_URL = process.env.HARAKIRI_WEB_URL ?? "http://127.0.0.1:15173";
const API_URL = process.env.HARAKIRI_API_URL ?? "http://127.0.0.1:18082";
const CLI_BIN = process.env.HARAKIRI_CLI_BIN ?? "harakiri";
const KEYCLOAK_USER = process.env.KEYCLOAK_USER ?? "lyra@k.ai";
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD ?? "harakiri-dev";

const routePattern = (route: string) => new RegExp(`#${route.replace("/", "\\/")}$`);
const keyHeaders = (apiKey: string) => ({ "x-api-key": apiKey });

async function fillKeycloak(page: Page) {
  await expect(page.getByText("Disposable runtimes, sealed on demand.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Keycloak SSO")).toBeVisible();
  await page.locator('input[name="username"]').fill(KEYCLOAK_USER);
  await page.locator('input[name="password"]').fill(KEYCLOAK_PASSWORD);
  await page.locator("#kc-login").click();
}

async function signIn(page: Page, route = "dashboard/sandboxes") {
  await page.goto(`${WEB_URL}/#${route}`);
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible();
  await page.getByRole("button", { name: /Sign in/i }).click();
  if (await page.locator('input[name="username"]').isVisible({ timeout: 10_000 }).catch(() => false)) {
    await fillKeycloak(page);
  }
  await page.waitForURL(routePattern(route), { timeout: 45_000 });
}

async function createDashboardApiKey(page: Page) {
  await page.locator(".side-link", { hasText: "API keys" }).click();
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await page.getByRole("button", { name: /Create key/i }).click();
  const keyCard = page.locator(".card", { hasText: "New key. Shown once." });
  await expect(keyCard).toContainText("hk_live_", { timeout: 10_000 });
  const token = (await keyCard.locator(".num").textContent())?.trim();
  expect(token).toMatch(/^hk_live_/);
  return token!;
}

async function cleanupSandbox(request: APIRequestContext, apiKey: string, sandboxId?: string) {
  if (!sandboxId) return;
  await request.delete(`${API_URL}/v1/sandboxes/${sandboxId}`, {
    headers: keyHeaders(apiKey)
  }).catch(() => undefined);
}

async function runCli(args: string[], home: string) {
  return execFileAsync(CLI_BIN, args, {
    env: { ...process.env, HOME: home },
    timeout: 120_000
  });
}

test("real Web, API, CLI, and SDK sandbox workflows run on the deployed k0s stack", async ({ page, request }) => {
  const cleanupIds: string[] = [];
  let apiKey = "";
  let apiKeyId = "";

  await signIn(page);
  await expect(page.locator(".filter-tab.active")).toContainText("Running");

  const authType = await page.evaluate(async (apiUrl) => {
    const token = localStorage.getItem("harakiri_access_token");
    const response = await fetch(`${apiUrl}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    return body.auth.authType;
  }, API_URL);
  expect(authType).toBe("keycloak");

  apiKey = await createDashboardApiKey(page);
  const keyList = await request.get(`${API_URL}/v1/api-keys`, { headers: keyHeaders(apiKey) });
  expect(keyList.ok()).toBeTruthy();
  const keyBody = await keyList.json();
  apiKeyId = keyBody.keys.find((key: { prefix: string; lastFour: string }) => key.prefix === apiKey.slice(0, 12) && key.lastFour === apiKey.slice(-4))?.id;
  expect(apiKeyId).toBeTruthy();

  try {
    const webSandboxName = `web-real-${Date.now()}`;
    await page.locator(".side-link", { hasText: "Sandboxes" }).click();
    await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
    await page.getByRole("button", { name: /New sandbox/i }).first().click();
    await page.getByPlaceholder("agent-eval-runner").fill(webSandboxName);
    await page.getByRole("button", { name: /Create sandbox/i }).last().click();

    await expect(page.locator(".detail-name")).toHaveText(webSandboxName, { timeout: 90_000 });
    const webSandboxId = (await page.locator(".detail-id").textContent())?.trim();
    expect(webSandboxId).toMatch(/^sbx_/);
    cleanupIds.push(webSandboxId!);

    const webFetched = await request.get(`${API_URL}/v1/sandboxes/${webSandboxId}`, { headers: keyHeaders(apiKey) });
    expect(webFetched.ok()).toBeTruthy();
    const webFetchedBody = await webFetched.json();
    expect(webFetchedBody.sandbox.opensandboxId).toBeTruthy();
    expect(webFetchedBody.sandbox.opensandboxId).not.toMatch(/^osbx_/);

    await page.locator(".term-input input").fill('python -c "print(\'web-ok\')"');
    await page.keyboard.press("Enter");
    await expect(page.locator(".term")).toContainText("web-ok", { timeout: 90_000 });

    await page.getByRole("button", { name: /Filesystem/i }).click();
    await expect(page.locator(".files-table")).toContainText("/usr", { timeout: 90_000 });
    await expect(page.locator(".files-table")).not.toContainText("Invalid Date");
    const webFiles = await request.get(`${API_URL}/v1/sandboxes/${webSandboxId}/files?path=%2F`, { headers: keyHeaders(apiKey) });
    expect(webFiles.ok()).toBeTruthy();
    const webFilesBody = await webFiles.json();
    expect(webFilesBody.files.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Logs/i }).click();
    await expect(page.locator(".logs-pane")).toContainText("sandbox", { timeout: 90_000 });
    const webLogs = await request.get(`${API_URL}/v1/sandboxes/${webSandboxId}/logs`, { headers: keyHeaders(apiKey) });
    expect(webLogs.ok()).toBeTruthy();
    const webLogsBody = await webLogs.json();
    expect(webLogsBody.logs.length).toBeGreaterThan(0);
    expect(webLogsBody.logs.every((log: { source?: string }) => log.source === "sandbox" || log.source === "control-plane")).toBeTruthy();

    await page.getByRole("button", { name: /Kill/i }).click();
    await expect(page.locator(".detail-top")).toContainText("terminated", { timeout: 45_000 });
    cleanupIds.pop();

    const apiCreate = await request.post(`${API_URL}/v1/sandboxes`, {
      headers: keyHeaders(apiKey),
      data: { template: "python-3.12", name: `api-real-${Date.now()}`, ttlSeconds: 90 }
    });
    expect(apiCreate.ok()).toBeTruthy();
    const apiCreated = await apiCreate.json();
    expect(apiCreated.sandbox.opensandboxId).toBeTruthy();
    expect(apiCreated.sandbox.opensandboxId).not.toMatch(/^osbx_/);
    cleanupIds.push(apiCreated.sandbox.id);
    const apiRun = await request.post(`${API_URL}/v1/sandboxes/${apiCreated.sandbox.id}/run`, {
      headers: keyHeaders(apiKey),
      data: { command: "python -c \"print('api-ok')\"" }
    });
    expect(apiRun.ok()).toBeTruthy();
    const apiRunBody = await apiRun.json();
    expect(apiRunBody.result.stdout).toContain("api-ok");
    expect(apiRunBody.result.exitCode).toBe(0);
    await cleanupSandbox(request, apiKey, apiCreated.sandbox.id);
    cleanupIds.pop();

    const cliHome = await mkdtemp(join(tmpdir(), "harakiri-cli-"));
    try {
      await runCli(["login", "--api-url", API_URL, "--api-key", apiKey], cliHome);
      const create = await runCli(["create", "--template", "python-3.12", "--name", `cli-real-${Date.now()}`, "--ttl", "90"], cliHome);
      const cliSandboxId = create.stdout.split(/\r?\n/).find((line) => /^sbx_/.test(line.trim()))?.trim();
      expect(cliSandboxId).toMatch(/^sbx_/);
      cleanupIds.push(cliSandboxId!);
      const cliFetched = await request.get(`${API_URL}/v1/sandboxes/${cliSandboxId}`, { headers: keyHeaders(apiKey) });
      const cliFetchedBody = await cliFetched.json();
      expect(cliFetchedBody.sandbox.opensandboxId).toBeTruthy();
      expect(cliFetchedBody.sandbox.opensandboxId).not.toMatch(/^osbx_/);
      const cliRun = await runCli(["run", cliSandboxId!, "--cmd", "python -c \"print('cli-ok')\""], cliHome);
      expect(cliRun.stdout).toContain("cli-ok");
      await runCli(["kill", cliSandboxId!], cliHome);
      cleanupIds.pop();
    } finally {
      await rm(cliHome, { recursive: true, force: true });
    }

    const sdk = new HarakiriClient({ apiUrl: API_URL, apiKey });
    const sdkCreated = await sdk.createSandbox({ template: "python-3.12", name: `sdk-real-${Date.now()}`, ttlSeconds: 90 });
    expect(sdkCreated.sandbox.opensandboxId).toBeTruthy();
    expect(sdkCreated.sandbox.opensandboxId).not.toMatch(/^osbx_/);
    cleanupIds.push(sdkCreated.sandbox.id);
    const sdkRun = await sdk.runSandbox(sdkCreated.sandbox.id, { command: "python -c \"print('sdk-ok')\"" });
    expect(sdkRun.result.stdout).toContain("sdk-ok");
    expect(sdkRun.result.exitCode).toBe(0);
    await sdk.killSandbox(sdkCreated.sandbox.id);
    cleanupIds.pop();
  } finally {
    for (const sandboxId of cleanupIds.reverse()) {
      await cleanupSandbox(request, apiKey, sandboxId);
    }
    if (apiKey && apiKeyId) {
      await request.delete(`${API_URL}/v1/api-keys/${apiKeyId}`, { headers: keyHeaders(apiKey) }).catch(() => undefined);
    }
  }
});

test("completed users do not return to onboarding after login", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async (apiUrl) => {
    const token = localStorage.getItem("harakiri_access_token");
    const response = await fetch(`${apiUrl}/v1/me/onboarding/complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await response.text());
    localStorage.clear();
  }, API_URL);

  await page.goto(`${WEB_URL}/#onboarding`);
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible();
  await page.getByRole("button", { name: /Sign in/i }).click();
  if (await page.locator('input[name="username"]').isVisible({ timeout: 5_000 }).catch(() => false)) {
    await fillKeycloak(page);
  }
  await page.waitForURL(routePattern("dashboard/sandboxes"), { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Harakiri." })).toHaveCount(0);

  await page.goto(`${WEB_URL}/#onboarding`);
  await page.waitForURL(routePattern("dashboard/sandboxes"), { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Harakiri." })).toHaveCount(0);

  await page.goto(`${WEB_URL}/#landing`);
  await page.getByRole("button", { name: /Get started/i }).first().click();
  await page.waitForURL(routePattern("dashboard/sandboxes"), { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Harakiri." })).toHaveCount(0);
});
