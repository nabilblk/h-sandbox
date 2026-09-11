import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguration } from "./configure.mjs";

const input = { webOrigin: "https://app.example.test", apiOrigin: "https://api.example.test", authOrigin: "https://auth.example.test", email: "operator@example.test" };
test("preview config owns secrets and separates public issuer from internal JWKS", () => {
  const first = createConfiguration(input);
  const second = createConfiguration(input);
  assert.notEqual(first["operator-login.json"].password, second["operator-login.json"].password);
  const config = first["harakiri-values.json"].config;
  assert.equal(config.AUTH_DEV_ALLOW, "0");
  assert.equal(config.SEED_ON_BOOT, "0");
  assert.equal(config.SANDBOX_ROUTE_DEFAULT_ACCESS_MODE, "token");
  assert.equal(config.KEYCLOAK_ISSUER_ALLOWLIST, "https://auth.example.test/realms/harakiri");
  assert.ok(config.KEYCLOAK_JWKS_URL.includes(".svc.cluster.local"));
  assert.ok(!JSON.stringify(first).includes("dev-opensandbox-key"));
  const secrets = first["secrets.json"].items;
  const api = secrets.find(s => s.metadata.name === "preview-api").stringData;
  assert.equal(Buffer.from(api.CREDENTIAL_VAULT_KEY, "base64").length, 32);
  assert.ok(first["opensandbox-values.json"]["opensandbox-server"].configToml.includes(api.OPEN_SANDBOX_API_KEY));
  assert.match(first["opensandbox-values.json"]["opensandbox-server"].configToml, /sandbox_create_timeout_seconds = 180\n/);
  for (const component of ["opensandbox-controller", "opensandbox-server"]) assert.equal(first["opensandbox-values.json"][component].namespaceOverride, "harakiri-preview");
  const server = first["opensandbox-values.json"]["opensandbox-server"].server;
  assert.equal(server.replicaCount, 1);
  assert.equal(server.gateway.replicaCount, 1);
  assert.equal(server.resources.requests.memory, "256Mi");
  assert.equal(server.gateway.resources.requests.memory, "128Mi");
  const realm = JSON.parse(secrets.find(s => s.metadata.name === "preview-realm").stringData["harakiri-realm.json"]);
  assert.deepEqual(realm.clients[0].redirectUris, ["https://app.example.test/*"]);
  assert.equal(realm.clients[0].directAccessGrantsEnabled, false);
  assert.equal(realm.clients[1].secret, api.KEYCLOAK_ADMIN_CLIENT_SECRET);
  assert.ok(!("KEYCLOAK_ADMIN_PASSWORD" in api));
});
test("preview accepts local forwards but rejects remote HTTP and ambiguous origins", () => {
  createConfiguration({ ...input, webOrigin: "http://127.0.0.1:28480" });
  for (const webOrigin of ["http://example.com", "https://example.com/path", "https://example.com/", "https://user:pass@example.com"]) {
    assert.throws(() => createConfiguration({ ...input, webOrigin }));
  }
});
