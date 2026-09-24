import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { documentationAssets } from "./docs-export.js";
import { docPages } from "./docs-content.js";
import { docGroups, searchDocPages } from "./docs-navigation.js";
import { deepagentsDocs, deepagentsFirstTask, deepagentsAgentTask } from "./deepagents-docs.js";

test("framework integration is a searchable first-class guide with matching code exports", () => {
  assert.ok(docGroups.some(group => group.title === "Integrations" && group.pages.includes("deepagents")));
  assert.ok(searchDocPages(docPages, "LangGraph checkpoint").some(page => page.id === "deepagents"));
  const markdown = documentationAssets().get("docs/deepagents.md")!;
  assert.ok(markdown.includes(deepagentsFirstTask));
  assert.ok(markdown.includes(deepagentsAgentTask));
  assert.ok(markdown.indexOf('import { createDeepAgent } from "deepagents"') < markdown.indexOf("## Installation"));
  assert.ok(markdown.indexOf(deepagentsAgentTask) < markdown.indexOf(deepagentsFirstTask));
  assert.equal(deepagentsAgentTask, readFileSync(new URL("../../../packages/deepagents/examples/run-repair.ts", import.meta.url), "utf8").trimEnd());
  for (const contract of ["Developer preview on npm", "SDK 0.5.0-rc.11", "capacity release",
    "A working directory is not a filesystem jail", "MemorySaver", "exactly-once", "sandbox storage",
    "separate gates", "per-request deadline", "HarakiriTaskCleanupError", "sandbox-backed agent",
    "Custom tools", "not automatically sandboxed", "termination notice", "cancellation between files",
    "completed the real-model repair", "qualification run passed all 15 gates",
    "Runtime qualification and registry publication are separate checks"]) assert.ok(markdown.includes(contract), contract);
  assert.doesNotMatch(markdown, /full-suite requalification is pending|Unpublished release candidate|DEEPAGENTS_TARBALL/);
  const receipt = new URL("../../../docs/release-notes/deepagents-0.1.0-delivery.md", import.meta.url);
  assert.ok(readFileSync(receipt, "utf8").includes("actions/runs/36007730164"));
  for (const run of ["36032828432", "36034957121"]) {
    assert.ok(markdown.includes(`actions/runs/${run}`));
    assert.ok(readFileSync(receipt, "utf8").includes(`actions/runs/${run}`));
  }
  assert.match(renderToStaticMarkup(deepagentsDocs.body), /hljs-keyword/);
  assert.ok(markdown.includes("npm install --save-exact @h-sandbox/deepagents@next @h-sandbox/sdk@0.5.0-rc.11"));
});

test("framework preview pins its published SDK peer and keeps framework dependencies separate", () => {
  const root = new URL("../../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("packages/deepagents/package.json", root), "utf8"));
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.peerDependencies["@h-sandbox/sdk"], "0.5.0-rc.11");
  assert.equal(manifest.peerDependencies.deepagents, "1.14.0");
  for (const path of ["packages/sdk", "packages/cli", "apps/api", "apps/web"]) {
    const pkg = JSON.parse(readFileSync(new URL(`${path}/package.json`, root), "utf8"));
    assert.ok(Object.keys(pkg.dependencies ?? {}).every(name => !/deepagents|langchain|langgraph/.test(name)), path);
  }
  for (const path of ["packages/deepagents/README.md", "docs/integrations/deepagents.md", "examples/README.md"]) {
    const file = new URL(path, root);
    const source = readFileSync(file, "utf8");
    assert.match(source, /developer preview on npm/i);
    assert.doesNotMatch(source, /unpublished release candidate/i);
    for (const [, href] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (!/^(?:[a-z]+:|#|\/)/.test(href)) assert.ok(existsSync(new URL(href.split(/[?#]/)[0], file)), `${path}: ${href}`);
    }
  }
  const workflow = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.match(workflow, /HARAKIRI_DEEPAGENTS_TEST_NODE/);
  assert.match(workflow, /@h-sandbox\/deepagents test:package/);
});
