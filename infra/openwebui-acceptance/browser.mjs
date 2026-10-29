import fs from "node:fs";
import assert from "node:assert/strict";
import { check, until, sha256 } from "../acceptance/context.mjs";
import { webOrigin, adapterOrigin } from "./stack.mjs";

export const prompt = `Use the connected terminal, not a code block in your reply. Create /workspace/demo/sales.csv with header region,sales and rows North,12; South,7; North,5. Use Python csv and matplotlib to group sales by region. Write /workspace/demo/report.json with exactly {"North":17,"South":7,"total":24}, a bar chart /workspace/demo/chart.png and /workspace/demo/report.pdf, and /workspace/demo/index.html containing a heading Sales report, the total 24 and the chart using a relative image URL. Run your code and verify the files. Do not install or download anything. Finish with the computed totals and links to the files.`;

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
  const accepted = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/auths/signup"));
  await page.getByRole("button", { name: second ? "Create Account" : "Create Admin Account", exact: true }).click();
  const response = await accepted;
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
  const verified = page.waitForResponse(response => response.url().includes("/terminal_servers/verify"));
  await page.getByRole("button", { name: "Verify Connection", exact: true }).click();
  const verification = await verified;
  check(verification.ok() && (await verification.json()).type === "terminal", "Native terminal connection verification rejected");
  console.log("OpenWebUI browser: save verified terminal connection");
  await page.locator("#terminal-chat-uploads").selectOption("filesystem");
  const persisted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/configs/terminal_servers" && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  check((await persisted).ok(), "Native terminal connection was not saved");
  await page.locator("#terminal-url").waitFor({ state: "hidden" });
  const enabled = page.locator("#terminal-0-control");
  if (await enabled.getAttribute("aria-checked") === "false") {
    const toggled = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/configs/terminal_servers" && response.request().method() === "POST");
    await enabled.click();
    check((await toggled).ok(), "Native terminal connection was not enabled");
  }
  console.log("OpenWebUI browser: terminal connection persisted and enabled");
  await page.goto(webOrigin);
}

export async function selectTerminal(page) {
  console.log("OpenWebUI browser: select connected terminal and wait for file browser");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Harakiri acceptance", exact: true }).click();
  await page.getByRole("region", { name: "File browser", exact: true }).waitFor({ timeout: 300000 });
  await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
}

export function chatWitness(page) {
  const state = { submissions: 0, selectedTerminal: false, completed: false, modelError: false, sockets: 0, toolCalls: 0, inputBytes: 0, outputBytes: 0, closed: 0, resizeFrames: 0 };
  let terminalOutput = "";
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
          state.completed ||= event.data?.done === true;
          state.modelError ||= Boolean(event.data?.error);
          if (event.data?.output?.some(item => item.type === "function_call_output")) state.toolCalls++;
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
  await until("Real model response completed", () => {
    check(!witness.state.modelError, "Native model response reported an error");
    return witness.state.completed;
  }, 600000);
  check(witness.state.toolCalls > 0, "No native tool event observed from real model");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.locator("[data-file-row]").filter({ has: page.getByText("demo", { exact: true }) }).getByText("demo", { exact: true }).click();
  for (const name of ["sales.csv", "report.json", "chart.png", "report.pdf", "index.html"]) {
    await page.locator("[data-file-row]").getByText(name, { exact: true }).waitFor();
  }
  return { singleSubmission: true, realModel: true, nativeTools: true, generatedFilesVisible: true };
}

export async function shell(page, witness) {
  console.log("OpenWebUI browser: shell input, ANSI, resize, interrupt, reconnect");
  const open = page.getByRole("button", { name: "Open terminal", exact: true });
  if (await open.isVisible()) await open.click();
  else await page.getByRole("button", { name: "Shell", exact: true }).click();
  const input = page.locator(".xterm-helper-textarea");
  await input.waitFor();
  const send = async command => { await input.focus(); await page.keyboard.insertText(command); await page.keyboard.press("Enter"); };
  await send("printf '\\033[32mNATIVE_SHELL_OK\\033[0m\\n'; printf 'SIZE_A:'; stty size");
  await until("Native shell output", () => /\u001b\[32mNATIVE_SHELL_OK/.test(witness.output()) && /SIZE_A:\d+ \d+/.test(witness.output()));
  await page.setViewportSize({ width: 1120, height: 820 });
  await send("printf 'SIZE_B:'; stty size");
  await until("Native remote terminal resize", () => {
    const a = witness.output().match(/SIZE_A:(\d+) (\d+)/), b = witness.output().match(/SIZE_B:(\d+) (\d+)/);
    return a && b && (a[1] !== b[1] || a[2] !== b[2]);
  });
  await send("sleep 60");
  await page.keyboard.press("Control+C");
  await send("printf 'INTERRUPT_%s\\n' OK");
  await until("Native shell interrupt", () => /INTERRUPT_OK/.test(witness.output()));
  const sockets = witness.state.sockets;
  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await until("Native socket closed", () => witness.state.closed > 0);
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await until("Native shell reconnected", () => witness.state.sockets > sockets);
  await send("printf 'RECONNECT_%s\\n' OK");
  await until("Native reconnect output", () => /RECONNECT_OK/.test(witness.output()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { shellInput: true, ansiOutput: true, remoteResize: true, interrupt: true, reconnect: true };
}

export async function downloadSelected(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("region", { name: "File browser", exact: true }).getByRole("button", { name: "Download", exact: true }).click();
  const download = await event;
  check(!(await download.failure()), "Native file download failed");
  return fs.readFileSync(await download.path());
}

export async function refreshFiles(page) {
  const [response] = await Promise.all([
    page.waitForResponse(response => /^\/api\/v1\/terminals\/harakiri\/files\/(list|read|view)$/.test(new URL(response.url()).pathname), { timeout: 300000 }),
    page.getByRole("region", { name: "File browser", exact: true }).getByRole("button", { name: "Refresh", exact: true }).click()
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
  const report = await downloadSelected(page);
  assert.deepEqual(JSON.parse(report), { North: 17, South: 7, total: 24 }, "Model report totals differ");
  await choose("chart.png");
  await until("Native image preview decoded", () => files.locator("img").evaluateAll(images => images.some(image => image.naturalWidth > 100 && image.naturalHeight > 100)));
  const png = await downloadSelected(page);
  check(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Downloaded chart is not PNG");
  await choose("report.pdf");
  await files.locator("canvas").first().waitFor();
  const pdf = await downloadSelected(page);
  check(pdf.subarray(0, 5).toString() === "%PDF-", "Downloaded report is not PDF");
  await choose("index.html");
  const frame = page.frameLocator('iframe[title="HTML Preview"]');
  await frame.getByRole("heading", { name: "Sales report", exact: false }).waitFor();
  check((await frame.locator("body").innerText()).includes("24"), "HTML preview does not show actual total");
  await until("Relative chart in HTML preview", () => frame.locator("img").evaluateAll(images => images.some(image => image.naturalWidth > 100)));
  check(!(await page.locator('iframe[title="HTML Preview"]').getAttribute("sandbox")).includes("allow-same-origin"), "Preview allows chat origin authority");
  // Only the generated synthetic report/chat, never account or connection settings.
  await page.screenshot({ path: "openwebui-report-desktop.png" });
  return { jsonPreview: true, imagePreview: true, pdfPreview: true, htmlPreview: true, relativeAssets: true, downloadSha256: sha256(report) };
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
  // Fixed boolean inventory only: no DOM, URL, input values, cookies or user content.
  console.log(`OpenWebUI browser state: ${JSON.stringify(controls)}`);
}

export async function upload(page, file, waitForFile = true) {
  const files = page.getByRole("region", { name: "File browser", exact: true });
  await files.getByRole("button", { name: "demo", exact: true }).click();
  await files.getByRole("button", { name: "Actions", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await (await chooser).setFiles(file);
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
