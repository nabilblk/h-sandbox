import type { Command } from "commander";
import type { AuditEventSummary, CredentialProviderPreset, CredentialVaultAuth } from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { collectEnv, collectString, parseNonNegativeInt, parsePositiveInt, printProgress } from "../utils.js";
import {
  credentialFromDirectOptions,
  type CredentialAuthType,
  parseAuthType
} from "./credential-options.js";
import { registerCredentialSecretCommands } from "./vault-secrets.js";
import { registerExternalSecretReferenceCommands } from "./vault-external-references.js";
import { registerDynamicCredentialIssuerCommands } from "./vault-dynamic-issuers.js";

const attachmentLine = (attachment: {
  id: string;
  status: string;
  providerState?: string;
  displayName: string;
  credentialName: string;
  bindingName: string;
  match: { hosts: string[] };
  fakeEnv: Record<string, string>;
}) => [
  attachment.id,
  attachment.status,
  attachment.providerState ?? "unknown",
  attachment.displayName,
  attachment.credentialName,
  attachment.bindingName,
  attachment.match.hosts.join(",") || "-",
  Object.keys(attachment.fakeEnv).join(",") || "-"
].join("\t");

const authLabel = (auth: CredentialVaultAuth) => {
  if (auth.type === "apiKey") return `apiKey:${auth.name}`;
  if (auth.type === "customHeaders") return `customHeaders:${auth.headers.map((header) => header.name).join(",")}`;
  return auth.type;
};

const presetLine = (preset: CredentialProviderPreset) => [
  preset.id,
  preset.category,
  preset.defaultEnvName,
  authLabel(preset.binding.auth),
  preset.binding.match.hosts.join(","),
  preset.test.target
].join("\t");

const auditEventLine = (event: AuditEventSummary) => [
  event.createdAt,
  event.actorLabel,
  event.action,
  event.targetType,
  event.targetId ?? "-",
  Object.keys(event.metadata).length ? JSON.stringify(event.metadata) : "-"
].join("\t");

export const registerVaultCommands = (program: Command) => {
  const vault = program
    .command("vault")
    .alias("credentials")
    .description("Attach credentials to sandbox outbound requests")
    .addHelpText("after", `
Examples:
  $ harakiri vault presets
  $ harakiri vault audit --action-prefix credential_secret.
  $ OPENAI_API_KEY=placeholder harakiri create --template open-agents-dev --credential preset=openai,from-env=OPENAI_API_KEY
  $ harakiri vault list sbx_...
  $ harakiri vault inspect sbx_...
  $ OPENAI_API_KEY=placeholder harakiri vault attach sbx_... --preset openai --from-env OPENAI_API_KEY
  $ harakiri vault attach sbx_... --preset openai --prompt
  $ harakiri vault secrets create --name openai-prod --preset openai --from-env OPENAI_API_KEY
  $ harakiri vault secrets share vlt_...
  $ harakiri vault attach-secret sbx_... vlt_...
  $ harakiri vault references create --name openai-cluster --preset openai --namespace harakiri --secret-name agent-credentials --key OPENAI_API_KEY
  $ harakiri vault references validate xsr_...
  $ harakiri vault attach-reference sbx_... xsr_...
  $ harakiri vault issuers create --name agent-repos --installation-id 123 --repository agent-runtime --permission contents=write --permission metadata=read
  $ harakiri vault issuers validate dci_...
  $ harakiri vault attach-issuer sbx_... dci_...
  $ harakiri vault secrets rotate vlt_... --prompt
  $ printf '%s' "$TOKEN" | harakiri vault attach sbx_... --name github --host api.github.com --auth api-key --header authorization --from-stdin
  $ harakiri vault test sbx_... sca_... --target https://api.openai.com/v1/models
  $ harakiri vault refresh sbx_... sca_...
  $ harakiri vault rehydrate sbx_...
  $ harakiri vault detach sbx_... sca_...
`);

  vault
    .command("audit")
    .description("List sanitized organization Credential Vault audit events")
    .option("--target-type <type>", "filter by audit target type")
    .option("--target-id <id>", "filter by audit target id")
    .option("--action-prefix <prefix>", "filter by action prefix")
    .option("--limit <count>", "maximum events to return", parsePositiveInt, 50)
    .option("--offset <count>", "number of events to skip", parseNonNegativeInt, 0)
    .option("--json", "print JSON")
    .action(async (options: {
      targetType?: string;
      targetId?: string;
      actionPrefix?: string;
      limit: number;
      offset: number;
      json?: boolean;
    }) => {
      const client = await apiClient();
      const result = await client.auditEvents.list({
        targetType: options.targetType,
        targetId: options.targetId,
        actionPrefix: options.actionPrefix,
        limit: options.limit,
        offset: options.offset
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("created\tactor\taction\ttarget-type\ttarget-id\tmetadata");
      for (const event of result.events) console.log(auditEventLine(event));
      printProgress(`audit events ${result.page.offset + result.events.length}/${result.page.total}`);
    });

  vault
    .command("presets")
    .description("List built-in credential provider presets")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentialPresets.list();
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("id\tcategory\tenv\tauth\thosts\ttest-target");
      for (const preset of result.presets) console.log(presetLine(preset));
    });

  vault
    .command("preset")
    .argument("<id>", "credential provider preset id")
    .description("Inspect a built-in credential provider preset")
    .option("--json", "print JSON")
    .action(async (id, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentialPresets.get(id);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("id\tcategory\tenv\tauth\thosts\ttest-target");
      console.log(presetLine(result.preset));
    });

  registerCredentialSecretCommands(vault);
  registerExternalSecretReferenceCommands(vault, attachmentLine);
  registerDynamicCredentialIssuerCommands(vault, attachmentLine);

  vault
    .command("list")
    .argument("<id>", "sandbox id")
    .description("List sanitized sandbox credential attachments")
    .option("--json", "print JSON")
    .action(async (id, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.list(id);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("id\tstatus\tprovider-state\tname\tcredential\tbinding\thosts\tfake-env");
      for (const attachment of result.attachments) console.log(attachmentLine(attachment));
    });

  vault
    .command("inspect")
    .argument("<id>", "sandbox id")
    .description("Compare credential attachments with sanitized runtime vault state")
    .option("--json", "print JSON")
    .action(async (id, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.inspect(id);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const missing = result.attachments.filter(({ providerState }) => providerState === "missing").length;
      printProgress(`runtime vault inspected. revision=${result.vault?.revision ?? "unknown"} missing=${missing}`);
      if (result.attachments.length) {
        console.log("id\tstatus\tprovider-state\tname\tcredential\tbinding\thosts\tfake-env");
        for (const attachment of result.attachments) console.log(attachmentLine(attachment));
      }
    });

  vault
    .command("attach")
    .argument("<id>", "sandbox id")
    .description("Inject a credential into the sandbox-local vault without exposing the real value to sandbox env")
    .option("--preset <id>", "built-in provider preset id")
    .option("--host <host>", "host or wildcard host to match; can be repeated", collectString, [])
    .option("--name <name>", "display name")
    .option("--credential-name <name>", "provider-local credential name")
    .option("--binding-name <name>", "provider-local binding name")
    .option("--auth <type>", "auth type: api-key, bearer, or basic", parseAuthType)
    .option("--header <name>", "header name for --auth api-key")
    .option("--scheme <scheme>", "scheme to match; can be repeated", collectString, [])
    .option("--method <method>", "HTTP method to match; can be repeated", collectString, [])
    .option("--path <path>", "path prefix to match; can be repeated", collectString, [])
    .option("--fake-env <key=value>", "fake environment variable visible to sandbox code; can be repeated", collectEnv, {})
    .option("--from-env <name>", "environment variable containing the real credential")
    .option("--from-stdin", "read the real credential from stdin")
    .option("--prompt", "prompt for the real credential without echoing input")
    .option("--json", "print JSON")
    .action(async (id, options: {
      preset?: string;
      host: string[];
      name?: string;
      credentialName?: string;
      bindingName?: string;
      auth?: CredentialAuthType;
      header?: string;
      scheme: string[];
      method: string[];
      path: string[];
      fakeEnv: Record<string, string>;
      fromEnv?: string;
      fromStdin?: boolean;
      prompt?: boolean;
      json?: boolean;
    }) => {
      const body = await credentialFromDirectOptions(options);
      const client = await apiClient();
      const result = await client.credentials.attach(id, body);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProgress(`credential attached. status=${result.attachment.status}`);
      console.log(attachmentLine(result.attachment));
    });

  vault
    .command("attach-secret")
    .argument("<id>", "sandbox id")
    .argument("<secret-id>", "workspace credential secret id")
    .description("Attach an encrypted workspace credential secret to a running sandbox")
    .option("--name <name>", "attachment display name")
    .option("--credential-name <name>", "provider-local credential name")
    .option("--binding-name <name>", "provider-local binding name")
    .option("--json", "print JSON")
    .action(async (id, secretId, options: {
      name?: string;
      credentialName?: string;
      bindingName?: string;
      json?: boolean;
    }) => {
      const client = await apiClient();
      const result = await client.credentials.attachSecret(id, secretId, {
        displayName: options.name,
        credentialName: options.credentialName,
        bindingName: options.bindingName
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProgress(`credential secret attached. status=${result.attachment.status}`);
      console.log(attachmentLine(result.attachment));
    });

  vault
    .command("refresh")
    .argument("<id>", "sandbox id")
    .argument("<attachment-id>", "dynamic credential attachment id")
    .description("Replace a dynamic attachment with a newly issued short-lived credential")
    .option("--json", "print JSON")
    .action(async (id, attachmentId, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.refresh(id, attachmentId);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProgress(`dynamic credential refreshed. expires=${result.attachment.expiresAt ?? "unknown"}`);
      console.log(attachmentLine(result.attachment));
    });

  vault
    .command("rehydrate")
    .argument("<id>", "sandbox id")
    .description("Rehydrate stored credential attachments that need reinjection")
    .option("--json", "print JSON")
    .action(async (id, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.rehydrate(id);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProgress(`credentials rehydrated. restored=${result.rehydrated} skipped=${result.skipped} failed=${result.failed}`);
      if (result.attachments.length) {
        console.log("id\tstatus\tprovider-state\tname\tcredential\tbinding\thosts\tfake-env");
        for (const attachment of result.attachments) console.log(attachmentLine(attachment));
      }
    });

  vault
    .command("test")
    .argument("<id>", "sandbox id")
    .argument("<attachment-id>", "credential attachment id")
    .description("Test a credential binding from inside the sandbox")
    .option("--target <url-or-host>", "target URL or host; defaults to the first concrete binding target")
    .option("--method <method>", "HTTP method; defaults to the first binding method or GET")
    .option("--timeout-ms <ms>", "maximum test duration", parsePositiveInt)
    .option("--json", "print JSON")
    .action(async (id, attachmentId, options: { target?: string; method?: string; timeoutMs?: number; json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.test(id, attachmentId, {
        target: options.target,
        method: options.method,
        timeoutMs: options.timeoutMs
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`${result.ok ? "ok" : "failed"}\t${result.status}\t${result.method}\t${result.httpStatus ?? "-"}\t${result.url}`);
      if (result.stderr && !result.ok) process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
    });

  vault
    .command("detach")
    .argument("<id>", "sandbox id")
    .argument("<attachment-id>", "credential attachment id")
    .description("Detach a sandbox credential attachment")
    .option("--json", "print JSON")
    .action(async (id, attachmentId, options: { json?: boolean }) => {
      const client = await apiClient();
      const result = await client.credentials.detach(id, attachmentId);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProgress(`credential detached. status=${result.attachment.status}`);
      console.log(attachmentLine(result.attachment));
    });
};
