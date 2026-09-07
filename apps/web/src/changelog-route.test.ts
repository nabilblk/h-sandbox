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
  assert.match(markup, /v0\.5\.0-rc\.2/);
  assert.match(markup, /Persistent workspaces and live command output/);
  assert.match(markup, /Credential Vault and executable tutorials/);
  assert.match(markup, /v0\.4\.0/);
  assert.match(markup, /OpenSandbox-native lifecycle persistence/);
  assert.match(markup, /Watching the World Cup/);
  assert.match(markup, /Summer vacation/);
  assert.match(markup, /SDK\/CLI v0\.3\.1/);
  assert.doesNotMatch(markup, /v0\.4[01]\.[0-9]/);
  assert.match(markup, /class="active"/);
});
