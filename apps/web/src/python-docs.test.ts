import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content";
import { documentationAssets } from "./docs-export";
import { searchDocPages } from "./docs-navigation";
import { pythonExamples } from "./python-doc-snippets";
import { pythonDeepagentsDocs, pythonSdkDocs } from "./python-docs";

test("Python guides expose exact runnable examples without claiming a PyPI release", () => {
  const assets = documentationAssets();
  assert.ok(searchDocPages(docPages, "Python SDK").some(page => page.id === "python-sdk"));
  assert.ok(searchDocPages(docPages, "SQLite").some(page => page.id === "deepagents-python"));
  const markdown = assets.get("docs/deepagents-python.md")!;
  for (const [name, program] of Object.entries(pythonExamples)) {
    const source = readFileSync(new URL(`../../../examples/python-first-task/${name}`, import.meta.url), "utf8");
    assert.equal(program, source.trimEnd());
    assert.equal(assets.get(`docs/examples/python/${name}`), source);
    assert.ok(markdown.includes(program));
  }
  for (const page of [pythonSdkDocs, pythonDeepagentsDocs]) {
    const rendered = renderToStaticMarkup(page.body);
    assert.match(rendered, /hljs-keyword/);
    assert.match(assets.get(`docs/${page.id}.md`)!, /publication is pending/i);
    assert.doesNotMatch(rendered, /pip install h-sandbox==/);
  }
  assert.match(markdown, /custom application tools are not automatically sandboxed/i);
  assert.match(markdown, /exactly-once/);
  assert.ok(markdown.indexOf("## Same agent, remote tools") < markdown.indexOf("## Prepare your environment"));
  assert.ok(assets.get("docs/deepagents.md")!.includes("Developer preview on npm"));
});

test("Python safety contracts agree between rendered docs, exports and repository guides", () => {
  const assets = documentationAssets();
  const sdk = assets.get("docs/python-sdk.md")!;
  const adapter = assets.get("docs/deepagents-python.md")!;
  const sdkSource = readFileSync(new URL("../../../docs/python-sdk.md", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../../../docs/integrations/deepagents-python.md", import.meta.url), "utf8");
  for (const content of [sdk, sdkSource]) {
    assert.match(content, /nonrecursive/);
    assert.match(content, /recursive=True/);
    assert.match(content, /cleanup before HTTP/);
  }
  for (const content of [adapter, adapterSource]) {
    assert.match(content, /HarakiriExecutionInterruptedError/);
    assert.match(content, /KeyboardInterrupt/);
    assert.match(content, /invalid_path/);
    assert.match(content, /None/);
  }
});
