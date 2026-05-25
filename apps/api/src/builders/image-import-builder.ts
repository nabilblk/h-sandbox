import { resolveImageDigest } from "../registry.js";
import type { ImageBuildRequest, ImageBuildResult, ImageBuilder } from "./image-builder.js";

type ResolveImageDigest = typeof resolveImageDigest;

export type ImageImportBuilderOptions = {
  resolveImageDigest?: ResolveImageDigest;
  now?: () => Date;
};

export class ImageImportBuilder implements ImageBuilder {
  readonly kind = "image-import";
  readonly capabilities = {
    dockerfile: false,
    imageImport: true,
    git: false,
    cache: false,
    rootless: true
  };

  private readonly resolveImageDigest: ResolveImageDigest;
  private readonly now: () => Date;

  constructor(options: ImageImportBuilderOptions = {}) {
    this.resolveImageDigest = options.resolveImageDigest ?? resolveImageDigest;
    this.now = options.now ?? (() => new Date());
  }

  async build(request: ImageBuildRequest): Promise<ImageBuildResult> {
    if (request.source.type !== "image") {
      throw new Error(`ImageImportBuilder cannot build source type ${request.source.type}`);
    }

    const startedAt = this.now().toISOString();
    const requestedImage = request.source.imageUri;
    const resolved = await this.resolveImageDigest(requestedImage);
    const completedAt = this.now().toISOString();

    return {
      imageUri: resolved.digestPinnedRef,
      imageDigest: resolved.digest,
      provenance: {
        builder: this.kind,
        startedAt,
        completedAt,
        details: {
          source: "image-import",
          requestedImage,
          resolvedImage: resolved.digestPinnedRef,
          buildId: request.buildId,
          templateId: request.templateId,
          organizationId: request.organizationId
        }
      }
    };
  }
}

export const imageImportBuilder = new ImageImportBuilder();
