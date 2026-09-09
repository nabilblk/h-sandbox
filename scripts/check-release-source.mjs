import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export function releaseSource(input, cwd = process.cwd()) {
  assert.ok(input.repository && input.repository === input.allowedRepository, "Publishing repository is not enabled");
  assert.equal(input.workflowRef, "refs/heads/main", "Publication must run from main");
  const ref = input.sourceRef || input.workflowSha;
  const isTag = typeof ref === "string" && ref.startsWith("v") && versionPattern.test(ref.slice(1));
  assert.ok(isTag || /^[a-f0-9]{40}$/.test(ref ?? ""), "Source must be a version tag or full commit SHA");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sha = git("rev-parse", "--verify", `${isTag ? `refs/tags/${ref}` : ref}^{commit}`);
  try { git("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main"); }
  catch { throw new Error("Release source is not part of origin/main"); }
  const versions = ["package.json", "apps/api/package.json", "apps/web/package.json", "packages/shared/package.json", "packages/sdk/package.json", "packages/cli/package.json"]
    .map(file => JSON.parse(git("show", `${sha}:${file}`)).version);
  const version = versions[0];
  assert.ok(versionPattern.test(version), "Invalid package release version");
  assert.ok(versions.every(v => v === version), "Control plane, SDK and CLI versions must match");
  if (isTag) assert.equal(ref, `v${version}`, "Source tag does not match package version");
  if (input.chartVersion) assert.equal(input.chartVersion, version, "Chart override must match the source version");
  if (input.imageTag) {
    assert.match(input.imageTag, /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/);
    assert.notEqual(input.imageTag, "latest", "Do not replace latest through an ad-hoc image tag");
    if (input.component === "all") assert.equal(input.imageTag, version, "Full release image tag must match the chart version");
  }
  if (input.distTag) {
    assert.match(input.distTag, /^[a-z][a-z0-9-]*$/);
    assert.ok(!version.includes("-") || input.distTag !== "latest", "Prereleases must not replace latest");
  }
  return { sha, short_sha: sha.slice(0, 12), version, prerelease: String(version.includes("-")) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = releaseSource({ repository: process.env.GITHUB_REPOSITORY, allowedRepository: process.env.RELEASE_REPOSITORY,
      workflowRef: process.env.GITHUB_REF, workflowSha: process.env.GITHUB_SHA, sourceRef: process.env.RELEASE_SOURCE_REF,
      imageTag: process.env.RELEASE_IMAGE_TAG, chartVersion: process.env.RELEASE_CHART_VERSION, distTag: process.env.RELEASE_DIST_TAG, component: process.env.RELEASE_COMPONENT });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(""));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
