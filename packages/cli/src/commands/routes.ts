import type { Command } from "commander";
import { apiClient } from "../config.js";
import { collectString, parsePort, printProgress } from "../utils.js";

export const registerRouteCommands = (program: Command) => {
  program
    .command("expose")
    .argument("<id>", "sandbox id")
    .description("Expose a sandbox HTTP port")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .option("--protocol <protocol>", "route protocol", "http")
    .option("--access <mode>", "route access mode: public or token", "public")
    .option("--label <label>", "route label; can be repeated", collectString, [])
    .action(async (id, options) => {
      printProgress(`exposing port ${options.port}`);
      const client = await apiClient();
      const accessMode = options.access === "token" ? "token" : "public";
      const labels = (options.label as string[]).map((label) => label.trim()).filter(Boolean);
      const result = await client.exposePort(id, { port: options.port, protocol: options.protocol, accessMode, labels: labels.length ? labels : undefined });
      printProgress(`${result.route.state}. provider=${result.route.provider}. access=${result.route.accessMode}`);
      console.log(result.route.url);
      if (result.accessToken && result.accessHeaderName) {
        console.log(`${result.accessHeaderName}: ${result.accessToken}`);
      }
    });

  program
    .command("routes")
    .argument("<id>", "sandbox id")
    .description("List exposed sandbox ports")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.listRoutes(id);
      for (const route of result.routes) {
        console.log(`${route.port}\t${route.state}\t${route.accessMode}\t${route.provider}\t${route.labels.join(",") || "-"}\t${route.url}`);
      }
    });

  program
    .command("unexpose")
    .argument("<id>", "sandbox id")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .description("Delete an exposed sandbox port")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.deleteRoute(id, options.port);
      printProgress(`${result.route.port} ${result.route.state}`);
    });
};
