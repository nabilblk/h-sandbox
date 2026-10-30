import fs from "node:fs";
import assert from "node:assert/strict";
import { check, until, sha256 } from "../acceptance/context.mjs";
import { webOrigin, adapterOrigin } from "./stack.mjs";
import { toolResult } from "./diagnostics.mjs";

export const prompt = fs.readFileSync(new URL("../../integrations/openwebui/report-prompt.txt", import.meta.url), "utf8").trim();

export async function signup(page, credentials, second = false) {
  console.log(`OpenWebUI browser: ${second ? "second user" : "administrator"} signup`);
  const acknowledge = page.getByRole("button", { name: "Okay, Let's Go!", exact: true });
  await page.goto(`${webOrigin}/auth`);
  const fullName = page.getByPlaceholder("Enter Your Full Name", { exact: true });
  if (second) await page.getByRole("button", { name: "Sign up", exact: true }).click();
  else await page.getByRole("button", { name: "Get started", exact: true }).click();
  console.log("OpenWebUI browser: signup form ready");
  await fullName.fill(second ? "Acceptance User" : "Acceptance Administrator");
  await page.getByPlaceholder("Enter Your Email", { exact: true }).fill(second ? "user@acceptance.example.test" : "admin@acceptance.example.test");
  await page.getByPlaceholder("Enter Your Password", { exact: true }).fill(credentials.password);
  const confirmation = page.getByPlaceholder("Confirm Your Password", { exact: true });
  if (await confirmation.isVisible()) await confirmation.fill(credentials.password);
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/auths/signup")),
    page.getByRole("button", { name: second ? "Create Account" : "Create Admin Account", exact: true }).click()
  ]);
  console.log(`OpenWebUI browser: signup response ${response.status()}`);
  check(response.ok(), "OpenWebUI signup rejected");
  const account = await response.json();
  check(typeof account.id === "string" && typeof account.token === "string", "OpenWebUI signup identity missing");
  await page.waitForURL(url => url.pathname !== "/auth");
  if (!second) {
    // A fresh admin always sees the release notes, after asynchronous app setup.
    // Finish that modal before opening Settings; two modal focus traps conflict.
    await acknowledge.click();
    await acknowledge.waitFor({ state: "hidden" });
    console.log("OpenWebUI browser: administrator welcome acknowledged");
  }
  return account;
}

export async function configureTerminal(page, credentials) {
  console.log("OpenWebUI browser: native administrator integration settings");
  await page.goto(`${webOrigin}/?settings=admin%3Aintegrations`);
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Terminal", exact: true }) });
  await section.getByRole("button", { name: "Add Connection", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Add Terminal Connection", exact: true }) });
  await dialog.waitFor();
  console.log("OpenWebUI browser: terminal connection dialog opened");
  await page.locator("#terminal-name").fill("Harakiri acceptance");
  await page.locator("#terminal-id").fill("harakiri");
  await page.locator("#terminal-url").fill(adapterOrigin);
  await page.getByPlaceholder("API Key", { exact: true }).fill(credentials.adapterKey);
  console.log("OpenWebUI browser: verify terminal connection");
  const [verification] = await Promise.all([
    page.waitForResponse(response => response.url().includes("/terminal_servers/verify")),
    page.getByRole("button", { name: "Verify Connection", exact: true }).click()
  ]);
  check(verification.ok() && (await verification.json()).type === "terminal", "Native terminal connection verification rejected");
  console.log("OpenWebUI browser: save verified terminal connection");
  await page.locator("#terminal-chat-uploads").selectOption("filesystem");
  const [persisted] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/configs/terminal_servers" && response.request().method() === "POST"),
    dialog.getByRole("button", { name: "Save", exact: true }).click()
  ]);
  check(persisted.ok(), "Native terminal connection was not saved");
  await page.locator("#terminal-url").waitFor({ state: "hidden" });
  const enabled = page.locator("#terminal-0-control");
  if (await enabled.getAttribute("aria-checked") === "false") {
    const [toggled] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/configs/terminal_servers" && response.request().method() === "POST"),
      enabled.click()
    ]);
    check(toggled.ok(), "Native terminal connection was not enabled");
  }
  console.log("OpenWebUI browser: terminal connection persisted and enabled");
  await page.goto(webOrigin);
}

export async function selectTerminal(page) {
  console.log("OpenWebUI browser: select connected terminal and wait for file browser");
  await page.locator("#message-input-container").getByRole("button", { name: "Terminal", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Harakiri acceptance", exact: true }).click();
  console.log("OpenWebUI browser: connected terminal selected");
  await page.getByRole("region", { name: "File browser", exact: true }).waitFor({ timeout: 300000 });
  await fileRefreshButton(page).waitFor();
  console.log("OpenWebUI browser: native file controls visible");
}

function fileRefreshButton(page) {
  // In pinned 0.12.4 only the file toolbar declares type=button; Ports has a second Refresh.
  return page.getByRole("region", { name: "File browser", exact: true }).locator('button[type="button"][aria-label="Refresh"]');
}

export function chatWitness(page) {
  const state = { submissions: 0, selectedTerminal: false, completed: false, modelError: false, modelEvents: 0, sockets: 0, toolCalls: 0, toolFailures: 0, browserErrors: 0, inputBytes: 0, outputBytes: 0, closed: 0, resizeFrames: 0 };
  const toolCalls = new Set();
  const toolFailures = new Set();
  let terminalOutput = "";
  // Expected HTTP/CSP denials are not uncaught JavaScript exceptions. Never log
  // exception messages because they can contain document contents or credentials.
  page.on("pageerror", () => state.browserErrors++);
  const onRequest = request => {
    if (new URL(request.url()).pathname !== "/api/chat/completions" || request.method() !== "POST") return;
    state.submissions++;
    const body = request.postDataJSON();
    state.selectedTerminal ||= body.terminal_id === "harakiri";
  };
  page.on("request", onRequest);
  page.on("websocket", socket => {
    const url = new URL(socket.url());
    if (url.hostname !== "127.0.0.1" || url.port !== "28580") return;
    if (url.pathname.includes("/api/v1/terminals/harakiri/api/terminals/")) {
      state.sockets++;
      socket.on("framesent", ({ payload }) => {
        if (Buffer.isBuffer(payload)) state.inputBytes += payload.length;
        else { try { if (JSON.parse(payload).type === "resize") state.resizeFrames++; } catch {} }
      });
      socket.on("framereceived", ({ payload }) => {
        state.outputBytes += Buffer.byteLength(payload);
        terminalOutput = (terminalOutput + payload.toString()).slice(-64000);
      });
      socket.on("close", () => state.closed++);
    } else if (url.pathname.startsWith("/ws/socket.io")) {
      socket.on("framereceived", ({ payload }) => {
        const text = payload.toString();
        if (!text.startsWith("42[")) return;
        try {
          const event = JSON.parse(text.slice(2))[1]?.data;
          if (!["chat:completion", "response:completion"].includes(event?.type)) return;
          state.modelEvents++;
          state.completed ||= event.data?.done === true;
          state.modelError ||= Boolean(event.data?.error);
          for (const item of [...(event.data?.output ?? []), ...(event.data?.item ? [event.data.item] : [])]) {
            if (item.type === "function_call_output" && typeof item.call_id === "string") {
              const result = toolResult(item);
              if (!toolCalls.has(item.call_id)) console.log(`OpenWebUI tool result: ${JSON.stringify(result)}`);
              toolCalls.add(item.call_id);
              if (result.failed || result.exitCodes.some(code => code !== 0)) toolFailures.add(item.call_id);
            }
          }
          state.toolCalls = toolCalls.size;
          state.toolFailures = toolFailures.size;
        } catch { /* Ignore non-event frames; never retain or export chat content. */ }
      });
    }
  });
  return { state, output: () => terminalOutput };
}

export async function runChat(page, witness) {
  console.log("OpenWebUI browser: submit one real local-model artifact request");
  await page.locator("#chat-input").fill(prompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until("Real chat submitted with terminal", () => witness.state.submissions === 1 && witness.state.selectedTerminal, 45000);
  let heartbeat = 0;
  await until("Real model response completed", () => {
    if (Date.now() - heartbeat > 30000) {
      console.log(`OpenWebUI model progress: ${JSON.stringify({ events: witness.state.modelEvents, toolCalls: witness.state.toolCalls, completed: witness.state.completed })}`);
      heartbeat = Date.now();
    }
    check(!witness.state.modelError, "Native model response reported an error");
    return witness.state.completed;
  }, 900000);
  check(witness.state.toolCalls > 0, "No native tool event observed from real model");
  console.log(`OpenWebUI model completed: ${JSON.stringify({ toolCalls: witness.state.toolCalls, toolFailures: witness.state.toolFailures })}`);
  console.log("OpenWebUI browser: refresh generated artifacts");
  await refreshFiles(page);
  const files = page.getByRole("region", { name: "File browser", exact: true });
  // A native tool event or artifact link can already have navigated into demo.
  // Use its breadcrumb when present, otherwise enter it from the root listing.
  const breadcrumb = files.locator('button[type="button"]').getByText("demo", { exact: true });
  console.log("OpenWebUI browser: navigate to generated artifact directory");
  if (await breadcrumb.isVisible()) await breadcrumb.click();
  else await files.locator("[data-file-row]").getByText("demo", { exact: true }).click();
  for (const name of ["sales.csv", "report.json", "chart.png", "report.pdf", "index.html"]) {
    console.log(`OpenWebUI browser: verify generated ${name}`);
    await files.locator("[data-file-row]").getByText(name, { exact: true }).waitFor();
  }
  return { singleSubmission: true, realModel: true, nativeTools: true, generatedFilesVisible: true };
}

export async function shell(page, witness) {
  console.log("OpenWebUI browser: shell input, ANSI, resize, interrupt, reconnect");
  const dock = page.locator(".terminal-dock");
  const expand = dock.getByRole("button", { name: "Expand terminal", exact: true });
  if (await expand.isVisible()) await expand.click();
  const open = dock.getByRole("button", { name: "Open terminal", exact: true });
  if (await open.isVisible()) await open.click();
  else await dock.getByRole("tab", { name: "Shell", exact: true }).click();
  const input = dock.locator('.xterm-helper-textarea:visible');
  await input.waitFor();
  await until("Native shell connected", () => witness.state.sockets > 0 && witness.state.resizeFrames > 0, 45000);
  const send = async command => { await input.focus(); await page.keyboard.insertText(command); await page.keyboard.press("Enter"); };
  await send("printf '\\033[32mNATIVE_SHELL_OK\\033[0m\\n'; printf 'SIZE_A:'; stty size");
  await until("Native shell output", () => /\u001b\[32mNATIVE_SHELL_OK/.test(witness.output()) && /SIZE_A:\d+ \d+/.test(witness.output()));
  const resizeFrames = witness.state.resizeFrames;
  const handle = await page.getByRole("region", { name: "File browser", exact: true }).locator(".cursor-row-resize").boundingBox();
  check(handle, "Native terminal resize handle missing");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 100, { steps: 8 });
  await page.mouse.up();
  await until("Native resize frame sent", () => witness.state.resizeFrames > resizeFrames, 10000);
  await send("printf 'SIZE_B:'; stty size");
  await until("Native remote terminal resize", () => {
    const a = witness.output().match(/SIZE_A:(\d+) (\d+)/), b = witness.output().match(/SIZE_B:(\d+) (\d+)/);
    return a && b && (a[1] !== b[1] || a[2] !== b[2]);
  });
  await send("printf 'WAIT_%s\\n' STARTED; sleep 60");
  await until("Native foreground command started", () => /WAIT_STARTED/.test(witness.output()), 10000);
  await page.keyboard.press("Control+C");
  await send("printf 'INTERRUPT_%s\\n' OK");
  await until("Native shell interrupt", () => /INTERRUPT_OK/.test(witness.output()), 10000);
  const sockets = witness.state.sockets;
  const resized = witness.state.resizeFrames;
  const closed = witness.state.closed;
  await dock.getByRole("button", { name: "Close terminal", exact: true }).click();
  await until("Native socket closed", () => witness.state.closed > closed);
  if (await expand.isVisible()) await expand.click();
  if (await open.isVisible()) await open.click();
  await until("Native shell reconnected", () => witness.state.sockets > sockets && witness.state.resizeFrames > resized);
  await send("printf 'RECONNECT_%s\\n' OK");
  await until("Native reconnect output", () => /RECONNECT_OK/.test(witness.output()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { shellInput: true, ansiOutput: true, remoteResize: true, interrupt: true, reconnect: true };
}

export async function downloadSelected(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("region", { name: "File browser", exact: true }).getByRole("button", { name: "Download", exact: true }).click()
  ]);
  check(!(await download.failure()), "Native file download failed");
  return fs.readFileSync(await download.path());
}

export async function refreshFiles(page) {
  const [response] = await Promise.all([
    page.waitForResponse(response => /^\/api\/v1\/terminals\/harakiri\/files\/(list|read|view)$/.test(new URL(response.url()).pathname), { timeout: 300000 }),
    fileRefreshButton(page).click()
  ]);
  check(response.ok() && !(await response.finished()), "Native file refresh failed");
}

export async function previews(page) {
  console.log("OpenWebUI browser: JSON, chart, PDF and HTML previews");
  const files = page.getByRole("region", { name: "File browser", exact: true });
  const choose = async name => {
    await files.getByRole("button", { name: "demo", exact: true }).click();
    await files.locator("[data-file-row]").getByText(name, { exact: true }).click();
  };
  await files.locator("[data-file-row]").getByText("report.json", { exact: true }).click();
  await until("Native JSON preview rendered", async () => {
    const text = await files.innerText();
    return text.includes("North") && text.includes("South") && text.includes("24");
  });
  const report = await downloadSelected(page);
  assert.deepEqual(JSON.parse(report), { North: 17, South: 7, total: 24 }, "Model report totals differ");
  console.log("OpenWebUI preview: JSON totals verified, opening PNG");
  await choose("chart.png");
  const png = await downloadSelected(page);
  check(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Downloaded chart is not PNG");
  await until("Native image preview decoded", () => files.locator("img").evaluateAll(images => images.some(image => image.naturalWidth > 100 && image.naturalHeight > 100)));
  console.log("OpenWebUI preview: PNG decoded, opening PDF");
  await choose("report.pdf");
  await until("Native PDF preview rendered", () => files.locator(".pdf-page-wrapper canvas").evaluateAll(canvases => canvases.some(canvas => {
    if (canvas.width < 100 || canvas.height < 100) return false;
    const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return false;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] > 0 && Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 240) return true;
    }
    return false;
  })));
  const pdf = await downloadSelected(page);
  check(pdf.subarray(0, 5).toString() === "%PDF-", "Downloaded report is not PDF");
  console.log("OpenWebUI preview: PDF rendered, opening HTML");
  await choose("index.html");
  const frame = page.frameLocator('iframe[title="HTML Preview"]');
  await frame.getByRole("heading", { name: "Sales report", exact: false }).waitFor();
  check((await frame.locator("body").innerText()).includes("24"), "HTML preview does not show actual total");
  console.log("OpenWebUI preview: HTML totals verified, checking embedded chart");
  await until("Embedded chart in HTML preview", () => frame.locator("img").evaluateAll(images => images.some(image => image.naturalWidth > 100)));
  const embedded = await frame.locator('img[src^="data:image/png;base64,"]').first().getAttribute("src");
  check(sha256(Buffer.from(embedded.split(",", 2)[1], "base64")) === sha256(png), "Embedded chart differs from downloaded PNG");
  check(!(await page.locator('iframe[title="HTML Preview"]').getAttribute("sandbox")).includes("allow-same-origin"), "Preview allows chat origin authority");
  try {
    await until("HTML report fits its preview pane", () => frame.locator("html").evaluate(root => root.scrollWidth <= window.innerWidth), 5000);
  } finally {
    // Numeric layout evidence only. A failed generated document must remain
    // inspectable without exporting HTML, tool output or browser credentials.
    console.log(`OpenWebUI preview layout: ${JSON.stringify(await frame.locator("html").evaluate(previewLayout))}`);
    await page.screenshot({ path: "openwebui-report-desktop.png" });
  }
  return { jsonPreview: true, imagePreview: true, pdfPreview: true, htmlPreview: true, embeddedAssets: true, downloadSha256: sha256(report) };
}

export function previewLayout(root) {
  const view = root.ownerDocument.defaultView;
  const body = root.ownerDocument.body;
  const chart = root.querySelector("img");
  return {
    viewportWidth: Math.round(view.innerWidth), documentWidth: Math.round(root.scrollWidth),
    bodyWidth: Math.round(body.getBoundingClientRect().width),
    chartWidth: chart ? Math.round(chart.getBoundingClientRect().width) : null,
    chartMaxWidth100Percent: chart ? view.getComputedStyle(chart).maxWidth === "100%" : false,
    standardsMode: root.ownerDocument.compatMode === "CSS1Compat"
  };
}

export async function browserDiagnostics(page) {
  if (!page || page.isClosed()) return;
  const controls = {};
  for (const name of ["Get started", "Create Admin Account", "Okay, Let's Go!", "Add Connection", "Verify Connection", "Terminal", "Send message", "Stop", "Refresh"]) {
    controls[name] = await page.getByRole("button", { name, exact: true }).first().isVisible().catch(() => false);
  }
  for (const id of ["terminal-name", "terminal-id", "terminal-url"]) {
    controls[id] = await page.locator(`#${id}`).isVisible().catch(() => false);
  }
  const files = page.getByRole("region", { name: "File browser", exact: true });
  controls.demoBreadcrumb = await files.locator('button[type="button"]').getByText("demo", { exact: true }).isVisible().catch(() => false);
  for (const name of ["demo", "sales.csv", "report.json", "chart.png", "report.pdf", "index.html"]) {
    controls[name] = await files.locator("[data-file-row]").getByText(name, { exact: true }).isVisible().catch(() => false);
  }
  // Fixed boolean inventory only: no DOM, URL, input values, cookies or user content.
  console.log(`OpenWebUI browser state: ${JSON.stringify(controls)}`);
  const images = await files.locator("img").evaluateAll(items => items.slice(0, 10).map(image => ({
    complete: image.complete, decoded: image.naturalWidth > 0, blob: image.src.startsWith("blob:")
  }))).catch(() => []);
  const preview = page.frameLocator('iframe[title="HTML Preview"]');
  const embedded = await page.locator('iframe[title="HTML Preview"]').count() ? await preview.locator("img").evaluateAll(items => items.slice(0, 10).map(image => ({
    complete: image.complete, decoded: image.naturalWidth > 0, data: image.src.startsWith("data:image/png;base64,")
  }))).catch(() => []) : [];
  console.log(`OpenWebUI image state: ${JSON.stringify({ images, embedded })}`);
}

export async function upload(page, file, waitForFile = true) {
  const files = page.getByRole("region", { name: "File browser", exact: true });
  await files.getByRole("button", { name: "demo", exact: true }).click();
  await files.getByRole("button", { name: "Actions", exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload", exact: true }).click()
  ]);
  await chooser.setFiles(file);
  if (waitForFile) await files.locator("[data-file-row]").getByText(file.name, { exact: true }).waitFor();
}

export async function transfersAndIsolation(page) {
  console.log("OpenWebUI browser: binary transfer and hostile HTML isolation");
  const bytes = Buffer.from(Array.from({ length: 1024 * 1024 }, (_, index) => index % 256));
  await upload(page, { name: "native-transfer.bin", mimeType: "application/octet-stream", buffer: bytes });
  const files = page.getByRole("region", { name: "File browser", exact: true });
  await files.locator("[data-file-row]").getByText("native-transfer.bin", { exact: true }).click();
  check(sha256(await downloadSelected(page)) === sha256(bytes), "Native binary round trip differs");
  // Only synthetic content; no token is read or sent by this probe.
  const hostile = `<!doctype html><h1>Preview isolation probe</h1><pre id="result"></pre><script>
let parentBlocked=false,storageBlocked=false;
try { void parent.document.body; } catch { parentBlocked=true; }
try { void localStorage.length; } catch { storageBlocked=true; }
document.querySelector('#result').textContent=JSON.stringify({parentBlocked,storageBlocked});
</script>`;
  await upload(page, { name: "isolation.html", mimeType: "text/html", buffer: Buffer.from(hostile) });
  await files.locator("[data-file-row]").getByText("isolation.html", { exact: true }).click();
  const result = await page.frameLocator('iframe[title="HTML Preview"]').locator("#result").innerText();
  check(JSON.parse(result).parentBlocked && JSON.parse(result).storageBlocked, "Hostile preview shares application authority");
  return { binaryRoundTrip: true, bytes: bytes.length, fileSha256: sha256(bytes), hostileParentBlocked: true, hostileStorageBlocked: true };
}
