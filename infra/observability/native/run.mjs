import fs from "node:fs";
import { totalmem, freemem } from "node:os";
import { context, check, origins, until } from "../../acceptance/context.mjs";
import { install } from "../../acceptance/install.mjs";
import { operatorSession } from "../../acceptance/browser.mjs";
import { importAcceptanceTemplate } from "../../acceptance/first-task.mjs";
import { finishReceipt, publicFailure } from "../../acceptance/receipt.mjs";
import { configuredComplete, diagnosticLocation, gateReceipt, nativeGates, workloadDiagnostics } from "./contracts.mjs";
import { componentReplicas, installCandidate } from "./install.mjs";
import { coldRecovery } from "./recovery.mjs";
import { exerciseAgents } from "./agents.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = { status: "running", source: process.env.GITHUB_SHA, runId: ctx.identity.id,
  startedAt: new Date().toISOString(), results: [],
  boundary: "Native sandbox and real local-model workflows, plus same-version cold recovery onto fresh storage. Not physical-erasure or OpenShift evidence. Image audit is a separate release gate." };
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
let activeGate, operator, candidate, template, telemetryKey;

async function gate(name, action) {
  check(nativeGates.includes(name), "Unknown native observability gate");
  activeGate = name;
  ctx.guard();
  const disk = fs.statfsSync(ctx.identity.directory);
  check(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "Observability runner has less than 2 GiB disk headroom");
  console.log(`Observability acceptance: ${name}`);
  const started = Date.now();
  await action();
  receipt.results.push(gateReceipt(name, Date.now() - started));
  publish();
}

async function investigate(runId) {
  const { page } = operator;
  await page.goto(`${origins.web}/#dashboard/runs?run=${encodeURIComponent(runId)}`);
  await page.getByRole("heading", { name: "Native validation and repair", exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "Sensitive content", exact: true }).check();
  await page.getByRole("button", { name: "Review errors (1)", exact: true }).click();
  await page.getByRole("tabpanel").getByText("Synthetic validation failed", { exact: false }).waitFor();
  await page.screenshot({ path: "telemetry-native-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Native run viewer overflows mobile viewport");
  const mobileLog = page.getByRole("tabpanel").getByText("Synthetic validation failed", { exact: false });
  await mobileLog.scrollIntoViewIfNeeded();
  check(await mobileLog.isVisible(), "Correlated log is not visible in the mobile inspector");
  await page.screenshot({ path: "telemetry-native-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function revoke(key) {
  if (!key || key.revoked) return;
  await operator.request(`/v1/api-keys/${encodeURIComponent(key.id)}`, "DELETE");
  const response = await fetch(`${origins.api}/v1/sandboxes`, {
    headers: { authorization: `Bearer ${key.token}` }, signal: AbortSignal.timeout(10_000)
  });
  check(response.status === 401, "Revoked acceptance key was still accepted");
  key.revoked = true;
}

async function investigateAgent(runId, stepId) {
  const { page } = operator;
  await page.goto(`${origins.web}/#dashboard/runs?run=${encodeURIComponent(runId)}&step=${encodeURIComponent(stepId)}`);
  await page.getByRole("heading", { name: "Real LangChain agent with sandbox tools", exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "Sensitive content", exact: true }).check();
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await page.getByRole("region", { name: "Generation details", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  for (const label of ["Framework input", "Framework output"]) {
    const payload = page.getByRole("region", { name: label, exact: true });
    await payload.waitFor();
    check((await payload.locator("code").innerText()).trim().length > 0, `Real-agent ${label} is empty`);
  }
  await page.screenshot({ path: "telemetry-real-agent-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Real-agent viewer overflows mobile viewport");
  await page.screenshot({ path: "telemetry-real-agent-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

try {
  publish();
  await gate("published-installation", () => install(ctx));
  await gate("source-candidate", async () => {
    candidate = await installCandidate(ctx);
    receipt.candidate = { source: candidate.source, images: candidate.images, tarballSha256: candidate.tarballSha256, published: false };
  });
  await gate("oidc-policy", async () => {
    operator = await operatorSession(ctx);
    const policy = await operator.request("/v1/observability/policy", "PATCH", { enabled: true, allowContent: true });
    check(policy.enabled && policy.allowContent && policy.operatorAllowsContent, "Native observability policy was not enabled");
    const created = await operator.request("/v1/api-keys", "POST", {
      name: "native-observability", scopes: ["sandboxes:read", "sandboxes:write", "templates:read", "org:read", "runs:read", "runs:write", "runs:content"],
      expiresAt: new Date(Date.now() + 3600_000).toISOString()
    }, 201);
    telemetryKey = { id: created.key.id, token: created.token };
    ctx.save("telemetry-client-key.json", telemetryKey);
  });
  await gate("template-import", async () => { template = await importAcceptanceTemplate(ctx, operator.client); });
  const { exerciseNative } = await import(candidate.fixture);
  await exerciseNative({ apiUrl: origins.api, apiKey: telemetryKey.token, template, runId: ctx.identity.id,
    producerSource: fs.readFileSync(new URL("./producer.py", import.meta.url), "utf8") }, gate, {
    browser: investigate,
    agents: async (client, sandbox) => { receipt.agents = await exerciseAgents(ctx, client, sandbox, telemetryKey.token, gate, investigateAgent); },
    collector: (enabled) => componentReplicas(ctx, "collector", Number(enabled)),
    recover: async () => { receipt.recovery = await coldRecovery(ctx, operator); },
    restart: async () => {
      for (const component of ["collector", "logs", "traces"]) await componentReplicas(ctx, component, 0);
      for (const component of ["logs", "traces", "collector"]) await componentReplicas(ctx, component, 1);
    }
  });
  await gate("key-revocation", () => revoke(telemetryKey));
  check(configuredComplete(receipt.results), "Native observability gate set is incomplete");
  receipt.status = "configured_gates_passed";
} catch (error) {
  ctx.save("telemetry-native-failure.json", { gate: activeGate, message: error.message, stack: error.stack });
  receipt.hostMemory = { totalBytes: totalmem(), freeBytes: freemem() };
  try { receipt.workloads = workloadDiagnostics(JSON.parse(ctx.k(["-n", "harakiri-preview", "get", "pods", "-o", "json"]))); }
  catch { receipt.workloadDiagnostics = "unavailable"; }
  receipt.results.push({ name: activeGate, status: "failed", failure: { ...publicFailure(error), ...diagnosticLocation(error) } });
  receipt.status = "failed";
  process.exitCode = 1;
  console.error(`Observability acceptance failed: ${activeGate}`);
} finally {
  await finishReceipt(receipt, {
    capacity: async () => {
      if (!operator) return;
      await until("Observability owned runtime capacity released", async () => (await operator.client.capacity()).capacity.inUse === 0, 180_000);
    },
    telemetryKey: () => revoke(telemetryKey),
    operatorKey: async () => { if (operator) await revoke(ctx.read("client-key.json")); },
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
