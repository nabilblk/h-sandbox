const names = new Set(["AssertionError", "GraphRecursionError", "HarakiriRunError", "HarakiriWaitTimeoutError",
  "HarakiriSandboxCreationError", "HarakiriTaskCleanupError", "HarakiriApiError", "TimeoutError", "TypeError", "Error"]);
const stages = new Set(["creation", "readiness", "source", "cleanup", "submission", "observation", "checkpoint"]);
export function modelFailure(error, depth = 0) {
  if (depth > 3 || !error) return { name: "unknown" };
  const result = { name: names.has(error.name) ? error.name : "unknown" };
  if (stages.has(error.stage)) result.stage = error.stage;
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) result.status = error.status;
  if (Number.isInteger(error.result?.exitCode)) result.exitCode = error.result.exitCode;
  const at = /\/run-repair\.ts:(\d+):(\d+)/.exec(error.stack ?? "");
  if (at) result.repairLine = Number(at[1]);
  if (error.cause) result.cause = modelFailure(error.cause, depth + 1);
  if (error instanceof AggregateError) result.errors = error.errors.slice(0, 3).map(item => modelFailure(item, depth + 1));
  return result;
}
