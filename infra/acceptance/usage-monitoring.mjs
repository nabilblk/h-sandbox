import { randomBytes } from "node:crypto";
import { check } from "./context.mjs";
import { applyOwned, platformNamespace } from "./operator.mjs";

export function configureUsageMonitoring(ctx, values) {
  ctx.guard();
  applyOwned(ctx, { apiVersion: "v1", kind: "Secret", metadata: { name: "acceptance-metrics", namespace: platformNamespace },
    type: "Opaque", stringData: { token: randomBytes(32).toString("hex") } }, "metrics-secret.json");
  values.metrics = { enabled: true, host: "127.0.0.1", port: 9130, tokenSecret: { name: "acceptance-metrics", key: "token" } };
}

export function verifyUsageMonitoring(ctx) {
  ctx.guard();
  // Operator-only pod inspection, never sandbox execution or a public endpoint.
  const script = `const target = 'http://127.0.0.1:9130/metrics';
    const statuses = [];
    for (const token of ['', 'incorrect', process.env.OPERATOR_METRICS_TOKEN]) {
      const response = await fetch(target, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(5000) });
      statuses.push(response.status);
      if (response.ok && !(await response.text()).includes('harakiri_observer_enabled')) throw new Error('Missing metrics');
    }
    console.log(JSON.stringify(statuses));`;
  for (const name of ["harakiri-api", "harakiri-scheduler"]) {
    const statuses = JSON.parse(ctx.k(["-n", platformNamespace, "exec", `deployment/${name}`, "--", "node", "--input-type=module", "-e", script]));
    check(JSON.stringify(statuses) === "[401,401,200]", "Private live metrics authentication failed");
  }
  return { authenticatedMetrics: true };
}
