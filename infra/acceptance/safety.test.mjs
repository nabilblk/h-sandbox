import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertClusterOwnership, assertKubeconfig, assertOwnedNamespace, assertPrivateDirectory, ownershipLabel, runnerIdentity, validateArtifactManifest } from "./safety.mjs";

const env = { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", RUNNER_ARCH: "X64", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", RUNNER_TEMP: "/tmp/runner" };
const identity = runnerIdentity(env, "linux", "x64");
const config = () => ({ clusters: [{ name: "local", cluster: { server: "https://localhost:6443", "certificate-authority-data": "fixture-ca" } }], contexts: [{ name: "acceptance", context: { cluster: "local", user: "acceptance" } }], users: [{ name: "acceptance", user: { "client-certificate-data": "fixture-cert", "client-key-data": "fixture-key" } }], "current-context": "acceptance" });

test("native harness refuses the Mac, ARM and self-hosted runners", () => {
  for (const [environment, platform, arch] of [[env, "darwin", "arm64"], [env, "linux", "arm64"], [{ ...env, RUNNER_ENVIRONMENT: "self-hosted" }, "linux", "x64"], [{ ...env, GITHUB_ACTIONS: "false" }, "linux", "x64"]]) {
    assert.throws(() => runnerIdentity(environment, platform, arch));
  }
});

test("run identity cannot inject paths or use a relative private directory", () => {
  assert.equal(identity.directory, "/tmp/runner/harakiri-acceptance-123-1");
  for (const override of [{ GITHUB_RUN_ID: "../lab" }, { GITHUB_RUN_ATTEMPT: "" }, { RUNNER_TEMP: "relative" }]) {
    assert.throws(() => runnerIdentity({ ...env, ...override }, "linux", "x64"));
  }
});

test("kubeconfig refuses lab, customer, multiple-context and insecure endpoints", () => {
  assertKubeconfig(config(), identity);
  for (const server of ["https://127.0.0.1:6444", "https://api.crc.testing:6443", "https://sb-api.harakiri.io", "http://localhost:6443", "https://user@localhost:6443/", "https://localhost:6443/unexpected"]) {
    const value = config(); value.clusters[0].cluster.server = server;
    assert.throws(() => assertKubeconfig(value, identity));
  }
  const insecure = config(); insecure.clusters[0].cluster["insecure-skip-tls-verify"] = true;
  assert.throws(() => assertKubeconfig(insecure, identity));
  const multiple = config(); multiple.contexts.push({ name: "lab" });
  assert.throws(() => assertKubeconfig(multiple, identity));
  const plugin = config(); plugin.users[0].user.exec = { command: "external-auth" };
  assert.throws(() => assertKubeconfig(plugin, identity));
});

test("cluster and namespace UID/ownership gates fail closed", () => {
  const ns = { metadata: { name: "kube-system", uid: "cluster-one", labels: { [ownershipLabel]: identity.id } } };
  assertClusterOwnership(ns, identity, "cluster-one");
  assert.throws(() => assertClusterOwnership(ns, identity, "replacement-cluster"));
  assert.throws(() => assertClusterOwnership(ns, { ...identity, id: "other-run" }, "cluster-one"));
  assertOwnedNamespace({ metadata: { name: "harakiri-preview", labels: ns.metadata.labels } }, identity);
  assert.throws(() => assertOwnedNamespace({ metadata: { name: "harakiri", labels: ns.metadata.labels } }, identity));
  assert.throws(() => assertOwnedNamespace({ metadata: { name: "harakiri-preview" } }, identity));
});

test("private state cannot be world-readable or a symlink", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-safety-"));
  try {
    fs.chmodSync(root, 0o700); assertPrivateDirectory(root);
    const link = path.join(root, "link"); fs.symlinkSync(root, link);
    assert.throws(() => assertPrivateDirectory(link));
    fs.chmodSync(root, 0o755); assert.throws(() => assertPrivateDirectory(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("artifact contract rejects another release and an external npm credential sink", () => {
  const pinned = JSON.parse(fs.readFileSync(new URL("./versions.json", import.meta.url)));
  const digest = "a".repeat(64);
  const manifest = { version: pinned.version, source: pinned.source, images: {}, charts: {}, npm: {} };
  for (const name of ["api", "web"]) manifest.images[name] = { digest: pinned.images[name], image: `core.campus.clusterdiali.me/harakiri/harakiri-${name}:${pinned.version}@${pinned.images[name]}`, platforms: [{ architecture: "amd64" }] };
  for (const name of ["harakiri", "opensandbox"]) manifest.charts[name] = { ...pinned.charts[name], archive: `${name}-${pinned.charts[name].version}.tgz`, sha256: digest };
  for (const name of ["sdk", "cli"]) manifest.npm[name] = { name: `@h-sandbox/${name}`, version: pinned.version, integrity: "sha512-YQ==", tarball: `https://registry.npmjs.org/@h-sandbox/${name}/-/package.tgz` };
  validateArtifactManifest(manifest, pinned);
  assert.throws(() => validateArtifactManifest({ ...manifest, version: "0.4.0" }, pinned));
  manifest.npm.sdk.tarball = "https://unrelated.example/package.tgz";
  assert.throws(() => validateArtifactManifest(manifest, pinned));
});
