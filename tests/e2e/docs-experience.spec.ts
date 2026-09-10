import { expect, test } from "@playwright/test";

test("Kubernetes installation is discoverable and exports the exact operator commands", async ({ page, request }) => {
  await page.goto("/#docs/overview");
  await page.locator('article .docs-start-link[href="#docs/install-kubernetes"]').click();
  await expect(page.getByRole("heading", { name: "Install on Kubernetes", exact: true })).toBeVisible();
  await expect(page.locator('.docs-side a[href="#docs/install-kubernetes"]')).toHaveAttribute("aria-current", "page");
  const source = await page.locator('.doc-code').filter({ hasText: "Download operator files" }).locator("pre code").textContent();
  expect(source).toContain("git checkout --detach");
  await page.getByRole("searchbox", { name: "Search documentation" }).fill("k8s helm");
  await page.getByRole("region", { name: "Documentation search results" }).getByRole("link", { name: /Install on Kubernetes/ }).click();
  await expect(page).toHaveURL(/#docs\/install-kubernetes$/);
  const response = await request.get("/docs/install-kubernetes.md");
  expect(response.ok()).toBe(true);
  const markdown = await response.text();
  expect(markdown).toContain(source!);
  expect(markdown).toContain("node install-check.mjs");
  expect(markdown).toContain("Native amd64 acceptance is still pending");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#docs/overview");
  await page.getByLabel("Browse docs").selectOption("install-kubernetes");
  await expect(page).toHaveURL(/#docs\/install-kubernetes$/);
  await page.locator(".docs-inline-toc summary").click();
  await page.getByRole("navigation", { name: "Page sections" }).getByRole("link", { name: "Connect and sign in", exact: true }).click();
  await expect(page.locator("#connect-and-sign-in")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("docs search, reading progression and section links preserve navigation", async ({ page }) => {
  await page.goto("/#docs/overview");
  await expect(page.getByRole("heading", { name: "Harakiri documentation", exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await search.fill("mountPath");
  const results = page.getByRole("region", { name: "Documentation search results" });
  await expect(results.getByRole("link", { name: /Workspace API/ })).toBeVisible();
  await results.getByRole("link", { name: /Workspace API/ }).click();
  await expect(page).toHaveURL(/#docs\/workspace-reference$/);
  await expect(search).toHaveValue("");
  await search.fill("nothing-matches-this-381725");
  await expect(results).toContainText("No matches");
  await search.press("Escape");
  await expect(results).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.goto("/#docs/vision-architecture?section=architecture");
  await expect(page.locator("article h2#architecture")).toBeFocused();
  await expect.poll(() => page.locator("#architecture").evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThan(55);
  await page.locator('.docs-toc a[href$="section=design-principles"]').click();
  await expect(page).toHaveURL(/section=design-principles$/);
  await expect(page.locator("#design-principles")).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/section=architecture$/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.docs-toc a[href$="section=architecture"]').click();
  await expect.poll(() => page.locator("#architecture").evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(120);
  await page.getByRole("navigation", { name: "Reading progression" }).getByRole("link", { name: /Next/ }).click();
  await expect(page).toHaveURL(/#docs\/sdk-cli$/);
});

test("language selection stays consistent and copy preserves exact code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#docs/quickstart");
  const install = page.getByRole("tablist", { name: "Install method" });
  const task = page.getByRole("tablist", { name: "Quickstart implementation" });
  await install.getByRole("tab", { name: "TypeScript" }).click();
  await expect(task.getByRole("tab", { name: "TypeScript" })).toHaveAttribute("aria-selected", "true");
  const block = page.locator('.doc-code[data-language="typescript"]');
  const raw = await block.locator("pre code").textContent();
  expect(raw).toContain('from "@h-sandbox/sdk"');
  await block.getByRole("button", { name: "Copy quickstart.mts code" }).click();
  await expect(block.getByRole("status")).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(raw);
  await expect(block.locator(".hljs-keyword").first()).toHaveCSS("color", "rgb(255, 156, 170)");
  await task.getByRole("tab", { name: "TypeScript" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(task.getByRole("tab", { name: "CLI" })).toBeFocused();
  await expect(install.getByRole("tab", { name: "CLI" })).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Clipboard blocked"); }; });
  const cli = page.locator(".doc-code").filter({ has: page.getByRole("button", { name: "Copy quickstart.sh code" }) });
  await cli.getByRole("button").click();
  await expect(cli.getByRole("status")).toContainText("Copy unavailable");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`all pages and diagrams fit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/#docs/overview");
    await expect(page.locator(".docs-body h1")).toBeVisible();
    const ids = await page.locator("#docs-page option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      await page.goto(`/#docs/${id}`);
      await expect(page.locator(`.docs-side a[href="#docs/${id}"]`)).toHaveAttribute("aria-current", "page");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow, id).toBe(false);
      const brokenCode = await page.locator("article pre").evaluateAll((nodes) => nodes.some((node) => !node.closest(".doc-code[data-language]")));
      expect(brokenCode, id).toBe(false);
      if (id === "vision-architecture") {
        const overflowedNodes = await page.locator("[data-diagram-node]").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
        expect(overflowedNodes).toBe(0);
        // Hide fixed chrome only for isolated diagram exports; viewport captures test it separately.
        const style = ".topnav, .docs-skip { visibility: hidden !important; }";
        await page.locator(".system-diagram").screenshot({ path: `docs/artifacts/docs-redesign/system-${viewport.width}.png`, style });
        await page.locator(".lifecycle-diagram").screenshot({ path: `docs/artifacts/docs-redesign/lifecycle-${viewport.width}.png`, style });
      }
    }
    expect(errors).toEqual([]);
    await page.goto("/#docs/quickstart");
    if (viewport.width < 760) {
      await page.getByLabel("Browse docs").selectOption("workspaces");
      await expect(page).toHaveURL(/#docs\/workspaces$/);
      await page.locator(".docs-inline-toc summary").click();
      await page.getByRole("navigation", { name: "Page sections" }).getByRole("link", { name: "Lifecycle", exact: true }).click();
      await expect(page).toHaveURL(/section=lifecycle$/);
      await expect(page.locator("#lifecycle")).toBeFocused();
    }
  });
}

test("keyboard skip link, unknown pages and reload keep the docs usable", async ({ page }) => {
  await page.goto("/#docs/does-not-exist");
  await expect(page.getByRole("heading", { name: "Documentation page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Browse the documentation" }).click();
  await expect(page).toHaveURL(/#docs\/overview$/);
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("article#docs-content")).toBeFocused();
  await page.goto("/#docs/workspaces?section=retention-and-limits");
  await page.reload();
  await expect(page.locator("#retention-and-limits")).toBeFocused();
  await expect(page).toHaveTitle("Workspaces | Harakiri Docs");
});
