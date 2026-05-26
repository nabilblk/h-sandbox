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

export const createSandboxSchema = z.object({
  template: z.string().default("python-3.12-data"),
  name: z.string().optional(),
  ttlSeconds: z.number().int().min(10).max(86400).default(300),
  env: sandboxEnvSchema,
  egress: egressPolicySchema.nullable().optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  wait: z.boolean().optional(),
  waitTimeoutMs: z.number().int().min(0).max(30000).optional()
});
