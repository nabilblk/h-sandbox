import assert from "node:assert/strict";
import test from "node:test";
import { bracesException, evaluateAudit } from "./check-dependency-audit.mjs";

const options = () => ({ exitCode: 1, versions: { ...bracesException.versions }, now: Date.parse("2026-10-14T19:00:00Z") });
const report = () => ({
  advisories: {
    "1240992": {
      github_advisory_id: bracesException.advisory, module_name: "braces", severity: "high",
      findings: [{ version: "3.0.3", paths: [...bracesException.paths], dev: true, optional: false, bundled: false }]
    }
  },
  metadata: { vulnerabilities: { high: 1, critical: 0, moderate: 9 } }
});
const advisory = value => value.advisories["1240992"];

test("accepts only the approved exact exposure and reports the unresolved risk", () => {
  const message = evaluateAudit(report(), options());
  assert.match(message, /Accepted ONLY GHSA-vfj7-8cjw-p6xm/);
  assert.match(message, /unpatched/);
  assert.match(message, /9 moderate/);
  assert.match(message, /2026-11-13T00:00:00Z/);
  const reordered = report();
  advisory(reordered).findings[0].paths.reverse();
  assert.equal(evaluateAudit(reordered, options()), message);
});

test("approval lasts at most 30 days and expires without a CI configuration change", () => {
  const from = Date.parse(bracesException.approvedAt);
  const to = Date.parse(bracesException.expiresAt);
  assert.ok(to - from <= 30 * 24 * 60 * 60 * 1000);
  for (const now of [from - 1, to, to + 1, NaN, Infinity]) {
    assert.throws(() => evaluateAudit(report(), { ...options(), now }), /not current/);
  }
  evaluateAudit(report(), { ...options(), now: to - 1 });
});

test("every tested framework pin is mandatory", () => {
  for (const key of Object.keys(bracesException.versions)) {
    for (const value of [undefined, "999.0.0", `^${bracesException.versions[key]}`]) {
      const current = options();
      current.versions[key] = value;
      assert.throws(() => evaluateAudit(report(), current), /versions changed/);
    }
  }
});

test("other high and critical advisories are never exempted", () => {
  for (const severity of ["high", "critical"]) {
    const value = report();
    value.advisories.extra = { github_advisory_id: "GHSA-another", module_name: "other", severity, findings: [] };
    value.metadata.vulnerabilities[severity]++;
    assert.throws(() => evaluateAudit(value, options()), /Unaccepted/);
  }
  const changed = report();
  advisory(changed).severity = "critical";
  changed.metadata.vulnerabilities = { high: 0, critical: 1, moderate: 9 };
  assert.throws(() => evaluateAudit(changed, options()), /Unaccepted critical/);
});

test("the exact advisory, dependency scope and both paths must remain unchanged", () => {
  const mutations = [
    item => { item.github_advisory_id = "GHSA-other"; },
    item => { item.module_name = "other"; },
    item => { item.findings[0].version = "3.0.2"; },
    item => { item.findings[0].dev = false; },
    item => { item.findings[0].optional = true; },
    item => { item.findings[0].bundled = true; },
    item => { item.findings[0].paths.push("apps__api>braces"); },
    item => { item.findings[0].paths.pop(); },
    item => { item.findings[0].paths.push(item.findings[0].paths[0]); },
    item => { item.findings[0].paths = [null]; },
    item => { item.findings = []; },
    item => { delete item.findings[0].dev; }
  ];
  for (const mutate of mutations) {
    const value = report(); mutate(advisory(value));
    assert.throws(() => evaluateAudit(value, options()), /Unaccepted|scope changed|paths changed|Missing/);
  }
});

test("invalid, partial and failed registry responses fail closed", () => {
  for (const value of [null, [], {}, { error: "registry unavailable" }, { advisories: [] }]) {
    assert.throws(() => evaluateAudit(value, options()), /Invalid audit/);
  }
  for (const count of [undefined, -1, "1", 2]) {
    const value = report(); value.metadata.vulnerabilities.high = count;
    assert.throws(() => evaluateAudit(value, options()), /Invalid|Incomplete/);
  }
  for (const exitCode of [null, 2, 127]) {
    assert.throws(() => evaluateAudit(report(), { ...options(), exitCode }), /process failed/);
  }
  const unknown = report(); advisory(unknown).severity = "unknown";
  assert.throws(() => evaluateAudit(unknown, options()), /Unrecognized/);
});

test("an absent or duplicated finding requires removing or reassessing the exception", () => {
  const absent = report(); absent.advisories = {}; absent.metadata.vulnerabilities.high = 0;
  assert.throws(() => evaluateAudit(absent, { ...options(), exitCode: 0 }), /obsolete exception/);
  const duplicate = report(); duplicate.advisories.extra = structuredClone(advisory(duplicate));
  duplicate.metadata.vulnerabilities.high = 2;
  assert.throws(() => evaluateAudit(duplicate, options()), /duplicated/);
});
