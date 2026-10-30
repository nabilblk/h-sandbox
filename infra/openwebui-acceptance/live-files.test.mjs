import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { liveFiles } from "./files.mjs";

test("native edit waits for delayed preview and UI save completion before refresh", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-live-file-"));
  const downloadPath = path.join(directory, "download.txt");
  const calls = [];
  let editing = false, stored = "Original text\n", savedInUi = false;
  const edit = {
    isVisible: async () => false,
    async click() { calls.push("await-edit"); editing = true; },
    async waitFor() { assert.equal(stored, "Changed in OpenWebUI\n"); calls.push("await-save-ui"); savedInUi = true; }
  };
  const editor = { async fill(value) { assert.equal(editing, true, "Edit was skipped while preview was loading"); assert.equal(value, "Changed in OpenWebUI\n"); } };
  const buttons = {
    demo: { click: async () => {} }, Actions: { click: async () => {} },
    Download: { async click() { fs.writeFileSync(downloadPath, stored); } },
    Edit: edit,
    Save: { async click() { calls.push("save"); stored = "Changed in OpenWebUI\n"; } }
  };
  const files = {
    getByRole(role, { name }) { assert.equal(role, "button"); assert.ok(buttons[name], name); return buttons[name]; },
    getByText(text) {
      assert.equal(text, "Changed in OpenWebUI");
      return { async waitFor() { assert.equal(savedInUi, true); calls.push("fresh-preview"); } };
    },
    locator(selector) {
      if (selector === "[data-file-row]") return { getByText: () => ({ waitFor: async () => {}, click: async () => {} }) };
      if (selector.includes("textarea")) return { first: () => editor };
      assert.equal(selector, 'button[type="button"][aria-label="Refresh"]');
      return { async click() { assert.equal(savedInUi, true, "Refresh raced pending UI save"); calls.push("refresh"); } };
    }
  };
  const page = {
    getByRole(role, { name }) {
      if (role === "region") { assert.equal(name, "File browser"); return files; }
      assert.equal(name, "Upload"); return { click: async () => {} };
    },
    async waitForEvent(event) {
      if (event === "filechooser") return { setFiles: async () => {} };
      assert.equal(event, "download");
      return { failure: async () => null, path: async () => downloadPath };
    },
    waitForResponse: async () => ({ ok: () => true, finished: async () => null })
  };
  const client = {
    listSandboxes: async () => ({ sandboxes: [{ id: "owned", template: "fixture", status: "running" }] }),
    files: { read: async () => ({ content: stored }) }
  };
  try {
    assert.deepEqual(await liveFiles(page, client, "fixture"), { textRoundTrip: true, nativeEdit: true, freshPreview: true });
    assert.deepEqual(calls, ["await-edit", "save", "await-save-ui", "refresh", "fresh-preview"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
