import assert from "node:assert/strict";
import test from "node:test";
import { compileEgressPolicy, normalizeEgressTarget } from "./index.js";

test("compileEgressPolicy keeps open mode as allow-all without a provider policy", () => {
  const policy = compileEgressPolicy();
  assert.equal(policy.mode, "open");
  assert.equal(policy.compiledPolicy, null);
  assert.deepEqual(policy.rules, []);
});

test("compileEgressPolicy expands presets into deny-by-default allow rules", () => {
  const policy = compileEgressPolicy({ mode: "restricted", presets: ["python-package-install"], allow: ["API.GitHub.com."] });
  assert.equal(policy.compiledPolicy?.defaultAction, "deny");
  assert.ok(policy.rules.some((rule) => rule.target === "pypi.org" && rule.presetId === "python-package-install"));
  assert.ok(policy.rules.some((rule) => rule.target === "api.github.com"));
});

test("compileEgressPolicy blocks outbound access with an empty deny-default policy", () => {
  const policy = compileEgressPolicy({ mode: "blocked", allow: ["github.com"] });
  assert.deepEqual(policy.compiledPolicy, { defaultAction: "deny", egress: [] });
  assert.deepEqual(policy.rules, []);
});

test("normalizeEgressTarget rejects URLs, IPs, and bare wildcards", () => {
  assert.equal(normalizeEgressTarget("*.pythonhosted.org."), "*.pythonhosted.org");
  assert.throws(() => normalizeEgressTarget("https://api.github.com"), /use a hostname/);
  assert.throws(() => normalizeEgressTarget("127.0.0.1"), /IP addresses/);
  assert.throws(() => normalizeEgressTarget("*"), /bare wildcards/);
});
