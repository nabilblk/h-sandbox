import { z } from "zod";
import { credentialSecretUsePolicies } from "@harakiri/shared";
import {
  credentialProviderProfileIdSchema,
  customCredentialProfileSchema,
  validateCredentialProfile
} from "./credential-profile.schema.js";

const envKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid environment variable name");

export const credentialSecretCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerPresetId: credentialProviderProfileIdSchema,
  customProfile: customCredentialProfileSchema.optional(),
  value: z.string().min(1).max(64 * 1024),
  usePolicy: z.enum(credentialSecretUsePolicies).default("admins_only"),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict().superRefine(validateCredentialProfile);

export const credentialSecretRotateSchema = z.object({
  value: z.string().min(1).max(64 * 1024)
}).strict();

export const credentialSecretUpdateSchema = z.object({
  usePolicy: z.enum(credentialSecretUsePolicies)
}).strict();

export const credentialSecretListQuerySchema = z.object({
  includeDeleted: z
    .union([z.boolean(), z.enum(["0", "1", "true", "false"])])
    .optional()
    .transform((value) => value === true || value === "1" || value === "true")
}).strict();
