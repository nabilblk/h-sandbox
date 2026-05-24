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

export const activeTemplateBuildStatuses = ["queued", "building"] as const;

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
