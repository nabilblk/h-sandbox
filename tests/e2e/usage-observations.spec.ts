import { expect, test, type Page } from "@playwright/test";
import { TEMPLATES, type UsageHistoryResponse } from "../../packages/shared/src/index.ts";
import { defaultWorkspace } from "../../apps/web/src/workspace";

// Browser contract fixtures only. Native runtime and SQL evidence are separate gates.
async function setup(page: Page, role = "admin") {
  const organization = { ...defaultWorkspace({ name: "Usage test", email: "usage@example.test" }), id: "org_fixture" };
  const state = { catalog: false, failHistory: false, oldServer: false, loseCommandResponse: false,
    historyState: "partial" as "partial" | "empty" | "disabled" | "stale" | "forbidden",
    creates: [] as Record<string, unknown>[], commands: 0, readiness: 0, windows: [] as URLSearchParams[] };
  await page.route("**/src/auth.ts", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class AuthSessionExpiredError extends Error {}
    const snapshot = { status: 'authenticated', profile: { email: 'usage@example.test', name: 'Usage test' } };
    export const auth = { init: async () => snapshot, snapshot: () => snapshot, subscribe: fn => { fn(snapshot); return () => {}; },
      getAccessToken: async () => 'usage-fixture', isAuthenticated: () => true, profile: () => snapshot.profile,
      clearLocalSession() {}, rememberReturnRoute() {}, consumeReturnRoute: () => null, peekReturnRoute: () => null, signIn() {}, signOut() {} };
  ` }));
  await page.route("**/v1/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/v1/me") return json({ user: { id: "user_fixture", email: "usage@example.test", fullName: "Usage test", onboardingCompletedAt: null }, auth: { organizationId: organization.id }, organization, role,
      capabilities: { canManageSettings: role === "admin", canManageMembers: role === "admin" } });
    if (path === "/v1/org/settings") return json({ organization });
    if (path === "/v1/org/capacity") return json({ capacity: { state: "enforced", limit: 2, inUse: 0, available: 2, revision: 1, overLimit: 0, breakdown: { active: 0, reserved: 0, releasing: 0, uncertain: 0 }, observedAt: new Date().toISOString() } });
    if (path === "/v1/templates") return json({ templates: state.catalog ? [{ ...TEMPLATES[0], id: "first-shell", name: "Approved shell", latestVersionId: "tplv_first", workdir: "/app", status: "ready" }] : [] });
    if (path === "/v1/sandboxes" && request.method() === "POST") {
      state.creates.push(request.postDataJSON());
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      return json({ sandbox: { id: "sbx_first", status: "pending" }, status: "pending" }, 202);
    }
    if (path.endsWith("/readiness")) return json({ sandbox: { id: "sbx_first", runtimeMetadata: { workdir: "/app" } }, readiness: { status: ++state.readiness === 1 ? "starting" : "ready" } });
    const command = { id: "cmd_first", command: "printf 'Harakiri is ready\\n'", cwd: "/app", status: "succeeded", stdout: "Harakiri is ready\n", stderr: "", exitCode: 0 };
    if (path.endsWith("/commands") && request.method() === "POST") {
      state.commands++;
      expect(request.postDataJSON().cwd).toBe("/app");
      return state.loseCommandResponse ? json({ error: "response_lost", message: "Submission response was lost." }, 502) : json({ command }, 201);
    }
    if (path.endsWith("/commands")) return json({ commands: [command] });
    if (path.endsWith("/commands/cmd_first")) return json({ command });
    if (path === "/v1/usage") return json({ sandboxesSpawned: 10, concurrentNow: 0, computeHours: 99999, avgColdStartMs: 99999, avgRuntimeSeconds: 99999, concurrentPeak: 99999,
      series: [99999], topTemplates: [], statusBreakdown: [] });
    if (path === "/v1/usage/history") {
      state.windows.push(url.searchParams);
      if (state.oldServer) return json({ error: "not_found" }, 404);
      if (state.historyState === "forbidden") return json({ error: "forbidden", message: "Requires org:read." }, 403);
      if (state.failHistory) return json({ error: "usage_history_unavailable", message: "History query timed out." }, 503);
      const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
      const start = Date.parse(from), span = (Date.parse(to) - start) / 48;
      const result: UsageHistoryResponse = { window: { from, to, resolution: url.searchParams.get("resolution") as "1m", timezone: "UTC" },
        coverage: { status: "partial", source: "reservation_intervals_and_operations", availableFrom: from, lastObservedAt: to, observer: "active", retentionDays: 30,
          gaps: [{ from: new Date(start + 8 * span).toISOString(), to: new Date(start + 9 * span).toISOString() }] },
        summary: { coveredSeconds: 84600, heldSlotSeconds: 165600, peakHeldSlots: 4, acceptedOperations: { create: 7, restore: 2, resume: 1 }, outcomes: { succeeded: 9, failed: 1, canceled: 0 },
          readiness: { coverage: "partial", sampleCount: 8, unobservedCount: 2, unsupportedCount: 0, p50Ms: 2000, p95Ms: 12500, observationIntervalMs: 10000 } },
        buckets: Array.from({ length: 48 }, (_, i) => ({ from: new Date(start + i * span).toISOString(), to: new Date(start + (i + 1) * span).toISOString(),
          coverage: i === 8 ? "unavailable" : "complete", coveredSeconds: i === 8 ? 0 : span / 1000, heldSlotSeconds: i === 8 ? null : (1 + i % 4) * span / 1000,
          averageHeldSlots: i === 8 ? null : 1 + i % 4, peakHeldSlots: i === 8 ? null : 4, acceptedOperations: i === 8 ? null : { create: 0, restore: 0, resume: 0 }, outcomes: i === 8 ? null : { succeeded: 0, failed: 0, canceled: 0 } })) };
      if (state.historyState === "stale") {
        result.coverage.observer = "stale";
        result.coverage.lastObservedAt = new Date(Date.parse(to) - 120_000).toISOString();
      }
      if (state.historyState === "empty" || state.historyState === "disabled") {
        const disabled = state.historyState === "disabled";
        result.coverage = { ...result.coverage, status: disabled ? "unavailable" : "complete", observer: disabled ? "disabled" : "active",
          lastObservedAt: disabled ? null : to, gaps: disabled ? [{ from, to }] : [] };
        result.summary = { coveredSeconds: disabled ? 0 : (Date.parse(to) - start) / 1000,
          heldSlotSeconds: disabled ? null : 0, peakHeldSlots: disabled ? null : 0,
          acceptedOperations: disabled ? null : { create: 0, restore: 0, resume: 0 }, outcomes: disabled ? null : { succeeded: 0, failed: 0, canceled: 0 },
          readiness: { coverage: "unavailable", sampleCount: 0, unobservedCount: 0, unsupportedCount: 0, p50Ms: null, p95Ms: null, observationIntervalMs: 10000 } };
        result.buckets = result.buckets.map(bucket => ({ ...bucket, coverage: disabled ? "unavailable" : "complete",
          coveredSeconds: disabled ? 0 : span / 1000, averageHeldSlots: disabled ? null : 0, heldSlotSeconds: disabled ? null : 0, peakHeldSlots: disabled ? null : 0,
          acceptedOperations: result.summary.acceptedOperations, outcomes: result.summary.outcomes }));
      }
      return json(result);
    }
    return json({ sandboxes: [], counts: {}, workspaces: [], policy: { available: false } });
  });
  return state;
}

async function firstTask(page: Page) {
  await page.goto("/#onboarding");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
}

for (const width of [1440, 390, 320]) test(`catalog-aware first task works once and fits ${width}px`, async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width, height: 1000 });
  await firstTask(page);
  await expect(page.getByRole("link", { name: "Set up the first template" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run first sandbox" })).toBeDisabled();
  state.catalog = true;
  await page.getByRole("button", { name: "Refresh templates" }).click();
  await expect(page.getByLabel("First sandbox template")).toHaveValue("first-shell");
  await page.getByRole("button", { name: "Run first sandbox" }).click();
  await expect(page.getByText("First task completed.", { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(1); expect(state.commands).toBe(1);
  expect(state.creates[0].template).toBe("first-shell");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `/tmp/harakiri-first-task-${width}.png`, fullPage: true });
  await page.reload();
  await firstTask(page);
  await expect(page.getByText("First task completed.", { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(1); expect(state.commands).toBe(1);
});

test("lost first-command response is recovered by Check, not by another POST", async ({ page }) => {
  const state = await setup(page); state.catalog = true; state.loseCommandResponse = true;
  await firstTask(page);
  await page.getByRole("button", { name: "Run first sandbox" }).click();
  await expect(page.getByText("Submission response was lost.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check first task" }).click();
  await expect(page.getByText("First task completed.", { exact: true })).toBeVisible();
  expect(state.commands).toBe(1); expect(state.creates).toHaveLength(1);
});

test("empty catalog gives members an administrator handoff", async ({ page }) => {
  await setup(page, "member"); await firstTask(page);
  await expect(page.getByText(/Ask an administrator to add a template/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up the first template" })).toHaveCount(0);
});

for (const width of [1440, 390, 320]) test(`usage observations, gaps and values are usable at ${width}px`, async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/#dashboard/metrics");
  await expect(page.getByRole("heading", { name: "Historical activity" })).toBeVisible();
  await expect(page.locator(".dash-crumbs")).toContainText("Usage");
  await expect(page.getByText("Partial coverage", { exact: true })).toBeVisible();
  await expect(page.locator(".usage-history-totals")).toContainText("12.5 s");
  await expect(page.locator(".usage-plot-column.missing")).toHaveCount(1);
  await expect(page.locator(".usage-page")).not.toContainText("99999");
  await page.getByText("Bucket values", { exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Next buckets" }).click();
  await expect(page.getByRole("navigation", { name: "Usage bucket pages" })).toContainText("2 / 3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `/tmp/harakiri-usage-history-${width}.png`, fullPage: true });
  await page.getByLabel("Usage period").selectOption("7d");
  await expect.poll(() => state.windows.at(-1)?.get("resolution")).toBe("15m");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  state.failHistory = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Showing the last successful history response");
  await expect(page.locator(".usage-history-totals")).toContainText("12.5 s");
});

test("old servers keep retained records visible without invented history", async ({ page }) => {
  const state = await setup(page); state.oldServer = true;
  await page.goto("/#dashboard/metrics");
  await expect(page.getByRole("alert")).toContainText("does not support usage history");
  await expect(page.getByText("History unavailable", { exact: true })).toBeVisible();
  await expect(page.locator(".usage-totals")).toContainText("10");
  await expect(page.locator(".usage-plot")).toHaveCount(0);
});

for (const stateName of ["empty", "disabled", "stale", "forbidden"] as const) test(`usage distinguishes ${stateName} history`, async ({ page }) => {
  const state = await setup(page); state.historyState = stateName;
  await page.goto("/#dashboard/metrics");
  if (stateName === "empty") {
    await expect(page.locator(".usage-history-totals dd")).toHaveText(["0", "0", "0", "Unavailable"]);
    await expect(page.locator(".usage-plot-column.missing")).toHaveCount(0);
    await expect(page.locator(".usage-plot-column.observed span").first()).toHaveCSS("height", "1px");
  } else if (stateName === "disabled") {
    await expect(page.locator(".usage-history-totals dd")).toHaveText(["Unavailable", "Unavailable", "Unavailable", "Unavailable"]);
    await expect(page.getByText(/Collection is disabled/)).toBeVisible();
    await expect(page.locator(".usage-plot-column.missing")).toHaveCount(48);
  } else if (stateName === "stale") {
    await expect(page.getByText(/Collection is delayed/)).toBeVisible();
    await expect(page.locator(".usage-history-totals")).toContainText("12.5 s");
  } else {
    await expect(page.getByRole("alert")).toContainText("Requires org:read");
    await expect(page.locator(".usage-plot")).toHaveCount(0);
  }
  const period = page.getByLabel("Usage period");
  await period.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: stateName === "forbidden" ? "Retry" : "Refresh", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => state.windows.length).toBe(2);
});
