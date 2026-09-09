import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SandboxSummary, UsageSummary } from "@harakiri/shared";
import { UsageContent, UsageRoute } from "./routes/usage.js";
import { SandboxCommandsPane } from "./routes/sandbox-commands.js";

test("usage loading state never displays fabricated counts or a sparkline", () => {
  const html = renderToStaticMarkup(createElement(UsageRoute));
  assert.match(html, /Loading usage/);
  assert.match(html, /History unavailable/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /viewBox="0 0 880 200"|last 14 days|18\.4%|9\.1%/);
});

test("usage ignores synthetic historical fields even from an older server", () => {
  const usage: UsageSummary = {
    sandboxesSpawned: 5, concurrentNow: 3, computeHours: 12345,
    avgColdStartMs: 54321, avgRuntimeSeconds: 98765, concurrentPeak: 99999,
    series: [1, 2, 3], topTemplates: [{ label: "node", value: 5 }],
    statusBreakdown: [{ label: "running", value: 3 }, { label: "idle", value: 2 }]
  };
  const html = renderToStaticMarkup(createElement(UsageContent, { usage }));
  assert.match(html, /<dd>3<\/dd>/);
  assert.match(html, /<dd>2<\/dd>/);
  assert.match(html, /not enforced/);
  assert.doesNotMatch(html, /12345|54321|98765|99999|<svg/);
});

test("commands start in the runtime workdir, including templates without a workspace directory", () => {
  for (const workdir of ["/", "/app", "/workspace"]) {
    const sandbox = { id: "sbx_workdir", status: "running", runtimeMetadata: { workdir } } as SandboxSummary;
    const html = renderToStaticMarkup(createElement(SandboxCommandsPane, { sandbox }));
    assert.ok(html.includes(`value="${workdir}"`));
  }
  const html = renderToStaticMarkup(createElement(SandboxCommandsPane, { sandbox: { id: "sbx_old", status: "running" } as SandboxSummary }));
  assert.match(html, /value="\/"/);
});
