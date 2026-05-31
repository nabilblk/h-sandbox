#!/usr/bin/env node
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerEgressCommands } from "./commands/egress.js";
import { registerRegistryCredentialCommands } from "./commands/registry-credentials.js";
import { registerRouteCommands } from "./commands/routes.js";
import { registerSandboxCommands } from "./commands/sandboxes.js";
import { registerTemplateCommands } from "./commands/templates.js";

const program = new Command();

program
  .name("harakiri")
  .description("Harakiri Sandbox CLI")
  .version("0.1.0")
  .addHelpText("after", `
Examples:
  $ harakiri login --api-url https://sb-api.harakiri.io --api-key hk_live_...
  $ harakiri create --template open-agents-dev --name agent-runner --env HARAKIRI_ENV=dev
  $ harakiri run sbx_... --cmd "python --version"
  $ harakiri expose sbx_... --port 3000
  $ harakiri egress set sbx_... --mode restricted --allow api.github.com
`);

registerConfigCommands(program);
registerAuthCommands(program);
registerTemplateCommands(program);
registerSandboxCommands(program);
registerRouteCommands(program);
registerEgressCommands(program);
registerRegistryCredentialCommands(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
