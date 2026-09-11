import assert from "node:assert/strict";
import test from "node:test";
import { ownedVaultEndpoint } from "./interruption.mjs";

test("fault injection uses the returned server proxy and preserves egress authentication", () => {
  for (const base of ["http://127.0.0.1:28486", "127.0.0.1:28486", ""]) {
    const result = ownedVaultEndpoint({ endpoint: `${base}/v1/sandboxes/owned/proxy/18080`, headers: { "OPENSANDBOX-EGRESS-AUTH": "sensitive" } }, "owned");
    assert.equal(result.url, "http://127.0.0.1:28486/v1/sandboxes/owned/proxy/18080/credential-vault");
    assert.equal(result.headers.get("OPENSANDBOX-EGRESS-AUTH"), "sensitive");
    assert.equal(result.headers.has("OpenSandbox-Ingress-To"), false);
  }
});

test("provider mutations cannot escape the owned sandbox, port or loopback service", () => {
  const root = "http://127.0.0.1:28486/v1/sandboxes/owned/proxy/18080";
  for (const endpoint of [root.replace("127.0.0.1", "foreign.invalid"), root.replace("owned", "other"), root.replace("18080", "44772"), `${root}?credential=sensitive`, `${root}#sensitive`, root.replace("127.0.0.1", "user:sensitive@127.0.0.1")]) {
    assert.throws(() => ownedVaultEndpoint({ endpoint, headers: { "OPENSANDBOX-EGRESS-AUTH": "sensitive" } }, "owned"), /escaped the owned/);
  }
  assert.throws(() => ownedVaultEndpoint({ endpoint: root }, "owned"), /authentication unavailable/);
});
