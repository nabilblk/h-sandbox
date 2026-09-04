import type { Command } from "commander";
import type {
  CredentialSecretResponse,
  CredentialSecretSummary,
  CredentialSecretUsePolicy
} from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { collectEnv, printProgress } from "../utils.js";
import {
  addCredentialProfileOptions,
  credentialProfileFromOptions,
  secretFromOptions,
  type CredentialProfileOptions,
  type SecretValueOptions
} from "./credential-options.js";

type JsonOptions = { json?: boolean };
type SecretCreateOptions = SecretValueOptions & CredentialProfileOptions & {
  name: string;
  fakeEnv: Record<string, string>;
  memberUse?: boolean;
  json?: boolean;
};

const secretLine = (secret: CredentialSecretSummary) => [
  secret.id,
  secret.status,
  secret.name,
  secret.providerPresetId,
  secret.version,
  secret.usePolicy,
  secret.usage.activeSandboxCount,
  secret.hasEncryptedSecret ? "yes" : "no",
  Object.keys(secret.fakeEnv).join(",") || "-",
  secret.egressDomains.join(",") || "-"
].join("\t");

const printSecretTable = (secrets: CredentialSecretSummary[]) => {
  console.log("id\tstatus\tname\tprofile\tversion\tuse-policy\tactive-sandboxes\thas-secret\tfake-env\tegress-domains");
  for (const secret of secrets) console.log(secretLine(secret));
};

const printSecretResult = (result: CredentialSecretResponse, message: string, json = false) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printProgress(message);
  printSecretTable([result.secret]);
};

const listSecrets = async (options: JsonOptions & { includeDeleted?: boolean }) => {
  const client = await apiClient();
  const result = await client.credentialSecrets.list({ includeDeleted: options.includeDeleted });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printSecretTable(result.secrets);
};

const getSecret = async (id: string, options: JsonOptions) => {
  const client = await apiClient();
  const result = await client.credentialSecrets.get(id);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printSecretTable([result.secret]);
};

const createSecret = async (options: SecretCreateOptions) => {
  const client = await apiClient();
  const profile = credentialProfileFromOptions(options);
  if (!profile) throw new Error("credential profile is required");
  const result = await client.credentialSecrets.create({
    name: options.name,
    ...profile,
    value: await secretFromOptions(options),
    usePolicy: options.memberUse ? "organization_members" : "admins_only",
    fakeEnv: options.fakeEnv
  });
  printSecretResult(result, `credential secret created. status=${result.secret.status}`, options.json);
};

const updateUsePolicy = async (id: string, usePolicy: CredentialSecretUsePolicy, options: JsonOptions) => {
  const client = await apiClient();
  const result = await client.credentialSecrets.update(id, { usePolicy });
  printSecretResult(result, `credential secret use policy updated. policy=${result.secret.usePolicy}`, options.json);
};

const rotateSecret = async (id: string, options: SecretValueOptions & JsonOptions) => {
  const client = await apiClient();
  const result = await client.credentialSecrets.rotate(id, { value: await secretFromOptions(options) });
  printSecretResult(result, `credential secret rotated. version=${result.secret.version}`, options.json);
};

const changeSecretStatus = async (
  id: string,
  action: "disable" | "enable" | "delete",
  options: JsonOptions
) => {
  const client = await apiClient();
  const result = await client.credentialSecrets[action](id);
  const verb = action === "disable" ? "disabled" : action === "enable" ? "enabled" : "deleted";
  printSecretResult(result, `credential secret ${verb}. status=${result.secret.status}`, options.json);
};

const registerReadCommands = (secrets: Command) => {
  secrets.command("list")
    .description("List sanitized workspace credential secrets")
    .option("--include-deleted", "include deleted metadata-only records")
    .option("--json", "print JSON")
    .action(listSecrets);
  secrets.command("get")
    .argument("<id>", "credential secret id")
    .description("Inspect sanitized workspace credential secret metadata")
    .option("--json", "print JSON")
    .action(getSecret);
};

const registerCreateCommand = (secrets: Command) => {
  const command = secrets.command("create")
    .requiredOption("--name <name>", "workspace credential secret name")
    .option("--fake-env <key=value>", "fake environment variable visible to sandbox code; can be repeated", collectEnv, {})
    .option("--from-env <name>", "environment variable containing the real credential")
    .option("--from-stdin", "read the real credential from stdin")
    .option("--prompt", "prompt for the real credential without echoing input")
    .option("--member-use", "allow organization members to attach this secret")
    .option("--json", "print JSON")
    .description("Create a write-only encrypted workspace credential secret")
    .action(createSecret);
  addCredentialProfileOptions(command);
};

const registerPolicyCommands = (secrets: Command) => {
  secrets.command("share")
    .argument("<id>", "credential secret id")
    .description("Allow organization members to attach a workspace credential secret")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => updateUsePolicy(id, "organization_members", options));
  secrets.command("restrict")
    .argument("<id>", "credential secret id")
    .description("Restrict workspace credential secret use to organization admins")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => updateUsePolicy(id, "admins_only", options));
};

const registerRotationCommand = (secrets: Command) => {
  secrets.command("rotate")
    .argument("<id>", "credential secret id")
    .option("--from-env <name>", "environment variable containing the new credential")
    .option("--from-stdin", "read the new credential from stdin")
    .option("--prompt", "prompt for the new credential without echoing input")
    .option("--json", "print JSON")
    .description("Rotate a write-only encrypted workspace credential secret")
    .action(rotateSecret);
};

const registerStatusCommands = (secrets: Command) => {
  for (const command of [
    ["disable", "Disable a workspace credential secret"],
    ["enable", "Enable a disabled workspace credential secret"],
    ["delete", "Delete encrypted value custody and keep metadata-only audit history"]
  ] as const) {
    const [action, description] = command;
    secrets.command(action)
      .argument("<id>", "credential secret id")
      .description(description)
      .option("--json", "print JSON")
      .action((id, options: JsonOptions) => changeSecretStatus(id, action, options));
  }
};

export const registerCredentialSecretCommands = (vault: Command) => {
  const secrets = vault.command("secrets")
    .description("Manage encrypted workspace credential secrets");
  registerReadCommands(secrets);
  registerCreateCommand(secrets);
  registerPolicyCommands(secrets);
  registerRotationCommand(secrets);
  registerStatusCommands(secrets);
};
