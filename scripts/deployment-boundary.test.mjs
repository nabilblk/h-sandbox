import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("the OSS source tree does not ship the customer installation package", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((file) => file && existsSync(resolve(root, file)));
  assert.deepEqual(files.filter((file) => file.startsWith("OCP-install/")), []);
  const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  assert.doesNotMatch(ci, /OCP-install|harakiri-deployments/);
  assert.match(ci, /infra\/keycloak\/harakiri-realm\.test\.mjs/);
});

test("standalone operator guides do not require the customer stack", () => {
  for (const file of ["docs/install-openshift.md", "docs/airgap.md", "docs/release-artifacts.md", "docs/template-release.md"]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /OCP-install\/|INSTALL_BACKGROUND_AGENT|oci:\/\/[^\s]+background-agents/);
  }
});

test("legacy local state remains ignored after its nested gitignore is removed", () => {
  const paths = ["OCP-install/charts/harakiri.tgz", "OCP-install/harakiri-security/state/harakiri-security/config.json"];
  const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
    cwd: root, encoding: "utf8", input: paths.join("\0") + "\0"
  }).split("\0").filter(Boolean);
  assert.deepEqual(ignored, paths);
});
