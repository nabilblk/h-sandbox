import { openSandbox } from "./opensandbox-transport.js";
import type {
  RuntimeFileListResult,
  RuntimeProvider,
  RuntimeSandboxRef,
  RuntimeSandboxSummary
} from "./provider.js";

const providerErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const mapSandbox = (sandbox: {
  id: string;
  status?: { state?: string };
  expiresAt?: string;
  metadata?: Record<string, string>;
}): RuntimeSandboxSummary => ({
  provider: "opensandbox",
  providerSandboxId: sandbox.id,
  state: sandbox.status?.state ?? "unknown",
  expiresAt: sandbox.expiresAt ?? null,
  metadata: sandbox.metadata
});

export const runtimeRef = (providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: "opensandbox",
  providerSandboxId: providerSandboxId ?? ""
});

export const openSandboxRuntimeProvider: RuntimeProvider = {
  kind: "opensandbox",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true
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

  run(input) {
    return openSandbox.run({
      sandboxId: input.controlPlaneSandboxId,
      opensandboxId: input.providerSandboxId,
      command: input.command,
      stdin: input.stdin
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
        source: "opensandbox-execd"
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

  logs(ref) {
    return openSandbox.logs(ref.providerSandboxId);
  },

  metrics(ref) {
    return openSandbox.metrics(ref.providerSandboxId);
  },

  exposeRoute(input) {
    return openSandbox.ensureRoute(input.providerSandboxId, input.port);
  }
};

export const runtimeProvider = openSandboxRuntimeProvider;
