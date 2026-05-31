import type { Command } from "commander";
import type { SandboxEgressResponse } from "@harakiri/sdk";
import { apiClient } from "../config.js";
import { collectString, printProgress } from "../utils.js";

const printPolicy = (egress: SandboxEgressResponse["egress"]) => {
  const provider = egress.providerStatus;
  console.log(`mode\t${egress.mode}`);
  console.log(`allowed\t${egress.rules.filter((rule) => rule.action === "allow").length}`);
  console.log(`denied\t${egress.rules.filter((rule) => rule.action === "deny").length}`);
  console.log(`provider\t${provider?.available ? provider.enforcementMode ?? provider.mode ?? "available" : provider?.error ?? "unavailable"}`);
  for (const rule of egress.rules) console.log(`${rule.action}\t${rule.target}\t${rule.presetId ?? rule.source}`);
};

export const registerEgressCommands = (program: Command) => {
  const egress = program
    .command("egress")
    .description("Inspect or change sandbox outbound access");

  egress
    .argument("<id>", "sandbox id")
    .description("Show sandbox outbound access")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.getEgressPolicy(id);
      printPolicy(result.egress);
    });

  egress
    .command("allow")
    .argument("<id>", "sandbox id")
    .argument("<domains...>", "domains to allow")
    .description("Allow outbound domains")
    .action(async (id, domains) => {
      const client = await apiClient();
      const result = await client.allowEgress(id, domains);
      printProgress(`egress ${result.egress.mode}. allowed=${result.egress.rules.filter((rule) => rule.action === "allow").length}`);
    });

  egress
    .command("deny")
    .argument("<id>", "sandbox id")
    .argument("<domains...>", "domains to deny")
    .description("Deny outbound domains")
    .action(async (id, domains) => {
      const client = await apiClient();
      const result = await client.denyEgress(id, domains);
      printProgress(`egress ${result.egress.mode}. denied=${result.egress.rules.filter((rule) => rule.action === "deny").length}`);
    });

  egress
    .command("block")
    .argument("<id>", "sandbox id")
    .description("Turn off outbound access")
    .action(async (id) => {
      const client = await apiClient();
      await client.blockEgress(id);
      printProgress("egress blocked. outbound network access is off.");
    });

  egress
    .command("set")
    .argument("<id>", "sandbox id")
    .description("Set outbound access mode and rules")
    .requiredOption("--mode <mode>", "open, restricted, blocked, custom")
    .option("--preset <preset>", "preset to allow; can be repeated", collectString, [])
    .option("--allow <domain>", "domain to allow; can be repeated", collectString, [])
    .option("--deny <domain>", "domain to deny; can be repeated", collectString, [])
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.updateEgressPolicy(id, {
        mode: options.mode,
        presets: options.preset,
        allow: options.allow,
        deny: options.deny
      });
      printProgress(`egress ${result.egress.mode}. rules=${result.egress.rules.length}`);
    });

  egress
    .command("test")
    .argument("<id>", "sandbox id")
    .argument("<target>", "host or URL to test")
    .description("Test outbound access from the sandbox")
    .action(async (id, target) => {
      const client = await apiClient();
      const result = await client.testEgress(id, target);
      console.log(`${result.ok ? "ok" : "blocked"}\t${result.normalizedTarget}\t${result.status}`);
      if (result.stderr && !result.ok) process.stderr.write(result.stderr);
    });
};
