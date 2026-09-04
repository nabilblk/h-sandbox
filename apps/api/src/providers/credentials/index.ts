import { githubAppInstallationIssuer } from "./github-app-installation.js";
import type { DynamicCredentialIssuerRegistry } from "./provider.js";

export const dynamicCredentialIssuers: DynamicCredentialIssuerRegistry = {
  github_app_installation: githubAppInstallationIssuer
};

export type {
  DynamicCredentialIssuance,
  DynamicCredentialIssuerAdapter,
  DynamicCredentialIssuerRegistry,
  DynamicCredentialValidation
} from "./provider.js";
