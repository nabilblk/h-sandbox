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
  const form = page.getByRole("dialog", { name: "Create API key" });
  await form.getByLabel("Name", { exact: true }).fill("browser-e2e");
  const created = page.waitForResponse((response) => response.url().endsWith("/v1/api-keys") && response.request().method() === "POST");
  await form.getByRole("button", { name: "Create key", exact: true }).click();
  const keyBody = await (await created).json();
  const keyCard = page.getByRole("dialog", { name: "API key created" });
  await expect(keyCard).toContainText("hk_live_", { timeout: 10_000 });
  const token = (await keyCard.locator(".key-secret code").textContent())?.trim();
  expect(token).toMatch(/^hk_live_/);
  await keyCard.getByRole("button", { name: "Done", exact: true }).click();
  return { token: token!, id: keyBody.key.id as string };
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

  const persistedAccessToken = await page.evaluate(() => localStorage.getItem("harakiri_access_token"));
  expect(persistedAccessToken).toBeNull();

  const createdKey = await createDashboardApiKey(page);
  apiKey = createdKey.token;
  apiKeyId = createdKey.id;
  const keyList = await request.get(`${API_URL}/v1/api-keys`, { headers: keyHeaders(apiKey) });
  expect(keyList.status()).toBe(403);
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
    await expect(page.locator(".detail-top")).toContainText("running", { timeout: 30_000 });

    const webFetched = await request.get(`${API_URL}/v1/sandboxes/${webSandboxId}`, { headers: keyHeaders(apiKey) });
    expect(webFetched.ok()).toBeTruthy();
    const webFetchedBody = await webFetched.json();
    expect(webFetchedBody.sandbox.status).toBe("running");
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

    await page.getByRole("button", { name: /Metrics/i }).click();
    await expect(page.getByText("CPU snapshot")).toBeVisible({ timeout: 90_000 });
    const webMetrics = await request.get(`${API_URL}/v1/sandboxes/${webSandboxId}/metrics`, { headers: keyHeaders(apiKey) });
    expect(webMetrics.ok()).toBeTruthy();
    const webMetricsBody = await webMetrics.json();
    expect(webMetricsBody.current).toBeTruthy();
    expect(webMetricsBody.series.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Network/i }).click();
    await expect(page.getByText("Expose port")).toBeVisible();
    await expect(page.getByText("No exposed ports yet.")).toBeVisible();
    await page.screenshot({ path: "/tmp/harakiri-auth-runtime-tabs.png", fullPage: true });

    await page.getByRole("button", { name: /Kill/i }).click();
    await expect(page.locator(".detail-top")).toContainText("terminated", { timeout: 45_000 });
    cleanupIds.pop();

    await page.getByRole("button", { name: /All sandboxes/i }).click();
    await page.locator(".side-link", { hasText: "Templates" }).click();
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
    await expect(page.locator(".tmpl-tab.active")).toContainText("List");
    await expect(page.locator(".tmpl-list")).toContainText("python-3.12", { timeout: 45_000 });
    await page.locator(".tmpl-tab", { hasText: "Builds" }).click();
    await expect(page.locator(".tmpl-tab.active")).toContainText("Builds");
    await expect(page.locator(".tmpl-builds")).toBeVisible();
    await page.screenshot({ path: "/tmp/harakiri-auth-template-tabs.png", fullPage: true });

    await page.goto(`${WEB_URL}/#docs`);
    await expect(page.locator(".docs-body h1")).toContainText("Vision and architecture");
    await page.locator(".docs-link", { hasText: "Quickstart" }).click();
    await expect(page.locator(".docs-body h1")).toContainText("Quickstart");
    await page.locator(".docs-link", { hasText: "Template builds" }).click();
    await expect(page.locator(".docs-body h1")).toContainText("Template builds");
    await page.locator(".docs-link", { hasText: "API reference" }).click();
    await expect(page.locator(".docs-body h1")).toContainText("API reference");
    await page.screenshot({ path: "/tmp/harakiri-auth-docs.png", fullPage: true });

    const apiCreate = await request.post(`${API_URL}/v1/sandboxes`, {
      headers: keyHeaders(apiKey),
      data: { template: "python-3.12", name: `api-real-${Date.now()}`, ttlSeconds: 90 }
    });
    expect(apiCreate.ok()).toBeTruthy();
    expect(apiCreate.status()).toBe(201);
    const apiCreated = await apiCreate.json();
    expect(apiCreated.status).not.toBe("pending");
    expect(apiCreated.operation).toBeUndefined();
    expect(apiCreated.sandbox.status).toBe("running");
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
      expect(create.stdout).toContain("sealed.");
      expect(create.stdout).not.toContain("queued.");
      const cliSandboxId = create.stdout.split(/\r?\n/).find((line) => /^sbx_/.test(line.trim()))?.trim();
      expect(cliSandboxId).toMatch(/^sbx_/);
      cleanupIds.push(cliSandboxId!);
      const cliFetched = await request.get(`${API_URL}/v1/sandboxes/${cliSandboxId}`, { headers: keyHeaders(apiKey) });
      const cliFetchedBody = await cliFetched.json();
      expect(cliFetchedBody.sandbox.status).toBe("running");
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
    expect(sdkCreated.status).not.toBe("pending");
    expect(sdkCreated.operation).toBeUndefined();
    expect(sdkCreated.sandbox.status).toBe("running");
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
      await page.locator(".side-link", { hasText: "API keys" }).click();
      await page.getByRole("button", { name: "Revoke browser-e2e", exact: true }).click();
      await page.getByRole("dialog", { name: "Revoke API key" }).getByRole("button", { name: "Revoke key", exact: true }).click();
    }
  }
});

test("completed users do not return to onboarding after login", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Sandboxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Harakiri." })).toHaveCount(0);
  await page.locator(".account-trigger").click();
  await page.getByText("Sign out of Harakiri and Keycloak").click();
  await page.waitForURL(/#landing$/, { timeout: 45_000 });

  await page.goto(`${WEB_URL}/#landing`);
  await page.getByRole("button", { name: /Get started/i }).first().click();
  await expect(page.getByRole("heading", { name: "Sign in with Keycloak." })).toBeVisible({ timeout: 10_000 });
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
