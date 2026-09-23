export type CommandReference = Readonly<{ sandboxId: string; commandId: string }>;

/** A failed observation is not permission to submit the command again. */
export class HarakiriExecutionError extends Error {
  readonly name = "HarakiriExecutionError";

  constructor(
    readonly stage: "submission" | "checkpoint" | "observation",
    readonly sandboxId: string,
    readonly reference: CommandReference | undefined,
    cause: unknown
  ) {
    super(`Sandbox command ${stage} failed. Inspect or reconnect; do not automatically replay the command.`, { cause });
  }
}

/** Includes no file contents. Earlier successful uploads must not be replayed blindly. */
export class HarakiriTransferError extends Error {
  readonly name = "HarakiriTransferError";

  constructor(
    readonly operation: "upload" | "download",
    readonly sandboxId: string,
    readonly path: string,
    readonly completedPaths: readonly string[],
    cause: unknown
  ) {
    super(`Sandbox file ${operation} failed. Earlier transfers may have completed.`, { cause });
  }
}

/** Workload and cleanup failures are both retained, including non-Error throws. */
export class HarakiriTaskCleanupError extends AggregateError {
  readonly name = "HarakiriTaskCleanupError";

  constructor(readonly sandboxId: string, errors: unknown[]) {
    super(errors, "Sandbox cleanup was not confirmed. Retain the sandbox ID for recovery.");
  }
}
