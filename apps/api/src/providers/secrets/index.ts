import { kubernetesSecretResolver } from "./kubernetes-secret-resolver.js";
import type { ExternalSecretResolverRegistry } from "./provider.js";

export const externalSecretResolvers: ExternalSecretResolverRegistry = {
  kubernetes_secret: kubernetesSecretResolver
};

export type {
  ExternalSecretResolution,
  ExternalSecretResolver,
  ExternalSecretResolverRegistry
} from "./provider.js";
