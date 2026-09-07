import assert from "node:assert/strict";
import test from "node:test";
import {
  hasOidcResponse,
  isPublicRoute,
  routeFromHash,
  sandboxDetailIdFromRoute,
  selectInitialRoute
} from "./routing.js";

test("routeFromHash accepts dashboard sandbox detail deep links", () => {
  const route = routeFromHash("#dashboard/sandboxes/sbx_1vwJ_6FiQo");

  assert.equal(route, "dashboard/sandboxes/sbx_1vwJ_6FiQo");
  assert.equal(sandboxDetailIdFromRoute(route), "sbx_1vwJ_6FiQo");
});

test("documentation deep links remain public and reject malformed paths", () => {
  for (const hash of ["#docs", "#docs/workspaces", "#docs/persistent-workspaces", "#docs/workspace-reference", "#docs/workspace-operations"]) {
    assert.equal(routeFromHash(hash), hash.slice(1));
    assert.equal(isPublicRoute(routeFromHash(hash)), true);
  }
  for (const hash of ["#docs/../../dashboard", "#docs/https://evil.example", "#docs/", "#docs/workspaces?code=bad"]) {
    assert.equal(routeFromHash(hash), "landing");
  }
});

test("routeFromHash accepts dashboard vault route", () => {
  assert.equal(routeFromHash("#dashboard/vault"), "dashboard/vault");
});

test("routeFromHash decodes detail ids when read for the detail view", () => {
  const route = routeFromHash("#dashboard/sandboxes/sbx_with%2Fslash");

  assert.equal(route, "dashboard/sandboxes/sbx_with%2Fslash");
  assert.equal(sandboxDetailIdFromRoute(route), "sbx_with/slash");
});

test("OIDC callbacks restore the remembered protected route", () => {
  assert.equal(hasOidcResponse("#state=abc&code=123"), true);
  assert.equal(
    selectInitialRoute({
      requestedRoute: "landing",
      isOidcResponse: true,
      returnedRoute: "dashboard/sandboxes/sbx_callback",
      pendingPublicRoute: null
    }),
    "dashboard/sandboxes/sbx_callback"
  );
});

test("authenticated direct navigation wins over stale stored return routes", () => {
  assert.equal(
    selectInitialRoute({
      requestedRoute: "dashboard/sandboxes/sbx_direct",
      isOidcResponse: false,
      returnedRoute: "landing",
      pendingPublicRoute: null
    }),
    "dashboard/sandboxes/sbx_direct"
  );
});

test("public landing can restore a pending public deep link", () => {
  assert.equal(
    selectInitialRoute({
      requestedRoute: "landing",
      isOidcResponse: false,
      returnedRoute: null,
      pendingPublicRoute: "docs"
    }),
    "docs"
  );
});
