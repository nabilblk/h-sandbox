import assert from "node:assert/strict";
import test from "node:test";
import { config } from "./config.js";
import { configuredRouteTarget, routeHost, routeKeyFor, routeUrl } from "./providers/runtime/route-targets.js";

const originalRouteBaseDomain = config.sandboxRouteBaseDomain;
const originalRoutePublicScheme = config.sandboxRoutePublicScheme;

test.afterEach(() => {
  config.sandboxRouteBaseDomain = originalRouteBaseDomain;
  config.sandboxRoutePublicScheme = originalRoutePublicScheme;
});

test("configuredRouteTarget uses the configured route domain and public scheme", () => {
  config.sandboxRouteBaseDomain = ".routes.example.test.";
  config.sandboxRoutePublicScheme = "http";

  const route = configuredRouteTarget({ sandboxId: "SBX__Route!!", port: 5173, provider: "dev" });

  assert.equal(route.routeKey, "sbx-route-5173");
  assert.equal(route.host, "sbx-route-5173.routes.example.test");
  assert.equal(route.url, "http://sbx-route-5173.routes.example.test");
  assert.equal(route.targetUrl, route.url);
  assert.equal(route.provider, "dev");
});

test("route helpers normalize keys and parse hosts consistently", () => {
  assert.equal(routeKeyFor("__", 3000), "sandbox-3000");
  assert.equal(routeUrl("route.example.test", "https"), "https://route.example.test");
  assert.equal(routeHost("https://route.example.test/path"), "route.example.test");
});
