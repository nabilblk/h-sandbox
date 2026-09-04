import type { Command } from "commander";
import type {
  ExternalSecretReferenceResponse,
  ExternalSecretReferenceSummary,
  SandboxCredentialAttachmentSummary,
  UpdateExternalSecretReferenceInput
} from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { collectEnv, printProgress } from "../utils.js";
import {
  addCredentialProfileOptions,
  credentialProfileFromOptions,
  type CredentialProfileOptions
} from "./credential-options.js";

type JsonOptions = { json?: boolean };

type ReferenceCreateOptions = CredentialProfileOptions & {
  name: string;
  namespace?: string;
  secretName: string;
  key: string;
  fakeEnv: Record<string, string>;
  memberUse?: boolean;
  json?: boolean;
};

type ReferenceUpdateOptions = CredentialProfileOptions & {
  name?: string;
  namespace?: string;
  secretName?: string;
  key?: string;
  fakeEnv: Record<string, string>;
  json?: boolean;
};

const locator = (reference: ExternalSecretReferenceSummary) =>
  `${reference.reference.namespace}/${reference.reference.name}:${reference.reference.key}`;

const referenceLine = (reference: ExternalSecretReferenceSummary) => [
  reference.id,
  reference.status,
  reference.name,
  reference.providerPresetId,
  locator(reference),
  reference.usePolicy,
  reference.validation.state,
  reference.version,
  reference.usage.activeSandboxCount
].join("\t");

const printReferenceTable = (references: ExternalSecretReferenceSummary[]) => {
  console.log("id\tstatus\tname\tprofile\tlocation\tuse-policy\tvalidation\tversion\tactive-sandboxes");
  for (const reference of references) console.log(referenceLine(reference));
};

const printReferenceResult = (
  result: ExternalSecretReferenceResponse,
  message: string,
  json = false
) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printProgress(message);
  printReferenceTable([result.reference]);
};

const createReference = async (options: ReferenceCreateOptions) => {
  const client = await apiClient();
  const profile = credentialProfileFromOptions(options);
  if (!profile) throw new Error("credential profile is required");
  const result = await client.externalSecretReferences.create({
    name: options.name,
    ...profile,
    resolverType: "kubernetes_secret",
    reference: {
      namespace: options.namespace,
      name: options.secretName,
      key: options.key
    },
    usePolicy: options.memberUse ? "organization_members" : "admins_only",
    fakeEnv: options.fakeEnv
  });
  printReferenceResult(result, `external secret reference created. validation=${result.reference.validation.state}`, options.json);
};

const hasLocatorUpdate = (options: ReferenceUpdateOptions) =>
  Boolean(options.namespace || options.secretName || options.key);

const updateBody = (
  options: ReferenceUpdateOptions,
  current?: ExternalSecretReferenceSummary["reference"]
): UpdateExternalSecretReferenceInput => {
  const profile = credentialProfileFromOptions(options, false);
  const body: UpdateExternalSecretReferenceInput = {
    name: options.name,
    ...profile,
    fakeEnv: Object.keys(options.fakeEnv).length ? options.fakeEnv : undefined
  };
  if (hasLocatorUpdate(options)) {
    if (!current) throw new Error("current external reference is required for a partial locator update");
    body.reference = {
      namespace: options.namespace ?? current.namespace,
      name: options.secretName ?? current.name,
      key: options.key ?? current.key
    };
  }
  return body;
};

const updateReference = async (id: string, options: ReferenceUpdateOptions) => {
  const client = await apiClient();
  const current = hasLocatorUpdate(options)
    ? (await client.externalSecretReferences.get(id)).reference.reference
    : undefined;
  const body = updateBody(options, current);
  if (!Object.values(body).some((value) => value !== undefined)) {
    throw new Error("at least one external secret reference field is required");
  }
  const result = await client.externalSecretReferences.update(id, body);
  printReferenceResult(result, `external secret reference updated. version=${result.reference.version}`, options.json);
};

const changeUsePolicy = async (
  id: string,
  usePolicy: "admins_only" | "organization_members",
  options: JsonOptions
) => {
  const client = await apiClient();
  const result = await client.externalSecretReferences.update(id, { usePolicy });
  printReferenceResult(result, `external secret reference use policy updated. policy=${usePolicy}`, options.json);
};

const changeStatus = async (
  id: string,
  action: "disable" | "enable" | "delete",
  options: JsonOptions
) => {
  const client = await apiClient();
  const result = await client.externalSecretReferences[action](id);
  printReferenceResult(result, `external secret reference ${action}d. status=${result.reference.status}`, options.json);
};

const registerReadCommands = (references: Command) => {
  references.command("list")
    .description("List sanitized external secret references")
    .option("--include-deleted", "include deleted metadata-only records")
    .option("--json", "print JSON")
    .action(async (options: JsonOptions & { includeDeleted?: boolean }) => {
      const client = await apiClient();
      const result = await client.externalSecretReferences.list({ includeDeleted: options.includeDeleted });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printReferenceTable(result.references);
    });
  references.command("get")
    .argument("<id>", "external secret reference id")
    .description("Inspect sanitized external secret reference metadata")
    .option("--json", "print JSON")
    .action(async (id, options: JsonOptions) => {
      const client = await apiClient();
      const result = await client.externalSecretReferences.get(id);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printReferenceTable([result.reference]);
    });
};

const registerWriteCommands = (references: Command) => {
  const create = references.command("create")
    .description("Reference a Kubernetes Secret without storing its value in Harakiri")
    .requiredOption("--name <name>", "workspace reference name")
    .requiredOption("--secret-name <name>", "Kubernetes Secret name")
    .requiredOption("--key <key>", "key inside the Kubernetes Secret")
    .option("--namespace <namespace>", "Kubernetes Secret namespace; defaults to operator configuration")
    .option("--fake-env <key=value>", "fake environment variable visible to sandbox code; can be repeated", collectEnv, {})
    .option("--member-use", "allow organization members to attach this reference")
    .option("--json", "print JSON")
    .action(createReference);
  addCredentialProfileOptions(create);

  const update = references.command("update")
    .argument("<id>", "external secret reference id")
    .description("Update external reference metadata or its Kubernetes locator")
    .option("--name <name>", "workspace reference name")
    .option("--namespace <namespace>", "Kubernetes Secret namespace")
    .option("--secret-name <name>", "Kubernetes Secret name")
    .option("--key <key>", "key inside the Kubernetes Secret")
    .option("--fake-env <key=value>", "replace fake environment variables; can be repeated", collectEnv, {})
    .option("--json", "print JSON")
    .action(updateReference);
  addCredentialProfileOptions(update);
};

const registerPolicyCommands = (references: Command) => {
  references.command("share")
    .argument("<id>", "external secret reference id")
    .description("Allow organization members to use this reference")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => changeUsePolicy(id, "organization_members", options));
  references.command("restrict")
    .argument("<id>", "external secret reference id")
    .description("Restrict this reference to organization admins")
    .option("--json", "print JSON")
    .action((id, options: JsonOptions) => changeUsePolicy(id, "admins_only", options));
};

const registerLifecycleCommands = (references: Command) => {
  references.command("validate")
    .argument("<id>", "external secret reference id")
    .description("Check resolver access and the referenced value")
    .option("--json", "print JSON")
    .action(async (id, options: JsonOptions) => {
      const client = await apiClient();
      const result = await client.externalSecretReferences.validate(id);
      printReferenceResult(result, `external secret reference checked. validation=${result.reference.validation.state}`, options.json);
    });
  for (const action of ["disable", "enable", "delete"] as const) {
    references.command(action)
      .argument("<id>", "external secret reference id")
      .description(`${action[0]?.toUpperCase()}${action.slice(1)} an external secret reference`)
      .option("--json", "print JSON")
      .action((id, options: JsonOptions) => changeStatus(id, action, options));
  }
};

export const registerExternalSecretReferenceCommands = (
  vault: Command,
  attachmentLine: (attachment: SandboxCredentialAttachmentSummary) => string
) => {
  const references = vault.command("references")
    .alias("external")
    .description("Manage Kubernetes-backed external secret references");
  registerReadCommands(references);
  registerWriteCommands(references);
  registerPolicyCommands(references);
  registerLifecycleCommands(references);

  vault.command("attach-reference")
    .argument("<id>", "sandbox id")
    .argument("<reference-id>", "external secret reference id")
    .description("Resolve and attach an external secret reference to a running sandbox")
    .option("--name <name>", "attachment display name")
    .option("--credential-name <name>", "provider-local credential name")
    .option("--binding-name <name>", "provider-local binding name")
    .option("--json", "print JSON")
    .action(async (id, referenceId, options: {
      name?: string;
      credentialName?: string;
      bindingName?: string;
      json?: boolean;
    }) => {
      const client = await apiClient();
      const result = await client.credentials.attachReference(id, referenceId, {
        displayName: options.name,
        credentialName: options.credentialName,
        bindingName: options.bindingName
      });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        printProgress(`external secret reference attached. status=${result.attachment.status}`);
        console.log(attachmentLine(result.attachment));
      }
    });
};
