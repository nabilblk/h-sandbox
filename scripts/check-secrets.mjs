import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

process.umask(0o077);
const root = path.resolve(import.meta.dirname, "..");
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("Git inventory failed; no scan result is available.");
  return result.stdout;
};
const history = process.argv.includes("--history");
if (process.argv.slice(2).some((arg) => arg !== "--history")) throw new Error("Usage: node scripts/check-secrets.mjs [--history]");
const version = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
if (version.status !== 0 || version.stdout.trim() !== "8.30.1") throw new Error("Install Gitleaks 8.30.1 before scanning. No clean result was produced.");
const artifacts = path.join(root, "docs/artifacts");
fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const evidence = fs.mkdtempSync(path.join(artifacts, "secret-scan-"));
const tree = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-publishable-"));
try {
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  for (const file of files) {
    const source = path.join(root, file);
    if (!fs.existsSync(source)) continue; // Tracked deletion in the candidate tree.
    if (!fs.lstatSync(source).isFile()) throw new Error(`Review non-regular tracked file before publication: ${file}`);
    const target = path.join(tree, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const modes = history ? ["tree", "history"] : ["tree"];
  let failed = false;
  for (const mode of modes) {
    const log = fs.openSync(path.join(evidence, `${mode}.log`), "w", 0o600);
    const report = path.join(evidence, `${mode}.json`);
    let result;
    try {
      result = spawnSync("gitleaks", [mode === "tree" ? "dir" : "git", ".", "--config", path.join(root, ".gitleaks.toml"), "--redact=100", "--no-banner", "--report-format=json", "--report-path", report, "--max-decode-depth=2", "--max-archive-depth=2", ...(mode === "history" ? ["--log-opts=--all"] : [])], { cwd: mode === "tree" ? tree : root, stdio: ["ignore", log, log], timeout: 600_000 });
    } finally { fs.closeSync(log); }
    const findings = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : [];
    const summary = { mode, scanner: "8.30.1", head: git("rev-parse", "HEAD").trim(), trackedFiles: files.length, refs: history ? git("for-each-ref", "--format=%(refname)").trim().split("\n").length : null, exitCode: result.status, findings: findings.length, at: new Date().toISOString() };
    fs.writeFileSync(path.join(evidence, `${mode}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    failed ||= result.status !== 0;
  }
  console.log(`Private redacted evidence: ${path.relative(root, evidence)}. Untracked files, remote assets, image layers and media require separate review.`);
  if (failed) process.exitCode = 1;
} finally {
  fs.rmSync(tree, { recursive: true, force: true });
}
