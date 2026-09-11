import type {
  CredentialVaultProviderState,
  EgressNetworkPolicy,
  EgressNetworkRule,
  RunResult
} from "@harakiri/shared";
import type {
  RuntimeCreateSandboxInput,
  RuntimeCreateSandboxResult,
  RuntimeCreateSnapshotInput,
  RuntimeCredentialVaultApplyInput,
  RuntimeCredentialVaultDeleteInput,
  RuntimeExposeRouteInput,
  RuntimeFileEntry,
  RuntimeFileListResult,
  RuntimeFilePathInput,
  RuntimeLogEntry,
  RuntimeMkdirInput,
  RuntimeMetricsSnapshot,
  RuntimeProvider,
  RuntimeReadFileInput,
  RuntimeRemoveFileInput,
  RuntimeRenameFileInput,
  RuntimeRouteTarget,
  RuntimeRunInput,
  RuntimeSandboxRef,
  RuntimeSandboxSummary,
  RuntimeSnapshotRef,
  RuntimeSnapshotSummary,
  RuntimeStartCommandInput,
  RuntimeWriteFileInput
} from "./provider.js";
import { configuredRouteTarget } from "./route-targets.js";

type DevSandbox = RuntimeSandboxSummary & {
  name: string;
  defaultCwd: string;
  files: RuntimeFileEntry[];
  fileContents: Map<string, string>;
  logs: RuntimeLogEntry[];
  egressPolicy: EgressNetworkPolicy;
  credentialVault: CredentialVaultProviderState | null;
  commands: Map<string, { command: string; stdout: string; stderr: string; exitCode: number | null; running: boolean; startedAt: string; finishedAt: string | null }>;
  commandSessions: Map<string, { cwd: string }>;
};

type DevSnapshot = RuntimeSnapshotSummary & {
  files: RuntimeFileEntry[];
  fileContents: Map<string, string>;
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

const normalizeDevPath = (path: string) => {
  if (!path || path.includes("\0")) return "/";
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const parts = safePath.split("/").reduce<string[]>((acc, part) => {
    if (!part || part === ".") return acc;
    if (part === "..") {
      acc.pop();
      return acc;
    }
    acc.push(part);
    return acc;
  }, []);
  return `/${parts.join("/")}` || "/";
};

const entryName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

const parentPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}` || "/";
};

const devFileEntry = (path: string, type: RuntimeFileEntry["type"], size = 0, mode = type === "directory" ? "0755" : "0644"): RuntimeFileEntry => ({
  path,
  name: entryName(path),
  type,
  size,
  mode,
  owner: "dev",
  group: "dev",
  modifiedAt: nowIso()
});

const singleQuotedPythonPrint = /print\('([^']*)'\)/g;
const doubleQuotedPythonPrint = /print\("([^"]*)"\)/g;

const devCommandStdout = (input: RuntimeRunInput) => {
  if (input.stdin) return `${input.stdin}\n`;
  const command = input.command.trim();
  if (/^echo\s+/.test(command)) {
    return `${command.replace(/^echo\s+/, "").replace(/^(['"])(.*)\1$/, "$2")}\n`;
  }
  if (command.includes("HARAKIRI_CONFORMANCE") && command.includes("os.environ.get")) {
    return `conformance:${input.env?.HARAKIRI_CONFORMANCE ?? "missing"}\n`;
  }
  const printed = [...command.matchAll(singleQuotedPythonPrint), ...command.matchAll(doubleQuotedPythonPrint)].map((match) => match[1]);
  if (printed.length) return `${printed.join("\n")}\n`;
  if (command.includes("HARAKIRI_EGRESS_TEST_TARGET=")) return "harakiri dev runtime: egress probe reachable\n";
  return `harakiri dev runtime: ${command}\n`;
};

export class InMemoryRuntimeProvider implements RuntimeProvider {
  readonly kind = "dev";
  readonly capabilities = {
    authoritativeLifecycle: true,
    pauseStopsExecution: true,
    terminal: true,
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
  };

  private readonly sandboxes = new Map<string, DevSandbox>();
  private readonly snapshots = new Map<string, DevSnapshot>();

  async create(input: RuntimeCreateSandboxInput): Promise<RuntimeCreateSandboxResult> {
    const providerSandboxId = devId();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
    const defaultCwd = input.template.workdir || "/";
    const sourceSnapshot = input.snapshot ? this.snapshots.get(input.snapshot.providerSnapshotId) : null;
    const fallbackFiles = fallbackFileSet(defaultCwd);
    const sandbox: DevSandbox = {
      provider: this.kind,
      providerSandboxId,
      state: "running",
      expiresAt,
      metadata: input.metadata ?? {},
      name: input.name,
      defaultCwd,
      files: sourceSnapshot ? sourceSnapshot.files.map((file) => ({ ...file })) : fallbackFiles,
      fileContents: sourceSnapshot
        ? new Map(sourceSnapshot.fileContents)
        : new Map(fallbackFiles.filter((file) => file.type === "file").map((file) => [file.path, "print('hello from dev runtime')\n"])),
      logs: [{ ts: nowIso(), lvl: "created", msg: input.snapshot ? "created from in-memory snapshot" : "created through in-memory runtime provider", source: "sandbox" }],
      egressPolicy: input.egressPolicy ?? { defaultAction: "allow", egress: [] },
      credentialVault: null,
      commands: new Map(),
      commandSessions: new Map()
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

  async pause(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${ref.providerSandboxId} not found`);
    sandbox.state = "paused";
    sandbox.logs.push({ ts: nowIso(), lvl: "paused", msg: "sandbox paused", source: "sandbox" });
    return sandbox;
  }

  async resume(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${ref.providerSandboxId} not found`);
    sandbox.state = "running";
    sandbox.logs.push({ ts: nowIso(), lvl: "resumed", msg: "sandbox resumed", source: "sandbox" });
    return sandbox;
  }

  async createSnapshot(input: RuntimeCreateSnapshotInput): Promise<RuntimeSnapshotSummary> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${input.providerSandboxId} not found`);
    const providerSnapshotId = devId();
    const snapshot: DevSnapshot = {
      provider: this.kind,
      providerSnapshotId,
      sourceProviderSandboxId: sandbox.providerSandboxId,
      name: input.name ?? null,
      state: "ready",
      reason: null,
      message: null,
      metadata: input.metadata ?? {},
      providerState: { provider: this.kind, providerSnapshotId, sourceProviderSandboxId: sandbox.providerSandboxId },
      createdAt: nowIso(),
      files: sandbox.files.map((file) => ({ ...file })),
      fileContents: new Map(sandbox.fileContents)
    };
    this.snapshots.set(providerSnapshotId, snapshot);
    sandbox.logs.push({ ts: nowIso(), lvl: "snapshot", msg: `snapshot created ${providerSnapshotId}`, source: "sandbox" });
    return snapshot;
  }

  async listSnapshots(): Promise<RuntimeSnapshotSummary[]> {
    return [...this.snapshots.values()];
  }

  async getSnapshot(ref: RuntimeSnapshotRef): Promise<RuntimeSnapshotSummary | null> {
    return this.snapshots.get(ref.providerSnapshotId) ?? null;
  }

  async deleteSnapshot(ref: RuntimeSnapshotRef): Promise<void> {
    const snapshot = this.snapshots.get(ref.providerSnapshotId);
    if (!snapshot) return;
    snapshot.state = "deleted";
    this.snapshots.delete(ref.providerSnapshotId);
  }

  async run(input: RuntimeRunInput): Promise<RunResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const command = input.command.trim() || "ls";
    const context = [input.cwd ? `cwd=${input.cwd}` : undefined, input.timeoutMs ? `timeout=${input.timeoutMs}ms` : undefined]
      .filter(Boolean)
      .join(" ");
    sandbox?.logs.push({ ts: nowIso(), lvl: "run", msg: `command: ${command}${context ? ` ${context}` : ""}`, source: "sandbox" });
    return {
      sandboxId: input.controlPlaneSandboxId,
      command,
      stdout: devCommandStdout(input),
      stderr: "",
      exitCode: 0,
      durationMs: 1
    };
  }

  async startCommand(input: RuntimeStartCommandInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const command = input.command.trim() || "ls";
    const providerCommandId = `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = nowIso();
    const stdout = devCommandStdout(input);
    const running = Boolean(input.detached);
    sandbox?.commands.set(providerCommandId, {
      command,
      stdout,
      stderr: "",
      exitCode: running ? null : 0,
      running,
      startedAt,
      finishedAt: running ? null : nowIso()
    });
    sandbox?.logs.push({ ts: startedAt, lvl: "command", msg: `command: ${command}`, source: "sandbox" });
    return {
      providerCommandId,
      status: running ? "running" as const : "succeeded" as const,
      stdout: running ? "" : stdout,
      stderr: "",
      exitCode: running ? null : 0,
      startedAt,
      finishedAt: running ? null : nowIso(),
      durationMs: 1
    };
  }

  async getCommand(input: RuntimeSandboxRef & { providerCommandId: string }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) throw new Error(`command ${input.providerCommandId} not found`);
    return {
      providerCommandId: input.providerCommandId,
      command: command.command,
      status: command.running ? "running" as const : command.exitCode === 0 ? "succeeded" as const : "failed" as const,
      exitCode: command.exitCode,
      error: null,
      startedAt: command.startedAt,
      finishedAt: command.finishedAt
    };
  }

  async commandLogs(input: RuntimeSandboxRef & { providerCommandId: string; cursor?: number }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) throw new Error(`command ${input.providerCommandId} not found`);
    return { stdout: command.stdout, stderr: command.stderr, cursor: input.cursor };
  }

  async interruptCommand(input: RuntimeSandboxRef & { providerCommandId: string }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) return;
    command.running = false;
    command.exitCode = 130;
    command.finishedAt = nowIso();
  }

  async createCommandSession(input: RuntimeSandboxRef & { cwd?: string }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${input.providerSandboxId} not found`);
    const providerSessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const cwd = normalizeDevPath(input.cwd ?? sandbox.defaultCwd);
    sandbox.commandSessions.set(providerSessionId, { cwd });
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `command session created cwd=${cwd}`, source: "sandbox" });
    return { providerSessionId, cwd };
  }

  async runCommandSession(input: RuntimeSandboxRef & { providerSessionId: string; command: string; cwd?: string; timeoutMs?: number }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const session = sandbox?.commandSessions.get(input.providerSessionId);
    if (!sandbox || !session) throw new Error(`command session ${input.providerSessionId} not found`);
    if (input.cwd) session.cwd = normalizeDevPath(input.cwd);
    const command = input.command.trim();
    if (/^cd\s+/.test(command)) {
      session.cwd = normalizeDevPath(command.replace(/^cd\s+/, "").trim());
      return { command, stdout: "", stderr: "", exitCode: 0, durationMs: 1 };
    }
    const stdout = command === "pwd" ? `${session.cwd}\n` : `harakiri dev session ${input.providerSessionId}: ${command}\n`;
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `session command: ${command}`, source: "sandbox" });
    return { command, stdout, stderr: "", exitCode: 0, durationMs: 1 };
  }

  async deleteCommandSession(input: RuntimeSandboxRef & { providerSessionId: string }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox?.commandSessions.delete(input.providerSessionId)) throw new Error(`command session ${input.providerSessionId} not found`);
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `command session deleted`, source: "sandbox" });
  }

  async files(input: RuntimeSandboxRef & { path?: string; defaultCwd: string }): Promise<RuntimeFileListResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const cwd = normalizeDevPath(input.path ?? sandbox?.defaultCwd ?? input.defaultCwd);
    const files = sandbox?.files ?? fallbackFileSet(cwd);
    return {
      ok: true,
      cwd,
      defaultCwd: input.defaultCwd,
      files: files.filter((file) => parentPath(file.path) === cwd),
      source: "in-memory"
    };
  }

  async statFile(input: RuntimeFilePathInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const path = normalizeDevPath(input.path);
    const file = sandbox?.files.find((entry) => entry.path === path);
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    return { ok: true as const, file };
  }

  async readFile(input: RuntimeReadFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const path = normalizeDevPath(input.path);
    const file = sandbox?.files.find((entry) => entry.path === path && entry.type === "file");
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    const content = sandbox?.fileContents.get(path) ?? "";
    return {
      ok: true as const,
      path,
      encoding: input.encoding,
      content: input.encoding === "base64" ? Buffer.from(content).toString("base64") : content
    };
  }

  async writeFile(input: RuntimeWriteFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const content = input.encoding === "base64" ? Buffer.from(input.content, "base64").toString("utf8") : input.content;
    if (input.createParents) {
      const parent = parentPath(path);
      if (!sandbox.files.some((entry) => entry.path === parent)) sandbox.files.push(devFileEntry(parent, "directory", 0));
    }
    const file = devFileEntry(path, "file", Buffer.byteLength(content), input.mode ?? "0644");
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path).concat(file);
    sandbox.fileContents.set(path, content);
    return { ok: true as const, file };
  }

  async mkdir(input: RuntimeMkdirInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const file = devFileEntry(path, "directory", 0);
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path).concat(file);
    return { ok: true as const, file };
  }

  async removeFile(input: RuntimeRemoveFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const found = sandbox.files.some((entry) => entry.path === path || (input.recursive && entry.path.startsWith(`${path}/`)));
    if (!found) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path && !(input.recursive && entry.path.startsWith(`${path}/`)));
    sandbox.fileContents.delete(path);
    return { ok: true as const, path };
  }

  async renameFile(input: RuntimeRenameFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const fromPath = normalizeDevPath(input.fromPath);
    const toPath = normalizeDevPath(input.toPath);
    const file = sandbox.files.find((entry) => entry.path === fromPath);
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    const renamed = { ...file, path: toPath, name: entryName(toPath), modifiedAt: nowIso() };
    sandbox.files = sandbox.files.filter((entry) => entry.path !== fromPath).concat(renamed);
    const content = sandbox.fileContents.get(fromPath);
    if (content !== undefined) {
      sandbox.fileContents.delete(fromPath);
      sandbox.fileContents.set(toPath, content);
    }
    return { ok: true as const, file: renamed };
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
      credentialVaultReady: true,
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

  async getCredentialVault(ref: RuntimeSandboxRef) {
    return this.sandboxes.get(ref.providerSandboxId)?.credentialVault ?? null;
  }

  async applyCredentialVault(input: RuntimeCredentialVaultApplyInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${input.providerSandboxId} not found`);
    const revision = (sandbox.credentialVault?.revision ?? 0) + 1;
    const credentialNames = new Set(sandbox.credentialVault?.credentials.map((credential) => credential.name) ?? []);
    const bindingNames = new Set(sandbox.credentialVault?.bindings.map((binding) => binding.name) ?? []);
    const credentials = [
      ...(sandbox.credentialVault?.credentials ?? []),
      ...input.credentials
        .filter((credential) => !credentialNames.has(credential.name))
        .map((credential) => ({ name: credential.name, sourceType: "inline", revision }))
    ];
    const bindings = [
      ...(sandbox.credentialVault?.bindings ?? []),
      ...input.bindings
        .filter((binding) => !bindingNames.has(binding.name))
        .map((binding) => ({
          name: binding.name,
          revision,
          match: binding.match,
          auth: {
            type: binding.auth.type,
            ...("name" in binding.auth ? { name: binding.auth.name } : {})
          }
        }))
    ];
    sandbox.credentialVault = { revision, credentials, bindings };
    sandbox.logs.push({ ts: nowIso(), lvl: "credential-vault", msg: `credential vault revision ${revision}`, source: "sandbox" });
    return sandbox.credentialVault;
  }

  async deleteCredentialVaultEntries(input: RuntimeCredentialVaultDeleteInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox?.credentialVault) return null;
    const credentialNames = new Set(input.credentialNames);
    const bindingNames = new Set(input.bindingNames);
    const revision = sandbox.credentialVault.revision + 1;
    sandbox.credentialVault = {
      revision,
      credentials: sandbox.credentialVault.credentials.filter((credential) => !credentialNames.has(credential.name)),
      bindings: sandbox.credentialVault.bindings.filter((binding) => !bindingNames.has(binding.name))
    };
    sandbox.logs.push({ ts: nowIso(), lvl: "credential-vault", msg: `credential vault revision ${revision}`, source: "sandbox" });
    return sandbox.credentialVault;
  }
}

export const inMemoryRuntimeProvider = new InMemoryRuntimeProvider();
