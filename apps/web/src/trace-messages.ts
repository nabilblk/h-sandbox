type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown) => typeof value === "string" ? value : undefined;
export type MessagePart = { type: "text"; text: string } | { type: "call" | "result"; name?: string; id?: string; value: unknown };
export type TraceMessage = { role: string; name?: string; callId?: string; parts: MessagePart[] };
export type MessageFormat = "messages" | "langchain-input" | "langchain-output";

const roles: Record<string, string> = {
  HumanMessage: "user", HumanMessageChunk: "user", AIMessage: "assistant", AIMessageChunk: "assistant",
  SystemMessage: "system", SystemMessageChunk: "system", ToolMessage: "tool", ToolMessageChunk: "tool",
  FunctionMessage: "function", FunctionMessageChunk: "function"
};

function serializedMessage(value: unknown): JsonObject | null {
  if (!object(value) || value.lc !== 1 || value.type !== "constructor" || !Array.isArray(value.id)
    || value.id.length !== 3 || !["langchain", "langchain_core"].includes(value.id[0])
    || value.id[1] !== "messages" || typeof value.id[2] !== "string" || !object(value.kwargs)) return null;
  const data = value.kwargs;
  const role = ["ChatMessage", "ChatMessageChunk"].includes(value.id[2]) ? string(data.role)
    : Object.hasOwn(roles, value.id[2]) ? roles[value.id[2]] : undefined;
  if (!role || (data.invalid_tool_calls !== undefined && (!Array.isArray(data.invalid_tool_calls) || data.invalid_tool_calls.length))) return null;
  const extra = object(data.additional_kwargs) ? data.additional_kwargs : {};
  return { role, content: data.content, name: data.name, tool_call_id: data.tool_call_id,
    tool_calls: data.tool_calls ?? extra.tool_calls };
}

function frameworkMessages(data: unknown, format: MessageFormat): unknown {
  if (format === "messages") return data;
  if (!object(data)) return null;
  let messages: unknown;
  if (format === "langchain-input") {
    messages = data.messages;
    if (Array.isArray(messages) && Array.isArray(messages[0])) {
      // Separate prompt batches are not one conversation. Preserve them as raw JSON.
      if (messages.length !== 1) return null;
      messages = messages[0];
    }
  } else {
    const batches = data.generations;
    if (!Array.isArray(batches) || batches.length !== 1 || !Array.isArray(batches[0]) || batches[0].length > 128) return null;
    messages = batches[0].map(generation => object(generation) ? generation.message : null);
  }
  if (!Array.isArray(messages) || messages.length > 128) return null;
  return messages.map(serializedMessage);
}

/** Decode supported text/tool shapes as data, never instantiate a serialized class. */
export function traceMessages(value: string, format: MessageFormat = "messages"): TraceMessage[] | null {
  if (value.length > 65_536) return null;
  let data: unknown;
  try { data = frameworkMessages(JSON.parse(value), format); } catch { return null; }
  if (!Array.isArray(data) || data.length > 128) return null;
  const messages: TraceMessage[] = [];
  for (const item of data) {
    if (!object(item) || typeof item.role !== "string") return null;
    const parts: MessagePart[] = [];
    const content = item.parts ?? item.content;
    if (typeof content === "string") { if (content) parts.push({ type: "text", text: content }); }
    else if (Array.isArray(content)) {
      if (content.length > 128) return null;
      for (const part of content) {
        if (!object(part)) return null;
        if (part.type === "text" && typeof (part.text ?? part.content) === "string") parts.push({ type: "text", text: (part.text ?? part.content) as string });
        else if (part.type === "tool_call") parts.push({ type: "call", name: string(part.name), id: string(part.id), value: part.arguments });
        else if (part.type === "tool_call_response") parts.push({ type: "result", id: string(part.id), value: part.result });
        else return null;
      }
    } else if (content !== undefined && content !== null) return null;
    if (item.tool_calls !== undefined) {
      if (!Array.isArray(item.tool_calls) || item.tool_calls.length > 128) return null;
      for (const call of item.tool_calls) {
        if (!object(call)) return null;
        const fn = object(call.function) ? call.function : call;
        parts.push({ type: "call", name: string(fn.name), id: string(call.id), value: fn.arguments ?? fn.args });
      }
    }
    messages.push({ role: item.role, name: string(item.name), callId: string(item.tool_call_id), parts });
  }
  return messages;
}
