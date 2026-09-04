import { z } from "zod";
import {
  credentialProviderProfileIds,
  egressModes,
  egressPresetIds,
  sandboxFileEncodings,
  sandboxGitOperationNames,
  sandboxRouteAccessModes
} from "@harakiri/shared";

const envKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid environment variable name");

const gitCommandMetadataSchema = z.object({
  capability: z.literal("git"),
  operation: z.enum(sandboxGitOperationNames),
  cwd: z.string().min(1).max(4096).optional(),
  targetPath: z.string().min(1).max(4096).optional(),
  repositoryUrl: z.string().min(1).max(2048).optional(),
  branch: z.string().min(1).max(512).optional(),
  ref: z.string().min(1).max(512).optional(),
  remote: z.string().min(1).max(256).optional(),
  configKey: z.string().min(1).max(512).optional(),
  credentialPersistence: z.enum(["one-shot", "dangerously-store-in-remote"]).optional(),
  hasCredentials: z.boolean().optional()
}).strict();

const commandMetadataSchema = gitCommandMetadataSchema;

export const runSchema = z.object({
  command: z.string().optional(),
  stdin: z.string().optional(),
  cwd: z.string().min(1).max(4096).optional(),
  env: z.record(envKeySchema, z.string()).optional(),
  timeoutMs: z.coerce.number().int().min(1_000).max(600_000).optional(),
  metadata: commandMetadataSchema.optional()
});

export const commandSchema = runSchema.extend({
  command: z.string().min(1),
  detached: z.boolean().optional()
});

export const commandSessionCreateSchema = z.object({
  cwd: z.string().min(1).max(4096).optional()
});

export const commandSessionRunSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).max(4096).optional(),
  timeoutMs: z.coerce.number().int().min(1_000).max(600_000).optional()
});

export const commandLogsSchema = z.object({
  cursor: z.coerce.number().int().min(0).optional(),
  tail: z.coerce.number().int().min(1).max(1000).optional()
});

export const routeSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]).default("http"),
  accessMode: z.enum(sandboxRouteAccessModes).default("public"),
  labels: z.array(z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/, "labels may contain letters, numbers, _, ., :, and -")).max(16).optional()
});

export const filePathSchema = z.object({
  path: z.string().min(1).max(4096).refine((value) => !value.includes("\0"), "path must not contain NUL bytes")
});

export const fileReadSchema = filePathSchema.extend({
  encoding: z.enum(sandboxFileEncodings).default("utf8")
});

export const fileWriteSchema = filePathSchema.extend({
  content: z.string(),
  encoding: z.enum(sandboxFileEncodings).default("utf8"),
  createParents: z.boolean().optional(),
  mode: z.string().regex(/^[0-7]{3,4}$/).optional()
});

export const fileUploadSchema = filePathSchema.extend({
  contentBase64: z.string(),
  sizeBytes: z.coerce.number().int().min(0).optional(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/i).optional(),
  createParents: z.boolean().optional(),
  mode: z.string().regex(/^[0-7]{3,4}$/).optional()
});

export const fileMkdirSchema = filePathSchema.extend({
  recursive: z.boolean().optional()
});

export const fileRemoveSchema = filePathSchema.extend({
  recursive: z.coerce.boolean().optional()
});

export const fileRenameSchema = z.object({
  fromPath: z.string().min(1).max(4096).refine((value) => !value.includes("\0"), "path must not contain NUL bytes"),
  toPath: z.string().min(1).max(4096).refine((value) => !value.includes("\0"), "path must not contain NUL bytes")
});

export const egressPatchSchema = z.object({
  mode: z.enum(egressModes).optional(),
  presets: z.array(z.enum(egressPresetIds)).optional(),
  allow: z.array(z.string().min(1).max(253)).optional(),
  deny: z.array(z.string().min(1).max(253)).optional(),
  reset: z.boolean().optional()
});

export const egressTestSchema = z.object({
  target: z.string().min(1).max(2048)
});

const credentialNameSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const credentialHeaderNameSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/);
const credentialSubstitutionSchema = z.object({
  credential: credentialNameSchema.optional(),
  placeholder: z.string().min(1).max(512),
  in: z.array(z.enum(["path", "query", "header", "body"])).min(1).max(4)
}).strict();

const credentialAuthBaseSchema = z.object({
  substitutions: z.array(credentialSubstitutionSchema).max(16).optional()
});

const credentialAuthSchema = z.discriminatedUnion("type", [
  credentialAuthBaseSchema.extend({
    type: z.literal("bearer"),
    credential: credentialNameSchema.optional()
  }).strict(),
  credentialAuthBaseSchema.extend({
    type: z.literal("basic"),
    credential: credentialNameSchema.optional()
  }).strict(),
  credentialAuthBaseSchema.extend({
    type: z.literal("apiKey"),
    name: credentialHeaderNameSchema,
    credential: credentialNameSchema.optional()
  }).strict(),
  credentialAuthBaseSchema.extend({
    type: z.literal("customHeaders"),
    headers: z.array(z.object({
      name: credentialHeaderNameSchema,
      credential: credentialNameSchema.optional()
    }).strict()).min(1).max(16)
  }).strict(),
  credentialAuthBaseSchema.extend({
    type: z.literal("passthrough")
  }).strict()
]);

const inlineCredentialAttachSchema = z.object({
  sourceType: z.literal("inline_ephemeral").optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  credentialName: credentialNameSchema.optional(),
  value: z.string().min(1).max(64 * 1024),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  binding: z.object({
    name: credentialNameSchema.optional(),
    match: z.object({
      schemes: z.array(z.enum(["https", "http"])).min(1).max(2).optional(),
      hosts: z.array(z.string().trim().min(1).max(253)).min(1).max(64),
      methods: z.array(z.string().trim().min(1).max(32)).min(1).max(16).optional(),
      paths: z.array(z.string().min(1).max(2048)).min(1).max(64).optional()
    }).strict(),
    auth: credentialAuthSchema
  }).strict()
}).strict();

const storedCredentialAttachSchema = z.object({
  sourceType: z.literal("harakiri_encrypted"),
  secretId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(120).optional(),
  credentialName: credentialNameSchema.optional(),
  bindingName: credentialNameSchema.optional()
}).strict();

const externalCredentialAttachSchema = z.object({
  sourceType: z.literal("external_ref"),
  referenceId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(120).optional(),
  credentialName: credentialNameSchema.optional(),
  bindingName: credentialNameSchema.optional()
}).strict();

const dynamicCredentialAttachSchema = z.object({
  sourceType: z.literal("dynamic"),
  issuerId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(120).optional(),
  credentialName: credentialNameSchema.optional(),
  bindingName: credentialNameSchema.optional()
}).strict();

const inlineTemplateCredentialSourceSchema = z.object({
  sourceType: z.literal("inline_ephemeral").optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  credentialName: credentialNameSchema.optional(),
  bindingName: credentialNameSchema.optional(),
  value: z.string().min(1).max(64 * 1024),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional()
}).strict();

export const credentialAttachSchema = z.union([
  inlineCredentialAttachSchema,
  storedCredentialAttachSchema,
  externalCredentialAttachSchema,
  dynamicCredentialAttachSchema
]);

export const createTimeCredentialAttachSchema = credentialAttachSchema;

export const templateCredentialSlotMappingSchema = z.object({
  slotId: z.string().trim().min(1).max(80).optional(),
  providerPresetId: z.enum(credentialProviderProfileIds).optional(),
  source: z.union([
    inlineTemplateCredentialSourceSchema,
    storedCredentialAttachSchema,
    externalCredentialAttachSchema,
    dynamicCredentialAttachSchema
  ])
}).strict().refine((value) => Boolean(value.slotId || value.providerPresetId), {
  message: "credential mapping requires slotId or providerPresetId"
});

export const credentialTestSchema = z.object({
  target: z.string().trim().min(1).max(2048).optional(),
  method: z.string().trim().min(1).max(32).optional(),
  timeoutMs: z.coerce.number().int().min(1_000).max(60_000).optional()
}).strict();

const booleanQuerySchema = z.union([z.boolean(), z.enum(["0", "1", "true", "false"])]).transform((value) => {
  if (typeof value === "boolean") return value;
  return value === "1" || value === "true";
});

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const envQuerySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const entries = Array.isArray(value) ? value : [value];
    const env: Record<string, string> = {};
    for (const entry of entries) {
      const index = entry.indexOf("=");
      if (index <= 0) {
        ctx.addIssue({ code: "custom", message: "env must be formatted as KEY=value" });
        return z.NEVER;
      }
      const key = entry.slice(0, index);
      if (!envNamePattern.test(key)) {
        ctx.addIssue({ code: "custom", message: "env key must match [A-Za-z_][A-Za-z0-9_]*" });
        return z.NEVER;
      }
      env[key] = entry.slice(index + 1);
    }
    return env;
  });

export const terminalAttachSchema = z.object({
  ticket: z.string().min(1).max(256).optional(),
  cwd: z.string().min(1).max(4096).optional(),
  shell: z.string().min(1).max(4096).optional(),
  sessionName: z.string().min(1).max(128).optional(),
  env: envQuerySchema,
  cols: z.coerce.number().int().min(1).max(1000).optional(),
  rows: z.coerce.number().int().min(1).max(1000).optional(),
  since: z.coerce.number().int().min(0).optional(),
  pty: booleanQuerySchema.optional()
});
