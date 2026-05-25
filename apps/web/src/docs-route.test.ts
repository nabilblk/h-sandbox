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
