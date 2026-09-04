import assert from "node:assert/strict";
import test from "node:test";
import { createKubernetesSecretResolver } from "./providers/secrets/kubernetes-secret-resolver.js";

const reference = {
  namespace: "harakiri",
  name: "agent-credentials",
  key: "OPENAI_API_KEY"
};

const resolverWith = (readNamespacedSecret: (input: { namespace: string; name: string }) => Promise<unknown>) =>
  createKubernetesSecretResolver({
    enabled: true,
    allowedNamespaces: ["harakiri"],
    allowedNames: [],
    allowedNamePrefixes: ["agent-"],
    core: () => ({ readNamespacedSecret } as never)
  });

test("Kubernetes resolver returns decoded material and resource version", async () => {
  const resolver = resolverWith(async (input) => {
    assert.deepEqual(input, { namespace: "harakiri", name: "agent-credentials" });
    return {
      metadata: { resourceVersion: "42" },
      data: { OPENAI_API_KEY: Buffer.from("real-secret").toString("base64") }
    };
  });

  assert.deepEqual(await resolver.resolve(reference), {
    kind: "ok",
    value: "real-secret",
    versionRef: "42"
  });
});

test("Kubernetes resolver fails before API access when disabled or denied", async () => {
  let reads = 0;
  const core = () => ({
    readNamespacedSecret: async () => {
      reads += 1;
      return {};
    }
  } as never);
  const disabled = createKubernetesSecretResolver({
    enabled: false,
    allowedNamespaces: ["harakiri"],
    allowedNames: [],
    allowedNamePrefixes: [],
    core
  });
  assert.equal((await disabled.resolve(reference)).kind, "unavailable");

  const denied = createKubernetesSecretResolver({
    enabled: true,
    allowedNamespaces: ["other"],
    allowedNames: [],
    allowedNamePrefixes: [],
    core
  });
  assert.equal((await denied.resolve(reference)).kind, "forbidden");
  assert.equal(reads, 0);
});

test("Kubernetes resolver maps missing, forbidden, and malformed values", async () => {
  const missingSecret = resolverWith(async () => {
    throw Object.assign(new Error("not found"), { code: 404 });
  });
  assert.equal((await missingSecret.resolve(reference)).kind, "not_found");

  const forbidden = resolverWith(async () => {
    throw Object.assign(new Error("token denied"), { statusCode: 403 });
  });
  assert.deepEqual(await forbidden.resolve(reference), {
    kind: "forbidden",
    message: "Kubernetes denied access to the Secret"
  });

  const missingKey = resolverWith(async () => ({ metadata: {}, data: {} }));
  assert.equal((await missingKey.resolve(reference)).kind, "not_found");

  const empty = resolverWith(async () => ({
    metadata: {},
    data: { OPENAI_API_KEY: "" }
  }));
  assert.equal((await empty.resolve(reference)).kind, "invalid");
});
