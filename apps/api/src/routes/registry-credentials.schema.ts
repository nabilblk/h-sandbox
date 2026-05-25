import { z } from "zod";
import { config } from "../config.js";

const registryCredentialPurposeSchema = z.enum(["pull", "push", "push_pull"]);

export const registryCredentialSchema = z.object({
  name: z.string().min(1).max(120),
  registryHost: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
  secretRef: z.string().max(255).optional(),
  secret: z.string().min(1).max(20000).optional(),
  purpose: registryCredentialPurposeSchema.default("pull"),
  repositoryPrefix: z.string().min(1).max(255).default(config.templateRegistryRepositoryPrefix),
  pullSecretRef: z.string().max(255).optional(),
  pushSecretRef: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).refine((value) => value.secretRef || value.secret || value.pullSecretRef || value.pushSecretRef, {
  message: "registry credentials require an encrypted secret or an external secret reference"
});
