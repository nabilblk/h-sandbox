import { parseImageReference } from "./registry.js";

export type TemplateResourceInput = {
  cpuCount: number;
  memoryMb: number;
  defaultPorts?: number[];
};

export type TemplateResourceLimits = {
  maxCpuCount: number;
  maxMemoryMb: number;
  maxDefaultPorts: number;
};

export type TemplateResourceViolation = {
  field: "cpuCount" | "memoryMb" | "defaultPorts";
  limit: number;
  actual: number;
  message: string;
};

export const templateBuildStatuses = ["queued", "building", "success", "failed", "canceled"] as const;
export type TemplateBuildStatus = typeof templateBuildStatuses[number];
export const activeTemplateBuildStatuses = ["queued", "building"] as const;
export const terminalTemplateBuildStatuses = ["success", "failed", "canceled"] as const;

export const isActiveTemplateBuildStatus = (status: string): status is typeof activeTemplateBuildStatuses[number] =>
  activeTemplateBuildStatuses.includes(status as typeof activeTemplateBuildStatuses[number]);

export const isTerminalTemplateBuildStatus = (status: string): status is typeof terminalTemplateBuildStatuses[number] =>
  terminalTemplateBuildStatuses.includes(status as typeof terminalTemplateBuildStatuses[number]);

export const canUploadTemplateBuildContext = (status: string) => status === "queued";
export const shouldApplyTemplateBuildFailure = (status: string) => status !== "canceled";
export const shouldCreateTemplateVersionForBuild = (status: string) => status !== "canceled";

export const templateResourceLimitViolations = (
  resources: TemplateResourceInput,
  limits: TemplateResourceLimits
): TemplateResourceViolation[] => {
  const violations: TemplateResourceViolation[] = [];
  if (resources.cpuCount > limits.maxCpuCount) {
    violations.push({
      field: "cpuCount",
      limit: limits.maxCpuCount,
      actual: resources.cpuCount,
      message: `cpuCount must be less than or equal to ${limits.maxCpuCount}`
    });
  }
  if (resources.memoryMb > limits.maxMemoryMb) {
    violations.push({
      field: "memoryMb",
      limit: limits.maxMemoryMb,
      actual: resources.memoryMb,
      message: `memoryMb must be less than or equal to ${limits.maxMemoryMb}`
    });
  }
  const portCount = resources.defaultPorts?.length ?? 0;
  if (portCount > limits.maxDefaultPorts) {
    violations.push({
      field: "defaultPorts",
      limit: limits.maxDefaultPorts,
      actual: portCount,
      message: `defaultPorts must include at most ${limits.maxDefaultPorts} ports`
    });
  }
  return violations;
};

export const buildConcurrencyLimitExceeded = (activeBuildCount: number, maxActiveBuilds: number) =>
  activeBuildCount >= maxActiveBuilds;

export type TemplateImagePolicy = {
  allowRegistries: string[];
  denyRegistries: string[];
  allowPrefixes: string[];
  denyPrefixes: string[];
};

export type TemplateImagePolicyViolation = {
  image: string;
  normalizedImage?: string;
  registry?: string;
  reason: "dynamic_reference" | "invalid_reference" | "denied_registry" | "registry_not_allowed" | "denied_prefix" | "prefix_not_allowed";
  message: string;
};

const normalizedPolicyList = (values: string[]) => values.map((value) => value.trim().toLowerCase()).filter(Boolean);

const normalizedImageReference = (image: ReturnType<typeof parseImageReference>) =>
  `${image.displayRegistry}/${image.repository}${image.referenceType === "digest" ? "@" : ":"}${image.reference}`.toLowerCase();

export const templateImagePolicyViolation = (
  imageRef: string,
  policy: TemplateImagePolicy,
  options: { dynamic?: boolean } = {}
): TemplateImagePolicyViolation | null => {
  if (options.dynamic) {
    return {
      image: imageRef,
      reason: "dynamic_reference",
      message: "Dockerfile FROM references must use literal image references so policy can be enforced"
    };
  }

  let image;
  try {
    image = parseImageReference(imageRef);
  } catch (error) {
    return {
      image: imageRef,
      reason: "invalid_reference",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const registryCandidates = new Set([image.registry.toLowerCase(), image.displayRegistry.toLowerCase()]);
  const denyRegistries = normalizedPolicyList(policy.denyRegistries);
  const deniedRegistry = denyRegistries.find((registry) => registryCandidates.has(registry));
  if (deniedRegistry) {
    return {
      image: imageRef,
      normalizedImage: normalizedImageReference(image),
      registry: image.displayRegistry,
      reason: "denied_registry",
      message: `registry ${image.displayRegistry} is denied by template image policy`
    };
  }

  const allowRegistries = normalizedPolicyList(policy.allowRegistries);
  if (allowRegistries.length && !allowRegistries.some((registry) => registryCandidates.has(registry))) {
    return {
      image: imageRef,
      normalizedImage: normalizedImageReference(image),
      registry: image.displayRegistry,
      reason: "registry_not_allowed",
      message: `registry ${image.displayRegistry} is not allowed by template image policy`
    };
  }

  const normalizedRef = normalizedImageReference(image);
  const denyPrefixes = normalizedPolicyList(policy.denyPrefixes);
  const deniedPrefix = denyPrefixes.find((prefix) => normalizedRef.startsWith(prefix));
  if (deniedPrefix) {
    return {
      image: imageRef,
      normalizedImage: normalizedRef,
      registry: image.displayRegistry,
      reason: "denied_prefix",
      message: `image ${normalizedRef} is denied by template image policy`
    };
  }

  const allowPrefixes = normalizedPolicyList(policy.allowPrefixes);
  if (allowPrefixes.length && !allowPrefixes.some((prefix) => normalizedRef.startsWith(prefix))) {
    return {
      image: imageRef,
      normalizedImage: normalizedRef,
      registry: image.displayRegistry,
      reason: "prefix_not_allowed",
      message: `image ${normalizedRef} does not match an allowed template image prefix`
    };
  }

  return null;
};
