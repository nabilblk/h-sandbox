import { expect, test, type Page } from "@playwright/test";
import { sandboxFixture, setupSandboxDetail } from "./fixtures/sandbox-detail";

const detailUrl = (id = "sbx_python") => `/#dashboard/sandboxes/${id}`;
const sandboxLink = (page: Page, id: string) => page.getByRole("navigation", { name: "Recent sandboxes" }).locator(`a[href="#dashboard/sandboxes/${id}"]`);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

for (const width of [1920, 1440, 1024, 768, 390, 320]) {
  test(`sandbox navigation and log fields fit at ${width}px`, async ({ page }) => {
    await setupSandboxDetail(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(detailUrl());
    await page.getByRole("button", { name: "Logs", exact: true }).click();
    const logs = page.getByRole("region", { name: "Sandbox logs" });
    await expect(logs).toContainText("TERMINAL.ATTACH.STARTED");
    await expect(logs).toContainText("terminal attached");
    await expect(logs).toHaveAttribute("aria-busy", "false");
    if (width > 760) {
      await expect(sandboxLink(page, "sbx_agent")).toBeVisible();
      await expect(sandboxLink(page, "sbx_python")).toHaveAttribute("aria-current", "page");
    } else {
      await expect(page.getByRole("combobox", { name: "Switch sandbox" })).toHaveValue("sbx_python");
      await expect(page.getByRole("navigation", { name: "Recent sandboxes" })).toBeHidden();
    }
    const violations = await logs.evaluate((node) => {
      const issues: string[] = [];
      for (const [index, row] of Array.from(node.querySelectorAll<HTMLElement>(".logs-row:not(.logs-head)")).entries()) {
        const cells = Array.from(row.children) as HTMLElement[];
        for (const cell of cells) {
          const box = cell.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          if (text.right > box.right + 1 || text.bottom > box.bottom + 1 || text.left < box.left - 1) issues.push(`row ${index}: ${cell.className} text escapes cell`);
          if (cell.scrollWidth > cell.clientWidth + 1) issues.push(`row ${index}: ${cell.className} overflows`);
        }
        for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
          const left = cells[a].getBoundingClientRect(), right = cells[b].getBoundingClientRect();
          if (Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1 && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1) issues.push(`row ${index}: cells overlap`);
        }
      }
      if (node.scrollWidth > node.clientWidth) issues.push("logs overflow horizontally");
      return issues;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/harakiri-sandbox-detail-${width}.png`, fullPage: true });
    if (width > 760) await sandboxLink(page, "sbx_agent").click();
    else await page.getByRole("combobox", { name: "Switch sandbox" }).selectOption("sbx_agent");
    await expect(page.locator(".detail-name")).toHaveText("agent-research-worker");
    await expect(page.locator(".detail-tab.active")).toHaveText("Logs");
    await expect(logs).toContainText("Output from sbx_agent");
    await expect(logs).not.toContainText("Output from sbx_python");
    if (width > 760) await sandboxLink(page, "sbx_long").click();
    else await page.getByRole("combobox", { name: "Switch sandbox" }).selectOption("sbx_long");
    await expect(page.locator(".detail-id")).toHaveText("sbx_long");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.locator(".detail-name").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("search, keyboard switching and browser history preserve the active tab", async ({ page }) => {
  await setupSandboxDetail(page);
  await page.goto(detailUrl());
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search recent sandboxes" });
  await search.fill("SBX_AGENT");
  await expect(sandboxLink(page, "sbx_agent")).toBeVisible();
  await expect(sandboxLink(page, "sbx_python")).toHaveCount(0);
  await sandboxLink(page, "sbx_agent").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#dashboard\/sandboxes\/sbx_agent$/);
  await expect(page.locator(".detail-name")).toHaveText("agent-research-worker");
  await expect(sandboxLink(page, "sbx_agent")).toHaveAttribute("aria-current", "page");
  await search.fill("missing-sandbox");
  await expect(page.getByText("No matching sandboxes.")).toBeVisible();
  await search.fill("python-3.12");
  await expect(page.locator(".detail-sbx-item")).toHaveCount(4);
  await search.fill("");
  await page.goBack();
  await expect(page.locator(".detail-name")).toHaveText("python-3.12-runner");
  await expect(page.locator(".detail-tab.active")).toHaveText("Logs");
});

test("a bounded long list scrolls independently and includes an older selected sandbox", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  state.sandboxes = Array.from({ length: 200 }, (_, index) => sandboxFixture(`sbx_recent_${index}`, `recent-worker-${index}`));
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(detailUrl());
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.locator(".detail-sbx-item")).toHaveCount(201);
  await expect(sandboxLink(page, "sbx_python")).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("navigation", { name: "Recent sandboxes" });
  expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)).toBe(false);
  await list.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect(list.getByText("Showing the 200 most recent sandboxes.")).toBeInViewport();
  await expect(page.locator(".detail-tabs")).toBeInViewport();
  await expect(page.getByRole("searchbox")).toBeInViewport();
});

test("refresh failures retain the list and retry recovers without leaving the sandbox", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  await page.goto(detailUrl());
  await expect(sandboxLink(page, "sbx_agent")).toBeVisible();
  state.listStatus = 503;
  await page.getByRole("button", { name: "Refresh sandboxes" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not refresh sandboxes.");
  await expect(sandboxLink(page, "sbx_agent")).toBeVisible();
  await expect(page.locator(".detail-name")).toHaveText("python-3.12-runner");
  state.listStatus = 200;
  state.sandboxes.push(sandboxFixture("sbx_new", "new-worker"));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(sandboxLink(page, "sbx_new")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the sidebar works while details are loading or unavailable", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  const pending = deferred();
  state.detailGates.set("sbx_python", pending.promise);
  await page.goto(detailUrl());
  await expect(page.getByText("Loading sandbox...", { exact: true })).toBeVisible();
  await sandboxLink(page, "sbx_agent").click();
  await expect(page.locator(".detail-name")).toHaveText("agent-research-worker");
  const lateDetail = page.waitForResponse((response) => new URL(response.url()).pathname === "/v1/sandboxes/sbx_python");
  pending.resolve();
  await lateDetail;
  await expect(page.locator(".detail-id")).toHaveText("sbx_agent");
  state.detailStatus.set("sbx_python", 503);
  await sandboxLink(page, "sbx_python").click();
  await expect(page.getByRole("alert")).toHaveText("Sandbox temporarily unavailable.");
  await expect(sandboxLink(page, "sbx_agent")).toBeVisible();
  state.detailStatus.delete("sbx_python");
  await page.getByRole("button", { name: "Retry sandbox" }).click();
  await expect(page.locator(".detail-name")).toHaveText("python-3.12-runner");
});

test("a delayed log response cannot replace the next sandbox's output", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  await page.goto(detailUrl());
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sandbox logs" })).toContainText("Output from sbx_python");
  const pending = deferred();
  state.logGates.set("sbx_agent", pending.promise);
  await sandboxLink(page, "sbx_agent").click();
  await expect(page.getByText("Loading logs...", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sandbox logs" })).not.toContainText("Output from sbx_python");
  await sandboxLink(page, "sbx_previous").click();
  await expect(page.getByRole("region", { name: "Sandbox logs" })).toContainText("Output from sbx_previous");
  const lateLogs = page.waitForResponse((response) => new URL(response.url()).pathname === "/v1/sandboxes/sbx_agent/logs");
  pending.resolve();
  await lateLogs;
  await expect(page.getByRole("region", { name: "Sandbox logs" })).not.toContainText("Output from sbx_agent");
  expect(state.requests.filter((request) => request.includes("terminal/attach-ticket"))).toHaveLength(1);
});

test("initial list loading, empty results and errors remain explicit", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  const pending = deferred();
  state.listGate = pending.promise;
  state.detailStatus.set("sbx_python", 503);
  await page.goto(detailUrl());
  await expect(page.getByText("Loading sandboxes...", { exact: true })).toBeVisible();
  state.sandboxes = [];
  pending.resolve();
  await expect(page.getByText("No recent sandboxes.")).toBeVisible();
  state.listStatus = 503;
  await page.getByRole("button", { name: "Refresh sandboxes" }).click();
  await expect(page.getByText("Sandbox list unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: "All sandboxes" })).toBeEnabled();
});

test("log errors do not present stale output as current data", async ({ page }) => {
  const state = await setupSandboxDetail(page);
  await page.goto(detailUrl());
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sandbox logs" })).toContainText("Output from sbx_python");
  state.logStatus = 503;
  await sandboxLink(page, "sbx_agent").click();
  const logs = page.getByRole("region", { name: "Sandbox logs" });
  await expect(logs.getByRole("alert")).toHaveText("Logs temporarily unavailable.");
  await expect(logs).not.toContainText("Output from sbx_python");
});
