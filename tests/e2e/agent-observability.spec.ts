import { expect, test } from "@playwright/test";
import { setupObservability, spanFixture, traceId } from "./fixtures/observability";

const runUrl = "/#dashboard/runs?run=run_fixture";

test("candidate recording documentation stays readable and discloses the security gate", async ({ page }) => {
  await setupObservability(page);
  await page.goto("/#docs/agent-observability");
  await expect(page.getByRole("heading", { name: "Agent observability", exact: true })).toBeVisible();
  await expect(page.locator("#docs-content")).toContainText("fail the high/critical dependency audit");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const section = page.getByRole("heading", { name: "Record a command", exact: true });
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    await expect(page.locator("#docs-content")).toContainText("withAgentRun");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/harakiri-telemetry-docs-${viewport.width}.png` });
  }
});

test("run discovery, trace selection, keyboard navigation and refresh preserve exact step links", async ({ page }) => {
  await setupObservability(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#dashboard/runs");
  await page.getByRole("link", { name: /Repair CSV parser/ }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(8);
  const failed = page.getByRole("treeitem", { name: /Run regression tests/ });
  await failed.click();
  await expect(page).toHaveURL(/step=/);
  await expect(page.getByRole("complementary", { name: "Step inspector" })).toContainText("cmd_example");
  await page.reload();
  await expect(failed).toHaveAttribute("aria-selected", "true");
  await failed.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.getByRole("treeitem", { name: /Apply fix/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("treeitem", { name: /Repair the CSV parser/ })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("treeitem")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("treeitem")).toHaveCount(8);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("treeitem", { name: /Inspect repository/ })).toBeFocused();
  const divider = page.getByRole("separator", { name: "Resize trace navigation" });
  await divider.focus(); await page.keyboard.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "44");
  await page.getByLabel("Errors only").check();
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await page.getByLabel("Errors only").uncheck();
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Content", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();
  await page.screenshot({ path: "/tmp/harakiri-agent-runs-desktop.png", fullPage: true });
});

test("custom ranges are validated, shared and restored by browser history", async ({ page }) => {
  const state = await setupObservability(page);
  await page.goto(runUrl);
  await expect(page.getByRole("treeitem")).toHaveCount(8);
  expect(state.requests.filter((request) => request === "/v1/agent-runs")).toHaveLength(0);
  await page.getByLabel("Trace time window").selectOption("custom");
  await page.getByLabel("From (UTC)").fill("2026-11-09T12:00");
  await page.getByLabel("To (UTC)").fill("2026-11-09T11:00");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page.getByRole("alert")).toContainText("end after the start");
  await page.getByLabel("To (UTC)").fill("2026-11-09T12:05");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page).toHaveURL(/from=2026-11-09T12%3A00%3A00.000Z/);
  await page.getByRole("treeitem", { name: /Apply fix/ }).click();
  await page.reload();
  await expect(page.getByRole("treeitem", { name: /Apply fix/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Trace time window")).toHaveValue("custom");
  const request = new URL(state.requests.filter((request) => request.includes("/spans?")).at(-1)!, "http://fixture.test");
  expect(request.searchParams.get("to")).toBe("2026-11-09T12:05:00.000Z");
  await page.getByLabel("Trace time window").selectOption("run");
  await expect(page).not.toHaveURL(/from=/);
  await page.goBack();
  await expect(page.getByLabel("Trace time window")).toHaveValue("custom");
});

test("investigation opens at the root, fits the viewport and reveals errors inside collapsed branches", async ({ page }) => {
  const state = await setupObservability(page);
  state.spans.reverse();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(runUrl);
  const root = page.getByRole("treeitem", { name: /Repair the CSV parser/ });
  await expect(root).toHaveAttribute("aria-selected", "true");
  const layout = await page.locator(".trace-layout").boundingBox();
  expect(layout!.y).toBeLessThan(300);
  expect(layout!.y + layout!.height).toBeLessThanOrEqual(900);
  const browser = await page.locator(".trace-browser").boundingBox();
  const inspector = await page.getByRole("complementary", { name: "Step inspector" }).boundingBox();
  expect(inspector!.width).toBeGreaterThan(browser!.width);

  const reads = state.requests.length;
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tree", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  expect(state.requests).toHaveLength(reads);
  await page.getByRole("button", { name: "Collapse Repair the CSV parser", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Review errors (1)" }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(8);
  await expect(page.getByRole("treeitem", { name: /Run regression tests/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Logs", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Sensitive content", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("This step only")).toBeChecked();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: /Apply fix/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Logs", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("logs filter loaded records, copy exact output and do not search hidden content", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await setupObservability(page);
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Review errors (1)" }).click();
  await expect(page.locator(".trace-log")).toHaveCount(3);
  await page.getByLabel("Sensitive content", { exact: true }).check();
  await expect(page.getByLabel("Retained agent logs")).toContainText("Fixture output 1");
  const reads = state.requests.length;
  await page.getByLabel("Log severity").selectOption("warning");
  await expect(page.locator(".trace-log")).toHaveCount(1);
  await page.getByLabel("Search loaded logs").fill("output 1");
  await expect(page.locator(".trace-log")).toHaveCount(1);
  expect(state.requests).toHaveLength(reads);
  await page.getByRole("button", { name: "Copy log body", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Fixture output 1: 4 tests passed");
  await page.getByLabel("Sensitive content", { exact: true }).uncheck();
  await expect(page.locator(".trace-log")).toHaveCount(3);
  await expect(page.getByLabel("Retained agent logs")).not.toContainText("Fixture output");
  await expect(page.getByRole("button", { name: "Copy log body", exact: true })).toHaveCount(0);
  await page.getByLabel("Search loaded logs").fill("output 1");
  await expect(page.getByRole("heading", { name: "No matching logs" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator(".trace-log")).toHaveCount(3);
});

test("structured content is readable, copyable and escaped", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await setupObservability(page);
  state.input = JSON.stringify([{ role: "user", content: '<script>window.traceAttack=true</script>' }]);
  await page.goto(runUrl);
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByRole("button", { name: "Reveal content", exact: true }).click();
  const value = page.getByRole("region", { name: "Input messages", exact: true });
  await expect(value.locator(".llm-role")).toHaveText("user");
  await expect(value.locator("pre")).toHaveText('<script>window.traceAttack=true</script>');
  await value.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(value.locator("pre")).toHaveText(JSON.stringify(JSON.parse(state.input), null, 2));
  await expect(value.locator(".hljs-string").first()).toBeVisible();
  expect(await page.evaluate(() => "traceAttack" in window)).toBe(false);
  await value.getByRole("button", { name: "Copy Input messages", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(state.input);
});

test("model investigation shows actual usage semantics and links a captured tool call", async ({ page }) => {
  const state = await setupObservability(page);
  state.spans[2].attributes = { "openinference.span.kind": "LLM", "gen_ai.provider.name": "fixture-provider",
    "gen_ai.request.model": "fixture-model", "gen_ai.usage.input_tokens": "100", "gen_ai.usage.output_tokens": "20",
    "gen_ai.usage.cache_read.input_tokens": "80", "gen_ai.response.finish_reasons": '["tool_calls"]', "gen_ai.request.temperature": "0" };
  state.spans[3].attributes["gen_ai.tool.call.id"] = "call_fixture";
  state.input = JSON.stringify([{ role: "system", content: "Use only controlled tools." }, { role: "user", content: "Verify the report." }]);
  state.output = JSON.stringify([{ role: "assistant", content: "", tool_calls: [{ id: "call_fixture", name: "validate_report", arguments: { total: 3500 } }] }]);
  await page.goto(runUrl);
  await page.getByLabel("Step type", { exact: true }).selectOption("model");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await page.getByRole("treeitem", { name: /Plan the repair/ }).click();
  const generation = page.getByRole("region", { name: "Generation details" });
  await expect(generation).toContainText("fixture-provider");
  await expect(generation).toContainText("120");
  await expect(generation).toContainText("Cache read 80");
  await expect(generation).toContainText("tool_calls");
  await expect(generation).toContainText("First text tokenNot reported");
  await expect(generation).toContainText("CostNot reported");
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByRole("button", { name: "Reveal content", exact: true }).click();
  const output = page.getByRole("region", { name: "Output messages", exact: true });
  await expect(output.locator(".llm-role")).toHaveText("assistant");
  await expect(output).toContainText("validate_report");
  await expect(output).toContainText('"total": 3500');
  await output.getByRole("button", { name: "Inspect tool", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Step inspector" }).getByRole("heading", { name: "Run regression tests", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /Run regression tests/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Step type", { exact: true })).toHaveValue("");
  await page.getByLabel("Sensitive content", { exact: true }).uncheck();
  await expect(page.getByRole("tabpanel")).not.toContainText("call_fixture");
});

test("framework exceptions open their evidence, not an assumed application log", async ({ page }) => {
  const state = await setupObservability(page);
  delete state.spans[3].attributes["harakiri.command.id"];
  state.spans[3].attributes["error.type"] = "AssertionError";
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Review errors (1)" }).click();
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("AssertionError");
  await expect(page.getByLabel("Sensitive content", { exact: true })).not.toBeChecked();
});

test("content opt-in is explicit, hostile payloads stay inert, denied refresh removes old content", async ({ page }) => {
  const state = await setupObservability(page);
  await page.goto(runUrl);
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Sensitive content is hidden");
  await page.getByLabel("Sensitive content", { exact: true }).check();
  await expect(page.getByRole("tabpanel")).toContainText("<script>");
  expect(await page.evaluate(() => "traceAttack" in window)).toBe(false);
  await page.getByLabel("Sensitive content", { exact: true }).uncheck();
  await expect(page.getByRole("tabpanel")).not.toContainText("<script>");
  await page.getByLabel("Sensitive content", { exact: true }).check();
  await expect(page.getByRole("tabpanel")).toContainText("<script>");
  state.spansStatus = 403;
  await page.getByRole("button", { name: "Refresh run", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Telemetry access denied");
  await expect(page.getByRole("tabpanel")).not.toContainText("<script>");
});

test("Workbench keeps sandbox navigation and correlates logs without claiming a complete read", async ({ page }) => {
  const state = await setupObservability(page);
  state.logCount = 10_000;
  await page.goto(`/#dashboard/sandboxes/sbx_python?tab=runs&run=run_fixture&step=${traceId}:0000000000000004`);
  await expect(page.getByRole("treeitem", { name: /Run regression tests/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: /agent-research-worker/ })).toBeVisible();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  await expect(page.getByLabel("Retained agent logs")).toContainText("record_limit");
  await expect(page.locator(".trace-log")).toHaveCount(500);
  expect(state.requests.some((request) => request.includes(`spanId=0000000000000004`))).toBe(true);
  await page.getByLabel("This step only").uncheck();
  await expect.poll(() => state.requests.filter((request) => request.includes("/logs?")).at(-1)).not.toContain("spanId=");
  await expect(page.getByLabel("Retained agent logs")).not.toContainText("Fixture output");
  state.logsStatus = 503;
  await page.getByLabel("Follow", { exact: true }).check();
  await expect(page.getByLabel("Retained agent logs").getByRole("alert")).toContainText("unavailable");
});

test("1000 steps stay bounded, filterable and usable at desktop, tablet, mobile and zoom", async ({ page }) => {
  const state = await setupObservability(page);
  state.spans = Array.from({ length: 1000 }, (_, index) => spanFixture(index));
  await page.goto(runUrl);
  await expect(page.getByRole("treeitem")).toHaveCount(1000);
  const started = Date.now();
  await page.getByLabel("Search steps").fill("Tool step 998");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  expect(Date.now() - started).toBeLessThan(2000);
  await page.getByRole("treeitem", { name: /Tool step 998/ }).click();
  await expect(page.getByRole("complementary", { name: "Step inspector" })).toContainText("Tool step 998");
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByLabel("Agent trace steps")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/harakiri-agent-runs-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "/tmp/harakiri-agent-runs-zoom.png", fullPage: true });
});

test("disabled installation and expired retention are explicit, not empty success", async ({ page }) => {
  const state = await setupObservability(page);
  state.policy.available = false;
  await page.goto("/#dashboard/runs");
  await expect(page.getByRole("heading", { name: "Agent observability is not installed" })).toBeVisible();
  state.policy.available = true; state.run.expired = true;
  await page.goto(runUrl);
  await expect(page.getByText("The telemetry read window has expired. Run metadata is retained.")).toBeVisible();
  expect(state.requests.some((request) => request.includes("/spans"))).toBe(false);
});

test("viewer text has readable contrast on its rendered surfaces", async ({ page }) => {
  await setupObservability(page);
  await page.goto(runUrl);
  await expect(page.getByRole("treeitem")).toHaveCount(8);
  const violations = await page.locator(".runs-page").evaluate((root) => {
    const rgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { channels: channels.slice(0, 3), alpha: channels[3] ?? 1 };
    };
    const luminance = (channels: number[]) => channels.reduce((sum, value, index) => {
      const channel = value / 255;
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const background = (element: Element): number[] => {
      const color = rgb(getComputedStyle(element).backgroundColor);
      const behind = color.alpha < 1 && element.parentElement ? background(element.parentElement) : [255, 255, 255];
      return color.channels.map((channel, index) => channel * color.alpha + behind[index] * (1 - color.alpha));
    };
    const failures: Array<{ text: string; ratio: number; required: number }> = [];
    const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = nodes.nextNode(); node; node = nodes.nextNode()) {
      const element = node.parentElement, text = node.textContent?.trim();
      if (!text || !element || element.closest(":disabled, [hidden]") || !element.getClientRects().length) continue;
      const style = getComputedStyle(element);
      if (style.visibility !== "visible") continue;
      const behind = background(element);
      const front = rgb(style.color);
      const a = luminance(front.channels.map((channel, index) => channel * front.alpha + behind[index] * (1 - front.alpha)));
      const b = luminance(behind);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = Number.parseFloat(style.fontSize) >= (Number.parseInt(style.fontWeight) >= 700 ? 18.66 : 24);
      const required = large ? 3 : 4.5;
      if (ratio < required) failures.push({ text: text.slice(0, 70), ratio, required });
    }
    return failures;
  });
  expect(violations).toEqual([]);
});
