import { z } from "zod";
import {
  credentialSecretUsePolicies,
  dynamicCredentialIssuerTypes
} from "@harakiri/shared";

const envKeySchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  "must be a valid environment variable name"
);

const githubScopeSchema = z.object({
  installationId: z.string().trim().regex(/^[1-9]\d*$/, "must be a positive integer"),
  repositories: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
  permissions: z.record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    z.enum(["read", "write", "admin"])
  ).refine((value) => Object.keys(value).length > 0, "at least one permission is required")
}).strict();

export const dynamicCredentialIssuerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  issuerType: z.enum(dynamicCredentialIssuerTypes),
  scope: githubScopeSchema,
  usePolicy: z.enum(credentialSecretUsePolicies).default("admins_only"),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict();

export const dynamicCredentialIssuerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: githubScopeSchema.optional(),
  usePolicy: z.enum(credentialSecretUsePolicies).optional(),
  fakeEnv: z.record(envKeySchema, z.string().max(4096)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "at least one dynamic credential issuer field is required"
});

export const dynamicCredentialIssuerListQuerySchema = z.object({
  includeDeleted: z
    .union([z.boolean(), z.enum(["0", "1", "true", "false"])])
    .optional()
    .transform((value) => value === true || value === "1" || value === "true")
}).strict();
