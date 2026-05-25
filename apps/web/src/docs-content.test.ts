import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";

test("docs content exposes expected product pages and renderable body markup", () => {
  assert.ok(docPages.length >= 8);
  assert.ok(docPages.some((page) => page.id === "quickstart" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "api-reference" && page.section === "Reference"));

  const quickstart = docPages.find((page) => page.id === "quickstart");
  assert.ok(quickstart);
  const markup = renderToStaticMarkup(quickstart.body);
  assert.match(markup, /harakiri create --template python-3\.12-data/);
  assert.match(markup, /harakiri expose sbx_\.\.\. --port 3000/);
});
