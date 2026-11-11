import { z } from "zod";

export const agentRunIdSchema = z.string().regex(/^run_[A-Za-z0-9_-]{1,64}$/);
export const telemetrySandboxIdSchema = z.string().regex(/^sbx_[A-Za-z0-9_-]{1,64}$/);
export const agentOutcomeSchema = z.enum(["unknown", "succeeded", "failed", "cancelled"]);
export const createAgentRunSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sandboxId: telemetrySandboxIdSchema,
  capture: z.enum(["metadata", "content"]).default("metadata")
}).strict();
export const observabilityPolicySchema = z.object({ enabled: z.boolean(), allowContent: z.boolean() }).strict();
export const agentRunsQuerySchema = z.object({
  sandboxId: telemetrySandboxIdSchema.optional(),
  outcome: agentOutcomeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(1024).optional()
}).strict();
const instant = z.string().datetime().transform((value) => new Date(value).toISOString());
export const telemetryReadSchema = z.object({
  from: instant,
  to: instant,
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  traceId: z.string().regex(/^(?!0{32}$)[0-9a-f]{32}$/).optional(),
  spanId: z.string().regex(/^(?!0{16}$)[0-9a-f]{16}$/).optional(),
  includeContent: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
}).strict().refine((value) => !value.spanId || value.traceId, "spanId requires traceId")
  .refine((value) => Date.parse(value.to) > Date.parse(value.from)
    && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86_400_000, "The read window must be greater than zero and at most 31 days");

// PostgreSQL timestamps have microseconds; a millisecond round trip loses the
// keyset boundary and can skip rows. The opaque cursor preserves the DB value.
export const runCursorSchema = z.object({
  version: z.literal(1),
  time: z.string().datetime({ precision: 6 }),
  id: agentRunIdSchema,
  sandboxId: telemetrySandboxIdSchema.nullable(),
  outcome: agentOutcomeSchema.nullable(),
  search: z.string().max(120)
}).strict();
