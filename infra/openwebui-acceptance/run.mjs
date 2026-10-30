import fs from "node:fs";
import { context, check, until } from "../acceptance/context.mjs";
import { install } from "../acceptance/install.mjs";
import { operatorSession } from "../acceptance/browser.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { installWorkbenchCandidate } from "../workbench-acceptance/candidate.mjs";
import { assertPortsFree, buildImages, installPrivateRegistry, startApplications, cleanupDocker, ownedDocker } from "./stack.mjs";
import { signup, configureTerminal, selectTerminal, chatWitness, runChat, shell, previews, transfersAndIsolation, browserDiagnostics } from "./browser.mjs";
import { restart, replaceRuntime, twoUsersAndQuota, revokeAndRecover } from "./recovery.mjs";
import { gates, publicReceipt, safeFailure } from "./receipt.mjs";
import { liveFiles, transferFailures, svgIsolation, relativeAssetBoundary } from "./files.mjs";
import { diagnose } from "./diagnostics.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = { status: "running", source: process.env.GITHUB_SHA, runId: ctx.identity.id, results: [] };
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(publicReceipt(receipt), null, 2)}\n`, { mode: 0o600 });
const template = `acceptance-open-terminal-${ctx.identity.id}`;
let activeGate, candidate, images, image, operator, credentials, page, admin, witness;
let scenarioFailed = false;
async function gate(name, action) {
  check(gates.has(name), "Unknown OpenWebUI acceptance gate");
  activeGate = name;
  ctx.guard();
  console.log(`OpenWebUI acceptance: ${name}`);
  const evidence = await action();
  receipt.results.push({ gate: name, status: "passed", evidence });
  publish();
}
async function scenario(name, action) {
  try { await gate(name, action); }
  catch (error) {
    scenarioFailed = true;
    receipt.results.push({ gate: name, status: "failed", failure: publicFailure(error) });
    console.error(`OpenWebUI acceptance failed: ${name} ${JSON.stringify(safeFailure(publicFailure(error)))}`);
    console.log(`OpenWebUI protocol counters: ${JSON.stringify(witness.state)}`);
    await diagnose(ctx, operator.client, template);
    await browserDiagnostics(page).catch(() => {});
    publish();
  }
}
try {
  publish();
  await assertPortsFree();
  await gate("published-installation", () => install(ctx));
  await gate("source-candidate", async () => { candidate = await installWorkbenchCandidate(ctx); receipt.images = candidate.images; });
  await gate("candidate-images", async () => { images = await buildImages(ctx); receipt.images = { ...receipt.images, ...images }; });
  await gate("private-registry", async () => { image = await installPrivateRegistry(ctx, candidate, images); receipt.images = { ...receipt.images, ...images }; });
  await gate("oidc-onboarding", async () => { operator = await operatorSession(ctx); });
  await gate("native-template", async () => {
    await operator.client.createTemplate({ id: template, name: "Open Terminal acceptance", image, visibility: "private", cpuCount: 1, memoryMb: 1024,
      workdir: "/workspace", defaultEntrypoint: ["/usr/local/bin/harakiri-open-terminal"], runtimeFamily: "custom" });
    const { build } = await operator.client.createTemplateBuild(template, { sourceType: "image", imageDestination: image });
    await until("Native template import and pull preflight", async () => {
      const result = await operator.client.getTemplateBuild(build.id);
      check(!["failed", "canceled"].includes(result.build.status), "Native template import failed");
      return result.build.status === "success";
    }, 600000);
    return { ready: true };
  });
  await gate("applications", async () => { credentials = await startApplications(ctx, images, template); });
  await gate("native-admin-setup", async () => {
    page = await operator.browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(45000);
    witness = chatWitness(page);
    admin = await signup(page, credentials);
    await configureTerminal(page, credentials);
    check((await operator.client.capacity()).capacity.inUse === 0, "Discovery allocated a runtime");
    return { discoveryNoAllocation: true };
  });
  await gate("native-cold-start", async () => {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/terminals/harakiri/files/list", { timeout: 300000 }),
      selectTerminal(page)
    ]);
    console.log(`OpenWebUI cold-start HTTP status: ${response.status()}`);
    check(response.ok() && !(await response.finished()), "Native cold-start file listing failed");
    await until("Native file browser provisioned exactly one runtime", async () => (await operator.client.capacity()).capacity.inUse === 1, 300000);
    return { ready: true, noDuplicateRuntime: true };
  });
  await scenario("native-model-artifacts", () => runChat(page, witness));
  // Keep a failed model scenario failed, but stop its producer and still inspect
  // the independent transport/recovery features. Never seed replacement artifacts.
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  if (await stop.isVisible()) { await stop.click(); await stop.waitFor({ state: "hidden" }); }
  await scenario("native-shell", () => shell(page, witness));
  await scenario("native-previews", () => previews(page));
  await scenario("native-relative-assets-limit", () => relativeAssetBoundary(page));
  await scenario("native-transfers-isolation", () => transfersAndIsolation(page));
  await scenario("native-live-files", () => liveFiles(page, operator.client, template));
  await scenario("native-transfer-failures", () => transferFailures(page));
  await scenario("native-svg-mobile", () => svgIsolation(page));
  await scenario("adapter-restart", () => restart(ctx, operator.client, template, page));
  await scenario("grant-revocation-recovery", () => revokeAndRecover(ctx, operator.client, template, page, admin));
  await scenario("runtime-replacement", () => replaceRuntime(ctx, operator, template, page));
  await scenario("two-users-quota", () => twoUsersAndQuota(ctx, operator, template, operator.browser, admin, credentials));
  await scenario("native-browser-errors", () => {
    check(witness.state.browserErrors === 0, "Native browser has uncaught JavaScript errors");
    return { noBrowserScriptErrors: true };
  });
  receipt.status = scenarioFailed ? "failed" : "configured_gates_passed";
} catch (error) {
  ctx.save("openwebui-failure.json", { gate: activeGate, message: error.message, stack: error.stack });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  receipt.status = "failed";
  process.exitCode = 1;
  console.error(`OpenWebUI acceptance failed: ${activeGate} ${JSON.stringify(safeFailure(publicFailure(error)))}`);
  if (witness) console.log(`OpenWebUI protocol counters: ${JSON.stringify(witness.state)}`);
  if (credentials) await diagnose(ctx, operator.client, template);
  await browserDiagnostics(page).catch(() => {});
} finally {
  await finishReceipt(receipt, {
    chatBrowser: async () => { if (page) await page.close(); },
    adapter: async () => {
      // Quiesce application requests before retiring owned runtimes and credentials.
      if (credentials) ownedDocker(ctx, "adapter", ["stop", "--time", "10"]);
    },
    runtimes: async () => {
      if (!operator) return;
      for (const sandbox of (await operator.client.listSandboxes()).sandboxes.filter(item => item.template === template && item.status !== "terminated")) {
        await operator.client.killSandbox(sandbox.id);
      }
      await until("All owned runtime capacity released", async () => (await operator.client.capacity()).capacity.inUse === 0, 180000);
    },
    workspaces: async () => {
      if (!operator) return;
      for (const workspace of (await operator.client.workspaces.list()).workspaces.filter(item => item.name.startsWith(`openwebui-acceptance-${ctx.identity.id}-`))) {
        await until("Owned workspace released before archival", async () => {
          const { workspace: current } = await operator.client.workspaces.get(workspace.id);
          return current.status === "available" && !current.attachedSandboxId;
        }, 180000);
        await operator.client.workspaces.archive(workspace.id);
      }
    },
    key: async () => {
      if (operator) await operator.request(`/v1/api-keys/${ctx.read("client-key.json").id}`, "DELETE");
    },
    // Keep the separate Harakiri operator page available for OIDC renewal until
    // its cleanup key is revoked, even when a long model run outlives the token.
    browser: async () => { if (operator) await operator.browser.close(); },
    docker: () => cleanupDocker(ctx), portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
