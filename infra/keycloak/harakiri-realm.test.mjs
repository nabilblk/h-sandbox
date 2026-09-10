import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the development realm retains the explicit API audience and browser PKCE", () => {
  const realm = JSON.parse(readFileSync(new URL("./harakiri-realm.json", import.meta.url), "utf8"));
  const client = realm.clients.find((entry) => entry.clientId === "harakiri-web");
  assert.equal(client.publicClient, true);
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
  assert.deepEqual(client.protocolMappers, [{
    name: "harakiri-api-audience", protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper", consentRequired: false,
    config: {
      "included.custom.audience": "harakiri-api", "id.token.claim": "false",
      "access.token.claim": "true", "introspection.token.claim": "true"
    }
  }]);
});
