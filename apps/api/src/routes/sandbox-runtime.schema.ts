import { z } from "zod";

export const runSchema = z.object({
  command: z.string().optional(),
  stdin: z.string().optional()
});

export const routeSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]).default("http")
});
