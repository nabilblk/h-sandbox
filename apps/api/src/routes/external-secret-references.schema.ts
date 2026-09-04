import { z } from "zod";
import { credentialSecretUsePolicies, externalSecretResolverTypes } from "@harakiri/shared";
import {
  credentialProviderProfileIdSchema,
  customCredentialProfileSchema,
  validateCredentialProfile
} from "./credential-profile.schema.js";

const envKeySchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  "must be a valid environment variable name"
);

const kubernetesReferenceSchema = z.object({
  namespace: z.string().trim().min(1).max(253).optional(),
  name: z.string().trim().min(1).max(253),
  key: z.string().trim().min(1).max(253)
}).strict();

export const externalSecretReferenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerPresetId: credentialProviderProfileIdSchema,
  customProfile: customCredentialProfileSchema.optional(),
  resolverType: z.enum(externalSecretResolverTypes),
  reference: kubernetesReferenceSchema,
  usePolicy: z.enum(credentialSecretUsePolicies).default("admins_only"),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict().superRefine(validateCredentialProfile);

export const externalSecretReferenceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  providerPresetId: credentialProviderProfileIdSchema.optional(),
  customProfile: customCredentialProfileSchema.optional(),
  reference: kubernetesReferenceSchema.optional(),
  usePolicy: z.enum(credentialSecretUsePolicies).optional(),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "at least one external secret reference field is required"
});

export const externalSecretReferenceListQuerySchema = z.object({
  includeDeleted: z
    .union([z.boolean(), z.enum(["0", "1", "true", "false"])])
    .optional()
    .transform((value) => value === true || value === "1" || value === "true")
}).strict();
