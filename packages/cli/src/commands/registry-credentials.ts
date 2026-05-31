import type { Command } from "commander";
import type { RegistryCredentialPurpose, UpsertRegistryCredentialBody } from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { printProgress } from "../utils.js";

const registryCredentialPurposes: RegistryCredentialPurpose[] = ["pull", "push", "push_pull"];

const parsePurpose = (value: string) => {
  if (!registryCredentialPurposes.includes(value as RegistryCredentialPurpose)) {
    throw new Error("--purpose must be pull, push, or push_pull");
  }
  return value as RegistryCredentialPurpose;
};

export const registerRegistryCredentialCommands = (program: Command) => {
  const registry = program
    .command("registry-credentials")
    .alias("registry")
    .description("Manage template registry credentials")
    .addHelpText("after", `
Examples:
  $ harakiri registry list
  $ harakiri registry upsert --name ghcr --registry-host ghcr.io --username USER --secret TOKEN --purpose push_pull
  $ harakiri registry revoke trc_...
`);

  registry
    .command("list")
    .description("List registry credentials")
    .option("--include-revoked", "include revoked credentials")
    .action(async (options) => {
      const client = await apiClient();
      const result = await client.listRegistryCredentials({ includeRevoked: options.includeRevoked });
      for (const credential of result.credentials) {
        const secretState = credential.hasEncryptedSecret ? "encrypted" : (credential.secretRef ?? credential.pullSecretRef ?? credential.pushSecretRef ?? "external");
        console.log(`${credential.id}\t${credential.purpose}\t${credential.registryHost}\t${credential.name}\t${credential.repositoryPrefix}\t${secretState}`);
      }
    });

  registry
    .command("upsert")
    .description("Create or update a registry credential")
    .requiredOption("--name <name>", "credential name")
    .requiredOption("--registry-host <host>", "registry hostname")
    .option("--username <username>", "registry username")
    .option("--secret <secret>", "registry password or token to encrypt")
    .option("--secret-ref <ref>", "external secret reference")
    .option("--purpose <purpose>", "credential purpose: pull, push, or push_pull", parsePurpose, "pull")
    .option("--repository-prefix <prefix>", "repository prefix used for built images")
    .option("--pull-secret-ref <ref>", "Kubernetes pull secret reference")
    .option("--push-secret-ref <ref>", "Kubernetes push secret reference")
    .action(async (options) => {
      if (!options.secret && !options.secretRef && !options.pullSecretRef && !options.pushSecretRef) {
        throw new Error("registry credentials require --secret, --secret-ref, --pull-secret-ref, or --push-secret-ref");
      }
      const body: UpsertRegistryCredentialBody = {
        name: options.name,
        registryHost: options.registryHost,
        username: options.username,
        secret: options.secret,
        secretRef: options.secretRef,
        purpose: options.purpose,
        repositoryPrefix: options.repositoryPrefix,
        pullSecretRef: options.pullSecretRef,
        pushSecretRef: options.pushSecretRef
      };
      const client = await apiClient();
      const result = await client.upsertRegistryCredential(body);
      printProgress(`stored registry credential ${result.credential.name}`);
      console.log(result.credential.id);
    });

  registry
    .command("revoke")
    .argument("<id>", "registry credential id")
    .description("Revoke a registry credential")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.revokeRegistryCredential(id);
      printProgress(`revoked registry credential ${result.credential.name}`);
    });
};
