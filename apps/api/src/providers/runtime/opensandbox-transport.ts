import type { EgressNetworkPolicy, RunResult } from "@harakiri/shared";
import { config } from "../../config.js";
import { registryImageAuthForImage, type RegistryImageAuth } from "../../registry-credentials.js";
import type { RuntimeTemplate } from "../../templates.js";
import { callOpenSandbox, OpenSandboxHttpError } from "./opensandbox-client.js";
import {
  attachExecdPtySession,
  createExecdCommandSession,
  createExecdPtySession,
  deleteExecdCommandSession,
  deleteExecdPtySession,
  getExecdCommandLogs,
  getExecdCommandStatus,
  getExecdPtySession,
  interruptExecdCommand,
  runExecdCommandSession,
  runExecdCommand,
  startExecdCommand
} from "./opensandbox-execd.js";
import {
  listFilesInSandbox,
  mkdirInSandbox,
  readFileInSandbox,
  removeFileInSandbox,
  renameFileInSandbox,
  statFileInSandbox,
  writeFileInSandbox
} from "./opensandbox-files.js";
import { sandboxLogs } from "./opensandbox-logs.js";
import { sandboxMetrics } from "./opensandbox-metrics.js";
import { ensureSandboxRoute, routePolicyMetadata } from "./opensandbox-routes.js";
import { getSandboxEgressPolicy, patchSandboxEgressRules, setSandboxEgressPolicy } from "./opensandbox-egress.js";
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
  egressPolicy?: EgressNetworkPolicy | null;
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
    ...(env ? { env } : {}),
    ...(input.egressPolicy ? { networkPolicy: input.egressPolicy } : {})
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
    egressPolicy?: EgressNetworkPolicy | null;
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
        egressPolicy: input.egressPolicy,
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

  async run(input: {
    sandboxId: string;
    opensandboxId?: string | null;
    command: string;
    stdin?: string;
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<RunResult> {
    const started = Date.now();
    const command = input.command.trim() || "python -";
    const result = await runExecdCommand({
      opensandboxId: requireOpenSandboxId(input.opensandboxId),
      command,
      stdin: input.stdin,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs
    });
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

  async startCommand(input: {
    sandboxId: string;
    opensandboxId?: string | null;
    command: string;
    stdin?: string;
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    detached?: boolean;
  }) {
    return startExecdCommand({
      opensandboxId: requireOpenSandboxId(input.opensandboxId),
      command: input.command.trim() || "python -",
      stdin: input.stdin,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs,
      detached: input.detached
    });
  },

  async getCommand(opensandboxId: string | null | undefined, providerCommandId: string) {
    return getExecdCommandStatus(requireOpenSandboxId(opensandboxId), providerCommandId);
  },

  async commandLogs(opensandboxId: string | null | undefined, providerCommandId: string, cursor?: number) {
    return getExecdCommandLogs(requireOpenSandboxId(opensandboxId), providerCommandId, cursor);
  },

  async interruptCommand(opensandboxId: string | null | undefined, providerCommandId: string) {
    return interruptExecdCommand(requireOpenSandboxId(opensandboxId), providerCommandId);
  },

  async createCommandSession(opensandboxId: string | null | undefined, input: { cwd?: string }) {
    return createExecdCommandSession({ opensandboxId: requireOpenSandboxId(opensandboxId), cwd: input.cwd });
  },

  async runCommandSession(
    opensandboxId: string | null | undefined,
    input: { providerSessionId: string; command: string; cwd?: string; timeoutMs?: number }
  ) {
    return runExecdCommandSession({
      opensandboxId: requireOpenSandboxId(opensandboxId),
      providerSessionId: input.providerSessionId,
      command: input.command,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs
    });
  },

  async deleteCommandSession(opensandboxId: string | null | undefined, providerSessionId: string) {
    return deleteExecdCommandSession(requireOpenSandboxId(opensandboxId), providerSessionId);
  },

  async createPtySession(
    opensandboxId: string | null | undefined,
    input: { cwd?: string; cols?: number; rows?: number; sessionName?: string }
  ) {
    return createExecdPtySession({ opensandboxId: requireOpenSandboxId(opensandboxId), cwd: input.cwd });
  },

  async getPtySession(opensandboxId: string | null | undefined, providerSessionId: string) {
    return getExecdPtySession(requireOpenSandboxId(opensandboxId), providerSessionId);
  },

  async deletePtySession(opensandboxId: string | null | undefined, providerSessionId: string) {
    return deleteExecdPtySession(requireOpenSandboxId(opensandboxId), providerSessionId);
  },

  async attachPtySession(
    opensandboxId: string | null | undefined,
    input: { providerSessionId: string; client: Parameters<typeof attachExecdPtySession>[0]["client"]; since?: number; pty?: boolean }
  ) {
    return attachExecdPtySession({
      opensandboxId: requireOpenSandboxId(opensandboxId),
      providerSessionId: input.providerSessionId,
      client: input.client,
      since: input.since,
      pty: input.pty
    });
  },

  async files(opensandboxId?: string | null, path = "/") {
    return listFilesInSandbox(requireOpenSandboxId(opensandboxId), path);
  },

  async statFile(opensandboxId: string | null | undefined, path: string) {
    return statFileInSandbox(requireOpenSandboxId(opensandboxId), path);
  },

  async readFile(opensandboxId: string | null | undefined, path: string, encoding: "utf8" | "base64") {
    return readFileInSandbox(requireOpenSandboxId(opensandboxId), path, encoding);
  },

  async writeFile(
    opensandboxId: string | null | undefined,
    input: { path: string; content: string; encoding: "utf8" | "base64"; createParents?: boolean; mode?: string }
  ) {
    return writeFileInSandbox(requireOpenSandboxId(opensandboxId), input);
  },

  async mkdir(opensandboxId: string | null | undefined, input: { path: string; recursive?: boolean }) {
    return mkdirInSandbox(requireOpenSandboxId(opensandboxId), input);
  },

  async removeFile(opensandboxId: string | null | undefined, input: { path: string; recursive?: boolean }) {
    return removeFileInSandbox(requireOpenSandboxId(opensandboxId), input);
  },

  async renameFile(opensandboxId: string | null | undefined, input: { fromPath: string; toPath: string }) {
    return renameFileInSandbox(requireOpenSandboxId(opensandboxId), input);
  },

  async logs(opensandboxId?: string | null) {
    return sandboxLogs(requireOpenSandboxId(opensandboxId));
  },

  async metrics(opensandboxId?: string | null) {
    return sandboxMetrics(requireOpenSandboxId(opensandboxId));
  },

  async getEgressPolicy(opensandboxId?: string | null) {
    return getSandboxEgressPolicy(requireOpenSandboxId(opensandboxId));
  },

  async setEgressPolicy(opensandboxId: string | null | undefined, policy: EgressNetworkPolicy) {
    return setSandboxEgressPolicy(requireOpenSandboxId(opensandboxId), policy);
  },

  async patchEgressRules(opensandboxId: string | null | undefined, rules: EgressNetworkPolicy["egress"]) {
    return patchSandboxEgressRules(requireOpenSandboxId(opensandboxId), rules);
  }
};
