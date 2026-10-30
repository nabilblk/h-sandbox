import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { check, until } from "../acceptance/context.mjs";
import { upload, downloadSelected, refreshFiles } from "./browser.mjs";
import { runtime } from "./recovery.mjs";

const fileBrowser = page => page.getByRole("region", { name: "File browser", exact: true });
const isUpload = request => new URL(request.url()).pathname === "/api/v1/terminals/harakiri/files/upload";

export async function relativeAssetBoundary(page) {
  const html = `<!doctype html><h1>Relative asset boundary</h1><pre id="result">pending</pre>
<img src="chart.png" onload="document.querySelector('#result').textContent='loaded'" onerror="document.querySelector('#result').textContent='requires session'">`;
  await upload(page, { name: "relative-asset.html", mimeType: "text/html", buffer: Buffer.from(html) });
  let denied = false, blocked = false, allowed = false;
  const matches = request => new URL(request.url()).pathname.endsWith("/files/serve/workspace/demo/chart.png");
  const onResponse = response => {
    if (!matches(response.request())) return;
    denied ||= [401, 403].includes(response.status());
    allowed ||= response.ok();
  };
  const onFailure = request => { if (matches(request)) blocked = true; };
  page.on("response", onResponse);
  page.on("requestfailed", onFailure);
  try {
    await fileBrowser(page).locator("[data-file-row]").getByText("relative-asset.html", { exact: true }).click();
    const frame = page.frameLocator('iframe[title="HTML Preview"]');
    await until("Relative asset has a finite rejected outcome", async () => (await frame.locator("#result").innerText()) === "requires session");
    // Chromium may hide the unauthorized cross-origin image response with ORB.
    check((denied || blocked) && !allowed, "Opaque preview unexpectedly has session authority for relative assets");
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onFailure);
  }
  return { relativeAssetsRequireSession: true };
}

export async function liveFiles(page, client, template) {
  const files = fileBrowser(page);
  await upload(page, { name: "live.txt", mimeType: "text/plain", buffer: Buffer.from("Original text\n") });
  await files.locator("[data-file-row]").getByText("live.txt", { exact: true }).click();
  check((await downloadSelected(page)).toString() === "Original text\n", "Native text upload differs");
  console.log("OpenWebUI live file: wait for text preview, then edit");
  const edit = files.getByRole("button", { name: "Edit", exact: true });
  // Download and preview use different requests. A completed download does not
  // mean the asynchronously loaded text has mounted its Edit control yet.
  await edit.click();
  const editor = files.locator('textarea:visible:not(.xterm-helper-textarea), .cm-content[contenteditable="true"]:visible').first();
  await editor.fill("Changed in OpenWebUI\n");
  await files.getByRole("button", { name: "Save", exact: true }).click();
  await edit.waitFor();
  console.log("OpenWebUI live file: saved in UI, verifying stored bytes and fresh preview");
  const sandbox = await runtime(client, template);
  await until("Independent native edit verification", async () =>
    (await client.files.read(sandbox.id, "/workspace/demo/live.txt")).content === "Changed in OpenWebUI\n");
  await refreshFiles(page);
  await files.getByText("Changed in OpenWebUI", { exact: true }).waitFor();
  check((await downloadSelected(page)).toString() === "Changed in OpenWebUI\n", "Preview serves stale bytes after edit");
  return { textRoundTrip: true, nativeEdit: true, freshPreview: true };
}

export async function transferFailures(page) {
  const files = fileBrowser(page);
  console.log("OpenWebUI transfer: submit oversize native upload");
  await Promise.all([
    page.waitForResponse(response => isUpload(response.request()) && response.status() === 413),
    upload(page, { name: "oversized.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(17 * 1024 * 1024) }, false)
  ]);
  console.log("OpenWebUI transfer: oversize upload rejected with HTTP 413");
  await page.getByText("Upload failed: oversized.bin", { exact: true }).waitFor();
  await until("Oversize upload finishes visibly", () => files.getByText("Uploading...", { exact: true }).isVisible().then(value => !value));
  check(await files.getByText("oversized.bin", { exact: true }).count() === 0, "Rejected upload appeared as successful");

  // Inject a browser transport failure before dispatch, never a fake response.
  // Chromium's network throttling does not reliably slow loopback uploads.
  // Partial-body interruption is covered separately by the core socket tests.
  const network = await page.context().newCDPSession(page);
  const waiting = new AbortController();
  let attempts = 0;
  const count = request => { if (isUpload(request)) attempts++; };
  page.on("request", count);
  try {
    try {
      await network.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/terminals/harakiri/files/upload?*", requestStage: "Request" }] });
      await Promise.all([
        page.waitForEvent("requestfailed", isUpload),
        (async () => {
          const [[{ requestId }]] = await Promise.all([
            once(network, "Fetch.requestPaused", { signal: AbortSignal.any([waiting.signal, AbortSignal.timeout(45000)]) }),
            upload(page, { name: "interrupted.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(1024 * 1024) }, false)
          ]);
          console.log("OpenWebUI transfer: native upload paused before dispatch, injecting transport failure");
          await network.send("Fetch.failRequest", { requestId, errorReason: "ConnectionReset" });
        })()
      ]);
      await page.getByText("Upload failed: interrupted.bin", { exact: true }).waitFor();
      console.log("OpenWebUI transfer: browser reported transport failure");
    } finally {
      waiting.abort();
      try { await network.send("Fetch.disable"); }
      finally { await network.detach(); }
    }
    await refreshFiles(page);
    await delay(10000);
    check(attempts === 1, "Interrupted native upload was replayed");
    check(await files.getByText("interrupted.bin", { exact: true }).count() === 0, "Incomplete upload appeared as successful");
  } finally { page.off("request", count); }
  return { oversizeRejected: true, uploadTransportFailure: true, failureBeforeDispatch: true, noUploadReplay: true };
}

export async function svgIsolation(page) {
  console.log("OpenWebUI SVG: upload and verify desktop sanitization");
  const bytes = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" onload="document.documentElement.dataset.harakiriPreviewProbe='executed'">
<script>document.documentElement.dataset.harakiriPreviewProbe='executed'</script>
<text x="10" y="40">Synthetic SVG preview</text></svg>`;
  await upload(page, { name: "isolation.svg", mimeType: "image/svg+xml", buffer: Buffer.from(bytes) });
  console.log("OpenWebUI SVG: uploaded, selecting desktop preview");
  const files = fileBrowser(page);
  await files.locator("[data-file-row]").getByText("isolation.svg", { exact: true }).click();
  console.log("OpenWebUI SVG: selected, waiting for rendered text");
  await files.getByText("Synthetic SVG preview", { exact: true }).waitFor();
  check(await files.locator(".svg-preview script, .svg-preview [onload]").count() === 0, "SVG executable markup survived sanitization");
  check(!(await page.locator("html").getAttribute("data-harakiri-preview-probe")), "SVG executed with chat authority");
  await mobileSvgPreview(page);
  return { svgScriptBlocked: true, mobilePreview: true };
}

export async function mobileSvgPreview(page) {
  const drawer = page.locator('.modal[data-swipe-panel="right"]');
  const files = drawer.getByRole("region", { name: "File browser", exact: true });
  try {
    console.log("OpenWebUI SVG: wait for mobile drawer remount");
    await page.setViewportSize({ width: 390, height: 844 });
    // Resizing returns before Svelte replaces the desktop FileNav. Scope to the
    // native drawer so a still-visible desktop row cannot consume this click.
    await files.waitFor();
    console.log("OpenWebUI SVG: open file in mobile drawer");
    await files.locator("[data-file-row]").getByText("isolation.svg", { exact: true }).click();
    await files.getByText("Synthetic SVG preview", { exact: true }).waitFor();
    const preview = await files.locator(".svg-preview").boundingBox();
    check(preview && preview.x >= 0 && preview.y >= 0 && preview.x + preview.width <= 390 && preview.y + preview.height <= 844,
      "Native mobile preview falls outside the viewport");
    await page.screenshot({ path: "openwebui-preview-mobile.png" });
  } finally {
    console.log("OpenWebUI SVG: restore desktop viewport");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await drawer.waitFor({ state: "hidden" });
    await fileBrowser(page).waitFor();
  }
}
