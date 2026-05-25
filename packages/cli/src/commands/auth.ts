import type { Command } from "commander";
import { configPath, defaultApiUrl, defaultKey, saveConfig } from "../config.js";
import { printProgress } from "../utils.js";

export const registerAuthCommands = (program: Command) => {
  program
    .command("login")
    .description("Store API connection settings")
    .option("--api-url <url>", "Harakiri API URL", defaultApiUrl)
    .option("--api-key <key>", "Harakiri API key", defaultKey)
    .action(async (options) => {
      if (!options.apiKey) throw new Error("missing --api-key. Create a key in the dashboard or with the API first.");
      await saveConfig({ apiUrl: options.apiUrl, apiKey: options.apiKey });
      printProgress(`saved config at ${configPath}`);
    });
};
