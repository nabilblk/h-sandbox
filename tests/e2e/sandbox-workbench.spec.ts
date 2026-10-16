import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { setupWorkbench } from "./fixtures/workbench";

const url = (tab = "overview") => `/#dashboard/sandboxes/sbx_python?tab=${tab}`;
const tab = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("overview checks readiness without attaching and command links survive refresh", async ({ page }) => {
  const { detail } = await setupWorkbench(page);
  await page.goto(url());
  await expect(page.getByRole("region", { name: "Sandbox overview" })).toContainText("Ready for commands");
  expect(detail.requests.some((request) => request.includes("attach-ticket"))).toBe(false);
  await page.getByRole("link", { name: "python report.py succeeded / exit 0" }).click();
  await expect(page).toHaveURL(/tab=commands&command=cmd_example/);
  await expect(page.getByLabel("Command output")).toContainText("4 tests passed");
  await page.reload();
  await expect(page.getByLabel("Command output")).toContainText("4 tests passed");
  await expect(page.getByRole("button", { name: "Copy command link" })).toBeVisible();
});

test("terminal handles ANSI, raw control keys, resize and explicit reconnect", async ({ page }) => {
  await setupWorkbench(page);
  let tickets = 0;
  const frames: Array<string | Buffer> = [];
  const sockets: WebSocketRoute[] = [];
  await page.route("**/terminal/attach-ticket", (route) => { tickets++; return route.fulfill({ json: { attachUrl: `ws://127.0.0.1:15189/fixture-terminal?ticket=${tickets}` } }); });
  await page.routeWebSocket(/fixture-terminal/, (socket) => {
    sockets.push(socket);
    socket.onMessage((message) => frames.push(message));
    socket.send(JSON.stringify({ type: "connected" }));
    socket.send(Buffer.concat([Buffer.from([1]), Buffer.from("\x1b[2J\x1b[Hhello\x1b[1;1HHi\r\nready\r\n") ]));
  });
  await page.goto(url("terminal"));
  await expect(page.getByRole("region", { name: "Interactive terminal" }).getByRole("status")).toHaveText("attached");
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("Hillo");
  const input = page.getByLabel("Sandbox terminal input");
  await input.focus();
  await page.keyboard.type("echo test");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Control+c");
  await expect.poll(() => Buffer.concat(frames.filter(Buffer.isBuffer).map((frame) => frame.subarray(1))).toString()).toContain("echo test\r\x1b[A\x03");
  expect(frames.filter(Buffer.isBuffer).every((frame) => frame[0] === 0)).toBe(true);
  const sizes = () => frames.filter((frame): frame is string => typeof frame === "string").map((frame) => JSON.parse(frame)).filter((frame) => frame.type === "resize");
  await expect.poll(() => sizes().length).toBeGreaterThan(0);
  const columns = sizes().at(-1).cols;
  await page.setViewportSize({ width: 800, height: 800 });
  await expect.poll(() => sizes().at(-1).cols).toBeLessThan(columns);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("region", { name: "Interactive terminal" }).getByRole("status")).toHaveText("disconnected");
  expect(tickets).toBe(1);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect.poll(() => tickets).toBe(2);
  await expect(page.getByRole("region", { name: "Interactive terminal" }).getByRole("status")).toHaveText("attached");
  await page.screenshot({ path: "/tmp/harakiri-workbench-terminal.png", fullPage: true });
  let closed = false;
  sockets.at(-1)!.onClose(() => { closed = true; });
  await tab(page, "Overview").click();
  await expect.poll(() => closed).toBe(true);
});

test("terminal reports denied attach without opening a socket or retrying", async ({ page }) => {
  await setupWorkbench(page);
  let requests = 0;
  await page.route("**/terminal/attach-ticket", (route) => { requests++; return route.fulfill({ status: 403, json: { error: "forbidden", message: "Execution permission required." } }); });
  await page.goto(url("terminal"));
  await expect(page.getByRole("alert")).toHaveText("Execution permission required.");
  await expect(page.getByRole("button", { name: "Interrupt", exact: true })).toBeDisabled();
  expect(requests).toBe(1);
});

test("file previews are inert and binary transfers preserve integrity", async ({ page }) => {
  const state = await setupWorkbench(page);
  await page.goto(url("files"));
  await page.getByRole("button", { name: /hostile.html/ }).click();
  await expect(page.locator(".workbench-file-content")).toContainText("<script>");
  expect(await page.evaluate(() => "workbenchAttack" in window)).toBe(false);
  await page.getByRole("button", { name: /result.bin/ }).click();
  await expect(page.getByText("Binary file. Download to inspect.")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("result.bin");
  expect(await readFile((await download.path())!)).toEqual(state.files.get("/workspace/result.bin"));
  const upload = Buffer.from([0, 255, 1, 2, 3]);
  await page.getByLabel("Upload file", { exact: true }).setInputFiles({ name: "result.bin", mimeType: "application/octet-stream", buffer: upload });
  await expect(page.getByRole("dialog")).toContainText("will be replaced");
  expect(state.uploads).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(page.getByText("Uploaded result.bin.", { exact: true })).toBeVisible();
  expect(state.files.get("/workspace/result.bin")).toEqual(upload);
  state.corruptDownload = true;
  await page.getByRole("button", { name: /report.json/ }).click();
  await expect(page.getByRole("alert")).toContainText("checksum verification failed");
});

test("cancelled upload discloses an unknown remote outcome", async ({ page }) => {
  const state = await setupWorkbench(page);
  let release!: () => void;
  state.uploadGate = new Promise<void>((resolve) => { release = resolve; });
  await page.goto(url("files"));
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeEnabled();
  await page.getByLabel("Upload file", { exact: true }).setInputFiles({ name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByRole("dialog").getByRole("button", { name: "Upload file", exact: true }).click();
  await expect.poll(() => state.uploads.length).toBe(1);
  await page.getByRole("button", { name: "Cancel transfer" }).click();
  await expect(page.getByRole("alert")).toContainText("may have written the file");
  release();
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeEnabled();
});

test("refresh replaces a selected preview and removes deleted files", async ({ page }) => {
  const state = await setupWorkbench(page);
  await page.goto(url("files"));
  await page.getByRole("button", { name: /report.json/ }).click();
  await expect(page.locator(".workbench-file-content")).toContainText('"passed":4');
  state.files.set("/workspace/report.json", Buffer.from('{"tests":5,"passed":5}\n'));
  await page.getByRole("button", { name: "Refresh files" }).click();
  await expect(page.locator(".workbench-file-content")).toContainText('"passed":5');
  state.files.delete("/workspace/report.json");
  await page.getByRole("button", { name: "Refresh files" }).click();
  await expect(page.getByRole("complementary", { name: "File preview" })).toHaveCount(0);
});

test("older command links refresh canonical status outside the recent list", async ({ page }) => {
  await setupWorkbench(page);
  let complete = false;
  await page.route("**/commands", (route) => route.fulfill({ json: { commands: [] } }));
  await page.route("**/commands/cmd_example", (route) => route.fulfill({ json: { command: {
    id: "cmd_example", command: "python report.py", status: complete ? "failed" : "running",
    exitCode: null, finishReason: complete ? "timeout" : null
  } } }));
  await page.route("**/commands/cmd_example/events**", (route) => route.fulfill({ contentType: "text/event-stream", body: "" }));
  await page.goto(url("commands") + "&command=cmd_example");
  await expect(page.getByRole("button", { name: /python report.py running/ })).toBeVisible();
  complete = true;
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await expect(page.getByRole("button", { name: /python report.py failed/ })).toBeVisible();
  await expect(page.locator(".command-output-toolbar")).toContainText("timeout");
  await expect(page.getByRole("button", { name: "Terminate", exact: true })).toHaveCount(0);
});

test("oversized uploads and previews are rejected before transferring bytes", async ({ page }) => {
  const state = await setupWorkbench(page);
  state.files.set("/workspace/large.txt", Buffer.alloc(256 * 1024 + 1, 65));
  await page.goto(url("files"));
  await page.getByRole("button", { name: /large.txt/ }).click();
  await expect(page.getByText(/Text previews support regular files/)).toBeVisible();
  await page.getByLabel("Upload file", { exact: true }).setInputFiles({ name: "large.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(16 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toContainText("Upload limit");
  expect(state.uploads).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a timed-out preview can be replaced without leaking a late response", async ({ page }) => {
  await setupWorkbench(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/files/download?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("path") !== "/workspace/hostile.html") return route.fallback();
    await gate;
    return route.fallback();
  });
  await page.goto(url("files"));
  await page.clock.install();
  await page.getByRole("button", { name: /hostile.html/ }).click();
  await expect(page.getByText("Loading preview...", { exact: true })).toBeVisible();
  await page.clock.fastForward(20_001);
  await expect(page.getByRole("alert")).toContainText("Preview timed out");
  await page.getByRole("button", { name: /report.json/ }).click();
  await expect(page.locator(".workbench-file-content")).toContainText('"passed":4');
  release();
  await expect(page.locator(".workbench-file-content")).not.toContainText("<script>");
});

test("logs filter and follow snapshots; metrics expose missing fields and failed observations", async ({ page }) => {
  const state = await setupWorkbench(page);
  await page.goto(url("logs"));
  const logs = page.getByRole("region", { name: "Sandbox logs" });
  await expect(logs).toContainText("Runtime ready.");
  await page.getByLabel("Log source").selectOption("control-plane");
  await expect(logs).not.toContainText("Runtime ready.");
  await page.getByRole("searchbox", { name: "Search logs" }).fill("terminal");
  await expect(logs).toContainText("terminal attached");
  await expect(logs).not.toContainText("Credential attachment refreshed");
  await page.getByRole("searchbox", { name: "Search logs" }).fill("");
  await page.getByLabel("Log source").selectOption("");
  state.detail.logs = [{ lvl: "warn", source: "sandbox", msg: "New observation", ts: "2026-10-15T12:00:00Z" }];
  await page.getByRole("checkbox", { name: "Follow" }).check();
  await expect(logs).toContainText("New observation");
  state.detail.logStatus = 503;
  await expect(logs.getByRole("alert")).toContainText("last successful snapshot");
  await tab(page, "Metrics").click();
  await expect(page.getByRole("region", { name: "Sandbox metrics" })).toContainText("128 MiB");
  await expect(page.locator(".workbench-observations > div").filter({ hasText: "Disk I/O" })).toContainText("Unavailable");
  state.metricsStatus = 503;
  await page.getByRole("button", { name: "Refresh metrics" }).click();
  await expect(page.getByRole("alert")).toContainText("Current runtime metrics unavailable");
  await expect(page.locator(".workbench-observations")).not.toContainText("128");
});

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`overview and file preview remain usable at ${width}px`, async ({ page }) => {
    await setupWorkbench(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url());
    await expect(page.getByText("Ready for commands", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/harakiri-workbench-overview-${width}.png`, fullPage: true });
    await tab(page, "Filesystem").click();
    await page.getByRole("button", { name: /report.json/ }).click();
    await expect(page.locator(".workbench-file-content")).toContainText('"passed":4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/harakiri-workbench-files-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
