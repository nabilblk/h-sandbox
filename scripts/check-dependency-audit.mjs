import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function evaluateAudit(report, { exitCode }) {
  if (!record(report) || report.error || !record(report.advisories)) {
    throw new Error("Invalid audit report; registry errors cannot authorize a release.");
  }
  if (exitCode !== 0 && exitCode !== 1) throw new Error(`Audit process failed (${exitCode}).`);
  const counts = report.metadata?.vulnerabilities;
  if (!record(counts) || ["high", "critical", "moderate"].some(level => !Number.isInteger(counts[level]) || counts[level] < 0)) {
    throw new Error("Invalid audit vulnerability counts.");
  }
  const advisories = Object.values(report.advisories);
  if (advisories.some(item => !record(item) || !["info", "low", "moderate", "high", "critical"].includes(item.severity))) {
    throw new Error("Unrecognized audit advisory format.");
  }
  for (const level of ["high", "critical"]) {
    if (counts[level] !== advisories.filter(item => item.severity === level).length) {
      throw new Error(`Incomplete audit report for ${level} findings.`);
    }
  }
  // The retired exception is documented in docs/security/dependency-audit-2026-10.md.
  // A recurrence of that advisory requires a new review, not a silent exemption.
  const rejected = advisories.find(item => ["high", "critical"].includes(item.severity));
  if (rejected) {
    throw new Error(`Unaccepted ${rejected.severity} finding: ${rejected.github_advisory_id ?? rejected.module_name ?? "unknown"}.`);
  }
  if (exitCode !== 0) throw new Error("Audit process failed despite no reported high/critical findings.");
  return `No high or critical findings; no exceptions. ${counts.moderate} moderate findings remain below the unchanged high-severity gate.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = spawnSync("pnpm", ["audit", "--audit-level=high", "--json"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Audit terminated by ${result.signal}.`);
    console.warn(evaluateAudit(JSON.parse(result.stdout), { exitCode: result.status }));
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
