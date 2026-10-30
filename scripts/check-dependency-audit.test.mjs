import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "./check-dependency-audit.mjs";

const report = () => ({ advisories: {}, metadata: { vulnerabilities: { high: 0, critical: 0, moderate: 14 } } });

test("accepts a valid clean high-severity audit without any exception", () => {
  assert.match(evaluateAudit(report(), { exitCode: 0 }), /no exceptions.*14 moderate/);
});

test("rejects every high and critical finding, including the retired braces exception", () => {
  for (const severity of ["high", "critical"]) {
    for (const id of ["GHSA-new", "GHSA-vfj7-8cjw-p6xm"]) {
      const value = report();
      value.advisories.one = { github_advisory_id: id, severity };
      value.metadata.vulnerabilities[severity] = 1;
      for (const exitCode of [0, 1]) assert.throws(() => evaluateAudit(value, { exitCode }), /Unaccepted/);
    }
  }
});

test("invalid, incomplete and failed registry responses fail closed", () => {
  for (const value of [null, [], {}, { error: "registry unavailable" }, { advisories: [] }]) {
    assert.throws(() => evaluateAudit(value, { exitCode: 0 }), /Invalid audit/);
  }
  for (const count of [undefined, -1, "0", 2]) {
    const value = report(); value.metadata.vulnerabilities.high = count;
    assert.throws(() => evaluateAudit(value, { exitCode: 0 }), /Invalid|Incomplete/);
  }
  for (const exitCode of [null, 1, 2, 127]) {
    assert.throws(() => evaluateAudit(report(), { exitCode }), /process failed/);
  }
  const unknown = report(); unknown.advisories.one = { severity: "unknown" };
  assert.throws(() => evaluateAudit(unknown, { exitCode: 0 }), /Unrecognized/);
  const hidden = report(); hidden.advisories.one = { severity: "high" };
  assert.throws(() => evaluateAudit(hidden, { exitCode: 0 }), /Incomplete/);
});
