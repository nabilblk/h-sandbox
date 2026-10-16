import type { Command } from "commander";
import { initBanner, shouldUseColor } from "../format.js";
import { diagnose } from "../diagnostics.js";
import { parsePositiveInt } from "../utils.js";

export const registerConfigCommands = (program: Command) => {
  program.command("doctor")
    .argument("[id]", "also check this sandbox's execution readiness")
    .description("Check CLI configuration and API access without changing resources")
    .option("--json", "print structured diagnostic results")
    .option("--timeout-ms <ms>", "per-request timeout (up to 60000)", "10000")
    .action(async (id: string | undefined, options: { json?: boolean; timeoutMs: string }) => {
      const timeoutMs = parsePositiveInt(options.timeoutMs);
      if (timeoutMs > 60_000) throw new Error("timeout-ms must be at most 60000");
      const report = await diagnose(id, timeoutMs);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else {
        if (report.apiUrl) console.log(`API: ${report.apiUrl}`);
        for (const check of report.checks) console.log(`${check.status.toUpperCase()} ${check.name}: ${check.message}`);
      }
      if (!report.ok) process.exitCode = 1;
    });
  program
    .command("init")
    .description("Print the Harakiri terminal banner")
    .action(() => {
      console.log(initBanner(shouldUseColor()));
    });
};
