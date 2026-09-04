import type { CoreV1Api } from "@kubernetes/client-node";
import type { KubernetesSecretReference } from "@harakiri/shared";
import { config } from "../../config.js";
import { kubernetes } from "../../kubernetes.js";
import { redactText } from "../../redaction.js";
import type { ExternalSecretResolution, ExternalSecretResolver } from "./provider.js";

type KubernetesSecretReader = Pick<CoreV1Api, "readNamespacedSecret">;

type KubernetesSecretResolverOptions = {
  enabled: boolean;
  allowedNamespaces: string[];
  allowedNames: string[];
  allowedNamePrefixes: string[];
  core: () => KubernetesSecretReader;
};

const defaultOptions: KubernetesSecretResolverOptions = {
  enabled: config.externalSecretKubernetesEnabled,
  allowedNamespaces: config.externalSecretKubernetesAllowedNamespaces,
  allowedNames: config.externalSecretKubernetesAllowedNames,
  allowedNamePrefixes: config.externalSecretKubernetesAllowedNamePrefixes,
  core: () => kubernetes.core()
};

const nameIsAllowed = (name: string, options: KubernetesSecretResolverOptions) => {
  if (!options.allowedNames.length && !options.allowedNamePrefixes.length) return true;
  return options.allowedNames.includes(name)
    || options.allowedNamePrefixes.some((prefix) => name.startsWith(prefix));
};

const forbiddenReason = (reference: KubernetesSecretReference, options: KubernetesSecretResolverOptions) => {
  if (!options.allowedNamespaces.includes(reference.namespace)) {
    return `Kubernetes Secret namespace ${reference.namespace} is not allowed`;
  }
  if (!nameIsAllowed(reference.name, options)) {
    return `Kubernetes Secret ${reference.name} is not allowed`;
  }
  return null;
};

const errorStatus = (error: unknown) => {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const response = record.response && typeof record.response === "object"
    ? record.response as Record<string, unknown>
    : null;
  const value = record.code ?? record.statusCode ?? response?.statusCode ?? response?.status;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const mapReadError = (error: unknown): ExternalSecretResolution => {
  const status = errorStatus(error);
  if (status === 404) return { kind: "not_found", message: "Kubernetes Secret was not found" };
  if (status === 401 || status === 403) {
    return { kind: "forbidden", message: "Kubernetes denied access to the Secret" };
  }
  const message = redactText(error instanceof Error ? error.message : String(error));
  return { kind: "unavailable", message: `Kubernetes Secret resolver is unavailable: ${message}` };
};

const decodeSecretValue = (encoded: string | undefined, key: string): ExternalSecretResolution => {
  if (encoded === undefined) return { kind: "not_found", message: `Kubernetes Secret key ${key} was not found` };
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(encoded, "base64"));
    if (!value) return { kind: "invalid", message: `Kubernetes Secret key ${key} is empty` };
    return { kind: "ok", value, versionRef: null };
  } catch {
    return { kind: "invalid", message: `Kubernetes Secret key ${key} is not valid UTF-8` };
  }
};

export const createKubernetesSecretResolver = (
  overrides: Partial<KubernetesSecretResolverOptions> = {}
): ExternalSecretResolver => {
  const options = { ...defaultOptions, ...overrides };
  return {
    type: "kubernetes_secret",
    async resolve(reference) {
      if (!options.enabled) {
        return { kind: "unavailable", message: "Kubernetes Secret resolution is disabled by the operator" };
      }
      const forbidden = forbiddenReason(reference, options);
      if (forbidden) return { kind: "forbidden", message: forbidden };
      try {
        const secret = await options.core().readNamespacedSecret({
          namespace: reference.namespace,
          name: reference.name
        });
        const decoded = decodeSecretValue(secret.data?.[reference.key], reference.key);
        if (decoded.kind !== "ok") return decoded;
        return {
          ...decoded,
          versionRef: secret.metadata?.resourceVersion ?? null
        };
      } catch (error) {
        return mapReadError(error);
      }
    }
  };
};

export const kubernetesSecretResolver = createKubernetesSecretResolver();
