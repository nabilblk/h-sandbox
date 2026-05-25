import { config } from "../config.js";
import { apiErrorResponse } from "@harakiri/shared";
import { templateImagePolicyViolation, templateResourceLimitViolations } from "../template-policy.js";

const templateResourceLimits = () => ({
  maxCpuCount: config.templateMaxCpuCount,
  maxMemoryMb: config.templateMaxMemoryMb,
  maxDefaultPorts: config.templateMaxDefaultPorts
});

export const templateResourceLimitPayload = (resources: { cpuCount: number; memoryMb: number; defaultPorts?: number[] }) => {
  const violations = templateResourceLimitViolations(resources, templateResourceLimits());
  if (!violations.length) return null;
  return apiErrorResponse("template_resource_limit_exceeded", { violations });
};

const templateImagePolicy = () => ({
  allowRegistries: config.templateImageAllowRegistries,
  denyRegistries: config.templateImageDenyRegistries,
  allowPrefixes: config.templateImageAllowPrefixes,
  denyPrefixes: config.templateImageDenyPrefixes
});

export const templateImagePolicyPayload = (images: Array<{ image: string; dynamic?: boolean; line?: number }>) => {
  const policy = templateImagePolicy();
  const violations = images
    .map(({ image, dynamic, line }) => {
      const violation = templateImagePolicyViolation(image, policy, { dynamic });
      return violation ? { ...violation, ...(line ? { line } : {}) } : null;
    })
    .filter(Boolean);
  if (!violations.length) return null;
  return apiErrorResponse("template_image_policy_violation", { violations });
};

export const templateMutationForbidden = apiErrorResponse("template_not_mutable", {
  message: "Only organization-owned templates can be built or promoted by this workspace."
});
