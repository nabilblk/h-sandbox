import { z } from "zod";
import {
  credentialProviderProfileIds,
  customCredentialAuthTypes
} from "@harakiri/shared";

const envNameSchema = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const credentialProviderProfileIdSchema = z.enum(credentialProviderProfileIds);

export const customCredentialProfileSchema = z.object({
  host: z.string().trim().min(1).max(253),
  authType: z.enum(customCredentialAuthTypes),
  headerName: z.string().trim().min(1).max(128).optional(),
  methods: z.array(z.string().trim().min(1).max(16)).max(16).optional(),
  paths: z.array(z.string().trim().min(1).max(512)).max(16).optional(),
  envName: envNameSchema.optional(),
  testPath: z.string().trim().min(1).max(512).optional()
}).strict();

export const validateCredentialProfile = (
  value: { providerPresetId: string; customProfile?: unknown },
  context: z.RefinementCtx
) => {
  if (value.providerPresetId === "custom" && !value.customProfile) {
    context.addIssue({ code: "custom", path: ["customProfile"], message: "customProfile is required when providerPresetId is custom" });
  }
  if (value.providerPresetId !== "custom" && value.customProfile) {
    context.addIssue({ code: "custom", path: ["customProfile"], message: "customProfile is only valid when providerPresetId is custom" });
  }
};
