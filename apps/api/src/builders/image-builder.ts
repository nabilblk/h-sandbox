export type ImageBuilderKind = "buildkit" | "image-import" | "kaniko-legacy" | string;

export type ImageBuildSource =
  | {
      type: "dockerfile";
      contextRef: string;
      dockerfilePath: string;
      buildArgs: Record<string, unknown>;
    }
  | {
      type: "image";
      imageUri: string;
    }
  | {
      type: "git";
      repositoryUrl: string;
      ref?: string;
      dockerfilePath?: string;
      buildArgs?: Record<string, unknown>;
    };

export type ImageBuildRequest = {
  buildId: string;
  organizationId: string;
  templateId: string;
  source: ImageBuildSource;
  destination?: string;
  metadata?: Record<string, unknown>;
};

export type ImageBuildLogEntry = {
  stream: "stdout" | "stderr";
  message: string;
  createdAt?: string;
};

export type ImageBuildResult = {
  imageUri: string;
  imageDigest: string;
  provenance: {
    builder: ImageBuilderKind;
    startedAt: string;
    completedAt: string;
    details?: Record<string, unknown>;
  };
  sbomRef?: string | null;
  cache?: Record<string, unknown>;
  logs?: ImageBuildLogEntry[];
};

export type ImageBuilderCapabilities = {
  dockerfile: boolean;
  imageImport: boolean;
  git: boolean;
  cache: boolean;
  rootless: boolean;
};

export interface ImageBuilder {
  readonly kind: ImageBuilderKind;
  readonly capabilities: ImageBuilderCapabilities;

  build(request: ImageBuildRequest): Promise<ImageBuildResult>;
  cancel?(buildId: string): Promise<void>;
  cleanup?(buildId: string): Promise<void>;
}
