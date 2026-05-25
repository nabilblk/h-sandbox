import { z } from "zod";

const sandboxEnvKeySchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
  message: "environment variable names must match [A-Za-z_][A-Za-z0-9_]*"
});

const sandboxEnvSchema = z.record(sandboxEnvKeySchema, z.string().max(32768)).default({}).refine((value) => Object.keys(value).length <= 64, {
  message: "at most 64 environment variables can be passed to a sandbox"
});

export const createSandboxSchema = z.object({
  template: z.string().default("python-3.12-data"),
  name: z.string().optional(),
  ttlSeconds: z.number().int().min(10).max(86400).default(300),
  env: sandboxEnvSchema,
  idempotencyKey: z.string().min(1).max(160).optional(),
  wait: z.boolean().optional(),
  waitTimeoutMs: z.number().int().min(0).max(30000).optional()
});
