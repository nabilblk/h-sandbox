import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { setupSandboxDetail } from "./sandbox-detail";

export const artifact = (path: string, bytes: Buffer) => ({ path, sizeBytes: bytes.length, contentBase64: bytes.toString("base64"), sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
export const exampleCommand = { id: "cmd_example", command: "python report.py", status: "succeeded", exitCode: 0, finishReason: "exit", detached: true, cwd: "/workspace", startedAt: "2026-10-15T12:00:00Z" };

export async function setupWorkbench(page: Page) {
  const detail = await setupSandboxDetail(page);
  const files = new Map([
    ["/workspace/report.json", Buffer.from('{"tests":4,"passed":4}\n')],
    ["/workspace/hostile.html", Buffer.from('<script>window.workbenchAttack = true</script><img src=x onerror="alert(1)">')],
    ["/workspace/result.bin", Buffer.from([0, 255, 128, 1, 2, 3])]
  ]);
  const state = { detail, files, uploads: [] as string[], uploadGate: Promise.resolve(), metricsStatus: 200, corruptDownload: false };
  await page.route("**/v1/sandboxes/*/files**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path") ?? "/workspace";
    const file = files.get(path);
    if (url.pathname.endsWith("/stat")) return route.fulfill({ status: file ? 200 : 404, json: file ? { file: { path, type: "file", size: file.length } } : { error: "file_not_found" } });
    if (url.pathname.endsWith("/download")) return route.fulfill({ status: file ? 200 : 404, json: file ? { ...artifact(path, file), ...(state.corruptDownload ? { sha256: "sha256:bad" } : {}) } : { error: "file_not_found" } });
    if (url.pathname.endsWith("/upload")) {
      const input = route.request().postDataJSON();
      state.uploads.push(input.path);
      await state.uploadGate;
      const bytes = Buffer.from(input.contentBase64, "base64");
      files.set(input.path, bytes);
      return route.fulfill({ json: artifact(input.path, bytes) });
    }
    return route.fulfill({ json: { cwd: path, files: [...files].filter(([name]) => name.slice(0, name.lastIndexOf("/")) === path).map(([name, bytes]) => ({ path: name, name: name.split("/").at(-1), size: bytes.length, type: "file", modifiedAt: "2026-10-15T12:00:00Z" })) } });
  });
  await page.route("**/v1/sandboxes/*/metrics", (route) => route.fulfill({ status: state.metricsStatus, json: state.metricsStatus === 200
    ? { current: { cpu: 12, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 2, memTotal: 2048 }, series: [], availableFields: ["cpu", "mem", "cpuCount", "memTotal"], observedAt: "2026-10-15T12:00:00Z" }
    : { error: "sandbox_metrics_unavailable", message: "Current runtime metrics unavailable." } }));
  await page.route("**/v1/sandboxes/*/commands**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: [
      { type: "output", commandId: exampleCommand.id, cursor: "v1:cmd_example:p:1", stdout: "4 tests passed\n", stderr: "" },
      { type: "complete", commandId: exampleCommand.id, cursor: "v1:cmd_example:p:2", status: "succeeded", exitCode: 0 }
    ].map((event) => `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("") });
    return route.fulfill({ json: pathname.endsWith("/commands") ? { commands: [exampleCommand] } : { command: exampleCommand } });
  });
  return state;
}
