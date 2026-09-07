import { openSandbox } from "./opensandbox-transport.js";
import type {
  RuntimeFileListResult,
  RuntimeProvider,
  RuntimeSandboxRef,
  RuntimeSandboxSummary
} from "./provider.js";
import { RuntimeUnsupportedError } from "./provider.js";

const providerErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const normalizeProviderSandboxState = (state?: string) => {
  const normalized = (state ?? "unknown").trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  if (normalized === "stopping" || normalized === "deleting" || normalized === "deleted") return "terminated";
  if (normalized === "failed") return "error";
  return normalized;
};

const normalizeProviderSnapshotState = (state?: string) => {
  const normalized = (state ?? "unknown").trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return normalized === "unknown" ? "creating" : normalized;
};

const fileError = (error: unknown) => {
  const maybeFileError = error as { code?: unknown; statusCode?: unknown };
  return {
    ok: false as const,
    error: {
      code: typeof maybeFileError.code === "string" ? maybeFileError.code : "runtime_files_unavailable",
      message: providerErrorMessage(error),
      recoverable: true,
      statusCode: typeof maybeFileError.statusCode === "number" ? maybeFileError.statusCode : 502
    }
  };
};

const mapSandbox = (sandbox: {
  id: string;
  status?: { state?: string };
  expiresAt?: string;
  metadata?: Record<string, string>;
}): RuntimeSandboxSummary => ({
  provider: "opensandbox",
  providerSandboxId: sandbox.id,
  state: normalizeProviderSandboxState(sandbox.status?.state),
  expiresAt: sandbox.expiresAt ?? null,
  metadata: sandbox.metadata
});

const mapSnapshot = (snapshot: {
  id: string;
  sandboxId?: string;
  name?: string | null;
  status?: { state?: string; reason?: string | null; message?: string | null };
  metadata?: Record<string, string>;
  createdAt?: string;
}) => ({
  provider: "opensandbox",
  providerSnapshotId: snapshot.id,
  sourceProviderSandboxId: snapshot.sandboxId ?? null,
  name: snapshot.name ?? null,
  state: normalizeProviderSnapshotState(snapshot.status?.state),
  reason: snapshot.status?.reason ?? null,
  message: snapshot.status?.message ?? null,
  metadata: snapshot.metadata,
  providerState: snapshot as unknown as Record<string, unknown>,
  createdAt: snapshot.createdAt ?? null
});

export const runtimeRef = (providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: "opensandbox",
  providerSandboxId: providerSandboxId ?? ""
});

export const openSandboxRuntimeProvider: RuntimeProvider = {
  kind: "opensandbox",
  capabilities: {
    persistentWorkspaces: true,
    terminal: true,
    terminalAttach: true,
    terminalResize: true,
    shellSessions: true,
    sessionCommands: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    egress: true,
    credentialVault: true,
    credentialVaultPatch: true,
    credentialVaultSanitizedRead: true,
    credentialVaultRequiresRehydration: true,
    pause: true,
    resume: true,
    snapshots: true
  },

  async create(input) {
    const result = await openSandbox.create(input);
    return {
      provider: result.provider,
      providerSandboxId: result.id,
      state: result.state,
      expiresAt: result.expiresAt,
      metadata: result.metadata,
      runtimeRegistryCredentialId: result.runtimeRegistryCredentialId,
      runtimeImageAuthProvided: result.runtimeImageAuthProvided
    };
  },

  async list() {
    return (await openSandbox.list()).map(mapSandbox);
  },

  async get(ref) {
    const sandbox = await openSandbox.get(ref.providerSandboxId);
    return sandbox ? mapSandbox(sandbox) : null;
  },

  async delete(ref) {
    if (!ref.providerSandboxId) return;
    await openSandbox.delete(ref.providerSandboxId);
  },

  async renew(ref, input) {
    if (!ref.providerSandboxId) return;
    await openSandbox.renew(ref.providerSandboxId, input);
  },

  async pause(ref) {
    if (!ref.providerSandboxId) throw new RuntimeUnsupportedError("OpenSandbox sandbox id is required for pause.");
    return mapSandbox(await openSandbox.pause(ref.providerSandboxId));
  },

  async resume(ref) {
    if (!ref.providerSandboxId) throw new RuntimeUnsupportedError("OpenSandbox sandbox id is required for resume.");
    return mapSandbox(await openSandbox.resume(ref.providerSandboxId));
  },

  async createSnapshot(input) {
    if (!input.providerSandboxId) throw new RuntimeUnsupportedError("OpenSandbox sandbox id is required for snapshot.");
    return mapSnapshot(await openSandbox.createSnapshot(input.providerSandboxId, {
      name: input.name,
      metadata: input.metadata
    }));
  },

  async listSnapshots() {
    return (await openSandbox.listSnapshots()).map(mapSnapshot);
  },

  async getSnapshot(ref) {
    if (!ref.providerSnapshotId) return null;
    const snapshot = await openSandbox.getSnapshot(ref.providerSnapshotId);
    return snapshot ? mapSnapshot(snapshot) : null;
  },

  async deleteSnapshot(ref) {
    if (!ref.providerSnapshotId) return;
    await openSandbox.deleteSnapshot(ref.providerSnapshotId);
  },

  run(input) {
    return openSandbox.run({
      sandboxId: input.controlPlaneSandboxId,
      opensandboxId: input.providerSandboxId,
      command: input.command,
      stdin: input.stdin,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs
    });
  },

  startCommand(input) {
    return openSandbox.startCommand({
      sandboxId: input.controlPlaneSandboxId,
      opensandboxId: input.providerSandboxId,
      command: input.command,
      stdin: input.stdin,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs,
      detached: input.detached
    });
  },

  getCommand(input) {
    return openSandbox.getCommand(input.providerSandboxId, input.providerCommandId, input.signal);
  },

  commandLogs(input) {
    return openSandbox.commandLogs(input.providerSandboxId, input.providerCommandId, input.cursor, input.signal);
  },

  interruptCommand(input) {
    return openSandbox.interruptCommand(input.providerSandboxId, input.providerCommandId);
  },

  createCommandSession(input) {
    return openSandbox.createCommandSession(input.providerSandboxId, { cwd: input.cwd });
  },

  runCommandSession(input) {
    return openSandbox.runCommandSession(input.providerSandboxId, {
      providerSessionId: input.providerSessionId,
      command: input.command,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs
    });
  },

  deleteCommandSession(input) {
    return openSandbox.deleteCommandSession(input.providerSandboxId, input.providerSessionId);
  },

  createPtySession(input) {
    if (input.shell && input.shell !== "bash" && input.shell !== "/bin/bash") {
      throw new RuntimeUnsupportedError("OpenSandbox PTY currently launches bash and does not support shell override.");
    }
    if (input.env && Object.keys(input.env).length > 0) {
      throw new RuntimeUnsupportedError("OpenSandbox PTY does not support per-attach environment variables yet. Set env when creating the sandbox or template.");
    }
    return openSandbox.createPtySession(input.providerSandboxId, { cwd: input.cwd, cols: input.cols, rows: input.rows, sessionName: input.sessionName });
  },

  getPtySession(input) {
    return openSandbox.getPtySession(input.providerSandboxId, input.providerSessionId);
  },

  deletePtySession(input) {
    return openSandbox.deletePtySession(input.providerSandboxId, input.providerSessionId);
  },

  attachPtySession(input) {
    return openSandbox.attachPtySession(input.providerSandboxId, {
      providerSessionId: input.providerSessionId,
      client: input.client,
      since: input.since,
      pty: input.pty
    });
  },

  async files(input): Promise<RuntimeFileListResult> {
    const cwd = input.path ?? input.defaultCwd;
    try {
      const result = await openSandbox.files(input.providerSandboxId, cwd);
      return {
        ok: true,
        cwd: result.cwd,
        defaultCwd: input.defaultCwd,
        files: result.files,
        source: result.source,
        warnings: result.warnings
      };
    } catch (error) {
      return {
        ok: false,
        cwd,
        defaultCwd: input.defaultCwd,
        files: [],
        error: {
          code: "runtime_files_unavailable",
          message: providerErrorMessage(error),
          recoverable: true
        }
      };
    }
  },

  async statFile(input) {
    try {
      return { ok: true, file: await openSandbox.statFile(input.providerSandboxId, input.path) };
    } catch (error) {
      return fileError(error);
    }
  },

  async readFile(input) {
    try {
      return { ok: true, ...(await openSandbox.readFile(input.providerSandboxId, input.path, input.encoding)) };
    } catch (error) {
      return fileError(error);
    }
  },

  async writeFile(input) {
    try {
      return {
        ok: true,
        file: await openSandbox.writeFile(input.providerSandboxId, {
          path: input.path,
          content: input.content,
          encoding: input.encoding,
          createParents: input.createParents,
          mode: input.mode
        })
      };
    } catch (error) {
      return fileError(error);
    }
  },

  async mkdir(input) {
    try {
      return { ok: true, file: await openSandbox.mkdir(input.providerSandboxId, { path: input.path, recursive: input.recursive }) };
    } catch (error) {
      return fileError(error);
    }
  },

  async removeFile(input) {
    try {
      return { ok: true, ...(await openSandbox.removeFile(input.providerSandboxId, { path: input.path, recursive: input.recursive })) };
    } catch (error) {
      return fileError(error);
    }
  },

  async renameFile(input) {
    try {
      return { ok: true, file: await openSandbox.renameFile(input.providerSandboxId, { fromPath: input.fromPath, toPath: input.toPath }) };
    } catch (error) {
      return fileError(error);
    }
  },

  logs(ref) {
    return openSandbox.logs(ref.providerSandboxId);
  },

  metrics(ref) {
    return openSandbox.metrics(ref.providerSandboxId);
  },

  exposeRoute(input) {
    return openSandbox.ensureRoute(input.providerSandboxId, input.port);
  },

  getEgressPolicy(ref) {
    return openSandbox.getEgressPolicy(ref.providerSandboxId);
  },

  setEgressPolicy(ref, policy) {
    return openSandbox.setEgressPolicy(ref.providerSandboxId, policy);
  },

  patchEgressRules(ref, rules) {
    return openSandbox.patchEgressRules(ref.providerSandboxId, rules);
  },

  getCredentialVault(ref) {
    return openSandbox.getCredentialVault(ref.providerSandboxId);
  },

  applyCredentialVault(input) {
    return openSandbox.applyCredentialVault(input);
  },

  deleteCredentialVaultEntries(input) {
    return openSandbox.deleteCredentialVaultEntries(input);
  }
};

export const runtimeProvider = openSandboxRuntimeProvider;
