import { z } from "zod";
import { egressModes, egressPresetIds, sandboxFileEncodings, sandboxGitOperationNames, sandboxRouteAccessModes } from "@harakiri/shared";

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
