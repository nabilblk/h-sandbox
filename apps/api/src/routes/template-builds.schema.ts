import { z } from "zod";

export const templateBuildSchema = z.object({
  sourceType: z.enum(["dockerfile", "git", "image"]).default("dockerfile"),
  contextHash: z.string().optional(),
  dockerfilePath: z.string().default("Dockerfile"),
  buildArgs: z.record(z.string(), z.unknown()).default({}),
  imageDestination: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const templateBuildContextUploadSchema = z.object({
  archiveBase64: z.string().min(1),
  sha256: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  format: z.literal("tar+gzip").default("tar+gzip"),
  fileCount: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});
