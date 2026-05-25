import { z } from "zod";

export const settingsSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  idleTtlSeconds: z.number().int().min(10).max(86400).optional(),
  maxConcurrency: z.number().int().min(1).max(10000).optional(),
  defaultTemplateId: z.string().optional()
});
