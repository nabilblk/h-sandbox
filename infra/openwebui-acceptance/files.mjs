import { setTimeout as delay } from "node:timers/promises";
import { check, until } from "../acceptance/context.mjs";
import { upload, downloadSelected } from "./browser.mjs";
import { runtime } from "./recovery.mjs";

const fileBrowser = page => page.getByRole("region", { name: "File browser", exact: true });
const isUpload = request => new URL(request.url()).pathname === "/api/v1/terminals/harakiri/files/upload";

export async function liveFiles(page, client, template) {
  const files = fileBrowser(page);
  await upload(page, { name: "live.txt", mimeType: "text/plain", buffer: Buffer.from("Original text\n") });
  await files.locator("[data-file-row]").getByText("live.txt", { exact: true }).click();
  check((await downloadSelected(page)).toString() === "Original text\n", "Native text upload differs");
  const edit = files.getByRole("button", { name: "Edit", exact: true });
  if (await edit.isVisible()) await edit.click();
  const editor = files.locator('textarea:visible:not(.xterm-helper-textarea), .cm-content[contenteditable="true"]:visible').first();
  await editor.fill("Changed in OpenWebUI\n");
  await files.getByRole("button", { name: "Save", exact: true }).click();
  const sandbox = await runtime(client, template);
  await until("Independent native edit verification", async () =>
    (await client.files.read(sandbox.id, "/workspace/demo/live.txt")).content === "Changed in OpenWebUI\n");
  await files.getByRole("button", { name: "Refresh", exact: true }).click();
  check((await downloadSelected(page)).toString() === "Changed in OpenWebUI\n", "Preview serves stale bytes after edit");
  return { textRoundTrip: true, nativeEdit: true, freshPreview: true };
}

export async function transferFailures(page) {
  const files = fileBrowser(page);
  const rejected = page.waitForResponse(response => isUpload(response.request()) && response.status() === 413);
  await upload(page, { name: "oversized.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(17 * 1024 * 1024) }, false);
  await rejected;
  await until("Oversize upload finishes visibly", () => files.getByText("Uploading...", { exact: true }).isVisible().then(value => !value));
  check(await files.getByText("oversized.bin", { exact: true }).count() === 0, "Rejected upload appeared as successful");

  // Real browser transport interruption, not a fulfilled/mock API response. The
  // pinned OpenWebUI buffers uploads; interrupt before the full body reaches it.
  const network = await page.context().newCDPSession(page);
  let attempts = 0;
  const count = request => { if (isUpload(request)) attempts++; };
  page.on("request", count);
  try {
    await network.send("Network.enable");
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 32768 });
    const started = page.waitForRequest(isUpload);
    const interrupted = page.waitForEvent("requestfailed", isUpload);
    await upload(page, { name: "interrupted.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(1024 * 1024) }, false);
    await started;
    await delay(200);
    await network.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await interrupted;
  } finally {
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await network.detach();
  }
  try {
    await files.getByRole("button", { name: "Refresh", exact: true }).click();
    await delay(10000);
    check(attempts === 1, "Interrupted native upload was replayed");
    check(await files.getByText("interrupted.bin", { exact: true }).count() === 0, "Incomplete upload appeared as successful");
  } finally { page.off("request", count); }
  return { oversizeRejected: true, interruptedUpload: true, noUploadReplay: true };
}

export async function svgIsolation(page) {
  const bytes = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" onload="document.documentElement.dataset.harakiriPreviewProbe='executed'">
<script>document.documentElement.dataset.harakiriPreviewProbe='executed'</script>
<text x="10" y="40">Synthetic SVG preview</text></svg>`;
  await upload(page, { name: "isolation.svg", mimeType: "image/svg+xml", buffer: Buffer.from(bytes) });
  const files = fileBrowser(page);
  await files.locator("[data-file-row]").getByText("isolation.svg", { exact: true }).click();
  await files.getByText("Synthetic SVG preview", { exact: true }).waitFor();
  check(await files.locator(".svg-preview script, .svg-preview [onload]").count() === 0, "SVG executable markup survived sanitization");
  check(!(await page.locator("html").getAttribute("data-harakiri-preview-probe")), "SVG executed with chat authority");
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await files.isVisible())) await page.getByRole("button", { name: "Controls", exact: true }).click();
  await files.getByText("Synthetic SVG preview", { exact: true }).waitFor();
  await page.screenshot({ path: "openwebui-preview-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { svgScriptBlocked: true, mobilePreview: true };
}
