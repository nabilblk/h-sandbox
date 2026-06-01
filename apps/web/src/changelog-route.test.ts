import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangelogRoute } from "./routes/changelog.js";

test("changelog route renders release entries and active public navigation", () => {
  const markup = renderToStaticMarkup(createElement(ChangelogRoute, {
    go: () => undefined,
    profile: null,
    onSignIn: () => undefined,
    onSignOut: () => undefined
  }));

  assert.match(markup, /Changelog/);
  assert.match(markup, /Developer integration surface/);
  assert.match(markup, /class="active"/);
});
