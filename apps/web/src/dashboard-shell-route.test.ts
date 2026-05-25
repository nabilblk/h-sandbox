import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardShellRoute } from "./routes/dashboard-shell.js";

test("dashboard shell renders navigation and template route content", () => {
  const markup = renderToStaticMarkup(createElement(DashboardShellRoute, {
    route: "dashboard/templates",
    go: () => undefined,
    openSandbox: () => undefined,
    onSignOut: () => undefined,
    profile: { email: "lyra@k.ai", name: "Lyra Ito" }
  }));

  assert.match(markup, /Sandboxes/);
  assert.match(markup, /Templates/);
  assert.match(markup, /Usage/);
  assert.match(markup, /API keys/);
  assert.doesNotMatch(markup, /Members/);
  assert.match(markup, /New template/);
});
