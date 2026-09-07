import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsRoute, docsPageKey } from "./routes/docs.js";

const installSessionStorage = () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    },
    configurable: true
  });
  return values;
};

test("docs route renders selected docs page and navigation shell", () => {
  const storage = installSessionStorage();
  storage.set(docsPageKey, "api-reference");

  const markup = renderToStaticMarkup(createElement(DocsRoute, {
    go: () => undefined,
    profile: null,
    onSignIn: () => undefined,
    onSignOut: () => undefined
  }));

  assert.match(markup, /harakiri/);
  assert.match(markup, /API reference/);
  assert.match(markup, /class="docs-link active"/);
});

const renderDocs = (selectedId?: string) => renderToStaticMarkup(createElement(DocsRoute, {
  selectedId, go: () => undefined, profile: null, onSignIn: () => undefined, onSignOut: () => undefined
}));

test("public deep links override remembered selection and expose accessible navigation", () => {
  installSessionStorage().set(docsPageKey, "api-reference");
  const markup = renderDocs("workspaces");
  assert.match(markup, /<h1>Workspaces<\/h1>/);
  assert.match(markup, /href="#docs\/workspaces" class="docs-link active" aria-current="page"/);
  assert.match(markup, /<optgroup label="Concepts">/);
  assert.match(markup, /<option value="workspaces" selected="">/);
  assert.match(markup, /aria-label="On this page"/);
  assert.match(markup, /<button type="button">Lifecycle<\/button>/);
  assert.ok(markup.indexOf('docs-section-h">Getting started') < markup.indexOf('docs-section-h">Concepts'));
  assert.ok(markup.indexOf('docs-section-h">Concepts') < markup.indexOf('docs-section-h">Tutorials'));
});

test("unknown deep links show a recoverable not-found page", () => {
  installSessionStorage();
  assert.match(renderDocs("unknown-page"), /<h1>Documentation page not found<\/h1>/);
});

test("the quickstart works without remembered or available browser storage", () => {
  installSessionStorage().set(docsPageKey, "obsolete-page");
  assert.match(renderDocs(), /<h1>Quickstart<\/h1>/);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
  try { assert.match(renderDocs("workspaces"), /<h1>Workspaces<\/h1>/); }
  finally { installSessionStorage(); }
});
