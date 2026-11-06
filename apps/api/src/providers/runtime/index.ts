import { config } from "../../config.js";
import { inMemoryRuntimeProvider } from "./dev-provider.js";
import { openSandboxRuntimeProvider } from "./opensandbox-provider.js";
import type { RuntimeProvider, RuntimeSandboxRef } from "./provider.js";
import { restrictRuntimeProvider } from "./deployment-policy.js";

const explicitDevProvider = ["dev", "in-memory", "memory"].includes(config.runtimeProvider.toLowerCase());

export const runtimeProvider: RuntimeProvider = restrictRuntimeProvider(
  explicitDevProvider ? inMemoryRuntimeProvider : openSandboxRuntimeProvider,
  config.runtimeDisabledFeatures
);

export const runtimeRef = (providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

export { inMemoryRuntimeProvider, InMemoryRuntimeProvider } from "./dev-provider.js";
export { openSandboxRuntimeProvider } from "./opensandbox-provider.js";
export type * from "./provider.js";
