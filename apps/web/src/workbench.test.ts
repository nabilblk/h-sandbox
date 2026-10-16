import assert from "node:assert/strict";
import test from "node:test";
import { boundedLogs, filterLogs, terminalInput, terminalOutput, workbenchLocation, workbenchRoute } from "./workbench.js";
import { routeFromHash, sandboxDetailIdFromRoute } from "./routing.js";
import { artifactChecksum, decodeArtifact, downloadName, encodeArtifact, previewText, uploadPath } from "./workbench-files.js";
import { renderToStaticMarkup } from "react-dom/server";
import { workbenchDocs } from "./workbench-docs.js";
import { docGroups } from "./docs-navigation.js";

test("workbench documentation is discoverable and explicit about candidate requirements and limits", () => {
  assert.ok(docGroups.some((group) => (group.pages as readonly string[]).includes(workbenchDocs.id)));
  const html = renderToStaticMarkup(workbenchDocs.body).replace(/<[^>]*>/g, "");
  for (const text of ["Requires 0.5.0-rc.13", "release candidate", "qualification and delivery status", "No database migration", "lazy-loaded xterm.js PTY", "older than the recent-command list", "finishReason", "deleted file", "256 KiB", "16 MiB", "3,000 lines", "doctor", "org:read", "sandboxes:read", "503 sandbox_metrics_unavailable", "availableFields", "observedAt", "not a durable replay stream", "independent developer acceptance"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Source preview|source-build|build the CLI from|harness is underway|no completed .*claimed here/i);
});

test("workbench links preserve tab and command without accepting arbitrary parameters", () => {
  const link = workbenchRoute("sbx_123", "commands", "cmd_123");
  assert.equal(routeFromHash(`#${link}`), link);
  assert.equal(sandboxDetailIdFromRoute(link), "sbx_123");
  assert.deepEqual(workbenchLocation(link), { tab: "commands", command: "cmd_123" });
  assert.deepEqual(workbenchLocation("dashboard/sandboxes/sbx_123"), { tab: null, command: undefined });
  for (const query of ["tab=unknown", "command=cmd", "tab=logs&command=cmd", "tab=commands&command=../cmd", "tab=logs&tab=files", "token=secret", "tab=logs?tab=files"]) {
    assert.equal(routeFromHash(`#dashboard/sandboxes/sbx_123?${query}`), "landing");
  }
});

test("terminal framing preserves bytes, ANSI, control keys and replay payloads", () => {
  const data = new TextEncoder().encode("\u001b[31mhello\u001b[0m\r\n\u0003");
  assert.deepEqual(terminalInput(data), new Uint8Array([0, ...data]));
  for (const prefix of [1, 2]) assert.deepEqual(terminalOutput(new Uint8Array([prefix, ...data])), data);
  assert.deepEqual(terminalOutput(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 1, ...data])), data);
  assert.equal(terminalOutput(new Uint8Array([3, 0])), null);
  assert.equal(terminalOutput(new Uint8Array([99])), null);
});

test("bounded log snapshots retain identical entries and filter source, event and text", () => {
  const row = { ts: "2026-10-15T12:00:00Z", lvl: "info", msg: "ready", source: "sandbox" };
  const logs = [row, row, { ...row, lvl: "terminal.attach.started", source: "control-plane" }];
  assert.deepEqual(boundedLogs(logs, 1000, 2), { logs: logs.slice(1), omitted: 1 });
  assert.deepEqual(boundedLogs(logs, 1), { logs: [], omitted: 3 });
  assert.equal(filterLogs(logs, "READY", "sandbox", "info").length, 2);
  assert.equal(filterLogs(logs, "attach", "control-plane", "terminal.attach.started").length, 1);
  assert.equal(filterLogs(logs, "ready", "sandbox", "error").length, 0);
});

test("binary artifacts round trip without string iteration into a per-byte JS array", async () => {
  const bytes = new Uint8Array(1024 * 1024);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
  const artifact = { path: "/workspace/test.bin", contentBase64: encodeArtifact(bytes), sizeBytes: bytes.length, sha256: await artifactChecksum(bytes), transfer: { mode: "json-base64" as const, encoding: "base64" as const, maxBytes: bytes.length } };
  assert.deepEqual(await decodeArtifact(artifact, bytes.length), bytes);
  await assert.rejects(decodeArtifact(artifact, bytes.length - 1), /exceeds/);
  await assert.rejects(decodeArtifact({ ...artifact, sizeBytes: -1 }, bytes.length), /exceeds/);
  await assert.rejects(decodeArtifact({ ...artifact, contentBase64: "YQ==" }, bytes.length), /length/);
  await assert.rejects(decodeArtifact({ ...artifact, sha256: "sha256:bad" }, bytes.length), /checksum/);
  await assert.rejects(decodeArtifact(artifact, bytes.length, AbortSignal.abort(new Error("cancelled"))), /cancelled/);
});

test("previews reject binary and invalid UTF-8 and leave hostile markup as text", () => {
  assert.equal(previewText(new Uint8Array([0, 1])), null);
  assert.equal(previewText(new Uint8Array([255])), null);
  assert.equal(previewText(new TextEncoder().encode("<script>alert(1)</script>")), "<script>alert(1)</script>");
  assert.equal(previewText(new Uint8Array()), "");
  assert.equal(uploadPath("/workspace/", "result.json"), "/workspace/result.json");
  for (const name of ["", ".", "..", "../a", "a/b", "a\\b", "a\n"]) assert.throws(() => uploadPath("/workspace", name));
  assert.equal(downloadName("/workspace/../../a\nb.txt"), "a_b.txt");
});
