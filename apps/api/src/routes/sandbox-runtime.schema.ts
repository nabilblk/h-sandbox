import { z } from "zod";
import { egressModes, egressPresetIds } from "@harakiri/shared";

export const runSchema = z.object({
  command: z.string().optional(),
  stdin: z.string().optional()
});

export const routeSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]).default("http")
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
