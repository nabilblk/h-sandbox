import type { Command } from "commander";
import { apiClient } from "../config.js";
import { parsePort, printProgress } from "../utils.js";

export const registerRouteCommands = (program: Command) => {
  program
    .command("expose")
    .argument("<id>", "sandbox id")
    .description("Expose a sandbox HTTP port")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .option("--protocol <protocol>", "route protocol", "http")
    .action(async (id, options) => {
      printProgress(`exposing port ${options.port}`);
      const client = await apiClient();
      const result = await client.exposePort(id, { port: options.port, protocol: options.protocol });
      printProgress(`${result.route.state}. provider=${result.route.provider}`);
      console.log(result.route.url);
    });

  program
    .command("routes")
    .argument("<id>", "sandbox id")
    .description("List exposed sandbox ports")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.listRoutes(id);
      for (const route of result.routes) {
        console.log(`${route.port}\t${route.state}\t${route.provider}\t${route.url}`);
      }
    });
};
