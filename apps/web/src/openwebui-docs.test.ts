import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { openwebuiDocs, openwebuiReportPrompt } from "./openwebui-docs.js";
import { documentationAssets } from "./docs-export.js";
import { docGroups } from "./docs-navigation.js";

test("OpenWebUI candidate is discoverable without claiming released browser qualification", () => {
  assert.ok(docGroups.some((group) => group.title === "Integrations" && group.pages.some((id) => id === "openwebui")));
  const html = renderToStaticMarkup(openwebuiDocs.body);
  for (const text of [
    "Source candidate",
    "not yet natively qualified",
    "No new per-user Harakiri ACLs",
    "PostgreSQL",
    "never automatically replayed",
    "rc.13",
    "0.14.6",
    "0.12.4",
    "qwen3:4b-instruct"
  ])
    assert.ok(html.includes(text), `Missing boundary: ${text}`);
  const markdown = documentationAssets().get("docs/openwebui.md");
  assert.ok(markdown?.includes("```bash"));
  assert.ok(markdown?.includes("report.json"));
  assert.ok(markdown?.includes("/docs/routes.md"));
});

test("public and operator tutorials use the exact native qualification prompt", () => {
  const source = readFileSync(new URL("../../../integrations/openwebui/report-prompt.txt", import.meta.url), "utf8").trim();
  assert.equal(openwebuiReportPrompt, source);
  const guide = readFileSync(new URL("../../../integrations/openwebui/README.md", import.meta.url), "utf8");
  assert.ok(guide.includes(`\x60\x60\x60text\n${source}\n\x60\x60\x60`));
});
