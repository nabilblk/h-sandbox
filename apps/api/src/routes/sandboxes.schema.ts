import { z } from "zod";
import { egressModes, egressPresetIds } from "@harakiri/shared";

const sandboxEnvKeySchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
  message: "environment variable names must match [A-Za-z_][A-Za-z0-9_]*"
});

const sandboxEnvSchema = z.record(sandboxEnvKeySchema, z.string().max(32768)).default({}).refine((value) => Object.keys(value).length <= 64, {
  message: "at most 64 environment variables can be passed to a sandbox"
});

const egressPolicySchema = z.object({
  mode: z.enum(egressModes).optional(),
  presets: z.array(z.enum(egressPresetIds)).optional(),
  allow: z.array(z.string().min(1).max(253)).optional(),
  deny: z.array(z.string().min(1).max(253)).optional(),
  defaultAction: z.enum(["allow", "deny"]).optional()
});

const gitCredentialPersistenceSchema = z.enum(["one-shot", "dangerously-store-in-remote"]);
const gitSubmodulesSchema = z.union([z.boolean(), z.literal("recursive")]);
const sourceStatusSchema = z.enum(["requested", "cloning", "ready", "failed"]);

const sandboxGitSourceSchema = z.object({
  type: z.literal("git"),
  url: z.string().min(1).max(2048),
  branch: z.string().min(1).max(512).optional(),
  commit: z.string().min(1).max(128).optional(),
  targetPath: z.string().min(1).max(1024).optional(),
  depth: z.number().int().min(1).max(100000).optional(),
  shallow: z.boolean().optional(),
  submodules: gitSubmodulesSchema.optional(),
  credentialPersistence: gitCredentialPersistenceSchema.optional(),
  applyEgressPreset: z.boolean().optional(),
  timeoutMs: z.number().int().min(1).max(900000).optional()
}).strict();

const sandboxSourceSchema = sandboxGitSourceSchema;

const sandboxSourceProvenanceSchema = sandboxGitSourceSchema.omit({ applyEgressPreset: true, timeoutMs: true }).extend({
  targetPath: z.string().min(1).max(1024),
  status: sourceStatusSchema,
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().min(0).nullable().optional(),
  failureReason: z.string().max(4096).nullable().optional()
}).strict();

export const createSandboxSchema = z.object({
  template: z.string().optional(),
  snapshotId: z.string().min(1).max(160).optional(),
  name: z.string().optional(),
  ttlSeconds: z.number().int().min(10).max(86400).default(300),
  env: sandboxEnvSchema,
  egress: egressPolicySchema.nullable().optional(),
  source: sandboxSourceSchema.optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  wait: z.boolean().optional(),
  waitTimeoutMs: z.number().int().min(0).max(30000).optional()
}).refine((value) => !(value.snapshotId && value.source), {
  message: "source bootstrap cannot be combined with snapshot restore in the same request"
});

export const createSandboxSnapshotSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  metadata: z.record(z.string().min(1).max(128), z.string().max(1024)).default({}),
  expiresAt: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  wait: z.boolean().optional(),
  waitTimeoutMs: z.number().int().min(0).max(120000).optional()
});

export const patchSandboxSourceSchema = z.object({
  source: sandboxSourceProvenanceSchema.nullable()
});
