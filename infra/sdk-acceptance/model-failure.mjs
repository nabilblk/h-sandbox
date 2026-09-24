const names = new Set(["AssertionError", "GraphRecursionError", "HarakiriRunError", "HarakiriWaitTimeoutError",
  "HarakiriSandboxCreationError", "HarakiriTaskCleanupError", "HarakiriExecutionError", "HarakiriTransferError",
  "HarakiriApiError", "TimeoutError", "TypeError", "Error"]);
const stages = new Set(["creation", "readiness", "source", "cleanup", "submission", "observation", "checkpoint"]);
const tools = ["ls", "read_file", "write_file", "edit_file", "glob", "grep", "execute", "write_todos", "task", "other"];
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : 0;

/** Revalidated at the public receipt boundary; never includes tool arguments or model text. */
export function modelCounters(value = {}) {
  return {
    responses: count(value.responses), invalidToolCalls: count(value.invalidToolCalls),
    truncatedResponses: count(value.truncatedResponses),
    requestedTools: Object.fromEntries(tools.map(name => [name, count(value.requestedTools?.[name])]))
  };
}

export function modelObserver() {
  const state = modelCounters();
  return {
    snapshot: () => modelCounters(state),
    handleLLMEnd(output) {
      for (const generation of output.generations?.flat() ?? []) {
        const message = generation.message;
        state.responses++;
        state.invalidToolCalls += message?.invalid_tool_calls?.length ?? 0;
        if (message?.response_metadata?.done_reason === "length") state.truncatedResponses++;
        for (const tool of message?.tool_calls ?? []) {
          state.requestedTools[tools.includes(tool.name) ? tool.name : "other"]++;
        }
      }
    }
  };
}

export function modelFailure(error, depth = 0) {
  if (depth > 3 || !error) return { name: "unknown" };
  const result = { name: names.has(error.name) ? error.name : "unknown" };
  if (stages.has(error.stage)) result.stage = error.stage;
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) result.status = error.status;
  const exitCode = error.result ? error.result.exitCode : error.exitCode;
  if (exitCode === null || Number.isInteger(exitCode) && exitCode >= -255 && exitCode <= 255) result.exitCode = exitCode;
  const at = /\/run-repair\.ts:(\d+):(\d+)/.exec(error.stack ?? "");
  const line = at ? Number(at[1]) : error.repairLine;
  if (Number.isSafeInteger(line) && line > 0 && line < 1000) result.repairLine = line;
  const tests = {};
  for (const name of ["tests", "pass", "fail"]) {
    const match = new RegExp(`^# ${name} (\\d+)$`, "m").exec(error.result?.stdout ?? "");
    const value = match ? Number(match[1]) : error.tests?.[name];
    if (Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) tests[name] = value;
  }
  if (Object.keys(tests).length) result.tests = tests;
  if (error.model) result.model = modelCounters(error.model);
  if (error.cause) result.cause = modelFailure(error.cause, depth + 1);
  if (Array.isArray(error.errors)) result.errors = error.errors.slice(0, 3).map(item => modelFailure(item, depth + 1));
  return result;
}
