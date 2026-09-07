import type { EgressNetworkPolicy, RunResult } from "@harakiri/shared";
import { config } from "../../config.js";
import { registryImageAuthForImage, type RegistryImageAuth } from "../../registry-credentials.js";
import type { RuntimeTemplate } from "../../templates.js";
import type { RuntimeWorkspaceMount } from "./provider.js";
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
import {
  applySandboxCredentialVault,
  deleteSandboxCredentialVaultEntries,
  getSandboxCredentialVault
} from "./opensandbox-credential-vault.js";
import type { ProviderList, ProviderSandbox, ProviderSnapshot, ProviderSnapshotList, SandboxRouteTarget } from "./opensandbox-types.js";

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

const isNoOpOpenNetworkPolicy = (policy: EgressNetworkPolicy) =>
  policy.defaultAction === "allow" && policy.egress.length === 0;

const shouldSendNetworkPolicy = (
  policy?: EgressNetworkPolicy | null,
  options: { sendOpenNetworkPolicy: boolean } = { sendOpenNetworkPolicy: config.openSandboxSendOpenNetworkPolicy }
) => {
  // OpenSandbox injects the egress sidecar when networkPolicy is present.
  // Harakiri exposes mutable running-sandbox egress, so even allow-all
  // sandboxes need the native sidecar available for later policy updates.
  // Restricted OpenShift installs may opt out of the no-op policy so open
  // sandboxes can run without the sidecar's NET_ADMIN requirement.
  if (!policy) return false;
  if (!options.sendOpenNetworkPolicy && isNoOpOpenNetworkPolicy(policy)) return false;
  return true;
};

export const openSandboxCreateBody = (input: {
  workspace?: RuntimeWorkspaceMount;
  template: RuntimeTemplate;
  ttlSeconds: number;
  name: string;
  providerSnapshotId?: string;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  imageAuth?: RegistryImageAuth | null;
  egressPolicy?: EgressNetworkPolicy | null;
  sendOpenNetworkPolicy?: boolean;
}) => {
  const template = input.template;
  const env = input.env && Object.keys(input.env).length ? input.env : undefined;
  const sendNetworkPolicy = shouldSendNetworkPolicy(input.egressPolicy, {
    sendOpenNetworkPolicy: input.sendOpenNetworkPolicy ?? config.openSandboxSendOpenNetworkPolicy
  });
  return {
    ...(input.providerSnapshotId
      ? { snapshotId: input.providerSnapshotId }
      : {
          image: {
            uri: template.image,
            ...(input.imageAuth ? { auth: input.imageAuth } : {})
          },
          entrypoint: template.defaultEntrypoint
        }),
    timeout: Math.max(input.ttlSeconds, 60),
    resourceLimits: { cpu: `${Math.max(template.cpuCount, 1) * 1000}m`, memory: `${Math.max(template.memoryMb, 128)}Mi` },
    metadata: labelSafeMetadata({
      "harakiri.template": template.id,
      ...(template.templateVersionId ? { "harakiri.template_version": template.templateVersionId } : {}),
      ...(template.imageDigest ? { "harakiri.image_digest": template.imageDigest } : {}),
      ...(input.providerSnapshotId ? { "harakiri.snapshot_provider_id": input.providerSnapshotId } : {}),
      "harakiri.name": input.name,
      "harakiri.workdir": template.workdir,
      ...routePolicyMetadata(),
      ...(input.metadata ?? {})
    }),
    ...(env ? { env } : {}),
    ...(input.workspace ? { volumes: [{
      name: "workspace", mountPath: input.workspace.mountPath, readOnly: false,
      pvc: {
        claimName: input.workspace.volumeName,
        createIfNotExists: input.workspace.createIfMissing,
        deleteOnSandboxTermination: false,
        storage: `${input.workspace.sizeGiB}Gi`,
        storageClass: input.workspace.storageClass,
        accessModes: ["ReadWriteOnce"]
      }
    }] } : {}),
    ...(sendNetworkPolicy
      ? { networkPolicy: input.egressPolicy, credentialProxy: { enabled: true } }
      : {})
  };
};

const requireOpenSandboxId = (opensandboxId?: string | null) => {
  if (!opensandboxId) throw new Error("OpenSandbox sandbox id is required");
  return opensandboxId;
};

export const openSandbox = {
  async create(input: {
    workspace?: RuntimeWorkspaceMount;
    template: RuntimeTemplate;
    ttlSeconds: number;
    name: string;
    organizationId?: string;
    metadata?: Record<string, string>;
    env?: Record<string, string>;
    egressPolicy?: EgressNetworkPolicy | null;
    snapshot?: { providerSnapshotId: string };
  }) {
    const template = input.template;
    const registryAuth = input.snapshot ? null : input.organizationId ? await registryImageAuthForImage(input.organizationId, template.image, "pull") : null;
    const result = await callOpenSandbox<ProviderSandbox>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(openSandboxCreateBody({
        workspace: input.workspace,
        template,
        ttlSeconds: input.ttlSeconds,
        name: input.name,
        providerSnapshotId: input.snapshot?.providerSnapshotId,
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
      return await callOpenSandbox<ProviderSandbox>(`/v1/sandboxes/${opensandboxId}`, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return null;
      throw error;
    }
  },

  async delete(opensandboxId: string) {
    try {
      await callOpenSandbox(`/v1/sandboxes/${opensandboxId}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return;
      throw error;
    }
  },

  async renew(opensandboxId: string, input: { expiresAt: string }) {
    await callOpenSandbox(`/v1/sandboxes/${opensandboxId}/renew-expiration`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ expiresAt: input.expiresAt })
    });
  },

  async pause(opensandboxId: string) {
    try {
      const result = await callOpenSandbox<ProviderSandbox | undefined>(`/v1/sandboxes/${opensandboxId}/pause`, { method: "POST" });
      if (result?.id) return result;
      return { id: opensandboxId, status: { state: "Pausing" } };
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return { id: opensandboxId, status: { state: "Pausing" } };
    }
  },

  async resume(opensandboxId: string) {
    try {
      const result = await callOpenSandbox<ProviderSandbox | undefined>(`/v1/sandboxes/${opensandboxId}/resume`, { method: "POST" });
      if (result?.id) return result;
      return { id: opensandboxId, status: { state: "Resuming" } };
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return { id: opensandboxId, status: { state: "Resuming" } };
    }
  },

  async createSnapshot(opensandboxId: string, input: { name?: string; metadata?: Record<string, string> } = {}) {
    return callOpenSandbox<ProviderSnapshot>(`/v1/sandboxes/${opensandboxId}/snapshots`, {
      method: "POST",
      body: JSON.stringify({
        ...(input.name ? { name: input.name } : {}),
        ...(input.metadata && Object.keys(input.metadata).length ? { metadata: labelSafeMetadata(input.metadata) } : {})
      })
    });
  },

  async listSnapshots() {
    const result = await callOpenSandbox<ProviderSnapshotList | ProviderSnapshot[]>("/v1/snapshots");
    if (Array.isArray(result)) return result;
    return result.items ?? result.snapshots ?? result.data ?? [];
  },

  async getSnapshot(providerSnapshotId: string) {
    try {
      return await callOpenSandbox<ProviderSnapshot>(`/v1/snapshots/${providerSnapshotId}`);
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return null;
      if (!config.openSandboxAllowFallback) throw error;
      return null;
    }
  },

  async deleteSnapshot(providerSnapshotId: string) {
    try {
      await callOpenSandbox(`/v1/snapshots/${providerSnapshotId}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return;
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

  async getCommand(opensandboxId: string | null | undefined, providerCommandId: string, signal?: AbortSignal) {
    return getExecdCommandStatus(requireOpenSandboxId(opensandboxId), providerCommandId, signal);
  },

  async commandLogs(opensandboxId: string | null | undefined, providerCommandId: string, cursor?: number, signal?: AbortSignal) {
    return getExecdCommandLogs(requireOpenSandboxId(opensandboxId), providerCommandId, cursor, signal);
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
  },

  async getCredentialVault(opensandboxId: string | null | undefined) {
    return getSandboxCredentialVault(requireOpenSandboxId(opensandboxId));
  },

  async applyCredentialVault(input: Parameters<typeof applySandboxCredentialVault>[0]) {
    return applySandboxCredentialVault({
      ...input,
      providerSandboxId: requireOpenSandboxId(input.providerSandboxId)
    });
  },

  async deleteCredentialVaultEntries(input: Parameters<typeof deleteSandboxCredentialVaultEntries>[0]) {
    return deleteSandboxCredentialVaultEntries({
      ...input,
      providerSandboxId: requireOpenSandboxId(input.providerSandboxId)
    });
  }
};
