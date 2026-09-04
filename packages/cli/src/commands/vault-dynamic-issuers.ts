import type { Command } from "commander";
import type {
  DynamicCredentialIssuerResponse,
  DynamicCredentialIssuerSummary,
  GitHubAppInstallationScope,
  SandboxCredentialAttachmentSummary,
  UpdateDynamicCredentialIssuerInput
} from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { collectEnv, collectString, printProgress } from "../utils.js";

type JsonOptions = { json?: boolean };
type Permission = "read" | "write" | "admin";

type IssuerCreateOptions = {
  name: string;
  installationId: string;
  repository: string[];
  permission: Record<string, Permission>;
  fakeEnv: Record<string, string>;
  memberUse?: boolean;
  json?: boolean;
};

type IssuerUpdateOptions = {
  name?: string;
  installationId?: string;
  repository: string[];
  permission: Record<string, Permission>;
  fakeEnv: Record<string, string>;
  json?: boolean;
};

const collectPermission = (value: string, previous: Record<string, Permission>) => {
  const separator = value.indexOf("=");
  if (separator <= 0) throw new Error("--permission must be formatted as name=read|write|admin");
  const name = value.slice(0, separator).trim();
  const level = value.slice(separator + 1).trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw new Error("permission name must use lower-case snake case");
  if (!(["read", "write", "admin"] as string[]).includes(level)) {
    throw new Error("permission level must be read, write, or admin");
  }
  return { ...previous, [name]: level as Permission };
};

const scopeLabel = (issuer: DynamicCredentialIssuerSummary) =>
  `${issuer.scope.installationId}:${issuer.scope.repositories.join(",")}`;

const issuerLine = (issuer: DynamicCredentialIssuerSummary) => [
  issuer.id,
  issuer.status,
  issuer.name,
  scopeLabel(issuer),
  issuer.usePolicy,
  issuer.validation.state,
  issuer.lastIssuedAt ?? "-",
  issuer.usage.activeSandboxCount
].join("\t");

const printIssuerTable = (issuers: DynamicCredentialIssuerSummary[]) => {
  console.log("id\tstatus\tname\tinstallation:repositories\tuse-policy\tvalidation\tlast-issued\tactive-sandboxes");
  for (const issuer of issuers) console.log(issuerLine(issuer));
};

const printIssuerResult = (result: DynamicCredentialIssuerResponse, message: string, json = false) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printProgress(message);
  printIssuerTable([result.issuer]);
};

const scopeFromCreate = (options: IssuerCreateOptions): GitHubAppInstallationScope => ({
  installationId: options.installationId,
  repositories: options.repository,
  permissions: options.permission
});

const createIssuer = async (options: IssuerCreateOptions) => {
  const client = await apiClient();
  const result = await client.dynamicCredentialIssuers.create({
    name: options.name,
    issuerType: "github_app_installation",
    scope: scopeFromCreate(options),
    usePolicy: options.memberUse ? "organization_members" : "admins_only",
    fakeEnv: options.fakeEnv
  });
  printIssuerResult(result, `dynamic credential issuer created. validation=${result.issuer.validation.state}`, options.json);
};

const hasScopeUpdate = (options: IssuerUpdateOptions) => Boolean(
  options.installationId || options.repository.length || Object.keys(options.permission).length
);

const updatedScope = (
  options: IssuerUpdateOptions,
  current: GitHubAppInstallationScope
): GitHubAppInstallationScope => ({
  installationId: options.installationId ?? current.installationId,
  repositories: options.repository.length ? options.repository : current.repositories,
  permissions: Object.keys(options.permission).length ? options.permission : current.permissions
});

const updateIssuer = async (id: string, options: IssuerUpdateOptions) => {
  const client = await apiClient();
  const current = hasScopeUpdate(options)
    ? (await client.dynamicCredentialIssuers.get(id)).issuer.scope
    : undefined;
  const body: UpdateDynamicCredentialIssuerInput = {
    name: options.name,
    scope: current ? updatedScope(options, current) : undefined,
    fakeEnv: Object.keys(options.fakeEnv).length ? options.fakeEnv : undefined
  };
  if (!Object.values(body).some((value) => value !== undefined)) {
    throw new Error("at least one dynamic credential issuer field is required");
  }
  const result = await client.dynamicCredentialIssuers.update(id, body);
  printIssuerResult(result, `dynamic credential issuer updated. version=${result.issuer.version}`, options.json);
};

const changeUsePolicy = async (
  id: string,
  usePolicy: "admins_only" | "organization_members",
  options: JsonOptions
) => {
  const client = await apiClient();
  const result = await client.dynamicCredentialIssuers.update(id, { usePolicy });
  printIssuerResult(result, `dynamic credential issuer use policy updated. policy=${usePolicy}`, options.json);
};

const changeStatus = async (
  id: string,
  action: "disable" | "enable" | "delete",
  options: JsonOptions
) => {
  const client = await apiClient();
  const result = await client.dynamicCredentialIssuers[action](id);
  printIssuerResult(result, `dynamic credential issuer ${action}d. status=${result.issuer.status}`, options.json);
};

const registerReadCommands = (issuers: Command) => {
  issuers.command("list")
    .description("List sanitized dynamic credential issuers")
    .option("--include-deleted", "include deleted metadata-only records")
    .option("--json", "print JSON")
    .action(async (options: JsonOptions & { includeDeleted?: boolean }) => {
      const client = await apiClient();
      const result = await client.dynamicCredentialIssuers.list({ includeDeleted: options.includeDeleted });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printIssuerTable(result.issuers);
    });
  issuers.command("get")
    .argument("<id>", "dynamic credential issuer id")
    .description("Inspect sanitized dynamic credential issuer metadata")
    .option("--json", "print JSON")
    .action(async (id, options: JsonOptions) => {
      const client = await apiClient();
      const result = await client.dynamicCredentialIssuers.get(id);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printIssuerTable([result.issuer]);
    });
};

const registerWriteCommands = (issuers: Command) => {
  issuers.command("create")
    .description("Configure scoped GitHub App installation credentials")
    .requiredOption("--name <name>", "workspace issuer name")
    .requiredOption("--installation-id <id>", "GitHub App installation id")
    .requiredOption("--repository <name>", "repository name without owner; can be repeated", collectString, [])
    .requiredOption("--permission <name=level>", "GitHub permission with read, write, or admin level; can be repeated", collectPermission, {})
    .option("--fake-env <key=value>", "fake environment variable visible to sandbox code; can be repeated", collectEnv, {})
    .option("--member-use", "allow organization members to attach this issuer")
    .option("--json", "print JSON")
    .action(createIssuer);
  issuers.command("update")
    .argument("<id>", "dynamic credential issuer id")
    .description("Update GitHub App installation scope or display metadata")
    .option("--name <name>", "workspace issuer name")
    .option("--installation-id <id>", "GitHub App installation id")
    .option("--repository <name>", "replace repository names; can be repeated", collectString, [])
    .option("--permission <name=level>", "replace GitHub permissions; can be repeated", collectPermission, {})
    .option("--fake-env <key=value>", "replace fake environment variables; can be repeated", collectEnv, {})
    .option("--json", "print JSON")
    .action(updateIssuer);
};

const registerPolicyCommands = (issuers: Command) => {
  issuers.command("share")
    .argument("<id>", "dynamic credential issuer id")
    .description("Allow organization members to use this issuer")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => changeUsePolicy(id, "organization_members", options));
  issuers.command("restrict")
    .argument("<id>", "dynamic credential issuer id")
    .description("Restrict this issuer to organization admins")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => changeUsePolicy(id, "admins_only", options));
};

const registerLifecycleCommands = (issuers: Command) => {
  issuers.command("validate")
    .argument("<id>", "dynamic credential issuer id")
    .description("Validate the platform GitHub App and installation access")
    .option("--json", "print JSON")
    .action(async (id, options: JsonOptions) => {
      const client = await apiClient();
      const result = await client.dynamicCredentialIssuers.validate(id);
      printIssuerResult(result, `dynamic credential issuer checked. validation=${result.issuer.validation.state}`, options.json);
    });
  for (const action of ["disable", "enable", "delete"] as const) {
    issuers.command(action)
      .argument("<id>", "dynamic credential issuer id")
      .description(`${action[0]?.toUpperCase()}${action.slice(1)} a dynamic credential issuer`)
      .option("--json", "print JSON")
      .action((id, options: JsonOptions) => changeStatus(id, action, options));
  }
};

export const registerDynamicCredentialIssuerCommands = (
  vault: Command,
  attachmentLine: (attachment: SandboxCredentialAttachmentSummary) => string
) => {
  const issuers = vault.command("issuers")
    .alias("dynamic")
    .description("Manage short-lived credentials issued by the platform GitHub App");
  registerReadCommands(issuers);
  registerWriteCommands(issuers);
  registerPolicyCommands(issuers);
  registerLifecycleCommands(issuers);

  vault.command("attach-issuer")
    .argument("<id>", "sandbox id")
    .argument("<issuer-id>", "dynamic credential issuer id")
    .description("Mint and attach a short-lived credential to a running sandbox")
    .option("--name <name>", "attachment display name")
    .option("--credential-name <name>", "provider-local credential name")
    .option("--binding-name <name>", "provider-local binding name")
    .option("--json", "print JSON")
    .action(async (id, issuerId, options: {
      name?: string;
      credentialName?: string;
      bindingName?: string;
      json?: boolean;
    }) => {
      const client = await apiClient();
      const result = await client.credentials.attachIssuer(id, issuerId, {
        displayName: options.name,
        credentialName: options.credentialName,
        bindingName: options.bindingName
      });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        printProgress(`dynamic credential attached. expires=${result.attachment.expiresAt ?? "unknown"}`);
        console.log(attachmentLine(result.attachment));
      }
    });
};
