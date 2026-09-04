import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardShellRoute, dashboardNavItems } from "./routes/dashboard-shell.js";

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
  assert.doesNotMatch(markup, /CmdK/);
  assert.match(markup, /New template/);
});

test("dashboard navigation exposes management surfaces only to admins", () => {
  const memberLabels = dashboardNavItems({
    canManageCredentialSecrets: false,
    canManageMembers: false
  }).map(([, label]) => label);
  const adminLabels = dashboardNavItems({
    canManageCredentialSecrets: true,
    canManageMembers: true
  }).map(([, label]) => label);

  assert.equal(memberLabels.includes("Vault"), false);
  assert.equal(memberLabels.includes("Members"), false);
  assert.equal(adminLabels.includes("Vault"), true);
  assert.equal(adminLabels.includes("Members"), true);
});
