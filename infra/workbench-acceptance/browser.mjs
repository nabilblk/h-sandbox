import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { check, until } from "../acceptance/context.mjs";
import { apiUrl, workbenchUrl, binaryFixture, verifyBytes, ptySize, assertMetrics, scopedAttachHeaders, probeKey } from "./fixtures.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const contains = async (locator, text) => (await locator.textContent() ?? "").includes(text);
const shows = (locator, text) => until("Expected Workbench output", () => contains(locator, text), 60000);
const responseFor = (page, id, endpoint, method = "GET") => page.waitForResponse(response => {
  const url = new URL(response.url());
  return `${url.origin}${url.pathname}` === apiUrl(id, endpoint) && response.request().method() === method;
});
async function json(response, status = 200) {
  check(response.status() === status, "Workbench public request failed");
  return response.json();
}

export async function verifyOverview(page, id) {
  let attaches = 0;
  const observe = request => { if (request.url() === apiUrl(id, "terminal/attach-ticket")) attaches++; };
  page.on("request", observe);
  try {
    const readiness = responseFor(page, id, "readiness");
    await page.goto(workbenchUrl(id));
    check((await json(await readiness)).readiness.status === "ready", "Overview did not receive actual readiness");
    await shows(page.getByRole("region", { name: "Sandbox overview" }), "Ready for commands");
    check(attaches === 0, "Overview unexpectedly attached a terminal");
    return { ready: true, noAttach: true };
  } finally { page.off("request", observe); }
}

export function watchTerminal(page, id) {
  const state = { sockets: 0, closed: 0, inputBytes: 0, outputBytes: 0, sizes: [] };
  const listeners = [];
  const observe = socket => {
    const url = new URL(socket.url());
    const expected = new URL(apiUrl(id, "terminal/attach"));
    if (url.protocol !== "ws:" || url.host !== expected.host || url.pathname !== expected.pathname) return;
    state.sockets++;
    const sent = ({ payload }) => {
      if (Buffer.isBuffer(payload)) { if (payload[0] === 0) state.inputBytes += payload.length - 1; return; }
      try {
        const frame = JSON.parse(payload);
        if (frame.type === "resize" && Number.isInteger(frame.cols) && Number.isInteger(frame.rows) && frame.cols > 0 && frame.rows > 0) {
          state.sizes.push({ cols: frame.cols, rows: frame.rows });
          if (state.sizes.length > 20) state.sizes.shift();
        }
      } catch { /* Non-resize frames are not evidence. */ }
    };
    const received = ({ payload }) => { if (Buffer.isBuffer(payload) && payload[0] === 1) state.outputBytes += payload.length - 1; };
    const closed = () => { state.closed++; };
    for (const [event, listener] of [["framesent", sent], ["framereceived", received], ["close", closed]]) {
      socket.on(event, listener);
      listeners.push(() => socket.off(event, listener));
    }
  };
  page.on("websocket", observe);
  return { state, stop() { page.off("websocket", observe); for (const remove of listeners) remove(); } };
}

async function typePty(page, command) {
  await page.getByLabel("Sandbox terminal input").focus();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

export async function verifyPty(page, id) {
  const witness = watchTerminal(page, id);
  const state = witness.state;
  const terminal = page.getByRole("region", { name: "Interactive terminal" });
  const screen = page.locator(".xterm-accessibility-tree");
  // innerText preserves terminal row boundaries; textContent concatenates rows.
  const size = async marker => ptySize(await screen.innerText(), marker);
  try {
    await button(page, "Open terminal").click();
    await shows(terminal.getByRole("status"), "attached");
    await until("Initial terminal resize frame", () => state.sizes.length > 0);
    const initial = state.sizes.at(-1);
    await typePty(page, "printf '\\nWB_%s\\n' 'PTY_READY'; printf 'WB_SIZE_A:'; stty size");
    await shows(screen, "WB_PTY_READY");
    const before = await until("Initial remote PTY dimensions", () => size("WB_SIZE_A"));
    check(before.cols === initial.cols && before.rows === initial.rows, "Initial remote PTY size differs from xterm");
    await page.setViewportSize({ width: 900, height: 800 });
    await until("Changed terminal resize frame", () => state.sizes.at(-1).cols < initial.cols);
    const resized = state.sizes.at(-1);
    await typePty(page, "sleep 0.2; printf '\\nWB_SIZE_B:'; stty size");
    const after = await until("Resized remote PTY dimensions", () => size("WB_SIZE_B"));
    check(after.cols === resized.cols && after.rows === resized.rows && after.cols < before.cols, "Resize did not reach the real PTY");
    check(state.inputBytes > 0 && state.outputBytes > 0, "Terminal did not exchange binary input/output frames");
    await button(page, "Disconnect").click();
    await shows(terminal.getByRole("status"), "disconnected");
    await until("Disconnected terminal socket", () => state.closed === 1);
    check(state.sockets === 1, "Terminal connected more than once before explicit reconnect");
    await button(page, "Reconnect").click();
    await until("Explicit reconnect opens a new socket", () => state.sockets === 2);
    await shows(terminal.getByRole("status"), "attached");
    await typePty(page, "printf '\\nWB_%s\\n' 'RECONNECTED'");
    await shows(screen, "WB_RECONNECTED");
    check(state.sockets === 2, "Reconnect did not open one new terminal socket");
    await button(page, "Overview").click();
    await until("Pane change closes terminal socket", () => state.closed === 2);
    return { inputOutput: true, remoteResize: true, initialColumns: before.cols, resizedColumns: after.cols, disconnected: true, reconnected: true, paneClosed: true };
  } finally {
    witness.stop();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}

export async function verifyFiles(page, id) {
  const fixture = binaryFixture();
  await button(page, "Filesystem").click();
  await until("Upload control ready", () => button(page, "Upload").isEnabled());
  check(await page.getByLabel("Directory path").inputValue() === "/workspace", "File fixture is outside the template workdir");
  await page.getByLabel("Upload file", { exact: true }).setInputFiles({ name: fixture.name, mimeType: "application/octet-stream", buffer: fixture.bytes });
  const dialog = page.getByRole("dialog");
  await shows(dialog, fixture.path);
  const uploaded = responseFor(page, id, "files/upload", "POST");
  await button(dialog, "Upload file").click();
  const result = await json(await uploaded);
  check(result.sizeBytes === fixture.bytes.length && result.sha256 === `sha256:${fixture.sha256}`, "UI upload metadata mismatch");
  await page.getByText(`Uploaded ${fixture.name}.`, { exact: true }).waitFor();
  await page.getByRole("button", { name: new RegExp(fixture.name.replace(".", "\\.")) }).click();
  const downloaded = responseFor(page, id, "files/download");
  const event = page.waitForEvent("download");
  await button(page, "Download").click();
  await json(await downloaded);
  const download = await event;
  try {
    check(download.suggestedFilename() === fixture.name, "UI download filename mismatch");
    check(await download.failure() === null, "Browser download failed");
    verifyBytes(await fs.readFile(await download.path()), fixture);
  } finally { await download.delete(); }
  return { verifiedBytes: true, sizeBytes: fixture.bytes.length, fileSha256: fixture.sha256 };
}

export async function verifyLogs(page, id) {
  const response = responseFor(page, id, "logs");
  await button(page, "Logs").click();
  const { logs } = await json(await response);
  for (const event of ["terminal.attach.started", "terminal.attach.ended"]) {
    check(logs.some(log => log.source === "control-plane" && log.lvl === event && Number.isFinite(Date.parse(log.ts))), "Actual terminal lifecycle log missing");
  }
  const region = page.getByRole("region", { name: "Sandbox logs" });
  await shows(region, "terminal attached");
  await page.getByLabel("Log source", { exact: true }).selectOption("control-plane");
  await page.getByRole("searchbox", { name: "Search logs" }).fill("terminal attached");
  await shows(region, "terminal attached");
  check(!await contains(region, "terminal detached"), "Log filter did not exclude other real events");
  const followed = responseFor(page, id, "logs");
  await page.getByRole("checkbox", { name: "Follow", exact: true }).check();
  await json(await followed);
  await page.getByRole("checkbox", { name: "Follow", exact: true }).uncheck();
  return { realControlPlaneLogs: true, filtered: true, followed: true };
}

export async function verifyMetrics(page, id) {
  const response = responseFor(page, id, "metrics");
  await button(page, "Metrics").click();
  const first = await json(await response);
  const observed = assertMetrics(first);
  const observation = label => page.locator(".workbench-observations > div").filter({ hasText: label }).locator("dd");
  await shows(observation("CPU used"), `${first.current.cpu} %`);
  await shows(observation("Memory used"), `${first.current.mem} MiB`);
  for (const [key, label] of [["diskIo", "Disk I/O"], ["networkOut", "Network out"]]) {
    check(!first.availableFields.includes(key), "Native provider unexpectedly advertises unsupported metrics");
    await shows(observation(label), "Unavailable");
  }
  await until("Advancing runtime metrics observation", async () => {
    const next = responseFor(page, id, "metrics");
    await button(page, "Refresh metrics").click();
    return assertMetrics(await json(await next)) > observed;
  }, 60000);
  return { liveMetrics: true, missingFieldsUnavailable: true, cpu: first.current.cpu, mem: first.current.mem };
}

export async function verifyCommands(page, id) {
  const fixture = binaryFixture();
  const command = `printf 'WB_%s\\n' 'COMMAND_OK'; sha256sum ${fixture.path}`;
  let posts = 0;
  const observe = request => { if (request.url() === apiUrl(id, "commands") && request.method() === "POST") posts++; };
  page.on("request", observe);
  try {
    await button(page, "Commands").click();
    await page.getByRole("textbox", { name: "Command", exact: true }).fill(command);
    const created = responseFor(page, id, "commands", "POST");
    await button(page, "Run").click();
    const result = await created;
    check([200, 201, 202].includes(result.status()), "Tracked command was rejected");
    const commandId = (await result.json()).command.id;
    check(/^cmd_[a-zA-Z0-9_-]+$/.test(commandId), "Tracked command identity missing");
    const output = page.getByLabel("Command output", { exact: true });
    await shows(output, "WB_COMMAND_OK");
    await shows(output, `${fixture.sha256}  ${fixture.path}`);
    await shows(page.locator(".command-list-item.selected"), "succeeded");
    await shows(page.locator(".command-list-item.selected"), "exit 0");
    await button(page, "Overview").click();
    const link = page.getByRole("region", { name: "Sandbox overview" }).getByRole("link").filter({ hasText: command });
    await shows(link, "succeeded / exit 0");
    await link.click();
    const expected = `${workbenchUrl(id, "commands")}&command=${commandId}`;
    await until("Canonical command deep link", () => page.url() === expected);
    await shows(output, fixture.sha256);
    await page.reload({ waitUntil: "domcontentloaded" });
    await shows(output, "WB_COMMAND_OK");
    await shows(output, `${fixture.sha256}  ${fixture.path}`);
    await shows(page.locator(".command-list-item.selected"), "succeeded");
    check(page.url() === expected && posts === 1, "Command reload changed identity or duplicated execution");
    return { output: true, remoteChecksum: true, deeplinkReload: true, singleSubmission: true };
  } finally { page.off("request", observe); }
}

export async function verifyDeniedAttach(page, id, key) {
  await probeKey(id, key); // Establish that this is a real, active key with read access.
  await button(page, "Overview").click();
  let requests = 0;
  const witness = watchTerminal(page, id);
  const endpoint = apiUrl(id, "terminal/attach-ticket");
  const inject = async route => {
    requests++;
    // Only substitute the credential. The installed API supplies the response.
    await route.continue({ headers: scopedAttachHeaders(route.request(), id, key) });
  };
  await page.route(endpoint, inject);
  try {
    const denied = responseFor(page, id, "terminal/attach-ticket", "POST");
    await button(page, "Open terminal").click();
    const body = await json(await denied, 403);
    check(body.error === "forbidden", "Attach denial was not a scope rejection");
    const region = page.getByRole("region", { name: "Interactive terminal" });
    await region.getByRole("alert").waitFor();
    await shows(region.getByRole("status"), "error");
    check(await button(region, "Interrupt").isDisabled(), "Denied terminal allows input");
    await delay(1500);
    check(requests === 1 && witness.state.sockets === 0, "Denied attach opened a socket or retried automatically");
    await button(page, "Overview").click();
    return { actualScopedKey: true, noSocket: true, noRetry: true };
  } finally { await page.unroute(endpoint, inject); witness.stop(); }
}
