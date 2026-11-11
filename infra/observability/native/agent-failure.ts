const names = new Set([
  "AbortError", "TimeoutError", "TypeError", "AssertionError", "GraphRecursionError",
  "HarakiriApiError", "HarakiriCommandFailedError", "HarakiriWaitTimeoutError", "AggregateError"
]);
const codes = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};

/** Safe failure metadata for public CI. Never publish messages, tool output or URLs. */
export function agentFailure(value: unknown) {
  const error = record(value);
  const status = error.status ?? error.statusCode;
  const code = record(error.cause).code ?? error.code;
  const sources = typeof error.stack === "string" ? error.stack.split("\n").flatMap(line => {
    const match = line.match(/\/(host-agent|host-workflow|orders-agent|local-model)\.ts:(\d+):(\d+)\)?$/);
    return match ? [`${match[1]}.ts:${match[2]}:${match[3]}`] : [];
  }).slice(0, 4) : Array.isArray(error.sources) ? error.sources.filter((source): source is string => typeof source === "string"
    && /^(host-agent|host-workflow|orders-agent|local-model)\.ts:\d+:\d+$/.test(source)).slice(0, 4) : [];
  return {
    name: typeof error.name === "string" && names.has(error.name) ? error.name : "Error",
    ...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}),
    ...(typeof code === "string" && codes.has(code) ? { code } : {}), sources
  };
}

export class AgentAcceptanceError extends Error {
  readonly detail: ReturnType<typeof agentFailure>;
  constructor(detail: ReturnType<typeof agentFailure>) {
    super("Real host agent with sandbox tools failed");
    this.name = "AgentAcceptanceError";
    this.detail = detail;
  }
}
