import assert from "node:assert/strict";
import test from "node:test";
import { documentationAssets, renderDocMarkdown } from "./docs-export.js";
import { docPages } from "./docs-content.js";
import { quickstartCli, quickstartTypeScript } from "./getting-started-docs.js";

test("every navigable page has actual Markdown and an inventory entry", () => {
  const assets = documentationAssets();
  const index = JSON.parse(assets.get("docs/index.json")!);
  assert.equal(index.length, docPages.length);
  for (const page of docPages) {
    const markdown = assets.get(`docs/${page.id}.md`)!;
    assert.ok(markdown.startsWith(`# ${page.title}\n`));
    assert.doesNotMatch(markdown, /<html|<script|<svg|Copy Shell code/);
    assert.ok(assets.get("llms.txt")!.includes(`docs/${page.id}.md`));
  }
});

test("exports contain exact code from every language tab, not only the visible tab", () => {
  const markdown = renderDocMarkdown(docPages.find((page) => page.id === "quickstart")!);
  assert.ok(markdown.includes(quickstartCli));
  assert.ok(markdown.includes(quickstartTypeScript));
  assert.match(markdown, /```bash/);
  assert.match(markdown, /```typescript/);
});

test("public navigation and table structure survive Markdown conversion", () => {
  const assets = documentationAssets();
  const preview = assets.get("docs/developer-preview.md")!;
  assert.match(preview, /\| Profile \| Evidence and limits \|/);
  assert.match(preview, /\]\(\/docs\/quickstart.md\)/);
  assert.match(preview, /\[nabilblk@gmail\.com\]\(mailto:nabilblk@gmail\.com\)/);
  assert.doesNotMatch(preview, /\]\(#docs/);
  assert.match(assets.get("docs/index.md")!, /\]\(\.\.\/llms-full.txt\)/);
});
