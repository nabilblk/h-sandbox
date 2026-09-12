import { check, origins, pinned, until } from "./context.mjs";
import { query } from "./operator.mjs";

export function prepareEmptyCatalog(ctx) {
  ctx.guard();
  // Legacy migrations create built-ins even with SEED_ON_BOOT=0. Archive only
  // those seed versions on this owned runner to exercise the empty-catalog UX.
  query(ctx, `UPDATE templates t SET status = 'archived'
    FROM template_versions v WHERE v.id = t.latest_version_id
      AND t.organization_id IS NULL AND v.metadata->>'source' = 'seed';`);
}

export async function importAcceptanceTemplate(ctx, client) {
  const templateId = `acceptance-opencode-${ctx.identity.id}`;
  await client.createTemplate({ id: templateId, name: "Acceptance OpenCode", image: pinned.opencodeImage, visibility: "private", cpuCount: 1, memoryMb: 2048, workdir: "/workspace", defaultEntrypoint: ["sleep", "7200"], runtimeFamily: "custom" });
  const { build } = await client.createTemplateBuild(templateId, { sourceType: "image", imageDestination: pinned.opencodeImage });
  await until("Published OpenCode image import", async () => {
    const result = await client.getTemplateBuild(build.id);
    check(!["failed", "canceled"].includes(result.build.status), "Template image import failed");
    return result.build.status === "success";
  }, 600000);
  return templateId;
}

export async function firstTask(ctx, page, request) {
  console.log("Browser step: verify explicit empty-catalog fixture");
  const empty = page.getByRole("link", { name: "Set up the first template", exact: true });
  await empty.waitFor();
  check(await page.getByRole("button", { name: "Run first sandbox", exact: true }).isDisabled(), "Empty catalog permits first execution");
  const client = {
    createTemplate: body => request("/v1/templates", "POST", body, 201),
    createTemplateBuild: (id, body) => request(`/v1/templates/${id}/builds`, "POST", body, 201),
    getTemplateBuild: id => request(`/v1/template-builds/${id}`)
  };
  const templateId = await importAcceptanceTemplate(ctx, client);
  console.log("Browser step: run first task with imported native template");
  await page.getByRole("button", { name: "Refresh templates", exact: true }).click();
  await page.getByLabel("First sandbox template").selectOption(templateId);
  let commandPosts = 0, creates = 0;
  const observe = response => {
    const url = new URL(response.url());
    if (url.origin !== origins.api || response.request().method() !== "POST") return;
    if (url.pathname === "/v1/sandboxes") creates++;
    if (/\/commands$/.test(url.pathname)) commandPosts++;
  };
  page.on("response", observe);
  try {
    const from = new Date().toISOString();
    const accepted = page.waitForResponse(response => response.url() === `${origins.api}/v1/sandboxes` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Run first sandbox", exact: true }).click();
    const response = await accepted;
    check([200, 201, 202].includes(response.status()), "First-task create failed");
    const sandboxId = (await response.json()).sandbox.id;
    check(/^sbx_[a-zA-Z0-9_-]+$/.test(sandboxId), "Missing owned first-task identity");
    ctx.save("first-task.json", { sandboxId, templateId, from });
    await until("Literal wizard first task", async () => {
      if (await page.getByText("First task completed.", { exact: true }).isVisible()) return true;
      const retry = page.getByRole("button", { name: "Check first task", exact: true });
      if (await retry.isVisible() && await retry.isEnabled()) await retry.click();
      return false;
    }, 600000);
    const commands = await request(`/v1/sandboxes/${sandboxId}/commands`);
    check(commandPosts === 1 && creates === 1 && commands.commands.length === 1, "The first wizard task was duplicated");
    check(commands.commands[0].stdout.trim() === "Harakiri is ready" && commands.commands[0].exitCode === 0, "First wizard output does not match");
    await until("First task independently observed before cleanup", async () => {
      const options = new URLSearchParams({ from, to: new Date().toISOString(), resolution: "1m" });
      const history = await request(`/v1/usage/history?${options}`);
      return history.summary.readiness.sampleCount === 1;
    }, 60000);
    await request(`/v1/sandboxes/${sandboxId}`, "DELETE");
    await until("First-task confirmed release", async () => (await request("/v1/org/capacity")).capacity.inUse === 0, 180000);
    return { firstTask: true, emptyCatalog: true, firstTaskExactlyOnce: true, firstTaskCleaned: true };
  } finally { page.off("response", observe); }
}
