#!/usr/bin/env node
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerEgressCommands } from "./commands/egress.js";
import { registerGitCommands } from "./commands/git.js";
import { registerRegistryCredentialCommands } from "./commands/registry-credentials.js";
import { registerRouteCommands } from "./commands/routes.js";
import { registerSandboxCommands } from "./commands/sandboxes.js";
import { registerTemplateCommands } from "./commands/templates.js";
import { registerVaultCommands } from "./commands/vault.js";
import { registerWorkspaceCommands } from "./commands/workspaces.js";

const program = new Command();

program
  .name("harakiri")
  .description("Harakiri Sandbox CLI")
  .version("0.5.0-rc.1")
  .addHelpText("after", `
Examples:
  $ harakiri login --api-url https://sb-api.harakiri.io --api-key hk_live_...
  $ harakiri create --template open-agents-dev --name agent-runner --env HARAKIRI_ENV=dev
  $ harakiri run sbx_... --cmd "python --version"
  $ harakiri attach sbx_... --cwd /workspace
  $ harakiri git clone sbx_... https://github.com/acme/project.git --path /workspace/project
  $ harakiri vault presets
  $ harakiri create --template open-agents-dev --credential preset=openai,from-env=OPENAI_API_KEY
  $ harakiri command session create sbx_... --cwd /workspace
  $ harakiri expose sbx_... --port 3000
  $ harakiri egress set sbx_... --mode restricted --allow api.github.com
  $ harakiri vault attach sbx_... --preset openai --from-env OPENAI_API_KEY
`);

registerConfigCommands(program);
registerAuthCommands(program);
registerTemplateCommands(program);
registerSandboxCommands(program);
registerGitCommands(program);
registerRouteCommands(program);
registerEgressCommands(program);
registerRegistryCredentialCommands(program);
registerVaultCommands(program);
registerWorkspaceCommands(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
