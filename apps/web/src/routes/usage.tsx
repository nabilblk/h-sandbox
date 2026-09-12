import { useEffect, useRef, useState } from "react";
import type { UsageSummary, UsageHistoryResponse, UsageHistoryResolution } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { CapacitySummary, useOrganizationCapacity } from "../capacity";
import { ApiResponseError } from "../api-client/request";
import { UsageHistoryContent } from "../components/usage-history";

export function UsageContent({ usage }: { usage: UsageSummary | null }) {
  const count = (status: string) => usage?.statusBreakdown.find((row) => row.label === status)?.value ?? 0;
  return <>
    <dl className="usage-totals">
      <div><dt>Sandbox records</dt><dd>{usage ? usage.sandboxesSpawned.toLocaleString() : "Unavailable"}</dd><small>All retained records, including failed creates</small></div>
      <div><dt>Running</dt><dd>{usage ? count("running").toLocaleString() : "Unavailable"}</dd><small>Current control-plane state</small></div>
      <div><dt>Idle</dt><dd>{usage ? count("idle").toLocaleString() : "Unavailable"}</dd><small>Current control-plane state</small></div>
    </dl>
    <p className="usage-definition-note">Execution slots are counted separately from running records. Neither measures CPU, memory or billable usage.</p>
    {usage ? <div className="usage-breakdowns">
      <section><h2>Recorded states</h2><dl>{usage.statusBreakdown.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value.toLocaleString()}</dd></div>)}</dl>{!usage.statusBreakdown.length ? <p className="muted">No sandbox records.</p> : null}</section>
      <section><h2>Top templates</h2><dl>{usage.topTemplates.map((row) => <div key={row.label}><dt className="mono">{row.label}</dt><dd>{row.value.toLocaleString()}</dd></div>)}</dl>{!usage.topTemplates.length ? <p className="muted">No template activity recorded.</p> : null}</section>
    </div> : null}
  </>;
}

export const UsageRoute = () => {
  const capacity = useOrganizationCapacity();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<UsageHistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [period, setPeriod] = useState("24h");
  const loadedPeriod = useRef("");
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.usage().then((result) => { if (current) setUsage(result); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Unable to load usage."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (loadedPeriod.current !== period) setHistory(null);
    setHistoryLoading(true); setHistoryError("");
    const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;
    const resolution: UsageHistoryResolution = days === 1 ? "1m" : days === 7 ? "15m" : "1h";
    const now = Date.now();
    api.usageHistory({ from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now).toISOString(), resolution }, controller.signal)
      .then((result) => { if (current) { setHistory(result); loadedPeriod.current = period; } })
      .catch((cause) => { if (current) setHistoryError(cause instanceof ApiResponseError && cause.status === 404 ? "This server does not support usage history." : cause instanceof Error ? cause.message : "Unable to load history."); })
      .finally(() => { if (current) setHistoryLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [period, revision]);
  return <div className="dash-page usage-page">
    <div className="page-head"><div><h1 className="page-h">Usage</h1><p className="page-sub muted">Execution activity and capacity</p></div>
      <div className="usage-toolbar"><label>Period <select className="input" aria-label="Usage period" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
      <button className="btn btn-sm" disabled={loading || historyLoading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" />{loading || historyLoading ? "Refreshing" : error || historyError ? "Retry" : "Refresh"}</button></div>
    </div>
    {error ? <div className="build-inline-alert" role="alert">{error}{usage ? " Showing the last successful response." : ""}</div> : null}
    <p className="workspace-notice" role="status">{loading ? "Loading usage..." : usage?.coverage ? `Observed ${new Date(usage.coverage.observedAt).toLocaleString()}` : usage ? "Snapshot loaded. Observation time unavailable on this server." : "No usage snapshot available."}</p>
    <CapacitySummary state={capacity} />
    {historyError ? <div className="build-inline-alert" role="alert">{historyError}{history ? " Showing the last successful history response." : ""}</div> : null}
    <div aria-busy={historyLoading}>{history ? <UsageHistoryContent key={period} history={history} /> : <section className="usage-history"><h2>Historical activity</h2><span className="tag">History unavailable</span><p role="status">{historyLoading ? "Loading history..." : "No historical observations are available."}</p></section>}</div>
    <div aria-busy={loading}><UsageContent usage={usage} /></div>
  </div>;
};
