import { setTimeout as delay } from "node:timers/promises";
import type { SandboxReadiness, SandboxReadinessResponse } from "@harakiri/shared";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { getSandbox } from "./sandboxes.js";
import { readRuntimeFence } from "./sandbox-runtime-effects.js";

type Dependencies = { query: Query; runtimeProvider: RuntimeProvider };
type Input = { organizationId: string; sandboxId: string; signal?: AbortSignal };

export const getSandboxReadiness = async (
  input: Input, dependencies: Dependencies
): Promise<SandboxReadinessResponse | null> => {
  input.signal?.throwIfAborted();
  const sandbox = await getSandbox(input, dependencies);
  if (!sandbox) return null;
  const observed = (status: SandboxReadiness["status"], current = sandbox): SandboxReadinessResponse => ({
    sandbox: current, readiness: { status, checkedAt: new Date().toISOString() }
  });
  if (["pending", "resuming"].includes(sandbox.status)) return observed("starting");
  if (!["running", "idle"].includes(sandbox.status)) return observed("not_running");
  const ref = sandbox.runtimeMetadata.provider;
  if (!ref.sandboxId) return observed("starting");
  if (ref.kind !== dependencies.runtimeProvider.kind || !dependencies.runtimeProvider.isReady) return observed("unsupported");
  const before = await readRuntimeFence(sandbox.id, dependencies.query);
  if (!before || before.busy) return observed("starting");

  // No locks or mutations: a failed probe never proves execution has stopped.
  const timeout = AbortSignal.timeout(2_500);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  let status: SandboxReadiness["status"];
  try {
    status = await dependencies.runtimeProvider.isReady({ provider: ref.kind, providerSandboxId: ref.sandboxId }, signal)
      ? "ready" : "starting";
  } catch {
    input.signal?.throwIfAborted();
    status = "unavailable";
  }
  input.signal?.throwIfAborted();
  const current = await getSandbox(input, dependencies);
  if (!current) return null;
  const after = await readRuntimeFence(sandbox.id, dependencies.query);
  if (!["running", "idle", "pending", "resuming"].includes(current.status)) return observed("not_running", current);
  if (!after || after.busy || before.version !== after.version || current.status !== sandbox.status ||
    current.runtimeMetadata.provider.sandboxId !== ref.sandboxId || current.runtimeMetadata.provider.kind !== ref.kind) {
    return observed("starting", current);
  }
  return observed(status, current);
};

export const waitForSandboxReadiness = async (
  input: Input & { timeoutMs: number; intervalMs?: number }, dependencies: Dependencies
): Promise<SandboxReadinessResponse | null> => {
  if (input.timeoutMs <= 0) return null;
  const timeout = AbortSignal.timeout(Math.ceil(input.timeoutMs));
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  let last: SandboxReadinessResponse | null = null;
  try {
    while (!signal.aborted) {
      last = await getSandboxReadiness({ ...input, signal }, dependencies);
      if (!last || ["ready", "not_running", "unsupported"].includes(last.readiness.status)) return last;
      await delay(input.intervalMs ?? 1_000, undefined, { signal });
    }
  } catch (error) {
    input.signal?.throwIfAborted();
    if (!timeout.aborted) throw error;
  }
  return last;
};
