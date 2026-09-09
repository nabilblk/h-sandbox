import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SandboxResourceFields } from "./routes/sandboxes.js";

test("creation displays template-owned resources and actual sandbox lifetime", () => {
  const html = renderToStaticMarkup(createElement(SandboxResourceFields, {
    ttlSeconds: 900, onTtlChange() {}, template: { cpuCount: 2, memoryMb: 2048 }
  }));
  assert.match(html, /Lifetime \(seconds\)/);
  assert.match(html, /2 vCPU \/ 2,048 MB/);
  assert.match(html, /readOnly/);
  assert.doesNotMatch(html, /<select|Idle TTL/);
  const source = readFileSync(new URL("./routes/sandboxes.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /142ms|Cold start/);
  const shell = readFileSync(new URL('./routes/dashboard-shell.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /4 seats|v0\.41\.2|all systems|>operational</);
});
