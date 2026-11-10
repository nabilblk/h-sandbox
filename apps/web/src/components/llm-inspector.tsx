import { useMemo, useState } from "react";
import type { TelemetrySpan } from "@harakiri/shared";
import { generationFacts, traceMessages, type MessagePart } from "../llm-observability";
import { CopyTelemetry, TelemetryValue } from "./telemetry-value";
import { Icon } from "./icon";

const payload = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "Not reported";
const tokens = (value: bigint | null) => value?.toLocaleString() ?? "Not reported";

export function GenerationFacts({ span }: { span: TelemetrySpan }) {
  const facts = generationFacts(span);
  return <section className="generation-facts" aria-label="Generation details">
    <header><Icon name="bolt" size={15} /><h3>Generation</h3><span>{facts.provider ?? "Provider not reported"}</span></header>
    <strong className="generation-model">{facts.model ?? "Model not reported"}</strong>
    <dl className="generation-usage"><div><dt>Input tokens</dt><dd>{tokens(facts.input)}</dd></div><div><dt>Output tokens</dt><dd>{tokens(facts.output)}</dd></div><div><dt>Total tokens</dt><dd>{tokens(facts.total)}</dd></div></dl>
    {facts.cached !== null || facts.created !== null || facts.reasoning !== null ? <div className="generation-subsets">
      {facts.cached !== null ? <span>Cache read <strong>{tokens(facts.cached)}</strong></span> : null}
      {facts.created !== null ? <span>Cache creation <strong>{tokens(facts.created)}</strong></span> : null}
      {facts.reasoning !== null ? <span>Reasoning tokens <strong>{tokens(facts.reasoning)}</strong></span> : null}
      <small>Included in input/output counts, not added to total.</small>
    </div> : null}
    {facts.inconsistent ? <p className="runs-notice" role="status">Reported token details exceed their totals.</p> : null}
    <dl className="generation-parameters">
      <div><dt>Finish reason</dt><dd>{facts.finish || "Not reported"}</dd></div>
      <div><dt>First text token</dt><dd>{facts.firstTokenMs === null ? "Not reported" : `${facts.firstTokenMs.toFixed(0)} ms`}</dd></div>
      <div><dt>Cost</dt><dd>Not reported</dd></div>
      {[ ["Temperature", "gen_ai.request.temperature"], ["Top P", "gen_ai.request.top_p"], ["Output limit", "gen_ai.request.max_tokens"] ].map(([label, key]) => span.attributes[key] !== undefined
        ? <div key={key}><dt>{label}</dt><dd>{span.attributes[key]}</dd></div> : null)}
    </dl>
  </section>;
}

function Part({ part, spans, onSelect }: { part: MessagePart; spans: TelemetrySpan[]; onSelect: (id: string) => void }) {
  if (part.type === "text") return <pre className="llm-message-text">{part.text}</pre>;
  const matches = part.id ? spans.filter((span) => span.attributes["gen_ai.tool.call.id"] === part.id) : [];
  return <div className="llm-tool-call">
    <header><Icon name="settings" size={12} /><strong>{part.name ?? (part.type === "call" ? "Tool call" : "Tool result")}</strong>
      {matches.length === 1 ? <button className="btn btn-sm" onClick={() => onSelect(matches[0].id)}>Inspect tool<Icon name="arrowR" size={12} /></button> : null}
    </header>
    {part.id ? <code className="llm-call-id">{part.id}</code> : null}
    <pre>{payload(part.value)}</pre>
  </div>;
}

export function MessagePayload({ label, value, spans, onSelect }: { label: string; value: string; spans: TelemetrySpan[]; onSelect: (id: string) => void }) {
  const [raw, setRaw] = useState(false);
  const messages = useMemo(() => traceMessages(value), [value]);
  return <section className="llm-messages" aria-label={label}>
    <header className="llm-messages-heading"><h3>{label}</h3><span>{messages ? `${messages.length} ${messages.length === 1 ? "message" : "messages"}` : "Raw payload"}</span>
      {messages ? <div className="trace-view-switch" role="group" aria-label={`${label} display`}><button aria-pressed={!raw} onClick={() => setRaw(false)}>Messages</button><button aria-pressed={raw} onClick={() => setRaw(true)}>JSON</button></div> : null}
      <CopyTelemetry label={label} value={value} />
    </header>
    {!messages ? <p className="runs-muted">This payload is incomplete or uses an unsupported message format. The captured value is shown below.</p> : null}
    {raw || !messages ? <TelemetryValue label={`${label} JSON`} value={value} /> : messages.length ? messages.map((message, index) => <article className="llm-message" key={index}>
      <header><span className={`llm-role role-${["system", "user", "assistant", "tool"].includes(message.role) ? message.role : "other"}`}>{message.role}</span><strong>{message.name}</strong><small>{index + 1}</small></header>
      {message.callId ? <code className="llm-call-id">{message.callId}</code> : null}
      {message.parts.length ? message.parts.map((part, i) => <Part key={i} part={part} spans={spans} onSelect={onSelect} />) : <p className="runs-muted">Empty message</p>}
    </article>) : <p className="runs-muted">No messages reported.</p>}
  </section>;
}
