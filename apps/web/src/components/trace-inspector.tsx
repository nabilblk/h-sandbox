import { useState } from "react";
import type { TelemetrySpan, TelemetryWindow } from "@harakiri/shared";
import { durationLabel, stepKind } from "../observability";
import { workbenchRoute } from "../workbench";
import { Icon } from "./icon";
import { RunLogs } from "./run-logs";
import { CopyTelemetry, TelemetryValue } from "./telemetry-value";
import { GenerationFacts, MessagePayload } from "./llm-inspector";

export type InspectorTab = "overview" | "logs" | "data";

function AttributeList({ values }: { values: Record<string, string> }) {
  return <dl className="trace-attributes">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

const contentLabels: Record<string, string> = {
  "gen_ai.input.messages": "Input messages",
  "gen_ai.output.messages": "Output messages",
  "gen_ai.tool.call.arguments": "Tool arguments",
  "gen_ai.tool.call.result": "Tool result",
  "gen_ai.system_instructions": "System instructions", "gen_ai.tool.definitions": "Available tools",
  "input.value": "Framework input", "output.value": "Framework output"
};

export function TraceInspector({ span, spans, tab, runId, window, includeContent, following, onSelect, onReveal, canReveal }: {
  spans: TelemetrySpan[];
  span?: TelemetrySpan; tab: InspectorTab; runId: string; window: TelemetryWindow;
  includeContent: boolean; following: boolean; onSelect: (id: string) => void; onReveal: () => void; canReveal: boolean;
}) {
  const [scope, setScope] = useState<{ spanId?: string; stepOnly: boolean }>();
  const stepOnly = Boolean(span) && (scope?.spanId === span?.id ? scope?.stepOnly : span?.parent !== "root");
  if (tab === "logs") return <>
    <div className="log-scope"><label className="workbench-toggle"><input type="checkbox" disabled={!span} checked={Boolean(stepOnly)} onChange={(event) => setScope({ spanId: span?.id, stepOnly: event.target.checked })} /> This step only</label>
      <span>{stepOnly ? "Selected step" : "All run logs"}</span></div>
    <RunLogs runId={runId} span={stepOnly ? span : undefined} window={window} includeContent={includeContent} following={following} onSelect={onSelect} />
  </>;
  if (!span) return <div className="runs-empty"><Icon name="chart" size={24} /><h3>No step selected</h3></div>;
  const command = span.attributes["harakiri.command.id"];
  const showContent = includeContent && span.content.state === "available";
  return <div className="trace-inspector-content">
    {span.issues.length ? <p className="runs-notice" role="status">Partial evidence: {span.issues.join(", ")}</p> : null}
    {tab === "overview" ? <>
      {showContent && span.content.statusMessage ? <TelemetryValue label="Reported message" value={span.content.statusMessage} /> : null}
      <dl className="trace-facts">
        <div><dt>Reported status</dt><dd><span className={`step-status ${span.status}`}>{span.status}</span></dd></div>
        <div><dt>Duration</dt><dd>{durationLabel(span.durationNano)}</dd></div>
        <div><dt>Started</dt><dd>{new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toLocaleTimeString()}</dd></div>
        <div><dt>Service</dt><dd>{span.serviceName ?? "Not reported"}</dd></div>
      </dl>
      {stepKind(span) === "model" ? <GenerationFacts span={span} /> : null}
      <section className="trace-context"><h4>Execution context</h4>
        <a className="trace-context-link" href={`#${workbenchRoute(span.sandboxId, "overview")}`}><Icon name="box" /><span><small>Sandbox</small><code>{span.sandboxId}</code></span><Icon name="chevron" /></a>
        {command && /^[\w.-]{1,256}$/.test(command) ? <a className="trace-context-link" href={`#${workbenchRoute(span.sandboxId, "commands", command)}`}><Icon name="terminal" /><span><small>Tracked command</small><code>{command}</code></span><Icon name="chevron" /></a> : null}
      </section>
      <h4>Attributes <span className="runs-muted">{Object.keys(span.attributes).length}</span></h4>
      {Object.keys(span.attributes).length ? <AttributeList values={span.attributes} /> : <p className="runs-muted">No attributes reported.</p>}
      <details className="trace-identifiers"><summary>Trace identity and instrumentation</summary>
        <div className="trace-id-line"><code>{span.traceId}</code><CopyTelemetry label="trace ID" value={span.traceId} /></div>
        <AttributeList values={{ spanId: span.spanId, parent: span.parent, instrumentation: `${span.scopeName ?? "Not reported"} ${span.scopeVersion ?? ""}`.trim(),
          deliveries: String(span.deliveries), source: "Workload-reported", startTimeUnixNano: span.startTimeUnixNano, endTimeUnixNano: span.endTimeUnixNano ?? "Unknown" }} />
      </details>
    </> : showContent ? <>
      {span.content.statusMessage ? <TelemetryValue label="Reported message" value={span.content.statusMessage} /> : null}
      {Object.entries(span.content.attributes).map(([key, value]) => key === "gen_ai.input.messages" || key === "gen_ai.output.messages"
        ? <MessagePayload key={`${span.id}:${key}`} label={contentLabels[key]} value={value} spans={spans.filter((item) => item.traceId === span.traceId)} onSelect={onSelect} />
        : stepKind(span) === "model" && (key === "input.value" || key === "output.value")
        ? <MessagePayload key={`${span.id}:${key}`} label={contentLabels[key]} value={value} format={key === "input.value" ? "langchain-input" : "langchain-output"} spans={spans.filter((item) => item.traceId === span.traceId)} onSelect={onSelect} />
        : <TelemetryValue key={key} label={contentLabels[key] ?? key} value={value} />)}
      {!span.content.statusMessage && !Object.keys(span.content.attributes).length ? <div className="runs-empty"><Icon name="file" size={22} /><h3>No input or output reported</h3><p>This step has no captured payload. Its application logs may contain separate output.</p></div> : null}
      {span.content.events.length ? <section><h4>Events <span className="runs-muted">{span.content.events.length}</span></h4>{span.content.events.map((event, index) => <TelemetryValue key={index} label={event.name} value={JSON.stringify(event.attributes)} />)}</section> : null}
      {span.content.links.length ? <details className="trace-identifiers"><summary>Linked spans ({span.content.links.length})</summary>{span.content.links.map((link, index) => <AttributeList key={index} values={{ traceId: link.traceId, spanId: link.spanId, ...link.attributes }} />)}</details> : null}
    </> : <div className="runs-empty trace-privacy"><Icon name="lock" size={24} /><h3>{span.content.state === "not_captured" ? "Content was not captured for this step." : "Sensitive content is hidden."}</h3>
      <p>{span.content.state === "not_captured" ? "Timing, status and permitted metadata remain available." : "Prompts, outputs and log bodies can contain sensitive information."}</p>
      {canReveal && span.content.state !== "not_captured" ? <button className="btn" onClick={onReveal}><Icon name="lock" size={13} />Reveal content</button> : null}
    </div>}
  </div>;
}
