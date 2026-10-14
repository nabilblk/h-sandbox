import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../acceptance/context.mjs";
import { installPublishedApi, verifyPublishedApi } from "./published-api.mjs";

function fixture(changeConfig = value => value) {
  const documents = new Map();
  const add = value => {
    const bytes = JSON.stringify(value);
    const digest = `sha256:${sha256(bytes)}`;
    documents.set(digest, bytes);
    return digest;
  };
  const source = "a".repeat(40), version = "0.5.0-rc.12";
  const manifests = ["amd64", "arm64"].map(architecture => {
    const config = add(changeConfig({ os: "linux", architecture, config: { Labels: {
      "org.opencontainers.image.revision": source, "org.opencontainers.image.version": version
    } } }));
    return { platform: { os: "linux", architecture }, digest: add({ config: { digest: config } }) };
  });
  const pin = { release: "api-2026-10-02.1", source, version, tag: "provider-files-test", digest: add({ manifests }) };
  const image = `core.campus.clusterdiali.me/harakiri/harakiri-api:${pin.tag}@${pin.digest}`;
  const evidence = { kind: "harakiri-api-maintenance", ...pin, image };
  pin.manifestSha256 = add(evidence).slice(7);
  const calls = [];
  const request = async (url, options) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "github.com") {
      assert.equal(url, `https://github.com/nabilblk/h-sandbox/releases/download/${pin.release}/api-image.json`);
      assert.equal(options.headers.Authorization, undefined);
      return new Response(documents.get(`sha256:${pin.manifestSha256}`));
    }
    assert.equal(parsed.origin, "https://core.campus.clusterdiali.me");
    if (parsed.pathname === "/service/token") return Response.json({ token: "anonymous-test-token" });
    assert.equal(options.headers.Authorization, "Bearer anonymous-test-token");
    const document = documents.get(parsed.pathname.split("/").at(-1));
    return new Response(document ?? "absent", { status: document ? 200 : 404 });
  };
  return { pin, request, documents, calls, image };
}

test("published API qualification binds the receipt, both architectures and source labels", async () => {
  const { pin, request, image } = fixture();
  const result = await verifyPublishedApi(pin, request);
  assert.equal(result.image, image);
  assert.equal(result.published, true);
  assert.deepEqual(result.platforms.map(item => item.architecture), ["amd64", "arm64"]);
});

test("untrusted pins fail before network access", async () => {
  for (const override of [{ source: "main" }, { version: undefined }, { digest: "latest" }, { release: "../other" }, { tag: "tag@other" }, { manifestSha256: "" }]) {
    const { pin, request, calls } = fixture();
    await assert.rejects(verifyPublishedApi({ ...pin, ...override }, request));
    assert.equal(calls.length, 0);
  }
});

test("missing or modified published documents cannot qualify", async () => {
  const { pin, request, documents } = fixture();
  documents.set(pin.digest, "{}");
  await assert.rejects(verifyPublishedApi(pin, request), /checksum mismatch/);
  documents.delete(pin.digest);
  await assert.rejects(verifyPublishedApi(pin, request), /unavailable/);
});

test("a receipt cannot substitute a different source or image", async () => {
  const { pin, request } = fixture();
  await assert.rejects(verifyPublishedApi({ ...pin, source: "b".repeat(40) }, request), /identity mismatch/);
  await assert.rejects(verifyPublishedApi({ ...pin, tag: "substitute" }, request), /identity mismatch/);
});

test("registry configuration must match the exact source, version and architecture", async () => {
  for (const change of [
    value => ({ ...value, os: "windows" }),
    value => ({ ...value, architecture: "wrong" }),
    value => ({ ...value, config: { Labels: {} } })
  ]) {
    const { pin, request } = fixture(change);
    await assert.rejects(verifyPublishedApi(pin, request), /mismatch/);
  }
});

test("the API upgrade cannot start outside an owned acceptance fixture", async () => {
  await assert.rejects(installPublishedApi({ guard() { throw new Error("Not an owned fixture"); } }, {}), /Not an owned fixture/);
});

test("the owned fixture consumes the published digest without rebuilding or changing web/configuration", async t => {
  const { pin, request, image } = fixture();
  t.mock.method(globalThis, "fetch", async (url, options) =>
    url === "http://127.0.0.1:28482/health" ? new Response("healthy") : request(url, options));
  const original = { image: { api: { tag: "old-api" }, web: { tag: "keep-web" } },
    config: { PUBLIC_API_URL: "keep-origin", TEMPLATE_BUILDER_JOB_IMAGE: "old-api" } };
  const calls = [];
  let saved;
  const ctx = {
    guard() { calls.push("guard"); },
    read(name) {
      return name === "harakiri-values.json" ? structuredClone(original) :
        { charts: { harakiri: { archive: "harakiri-0.5.0-rc.10.tgz" } } };
    },
    save(name, value) { assert.equal(name, "published-api-values.json"); saved = value; },
    file(name) { return `/owned-fixture/${name}`; },
    helm(args) {
      calls.push("helm");
      assert.deepEqual(args, ["upgrade", "harakiri", "/owned-fixture/harakiri-0.5.0-rc.10.tgz", "-n", "harakiri-preview",
        "-f", "/owned-fixture/published-api-values.json", "--wait", "--timeout", "10m"]);
    },
    async forwardAll() { calls.push("forwards"); },
    k(args) {
      calls.push("identity");
      assert.ok(args.includes("app.kubernetes.io/instance=harakiri,app.kubernetes.io/component=api"));
      return JSON.stringify({ items: [{ metadata: {}, spec: { containers: [{ name: "api", image }] },
        status: { containerStatuses: [{ name: "api", ready: true, imageID: `docker-pullable://${image}` }] } }] });
    }
  };
  const result = await installPublishedApi(ctx, pin);
  assert.equal(result.runningImageVerified, true);
  assert.deepEqual(calls, ["guard", "helm", "forwards", "identity"]);
  assert.deepEqual(saved, { image: { api: { tag: `${pin.tag}@${pin.digest}` }, web: original.image.web },
    config: { ...original.config, TEMPLATE_BUILDER_JOB_IMAGE: image } });
});
