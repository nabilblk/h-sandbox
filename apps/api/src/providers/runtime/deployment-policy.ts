import type { EgressNetworkPolicy, RuntimeCapabilitySummary } from "@harakiri/shared";
import type { RuntimeCreateSandboxInput, RuntimeProvider, RuntimeProviderCapabilities } from "./provider.js";

export const runtimeFeatures = ["egress", "credential-vault", "snapshots", "pause-resume"] as const;
export type RuntimeFeature = typeof runtimeFeatures[number];

export function parseDisabledRuntimeFeatures(value = ""): RuntimeFeature[] {
  const features = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (features.some((feature) => !runtimeFeatures.includes(feature as RuntimeFeature))) {
    throw new Error(`RUNTIME_DISABLED_FEATURES accepts only: ${runtimeFeatures.join(", ")}`);
  }
  // Vault requires enforced outbound access; disabling that boundary must fail closed.
  if (features.includes("egress") && !features.includes("credential-vault")) features.push("credential-vault");
  return features as RuntimeFeature[];
}

export const runtimeFeatureReason = (feature: RuntimeFeature) =>
  `The operator has disabled ${feature} in this deployment. No weaker runtime fallback is used.`;

export class RuntimeFeatureUnavailableError extends Error {
  readonly code = "runtime_feature_unavailable";
  readonly statusCode = 501;
  constructor(readonly feature: RuntimeFeature) {
    super(runtimeFeatureReason(feature));
    this.name = "RuntimeFeatureUnavailableError";
  }
}

export function requireRuntimeFeature(provider: RuntimeProvider, feature: RuntimeFeature): void {
  if (provider.disabledFeatures?.includes(feature)) throw new RuntimeFeatureUnavailableError(feature);
}

export function requireRuntimeNetworkPolicy(provider: RuntimeProvider, policy?: EgressNetworkPolicy | null): void {
  if (policy && (policy.defaultAction !== "allow" || policy.egress.length > 0)) requireRuntimeFeature(provider, "egress");
}

export function requireRuntimeCreate(provider: RuntimeProvider, input: Pick<RuntimeCreateSandboxInput, "snapshot" | "egressPolicy">): void {
  if (input.snapshot) requireRuntimeFeature(provider, "snapshots");
  requireRuntimeNetworkPolicy(provider, input.egressPolicy);
}

const blockedMethods: Record<RuntimeFeature, readonly (keyof RuntimeProvider)[]> = {
  egress: ["setEgressPolicy", "patchEgressRules"],
  "credential-vault": ["applyCredentialVault"],
  snapshots: ["createSnapshot"],
  "pause-resume": ["pause", "resume"]
};
const blockedCapabilities: Record<RuntimeFeature, readonly (keyof RuntimeProviderCapabilities)[]> = {
  egress: ["egress"],
  "credential-vault": ["credentialVault", "credentialVaultPatch", "credentialVaultSanitizedRead"],
  snapshots: ["snapshots"],
  "pause-resume": ["pause", "resume"]
};
const capabilityFeatures: Partial<Record<RuntimeCapabilitySummary["name"], RuntimeFeature>> = {
  egressPolicy: "egress",
  credentialVault: "credential-vault",
  credentialVaultPatch: "credential-vault",
  credentialVaultSanitizedRead: "credential-vault",
  lifecyclePause: "pause-resume",
  lifecycleResume: "pause-resume",
  lifecycleSnapshot: "snapshots",
  createFromSnapshot: "snapshots"
};

export function deploymentCapability(provider: RuntimeProvider, capability: RuntimeCapabilitySummary): RuntimeCapabilitySummary {
  const feature = capabilityFeatures[capability.name];
  return feature && provider.disabledFeatures?.includes(feature)
    ? { ...capability, state: "unavailable", contract: "unavailable", source: "Operator deployment policy", reason: runtimeFeatureReason(feature) }
    : capability;
}

export function restrictRuntimeProvider(provider: RuntimeProvider, disabled: readonly RuntimeFeature[]): RuntimeProvider {
  const features = Object.freeze(parseDisabledRuntimeFeatures([...(provider.disabledFeatures ?? []), ...disabled].join(",")));
  if (!features.length) return provider;
  const capabilities = { ...provider.capabilities };
  const blocked = new Set(features.flatMap((feature) => blockedMethods[feature]));
  for (const feature of features) for (const capability of blockedCapabilities[feature]) capabilities[capability] = false;
  Object.freeze(capabilities);
  const methods = new Map<PropertyKey, unknown>();
  const restricted = new Proxy(provider, {
    get(target, key) {
      if (key === "disabledFeatures") return features;
      if (key === "capabilities") return capabilities;
      if (blocked.has(key as keyof RuntimeProvider)) return undefined;
      if (key === "create") return create;
      const value = Reflect.get(target, key, target);
      // Preserve provider receivers, including class-private state. Inspection and
      // cleanup remain usable after a feature is disabled; new effects do not.
      if (typeof value !== "function") return value;
      if (!methods.has(key)) methods.set(key, value.bind(target));
      return methods.get(key);
    }
  });
  const create: RuntimeProvider["create"] = async (input) => {
    requireRuntimeCreate(restricted, input);
    // Do not request a no-op enforcement sidecar when that feature is disabled.
    return provider.create(features.includes("egress") ? { ...input, egressPolicy: undefined } : input);
  };
  return restricted;
}
