import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock, CodeTabs, codeLanguages, highlightCode } from "./components/docs-code.js";
import { docPages } from "./docs-content.js";
import { docGroups, docSectionHref, docSectionId, groupDocPages, searchDocPages } from "./docs-navigation.js";
import { quickstartCli, quickstartTypeScript } from "./getting-started-docs.js";
import { isDocsRoute, isPublicRoute, routeFromHash } from "./routing.js";

test("every page occurs exactly once in the editorial progression", () => {
  const ids = docGroups.flatMap((group) => [...group.pages]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), docPages.map((page) => page.id).sort());
  assert.equal(groupDocPages(docPages)[0].pages[0].id, "overview");
  assert.ok(docGroups.find((group) => group.title === "Reference")!.pages.includes("cli-reference"));
});

test("search covers page copy and code, ignores case and whitespace, and handles no matches", () => {
  assert.ok(searchDocPages(docPages, "  WORKSPACE   mountPath ").some((page) => page.id === "workspace-reference"));
  assert.ok(searchDocPages(docPages, "exposeAndWait").some((page) => page.id === "routes"));
  assert.deepEqual(searchDocPages(docPages, "no-such-feature-92652"), []);
  assert.equal(searchDocPages(docPages, " ").length, docPages.length);
});

test("section URLs are public, unambiguous and preserve existing page links", () => {
  for (const page of docPages) {
    const slugs = page.toc.map(docSectionId);
    assert.equal(new Set(slugs).size, slugs.length, page.id);
    for (const heading of page.toc) {
      const route = docSectionHref(page.id, heading).slice(1);
      assert.ok(isDocsRoute(route), route);
      assert.ok(isPublicRoute(routeFromHash(`#${route}`)), route);
      assert.equal(routeFromHash(`#${route}`), route);
    }
  }
  assert.equal(routeFromHash("#docs/workspaces"), "docs/workspaces");
  assert.equal(isDocsRoute("docs/workspaces?section=<script>"), false);
  assert.equal(isDocsRoute("docs/workspaces?section=lifecycle&state=auth"), false);
});

test("syntax grammars produce escaped React text and unknown languages stay readable", () => {
  for (const [language, code] of Object.entries({
    bash: 'export NAME="value"', typescript: 'const count: number = 1;',
    javascript: 'const greeting = "hello";', json: '{"ready":true}',
    yaml: 'enabled: true', toml: 'name = "template"', python: 'print("hello")'
  })) {
    const markup = renderToStaticMarkup(createElement(CodeBlock, { language: language as keyof typeof codeLanguages, children: code }));
    assert.match(markup, /class="hljs-/);
    assert.match(markup, /aria-label="Copy .+ code"/);
    assert.match(markup, /<pre tabindex="0"/);
    assert.match(markup, /translate="no"/);
  }
  const raw = '<script>alert("not executable")</script>';
  const escaped = renderToStaticMarkup(createElement("code", null, highlightCode(raw, "unknown-language")));
  assert.doesNotMatch(escaped, /<script>/);
  assert.match(escaped, /&lt;script&gt;/);
  assert.equal(highlightCode(raw, "unknown-language"), raw);
});

test("every rendered documentation pre has a labelled shared code surface", () => {
  let total = 0;
  for (const page of docPages) {
    const markup = renderToStaticMarkup(page.body);
    const blocks = [...markup.matchAll(/<figure class="doc-code" data-language="([^"]+)"/g)];
    assert.equal(blocks.length, [...markup.matchAll(/<pre\b/g)].length, page.id);
    for (const block of blocks) assert.ok(block[1] in codeLanguages, `${page.id}: ${block[1]}`);
    total += blocks.length;
  }
  assert.ok(total > 100, `Unexpectedly few code blocks: ${total}`);
});

test("code tabs expose a controlled implementation choice and matching panel", () => {
  const markup = renderToStaticMarkup(createElement(CodeTabs, {
    label: "Example", value: "TypeScript", examples: [
      { label: "CLI", language: "bash", code: "harakiri capabilities" },
      { label: "TypeScript", language: "typescript", code: "await client.capabilities();" }
    ]
  }));
  assert.match(markup, /role="tablist" aria-label="Example"/);
  assert.match(markup, /aria-selected="true" tabindex="0">TypeScript/);
  assert.match(markup, /data-language="typescript"/);
  assert.doesNotMatch(markup, /data-language="bash"/);
});

test("quickstart cleans up after execution and handles failures", () => {
  execFileSync("bash", ["-n"], { input: quickstartCli });
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: quickstartTypeScript });
  assert.ok(quickstartCli.indexOf("trap '") < quickstartCli.indexOf('harakiri run "$SBX_ID"'));
  assert.ok(quickstartCli.lastIndexOf('harakiri kill "$SBX_ID"') > quickstartCli.indexOf('harakiri run "$SBX_ID"'));
  assert.match(quickstartTypeScript, /finally\s*\{\s*await sandbox\.kill\(\)/);
  assert.match(quickstartTypeScript, /assert.equal\(result.exitCode, 0\)/);
});

test("CLI quickstart extracts the ID from progress output and cleans up on command failure", () => {
  const harness = `harakiri() {
    if [[ "$1" != create && "$2" != sbx_docs_test ]]; then return 90; fi
    case "$1" in
      create) printf '\\033[32m-> provisioning...\\033[0m\\nsbx_docs_test\\n-> ready\\n' ;;
      status) printf '{"sandbox":{"status":"running"}}\\n' ;;
      run) printf '4\\n'; return "\${RUN_EXIT:-0}" ;;
      kill) printf 'terminated %s\\n' "$2" ;;
      *) return 91 ;;
    esac
  }
  eval "$1"`;
  const output = execFileSync("bash", ["-c", harness, "--", quickstartCli], { encoding: "utf8" });
  assert.match(output, /4\nterminated sbx_docs_test/);
  assert.equal((output.match(/terminated/g) ?? []).length, 1);
  assert.throws(() => execFileSync("bash", ["-c", harness, "--", quickstartCli], {
    encoding: "utf8", env: { ...process.env, RUN_EXIT: "17" }
  }), (error: unknown) => {
    const failure = error as { status: number; stdout: string };
    assert.equal(failure.status, 17);
    assert.match(failure.stdout, /terminated sbx_docs_test/);
    return true;
  });
});

test("vision distinguishes runtime ownership, metadata, files and current limitations", () => {
  const markup = renderToStaticMarkup(docPages.find((page) => page.id === "vision-architecture")!.body);
  for (const phrase of ["OpenSandbox is the current integrated runtime provider", "RuntimeProvider contract", "one real execution adapter", "not a supported live migration", "not Kubernetes exec", "PostgreSQL", "metadata", "workspace volumes", "not an agent framework", "restricted OpenShift", "still pending", "0.5.0-rc.8"]) {
    assert.ok(markup.includes(phrase), phrase);
  }
  assert.equal([...markup.matchAll(/class="docs-diagram /g)].length, 2);
  assert.doesNotMatch(markup, /linearGradient|feDropShadow|vision-hero/);
});
