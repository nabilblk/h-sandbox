import type { CreateSandboxInput, HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend, type HarakiriSandboxBackendOptions } from "./backend.js";
import { HarakiriTaskCleanupError } from "./errors.js";
import { positiveInteger } from "./execution.js";

export type OwnedSandboxInput = Omit<CreateSandboxInput, "idempotencyKey" | "source" | "cleanupOnSourceError" | "wait" | "waitTimeoutMs">;
export type OwnedSandboxOptions = {
  backend?: HarakiriSandboxBackendOptions;
  readinessTimeoutMs?: number;
  cleanupTimeoutMs?: number;
};

/** For one-shot jobs only. Checkpointed applications should manage a borrowed sandbox explicitly. */
export async function withHarakiriSandbox<T>(
  client: HarakiriClient,
  input: OwnedSandboxInput,
  task: (context: { sandbox: HarakiriSandbox; backend: HarakiriSandboxBackend }) => Promise<T>,
  options: OwnedSandboxOptions = {}
): Promise<T> {
  for (const field of ["idempotencyKey", "source", "cleanupOnSourceError", "wait", "waitTimeoutMs"]) {
    if (field in input) throw new TypeError(`${field} is not supported by the owned-task helper. Use an application-owned sandbox.`);
  }
  const readinessTimeoutMs = positiveInteger("readinessTimeoutMs", options.readinessTimeoutMs ?? 180_000);
  const cleanupTimeoutMs = positiveInteger("cleanupTimeoutMs", options.cleanupTimeoutMs ?? 90_000);
  options.backend?.signal?.throwIfAborted();
  // Retain the accepted handle before readiness so failures still enter cleanup.
  const sandbox = await client.sandboxes.create({ ...input, wait: false }, {
    signal: options.backend?.signal, requestTimeoutMs: options.backend?.requestTimeoutMs
  });
  let result!: T;
  const failures: unknown[] = [];
  try {
    await sandbox.wait({ timeoutMs: readinessTimeoutMs, signal: options.backend?.signal, requestTimeoutMs: options.backend?.requestTimeoutMs });
    const backend = new HarakiriSandboxBackend(sandbox, options.backend);
    result = await task({ sandbox, backend });
  } catch (error) {
    failures.push(error);
  }
  try {
    // Caller cancellation must not cancel confirmation of the owned runtime's cleanup.
    await sandbox.kill({ wait: true, timeoutMs: cleanupTimeoutMs });
  } catch (error) {
    throw new HarakiriTaskCleanupError(sandbox.id, [...failures, error]);
  }
  if (failures.length) throw failures[0];
  return result;
}
