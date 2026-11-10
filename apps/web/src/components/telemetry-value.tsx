import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { createLowlight } from "lowlight";
import json from "highlight.js/lib/languages/json";
import { formatTelemetryValue } from "../observability";
import { Icon } from "./icon";

const highlighter = createLowlight({ json });
type Token = ReturnType<typeof highlighter.highlight>["children"][number];
function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => token.type === "text" ? token.value
    : token.type === "element" ? <span key={index} className={(token.properties.className as string[] | undefined)?.join(" ")}>{renderTokens(token.children as Token[])}</span>
      : null);
}

export function CopyTelemetry({ value, label }: { value: string; label: string }) {
  const [result, setResult] = useState("");
  useEffect(() => { setResult(""); }, [value]);
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(""), 2000);
    return () => clearTimeout(timer);
  }, [result]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setResult("Copied"); }
    catch { setResult("Copy failed"); }
  };
  return <span className="telemetry-copy">
    <button type="button" className="btn btn-ghost runs-icon" aria-label={`Copy ${label}`} title={`Copy ${label}`} onClick={() => void copy()}><Icon name={result === "Copied" ? "check" : "copy"} size={13} /></button>
    <span role="status" className="telemetry-copy-status">{result}</span>
  </span>;
}

export const TelemetryValue = memo(function TelemetryValue({ label, value }: { label: string; value: string }) {
  const formatted = useMemo(() => formatTelemetryValue(value), [value]);
  const highlighted = useMemo(() => {
    if (formatted.language !== "json") return formatted.text;
    try { return renderTokens(highlighter.highlight("json", formatted.text).children); }
    catch { return formatted.text; }
  }, [formatted]);
  return <section className="telemetry-value" aria-label={label}>
    <header><h4>{label}</h4><span>{formatted.language}</span><CopyTelemetry label={label} value={value} /></header>
    <pre tabIndex={0}><code translate="no">{highlighted}</code></pre>
  </section>;
});
