import type { RunResult } from "@harakiri/shared";
import type { EgressNetworkPolicy, EgressNetworkRule } from "@harakiri/shared";
import type {
  RuntimeCreateSandboxInput,
  RuntimeCreateSandboxResult,
  RuntimeExposeRouteInput,
  RuntimeFileEntry,
  RuntimeFileListResult,
  RuntimeLogEntry,
  RuntimeMetricsSnapshot,
  RuntimeProvider,
  RuntimeRouteTarget,
  RuntimeSandboxRef,
  RuntimeSandboxSummary
} from "./provider.js";
import { configuredRouteTarget } from "./route-targets.js";

type DevSandbox = RuntimeSandboxSummary & {
  name: string;
  defaultCwd: string;
  files: RuntimeFileEntry[];
  logs: RuntimeLogEntry[];
  egressPolicy: EgressNetworkPolicy;
};

const nowIso = () => new Date().toISOString();

const devId = () => `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const fallbackFileSet = (cwd: string): RuntimeFileEntry[] => [
  {
    path: `${cwd.replace(/\/+$/, "") || "/"}/agent.py`.replace("//", "/"),
    name: "agent.py",
    type: "file",
    size: 128,
    mode: "0644",
    owner: "dev",
    group: "dev",
    modifiedAt: nowIso()
  },
  {
    path: `${cwd.replace(/\/+$/, "") || "/"}/tmp`.replace("//", "/"),
    name: "tmp",
    type: "directory",
    size: 0,
    mode: "0755",
    owner: "dev",
    group: "dev",
    modifiedAt: nowIso()
  }
];

export class InMemoryRuntimeProvider implements RuntimeProvider {
  readonly kind = "dev";
  readonly capabilities = {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    egress: true
  };

  private readonly sandboxes = new Map<string, DevSandbox>();

  async create(input: RuntimeCreateSandboxInput): Promise<RuntimeCreateSandboxResult> {
    const providerSandboxId = devId();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
    const defaultCwd = input.template.workdir || "/";
    const sandbox: DevSandbox = {
      provider: this.kind,
      providerSandboxId,
      state: "running",
      expiresAt,
      metadata: input.metadata ?? {},
      name: input.name,
      defaultCwd,
      files: fallbackFileSet(defaultCwd),
      logs: [{ ts: nowIso(), lvl: "created", msg: "created through in-memory runtime provider", source: "sandbox" }],
      egressPolicy: input.egressPolicy ?? { defaultAction: "allow", egress: [] }
    };
    this.sandboxes.set(providerSandboxId, sandbox);
    return {
      ...sandbox,
      runtimeRegistryCredentialId: null,
      runtimeImageAuthProvided: false
    };
  }

  async list(): Promise<RuntimeSandboxSummary[]> {
    return [...this.sandboxes.values()];
  }

  async get(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary | null> {
    return this.sandboxes.get(ref.providerSandboxId) ?? null;
  }

  async delete(ref: RuntimeSandboxRef): Promise<void> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) return;
    sandbox.state = "terminated";
    sandbox.logs.push({ ts: nowIso(), lvl: "terminated", msg: "sandbox terminated", source: "sandbox" });
  }

  async renew(ref: RuntimeSandboxRef, input: { expiresAt: string }): Promise<void> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) return;
    sandbox.expiresAt = input.expiresAt;
    sandbox.logs.push({ ts: nowIso(), lvl: "renewed", msg: "ttl reset", source: "sandbox" });
  }

  async run(input: RuntimeSandboxRef & { controlPlaneSandboxId: string; command: string; stdin?: string }): Promise<RunResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const command = input.command.trim() || "ls";
    sandbox?.logs.push({ ts: nowIso(), lvl: "run", msg: `command: ${command}`, source: "sandbox" });
    return {
      sandboxId: input.controlPlaneSandboxId,
      command,
      stdout: input.stdin ? `${input.stdin}\n` : `harakiri dev runtime: ${command}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: 1
    };
  }

  async files(input: RuntimeSandboxRef & { path?: string; defaultCwd: string }): Promise<RuntimeFileListResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const cwd = input.path ?? sandbox?.defaultCwd ?? input.defaultCwd;
    return {
      ok: true,
      cwd,
      defaultCwd: input.defaultCwd,
      files: sandbox?.files ?? fallbackFileSet(cwd),
      source: "in-memory"
    };
  }

  async logs(ref: RuntimeSandboxRef): Promise<RuntimeLogEntry[]> {
    return this.sandboxes.get(ref.providerSandboxId)?.logs ?? [];
  }

  async metrics(ref: RuntimeSandboxRef): Promise<RuntimeMetricsSnapshot | null> {
    if (!this.sandboxes.has(ref.providerSandboxId)) return null;
    const ts = nowIso();
    return {
      current: { cpu: 3, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 1, memTotal: 512 },
      series: [{ ts, cpu: 3, mem: 128 }]
    };
  }

  async exposeRoute(input: RuntimeExposeRouteInput): Promise<RuntimeRouteTarget> {
    return configuredRouteTarget({ sandboxId: input.providerSandboxId, port: input.port, provider: "dev" });
  }

  async getEgressPolicy(ref: RuntimeSandboxRef) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    return {
      status: sandbox ? "ok" : "missing",
      mode: sandbox?.egressPolicy.defaultAction === "deny" ? "deny_all" : "allow_all",
      enforcementMode: "dev",
      policy: sandbox?.egressPolicy ?? null
    };
  }

  async setEgressPolicy(ref: RuntimeSandboxRef, policy: EgressNetworkPolicy) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (sandbox) {
      sandbox.egressPolicy = policy;
      sandbox.logs.push({ ts: nowIso(), lvl: "egress", msg: `egress policy set to ${policy.defaultAction}`, source: "sandbox" });
    }
    return this.getEgressPolicy(ref);
  }

  async patchEgressRules(ref: RuntimeSandboxRef, rules: EgressNetworkRule[]) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (sandbox) {
      const seen = new Set<string>();
      const merged = [...rules, ...sandbox.egressPolicy.egress].filter((rule) => {
        if (seen.has(rule.target)) return false;
        seen.add(rule.target);
        return true;
      });
      sandbox.egressPolicy = { ...sandbox.egressPolicy, egress: merged };
    }
    return this.getEgressPolicy(ref);
  }
}

export const inMemoryRuntimeProvider = new InMemoryRuntimeProvider();
