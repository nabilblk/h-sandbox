import { z } from "zod";
import { egressModes, egressPresetIds } from "@harakiri/shared";

const egressPolicySchema = z.object({
  mode: z.enum(egressModes).default("open"),
  presets: z.array(z.enum(egressPresetIds)).default([]),
  allow: z.array(z.string().min(1).max(253)).default([]),
  deny: z.array(z.string().min(1).max(253)).default([]),
  defaultAction: z.enum(["allow", "deny"]).optional()
});

export const settingsSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  idleTtlSeconds: z.number().int().min(10).max(86400).optional(),
  maxConcurrency: z.number().int().min(1).max(10000).optional(),
  expectedCapacityRevision: z.number().int().min(1).optional(),
  defaultTemplateId: z.string().optional(),
  defaultEgressPolicy: egressPolicySchema.optional(),
  egressAllowedPresets: z.array(z.enum(egressPresetIds)).optional(),
  egressCustomDomainsEnabled: z.boolean().optional(),
  egressMaxRules: z.number().int().min(0).max(10000).optional(),
  egressRedactDomains: z.boolean().optional()
});
