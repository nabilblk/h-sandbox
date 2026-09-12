import type { CreateSandboxResponse, SandboxCommandResponse, SandboxCommandLogsResponse, SandboxCommandsResponse, SandboxReadinessResponse, Template } from "@harakiri/shared";

export const firstSandboxCommand = "printf 'Harakiri is ready\\n'";
export type FirstSandboxTask = {
  templateId: string;
  cwd: string;
  intent: string;
  sandboxId?: string;
  submitted?: boolean;
  commandId?: string;
  output?: string;
  complete?: boolean;
};

export const firstTaskTemplates = (templates: Template[]) => templates.filter((template) =>
  template.status === "ready" && Boolean(template.latestVersionId) && Boolean(template.image) && template.workdir.startsWith("/") &&
  !(template.credentialSlots ?? []).some((slot) => slot.required)
);

export const readFirstTask = (value: string | null): FirstSandboxTask | null => {
  try {
    const task = JSON.parse(value ?? "null") as FirstSandboxTask | null;
    if (!task || typeof task.templateId !== "string" || typeof task.intent !== "string" ||
      typeof task.cwd !== "string" || !task.cwd.startsWith("/")) return null;
    if ([task.sandboxId, task.commandId, task.output].some((field) => field !== undefined && typeof field !== "string")) return null;
    if ([task.submitted, task.complete].some((field) => field !== undefined && typeof field !== "boolean")) return null;
    return { templateId: task.templateId, cwd: task.cwd, intent: task.intent,
      ...(task.sandboxId === undefined ? {} : { sandboxId: task.sandboxId }),
      ...(task.commandId === undefined ? {} : { commandId: task.commandId }),
      ...(task.submitted === undefined ? {} : { submitted: task.submitted }),
      ...(task.complete === undefined ? {} : { complete: task.complete }),
      ...(task.output === undefined ? {} : { output: task.output }) };
  } catch { return null; }
};

export type FirstTaskClient = {
  createSandbox: (body: { template: string; ttlSeconds: number; idempotencyKey: string }) => Promise<CreateSandboxResponse>;
  sandboxReadiness: (id: string, signal?: AbortSignal) => Promise<SandboxReadinessResponse>;
  startCommand: (id: string, command: string, cwd: string, options: { timeoutMs: number }) => Promise<SandboxCommandResponse>;
  commands: (id: string) => Promise<SandboxCommandsResponse>;
  command: (id: string, commandId: string, signal?: AbortSignal) => Promise<SandboxCommandResponse>;
  commandLogs: (id: string, commandId: string, signal?: AbortSignal) => Promise<SandboxCommandLogsResponse>;
};

export const runFirstTask = async (initial: FirstSandboxTask, dependencies: {
  client: FirstTaskClient;
  save: (task: FirstSandboxTask) => void;
  signal: AbortSignal;
  pause?: () => Promise<void>;
}) => {
  let task = { ...initial };
  const { client, signal } = dependencies;
  const save = (update: Partial<FirstSandboxTask>) => { task = { ...task, ...update }; dependencies.save(task); };
  const pause = dependencies.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1_000)));
  signal.throwIfAborted();
  if (task.complete) return task;
  if (!task.sandboxId) {
    const created = await client.createSandbox({ template: task.templateId, ttlSeconds: 300, idempotencyKey: task.intent });
    save({ sandboxId: created.sandbox.id });
  }
  const sandboxId = task.sandboxId!;
  // A saved submission is recovered by reading. Never replay an ambiguous POST.
  if (task.submitted && !task.commandId) {
    signal.throwIfAborted();
    const matches = (await client.commands(sandboxId)).commands.filter((command) => command.command === firstSandboxCommand && command.cwd === task.cwd);
    if (matches.length !== 1) throw new Error("Command submission is unconfirmed. Open this sandbox to inspect it; no command will be resubmitted.");
    save({ commandId: matches[0].id });
  }
  if (!task.submitted) {
    for (;;) {
      signal.throwIfAborted();
      const result = await client.sandboxReadiness(sandboxId, signal);
      if (result.readiness.status === "ready") {
        const cwd = result.sandbox.runtimeMetadata?.workdir;
        if (typeof cwd !== "string" || !cwd.startsWith("/")) throw new Error("The runtime working directory is unavailable. No command was submitted.");
        save({ cwd });
        break;
      }
      if (result.readiness.status === "not_running") throw new Error("This sandbox is no longer running. Open it to inspect its state.");
      if (result.readiness.status === "unsupported") throw new Error("Execution readiness is unavailable for this provider. No command was submitted.");
      await pause();
    }
    signal.throwIfAborted();
    save({ submitted: true });
    const result = await client.startCommand(sandboxId, firstSandboxCommand, task.cwd, { timeoutMs: 15_000 });
    save({ commandId: result.command.id });
  }
  for (;;) {
    signal.throwIfAborted();
    const { command } = await client.command(sandboxId, task.commandId!, signal);
    if (["succeeded", "failed", "killed"].includes(command.status)) {
      // Detached command status does not include its output. A failed log read
      // leaves the saved command identity intact for the next observation.
      const logs = await client.commandLogs(sandboxId, task.commandId!, signal);
      save({ output: [logs.stdout, logs.stderr].filter(Boolean).join("\n") });
      if (command.status !== "succeeded" || command.exitCode !== 0) throw new Error("The first command did not succeed. Open the sandbox to inspect its output.");
      save({ complete: true });
      return task;
    }
    await pause();
  }
};
