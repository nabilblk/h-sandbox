import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { releaseSource } from "./check-release-source.mjs";

test("publication validates the repository, workflow ref, source ancestry, version and channel", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-release-source-"));
  const env = { ...process.env, HOME: root, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Release Test");
    git("config", "user.email", "release@example.test");
    for (const file of ["package.json", "apps/api/package.json", "apps/web/package.json", "packages/shared/package.json", "packages/sdk/package.json", "packages/cli/package.json"]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), JSON.stringify({ version: "0.5.0-rc.5" }));
    }
    git("add", "."); git("commit", "-m", "Reviewed candidate");
    const sha = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", sha);
    git("tag", "v0.5.0-rc.5");
    const input = { repository: "example/sandbox", allowedRepository: "example/sandbox", workflowRef: "refs/heads/main", workflowSha: sha, sourceRef: "v0.5.0-rc.5", distTag: "next" };
    assert.deepEqual(releaseSource(input, root), { sha, short_sha: sha.slice(0, 12), version: "0.5.0-rc.5", prerelease: "true" });
    assert.equal(releaseSource({ ...input, sourceRef: "" }, root).sha, sha);
    assert.throws(() => releaseSource({ ...input, repository: "fork/sandbox" }, root), /repository/);
    assert.throws(() => releaseSource({ ...input, allowedRepository: "" }, root), /repository/);
    assert.throws(() => releaseSource({ ...input, workflowRef: "refs/tags/v0.5.0-rc.5" }, root), /main/);
    assert.throws(() => releaseSource({ ...input, workflowRef: "refs/pull/1/merge" }, root), /main/);
    for (const sourceRef of ["main", "HEAD", "--help", "v0.5.0;exit 0", "$(echo unsafe)"]) assert.throws(() => releaseSource({ ...input, sourceRef }, root), /version tag or full commit/);
    assert.throws(() => releaseSource({ ...input, distTag: "latest" }, root), /Prereleases/);
    assert.throws(() => releaseSource({ ...input, chartVersion: "0.4.0" }, root), /Chart override/);
    assert.throws(() => releaseSource({ ...input, imageTag: "latest" }, root), /ad-hoc/);
    assert.throws(() => releaseSource({ ...input, component: "all", imageTag: "only-a-web-hotfix" }, root), /Full release/);
    assert.throws(() => releaseSource({ ...input, imageTag: "invalid\nargument" }, root));
    git("tag", "v0.4.0");
    assert.throws(() => releaseSource({ ...input, sourceRef: "v0.4.0" }, root), /does not match/);
    fs.writeFileSync(path.join(root, "unreviewed.txt"), "not on main");
    git("add", "."); git("commit", "-m", "Unreviewed source");
    assert.throws(() => releaseSource({ ...input, sourceRef: git("rev-parse", "HEAD") }, root), /not part of origin\/main/);
    fs.writeFileSync(path.join(root, "packages/cli/package.json"), JSON.stringify({ version: "0.4.0" }));
    git("add", "."); git("commit", "-m", "Mismatched versions");
    const mismatched = git("rev-parse", "HEAD"); git("update-ref", "refs/remotes/origin/main", mismatched);
    assert.throws(() => releaseSource({ ...input, sourceRef: mismatched }, root), /versions must match/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
