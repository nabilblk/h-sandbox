import { useState, type FormEvent } from "react";
import type { TelemetryWindow } from "@harakiri/shared";
import { validTelemetryWindow } from "../observability";

/** Explicit UTC inputs avoid silently shifting a shared investigation's timezone. */
export function TelemetryWindowPicker({ value, onApply }: { value: TelemetryWindow; onApply: (window: TelemetryWindow) => void }) {
  const [from, setFrom] = useState(value.from.slice(0, 19));
  const [to, setTo] = useState(value.to.slice(0, 19));
  const [error, setError] = useState("");
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const start = new Date(`${from}Z`), end = new Date(`${to}Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !validTelemetryWindow(start.toISOString(), end.toISOString())) {
      setError("Choose an end after the start, within 31 days.");
      return;
    }
    setError("");
    onApply({ from: start.toISOString(), to: end.toISOString() });
  };
  return <form className="runs-time-range" onSubmit={apply}>
    <label>From (UTC)<input className="input" type="datetime-local" step="1" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
    <label>To (UTC)<input className="input" type="datetime-local" step="1" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
    <button className="btn" type="submit">Apply range</button>
    {error ? <p role="alert" className="runs-notice">{error}</p> : null}
  </form>;
}
