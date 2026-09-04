import { z } from "zod";
import { egressModes, egressPresetIds } from "@harakiri/shared";
import {
  credentialProviderProfileIdSchema,
  customCredentialProfileSchema,
  validateCredentialProfile
} from "./credential-profile.schema.js";

const templateVisibilitySchema = z.enum(["public", "private", "internal"]);
const templateIconSchema = z.enum(["py", "node", "globe", "box", "file"]);
const credentialSlotIdSchema = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/);
const envNameSchema = z.string().min(1).max(120).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const egressPolicySchema = z.object({
  mode: z.enum(egressModes).default("open"),
  presets: z.array(z.enum(egressPresetIds)).default([]),
  allow: z.array(z.string().min(1).max(253)).default([]),
  deny: z.array(z.string().min(1).max(253)).default([]),
  defaultAction: z.enum(["allow", "deny"]).optional()
});

export const templateCredentialSlotInputSchema = z.object({
  id: credentialSlotIdSchema.optional(),
  providerPresetId: credentialProviderProfileIdSchema,
  customProfile: customCredentialProfileSchema.optional(),
  required: z.boolean().default(true),
  label: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
  envName: envNameSchema.optional()
}).strict().superRefine(validateCredentialProfile);

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
  runtimeFamily: z.string().min(1).max(80).default("custom"),
  egressPolicy: egressPolicySchema.optional(),
  credentialSlots: z.array(templateCredentialSlotInputSchema).max(32).default([])
});

export const templatePromoteSchema = z.object({
  versionId: z.string().min(1),
  alias: z.string().min(1).max(80).default("stable")
});

export const templateEgressSchema = z.object({
  egressPolicy: egressPolicySchema
});

export type TemplateCreateBody = z.infer<typeof templateCreateSchema>;
export type TemplatePromoteBody = z.infer<typeof templatePromoteSchema>;
export type TemplateEgressBody = z.infer<typeof templateEgressSchema>;
