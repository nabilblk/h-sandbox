import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const ownershipLabel = "harakiri.io/acceptance-run";
export const namespaces = ["harakiri-preview", "harakiri-preview-runtime"];

export function runnerIdentity(env = process.env, platform = process.platform, arch = process.arch) {
  assert.equal(platform, "linux", "Native acceptance cannot run on this local host");
  assert.equal(arch, "x64", "Native amd64 acceptance must not run on an ARM host");
  assert.equal(env.GITHUB_ACTIONS, "true", "A disposable Actions runner is required");
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted", "Self-hosted runners are forbidden");
  assert.equal(env.RUNNER_OS, "Linux");
  assert.equal(env.RUNNER_ARCH, "X64");
  assert.match(env.GITHUB_RUN_ID ?? "", /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? "", /^\d+$/);
  assert.ok(path.isAbsolute(env.RUNNER_TEMP ?? ""), "RUNNER_TEMP must be absolute");
  const id = `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const directory = path.join(env.RUNNER_TEMP, `harakiri-acceptance-${id}`);
  return { id, directory, kubeconfig: path.join(directory, "kubeconfig") };
}

export function assertKubeconfig(config, identity) {
  assert.equal(config.clusters?.length, 1, "One isolated cluster is required");
  const cluster = config.clusters[0];
  const url = new URL(cluster.cluster.server);
  assert.equal(url.href, "https://localhost:6443/", "Unexpected cluster API; refusing mutation");
  assert.ok(cluster.cluster["certificate-authority-data"], "A pinned cluster CA is required");
  assert.notEqual(cluster.cluster["insecure-skip-tls-verify"], true);
  assert.equal(config.contexts?.length, 1);
  assert.equal(config.contexts[0].context.cluster, cluster.name);
  assert.equal(config["current-context"], config.contexts[0].name);
  assert.equal(config.users?.length, 1, "One isolated client identity is required");
  assert.equal(config.contexts[0].context.user, config.users[0].name);
  const user = config.users[0].user;
  assert.ok(user["client-certificate-data"] && user["client-key-data"]);
  for (const key of ["exec", "auth-provider", "tokenFile", "client-certificate", "client-key"]) assert.equal(user[key], undefined, "External credential source is forbidden");
  assert.ok(identity.id && identity.kubeconfig, "Missing isolated runner identity");
}

export function localizeGeneratedKubeconfig(config, identity, localAddresses) {
  assert.equal(config.clusters?.length, 1, "One generated cluster is required");
  const server = new URL(config.clusters[0].cluster.server);
  assert.ok(localAddresses.includes(server.hostname), "Generated API address is not on this runner");
  assert.equal(server.href, `https://${server.hostname}:6443/`, "Unexpected generated API URL");
  const localized = structuredClone(config);
  localized.clusters[0].cluster.server = "https://localhost:6443";
  assertKubeconfig(localized, identity);
  return localized;
}

export function assertClusterOwnership(namespace, identity, expectedUid) {
  assert.equal(namespace.metadata.name, "kube-system");
  assert.equal(namespace.metadata.uid, expectedUid, "Cluster UID changed; refusing mutation");
  assert.equal(namespace.metadata.labels?.[ownershipLabel], identity.id, "Cluster not owned by this acceptance run");
}

export function assertOwnedNamespace(namespace, identity) {
  assert.ok(namespaces.includes(namespace.metadata.name), "Unexpected namespace");
  assert.equal(namespace.metadata.labels?.[ownershipLabel], identity.id, "Namespace not owned by this acceptance run");
}

export function assertPrivateDirectory(directory) {
  const stat = fs.lstatSync(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(stat.mode & 0o077, 0, "Acceptance state must be private");
}

export function validateArtifactManifest(manifest, pinned) {
  assert.equal(manifest.version, pinned.version);
  assert.equal(manifest.source, pinned.source);
  for (const name of ["api", "web"]) {
    assert.equal(manifest.images[name].digest, pinned.images[name]);
    assert.equal(manifest.images[name].image, `core.campus.clusterdiali.me/harakiri/harakiri-${name}:${pinned.version}@${pinned.images[name]}`);
    assert.ok(manifest.images[name].platforms.some(item => item.architecture === "amd64"));
  }
  for (const name of ["harakiri", "opensandbox"]) {
    assert.equal(manifest.charts[name].digest, pinned.charts[name].digest);
    assert.equal(manifest.charts[name].version, pinned.charts[name].version);
    assert.equal(manifest.charts[name].archive, `${name}-${pinned.charts[name].version}.tgz`);
    assert.match(manifest.charts[name].sha256, /^[a-f0-9]{64}$/);
  }
  for (const name of ["sdk", "cli"]) {
    assert.equal(manifest.npm[name].name, `@h-sandbox/${name}`);
    assert.equal(manifest.npm[name].version, pinned.version);
    assert.match(manifest.npm[name].integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
    assert.equal(new URL(manifest.npm[name].tarball).origin, "https://registry.npmjs.org");
  }
  return manifest;
}
