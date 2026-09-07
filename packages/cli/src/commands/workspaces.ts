import type { Command } from "commander";
import { apiClient } from "../config.js";

export function registerWorkspaceCommands(program: Command) {
  const workspace = program.command("workspace").description("Manage persistent sandbox workspaces");
  workspace.command("list").option("--json", "print JSON").action(async (options) => {
    const result = await (await apiClient()).workspaces.list();
    if (options.json) return console.log(JSON.stringify(result, null, 2));
    for (const item of result.workspaces) console.log(`${item.id}\t${item.name}\t${item.status}\t${item.sizeGiB} GiB\t${item.attachedSandboxId ?? "-"}`);
    if (!result.policy.available) console.error(result.policy.reason);
  });
  workspace.command("create").requiredOption("--name <name>", "workspace name").option("--json", "print JSON").action(async (options) => {
    const result = await (await apiClient()).workspaces.create({ name: options.name });
    console.log(options.json ? JSON.stringify(result, null, 2) : result.workspace.id);
  });
  workspace.command("inspect").argument("<id>", "workspace ID").action(async (id) => {
    console.log(JSON.stringify(await (await apiClient()).workspaces.get(id), null, 2));
  });
  workspace.command("archive").argument("<id>", "workspace ID").requiredOption("--retain-storage", "acknowledge that archiving retains storage and still consumes quota").action(async (id) => {
    const result = await (await apiClient()).workspaces.archive(id);
    console.log(`${result.workspace.id}\tarchived; storage retained for operator reclamation`);
  });
}
