import type {
  ExternalSecretResolverType,
  KubernetesSecretReference
} from "@harakiri/shared";

export type ExternalSecretResolution =
  | { kind: "ok"; value: string; versionRef: string | null }
  | { kind: "not_found"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "unavailable"; message: string };

export type ExternalSecretResolver = {
  type: ExternalSecretResolverType;
  resolve(reference: KubernetesSecretReference): Promise<ExternalSecretResolution>;
};

export type ExternalSecretResolverRegistry = Partial<Record<ExternalSecretResolverType, ExternalSecretResolver>>;
