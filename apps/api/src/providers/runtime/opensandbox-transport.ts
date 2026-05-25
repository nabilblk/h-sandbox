import type { RunResult } from "@harakiri/shared";
import { config } from "../../config.js";
import { registryImageAuthForImage, type RegistryImageAuth } from "../../registry-credentials.js";
import type { RuntimeTemplate } from "../../templates.js";
import { callOpenSandbox, OpenSandboxHttpError } from "./opensandbox-client.js";
import { runExecdCommand } from "./opensandbox-execd.js";
import { listFilesInSandbox } from "./opensandbox-files.js";
import { sandboxLogs } from "./opensandbox-logs.js";
import { sandboxMetrics } from "./opensandbox-metrics.js";
import { ensureSandboxRoute, routePolicyMetadata } from "./opensandbox-routes.js";
import type { ProviderList, ProviderSandbox, SandboxRouteTarget } from "./opensandbox-types.js";

export type {
  SandboxFileEntry,
  SandboxLogEntry,
  SandboxMetricsSnapshot,
  SandboxRouteTarget
} from "./opensandbox-types.js";

const labelSafeValue = (value: string) => {
  const cleaned = value
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .slice(0, 63)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9]+$/, "");
  return cleaned || "value";
};

const labelSafeMetadata = (metadata: Record<string, string>) =>
  Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, labelSafeValue(value)]));

export const openSandboxCreateBody = (input: {
  template: RuntimeTemplate;
  ttlSeconds: number;
  name: string;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  imageAuth?: RegistryImageAuth | null;
}) => {
  const template = input.template;
  const env = input.env && Object.keys(input.env).length ? input.env : undefined;
  return {
    image: {
      uri: template.image,
      ...(input.imageAuth ? { auth: input.imageAuth } : {})
    },
    entrypoint: template.defaultEntrypoint,
    timeout: Math.max(input.ttlSeconds, 60),
    resourceLimits: { cpu: `${Math.max(template.cpuCount, 1) * 1000}m`, memory: `${Math.max(template.memoryMb, 128)}Mi` },
    metadata: labelSafeMetadata({
      "harakiri.template": template.id,
      ...(template.templateVersionId ? { "harakiri.template_version": template.templateVersionId } : {}),
      ...(template.imageDigest ? { "harakiri.image_digest": template.imageDigest } : {}),
      "harakiri.name": input.name,
      "harakiri.workdir": template.workdir,
      ...routePolicyMetadata(),
      ...(input.metadata ?? {})
    }),
    ...(env ? { env } : {})
  };
};

const requireOpenSandboxId = (opensandboxId?: string | null) => {
  if (!opensandboxId) throw new Error("OpenSandbox sandbox id is required");
  return opensandboxId;
};

export const openSandbox = {
  async create(input: {
    template: RuntimeTemplate;
    ttlSeconds: number;
    name: string;
    organizationId?: string;
    metadata?: Record<string, string>;
    env?: Record<string, string>;
  }) {
    const template = input.template;
    const registryAuth = input.organizationId ? await registryImageAuthForImage(input.organizationId, template.image, "pull") : null;
    const result = await callOpenSandbox<ProviderSandbox>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(openSandboxCreateBody({
        template,
        ttlSeconds: input.ttlSeconds,
        name: input.name,
        env: input.env,
        imageAuth: registryAuth?.auth ?? null,
        metadata: {
          ...(registryAuth?.credentialId ? { "harakiri.runtime_registry_credential": registryAuth.credentialId } : {}),
          ...(input.metadata ?? {})
        }
      }))
    });
    return {
      provider: "opensandbox",
      id: result.id,
      state: result.status?.state ?? "Pending",
      expiresAt: result.expiresAt ?? null,
      metadata: result.metadata,
      runtimeRegistryCredentialId: registryAuth?.credentialId ?? null,
      runtimeImageAuthProvided: Boolean(registryAuth?.auth)
    };
  },

  async list() {
    try {
      const result = await callOpenSandbox<ProviderList | ProviderSandbox[]>("/v1/sandboxes");
      if (Array.isArray(result)) return result;
      return result.items ?? result.sandboxes ?? result.data ?? [];
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return [];
    }
  },

  async get(opensandboxId: string) {
    try {
      return await callOpenSandbox<ProviderSandbox>(`/v1/sandboxes/${opensandboxId}`);
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return null;
      if (!config.openSandboxAllowFallback) throw error;
      return null;
    }
  },

  async delete(opensandboxId: string) {
    try {
      await callOpenSandbox(`/v1/sandboxes/${opensandboxId}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return;
      if (!config.openSandboxAllowFallback) throw error;
    }
  },

  async renew(opensandboxId: string, input: { expiresAt: string }) {
    try {
      await callOpenSandbox(`/v1/sandboxes/${opensandboxId}/renew-expiration`, {
        method: "POST",
        body: JSON.stringify({ expiresAt: input.expiresAt })
      });
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
    }
  },

  async getRoute(opensandboxId: string, port: number) {
    return (await this.ensureRoute(opensandboxId, port)).targetUrl;
  },

  async ensureRoute(opensandboxId: string, port: number): Promise<SandboxRouteTarget> {
    return ensureSandboxRoute(opensandboxId, port);
  },

  async run(input: { sandboxId: string; opensandboxId?: string | null; command: string; stdin?: string }): Promise<RunResult> {
    const started = Date.now();
    const command = input.command.trim() || "python -";
    const result = await runExecdCommand({ opensandboxId: requireOpenSandboxId(input.opensandboxId), command, stdin: input.stdin });
    if ("durationMs" in result && typeof result.durationMs === "number") {
      return { sandboxId: input.sandboxId, command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, durationMs: result.durationMs };
    }

    return {
      sandboxId: input.sandboxId,
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - started + 141
    };
  },

  async files(opensandboxId?: string | null, path = "/") {
    return listFilesInSandbox(requireOpenSandboxId(opensandboxId), path);
  },

  async logs(opensandboxId?: string | null) {
    return sandboxLogs(requireOpenSandboxId(opensandboxId));
  },

  async metrics(opensandboxId?: string | null) {
    return sandboxMetrics(requireOpenSandboxId(opensandboxId));
  }
};
