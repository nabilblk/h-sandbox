import { z } from "zod";

const templateVisibilitySchema = z.enum(["public", "private", "internal"]);
const templateIconSchema = z.enum(["py", "node", "globe", "box", "file"]);

export const templateCreateSchema = z.object({
  id: z.string().min(2).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/).optional(),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500).default("Custom sandbox template."),
  image: z.string().min(1).default("ubuntu:24.04"),
  icon: templateIconSchema.default("file"),
  tags: z.array(z.string().min(1).max(40)).default([]),
  aliases: z.array(z.string().min(1).max(100)).default([]),
  visibility: templateVisibilitySchema.default("private"),
  defaultEntrypoint: z.array(z.string().min(1)).default(["sleep", "3600"]),
  cpuCount: z.number().int().min(1).max(64).default(2),
  memoryMb: z.number().int().min(128).max(262144).default(2048),
  workdir: z.string().min(1).default("/workspace"),
  defaultPorts: z.array(z.number().int().min(1).max(65535)).default([]),
  runtimeFamily: z.string().min(1).max(80).default("custom")
});

export const templatePromoteSchema = z.object({
  versionId: z.string().min(1),
  alias: z.string().min(1).max(80).default("stable")
});

export type TemplateCreateBody = z.infer<typeof templateCreateSchema>;
export type TemplatePromoteBody = z.infer<typeof templatePromoteSchema>;
