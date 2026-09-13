import type { CreateSandboxResponse, RunResult, SandboxCommandSummary } from "./protocol.js";

export class HarakiriWaitTimeoutError extends Error {
  constructor(
    message: string,
    public readonly target: "sandbox" | "command" | "route" | "snapshot" | "workspace",
    public readonly id: string,
    public readonly lastStatus?: string
  ) {
    super(message);
    this.name = "HarakiriWaitTimeoutError";
  }
}

export class HarakiriCommandEndedError extends Error {
  readonly category = "command_ended";
  readonly retryable = false;

  constructor(
    message: string,
    public readonly sandboxId: string,
    public readonly commandId: string,
    public readonly command: SandboxCommandSummary
  ) {
    super(message);
    this.name = "HarakiriCommandEndedError";
  }

  get status() { return this.command.status; }
  get exitCode() { return this.command.exitCode; }
  get finishReason() { return this.command.finishReason; }
}

/** A finite task completed with a nonzero exit code and check:true was requested. */
export class HarakiriRunError extends Error {
  constructor(public readonly result: RunResult) {
    super(`Command in sandbox ${result.sandboxId} exited with code ${result.exitCode}`);
    this.name = "HarakiriRunError";
  }

  get sandboxId() { return this.result.sandboxId; }
  get exitCode() { return this.result.exitCode; }
  get stdout() { return this.result.stdout; }
  get stderr() { return this.result.stderr; }
}

/** Creation was acknowledged. Reconnect using sandboxId instead of creating again. */
export class HarakiriSandboxCreationError extends Error {
  constructor(
    public readonly creation: CreateSandboxResponse,
    public readonly stage: "readiness" | "source",
    cause: unknown,
    public readonly cleanup: "not_requested" | "requested" | "unconfirmed" = "not_requested"
  ) {
    super(`Sandbox ${creation.sandbox.id} was accepted, but ${stage} did not complete. Reconnect to inspect it.`, { cause });
    this.name = "HarakiriSandboxCreationError";
  }

  get sandboxId() { return this.creation.sandbox.id; }
  get operation() { return this.creation.operation; }
}
