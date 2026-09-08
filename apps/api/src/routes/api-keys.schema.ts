import { z } from "zod";
import { apiKeyScopes } from "@harakiri/shared";

export const apiKeySchema = z.object({
  name: z.string().trim().min(1).max(100).default("cli"),
  scopes: z.array(z.enum(apiKeyScopes)).min(1).max(apiKeyScopes.length).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional()
}).strict();
