import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
const chart = new URL("../charts/harakiri", import.meta.url).pathname;
const render = (...args) => spawnSync("helm", ["template", "usage-test", chart, "-n", "usage-test", ...args], { encoding: "utf8" });

test("default chart has no metrics listener, monitor CRD, service or credentials", () => {
  const result = render(); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OPERATOR_METRICS_ENABLED: "0"/);
  assert.doesNotMatch(result.stdout, /kind: PodMonitor|name: metrics|name: OPERATOR_METRICS_TOKEN/);
});
test("enabled monitoring requires a private secret and explicit network exposure", () => {
  assert.notEqual(render("--set", "metrics.enabled=true").status, 0);
  const flags = ["--set", "metrics.enabled=true", "--set", "metrics.tokenSecret.name=operator-metrics"];
  const local = render(...flags); assert.equal(local.status, 0, local.stderr);
  assert.match(local.stdout, /OPERATOR_METRICS_HOST: "127.0.0.1"/);
  assert.notEqual(render(...flags, "--set", "metrics.podMonitor.enabled=true").status, 0);
  assert.notEqual(render(...flags, "--set", "metrics.host=0.0.0.0", "--set", "metrics.podMonitor.enabled=true").status, 0);
  const monitor = render(...flags, "--set", "metrics.host=0.0.0.0", "--set", "metrics.podMonitor.enabled=true", "--api-versions", "monitoring.coreos.com/v1/PodMonitor");
  assert.equal(monitor.status, 0, monitor.stderr);
  assert.match(monitor.stdout, /kind: PodMonitor/); assert.match(monitor.stdout, /authorization:\n\s+type: Bearer/);
  for (const document of monitor.stdout.split("---")) if (/kind: (Service|Ingress)\n/.test(document)) assert.doesNotMatch(document, /metrics|9130/);
  assert.notEqual(render("--set", "usage.retentionDays=0").status, 0);
  assert.notEqual(render("--set", "usage.retentionDays=31").status, 0);
  assert.notEqual(render("--set", "usage.retentionDays=1.5").status, 0);
  assert.notEqual(render(...flags, "--set", "metrics.tokenSecret.key=").status, 0);
  for (const port of [80, 8080, 65536, "not-a-port"]) assert.notEqual(render(...flags, "--set", `metrics.port=${port}`).status, 0);
});
