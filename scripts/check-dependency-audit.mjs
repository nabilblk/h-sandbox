import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Approved by nabilblk on 2026-10-14. This accepts a bounded, documented risk;
// it does not patch braces or protect independent consumers' local backends.
export const bracesException = Object.freeze({
  advisory: "GHSA-vfj7-8cjw-p6xm",
  approvedAt: "2026-10-14T00:00:00Z",
  expiresAt: "2026-11-13T00:00:00Z",
  paths: Object.freeze([
    "packages__deepagents>deepagents>fast-glob>micromatch>braces",
    "packages__deepagents>deepagents>micromatch>braces"
  ]),
  versions: Object.freeze({
    peer: "1.14.0", development: "1.14.0", framework: "1.14.0",
    fastGlob: "3.3.3", micromatch: "4.0.8", braces: "3.0.3",
    fastGlobMicromatch: "4.0.8", fastGlobBraces: "3.0.3"
  })
});

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function evaluateAudit(report, { exitCode, versions, now = Date.now() }) {
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
  if (!Number.isFinite(now) || now < Date.parse(bracesException.approvedAt) || now >= Date.parse(bracesException.expiresAt)) {
    throw new Error(`braces exception is not current; review required before ${bracesException.expiresAt}.`);
  }
  if (!record(versions) || Object.entries(bracesException.versions).some(([key, value]) => versions[key] !== value)) {
    throw new Error("Framework dependency versions changed; reassess the braces exception.");
  }

  let accepted = false;
  for (const advisory of advisories.filter(item => ["high", "critical"].includes(item.severity))) {
    if (advisory.github_advisory_id !== bracesException.advisory || advisory.module_name !== "braces" || advisory.severity !== "high") {
      throw new Error(`Unaccepted ${advisory.severity} finding: ${advisory.github_advisory_id ?? advisory.module_name ?? "unknown"}.`);
    }
    if (accepted || !Array.isArray(advisory.findings) || advisory.findings.length === 0) {
      throw new Error("Missing or duplicated braces findings; reassessment required.");
    }
    const paths = [];
    for (const finding of advisory.findings) {
      if (!record(finding) || finding.version !== "3.0.3" || finding.dev !== true || finding.optional !== false || finding.bundled !== false ||
          !Array.isArray(finding.paths) || finding.paths.length === 0 || finding.paths.some(path => typeof path !== "string")) {
        throw new Error("braces finding scope changed; reassessment required.");
      }
      paths.push(...finding.paths);
    }
    if (JSON.stringify(paths.sort()) !== JSON.stringify([...bracesException.paths].sort())) {
      throw new Error("braces dependency paths changed; reassessment required.");
    }
    accepted = true;
  }
  if (!accepted) throw new Error("braces finding is absent; remove or reassess the obsolete exception.");
  return `Accepted ONLY ${bracesException.advisory} in two tested development paths until ${bracesException.expiresAt}. ` +
    `The dependency remains unpatched. ${counts.moderate} moderate findings remain below the unchanged high-severity gate.`;
}

function installedVersions() {
  const manifest = JSON.parse(readFileSync(new URL("../packages/deepagents/package.json", import.meta.url), "utf8"));
  const require = createRequire(new URL("../packages/deepagents/package.json", import.meta.url));
  const framework = createRequire(require.resolve("deepagents"));
  const matcher = createRequire(framework.resolve("micromatch"));
  const fastGlob = createRequire(framework.resolve("fast-glob"));
  const nestedMatcher = createRequire(fastGlob.resolve("micromatch"));
  return {
    peer: manifest.peerDependencies.deepagents, development: manifest.devDependencies.deepagents,
    framework: require("deepagents/package.json").version,
    fastGlob: framework("fast-glob/package.json").version,
    micromatch: framework("micromatch/package.json").version,
    braces: matcher("braces/package.json").version,
    fastGlobMicromatch: fastGlob("micromatch/package.json").version,
    fastGlobBraces: nestedMatcher("braces/package.json").version
  };
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
    console.warn(evaluateAudit(JSON.parse(result.stdout), { exitCode: result.status, versions: installedVersions() }));
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
