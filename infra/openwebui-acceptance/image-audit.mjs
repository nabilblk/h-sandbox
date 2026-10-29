import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { check } from "../acceptance/context.mjs";

export function inspectImageAudit(report) {
  check(report?.SchemaVersion === 2 && typeof report.ArtifactName === "string" && Array.isArray(report.Results), "Invalid Trivy image report");
  const findings = report.Results.flatMap(result => result.Vulnerabilities ?? []);
  const serious = findings.filter(item => ["HIGH", "CRITICAL"].includes(item.Severity));
  const fixable = serious.filter(item => typeof item.FixedVersion === "string" && item.FixedVersion.trim());
  return { total: findings.length, serious: serious.length, fixableSerious: fixable.length,
    fixes: fixable.map(item => ({ id: item.VulnerabilityID, package: item.PkgName, installed: item.InstalledVersion, fixed: item.FixedVersion })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = inspectImageAudit(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
  console.log(JSON.stringify(result, null, 2));
  if (result.fixableSerious > 0) process.exitCode = 1;
}
