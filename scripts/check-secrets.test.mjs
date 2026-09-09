import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";

test("scanner detects fresh keys and fixture exceptions do not apply in other files", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-scanner-test-"));
  try {
    // Generated syntactic tokens are never registered with an authentication service.
    const token = `hk_live_${randomBytes(28).toString("base64url")}`;
    fs.mkdirSync(path.join(dir, "apps/api/src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "apps/api/src/seed.ts"), token);
    fs.writeFileSync(path.join(dir, "unexpected.txt"), "hk_live_demo_lyra_labs_" + "0".repeat(34));
    const report = path.join(dir, "findings.json");
    const result = spawnSync("gitleaks", ["dir", dir, "--config", path.join(root, ".gitleaks.toml"), "--redact=100", "--no-banner", "--report-format=json", "--report-path", report], { encoding: "utf8" });
    assert.equal(result.status, 1, "Scanner must detect syntactic keys, including in a file with a narrow fixture exception");
    const findings = JSON.parse(fs.readFileSync(report, "utf8"));
    assert.equal(findings.filter((finding) => finding.RuleID === "harakiri-api-key").length, 2);
    assert.ok(!fs.readFileSync(report, "utf8").includes(token), "Reports must be redacted");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("scanner creates private evidence directories in a minimal checkout", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-scanner-checkout-"));
  const env = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  try {
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(path.join(root, "scripts/check-secrets.mjs"), path.join(dir, "scripts/check-secrets.mjs"));
    fs.copyFileSync(path.join(root, ".gitleaks.toml"), path.join(dir, ".gitleaks.toml"));
    fs.writeFileSync(path.join(dir, "tracked.txt"), "Contributor fixture\n");
    for (const args of [["init", "--quiet"], ["add", "tracked.txt"], ["-c", "user.name=Scanner fixture", "-c", "user.email=scanner@example.test", "commit", "--quiet", "-m", "fixture"]]) {
      const result = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.existsSync(path.join(dir, "docs/artifacts")), false);
    const result = spawnSync(process.execPath, ["scripts/check-secrets.mjs", "--history"], { cwd: dir, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const artifacts = path.join(dir, "docs/artifacts");
    assert.equal(fs.statSync(artifacts).mode & 0o777, 0o700);
    const reports = fs.readdirSync(artifacts);
    assert.equal(reports.length, 1);
    for (const mode of ["tree", "history"]) {
      const report = path.join(artifacts, reports[0], `${mode}.json`);
      assert.deepEqual(JSON.parse(fs.readFileSync(report, "utf8")), []);
      assert.equal(fs.statSync(report).mode & 0o777, 0o600);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
