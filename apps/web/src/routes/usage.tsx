import { useEffect, useState } from "react";
import type { UsageSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";

export function UsageContent({ usage }: { usage: UsageSummary | null }) {
  const count = (status: string) => usage?.statusBreakdown.find((row) => row.label === status)?.value ?? 0;
  return <>
    <dl className="usage-totals">
      <div><dt>Sandbox records</dt><dd>{usage ? usage.sandboxesSpawned.toLocaleString() : "Unavailable"}</dd><small>All retained records, including failed creates</small></div>
      <div><dt>Running</dt><dd>{usage ? count("running").toLocaleString() : "Unavailable"}</dd><small>Current control-plane state</small></div>
      <div><dt>Idle</dt><dd>{usage ? count("idle").toLocaleString() : "Unavailable"}</dd><small>Current control-plane state</small></div>
    </dl>
    <section className="usage-history" aria-labelledby="usage-history-title">
      <div><h2 id="usage-history-title">Concurrent sandboxes</h2><span className="tag">History unavailable</span></div>
      <p>Historical concurrency, peak usage, compute hours, cold starts and runtime duration are not measured in this preview.</p>
      <p className="muted">Concurrency targets are not enforced. These counts are not resource quotas or billing measurements.</p>
    </section>
    {usage ? <div className="usage-breakdowns">
      <section><h2>Recorded states</h2><dl>{usage.statusBreakdown.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value.toLocaleString()}</dd></div>)}</dl>{!usage.statusBreakdown.length ? <p className="muted">No sandbox records.</p> : null}</section>
      <section><h2>Top templates</h2><dl>{usage.topTemplates.map((row) => <div key={row.label}><dt className="mono">{row.label}</dt><dd>{row.value.toLocaleString()}</dd></div>)}</dl>{!usage.topTemplates.length ? <p className="muted">No template activity recorded.</p> : null}</section>
    </div> : null}
  </>;
}

export const UsageRoute = () => {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.usage().then((result) => { if (current) setUsage(result); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Unable to load usage."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  return <div className="dash-page usage-page">
    <div className="page-head"><div><h1 className="page-h">Usage</h1><p className="page-sub muted">Retained sandbox records in this organization</p></div>
      <button className="btn btn-sm" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" />{loading ? "Refreshing" : error ? "Retry" : "Refresh"}</button>
    </div>
    {error ? <div className="build-inline-alert" role="alert">{error}{usage ? " Showing the last successful response." : ""}</div> : null}
    <p className="workspace-notice" role="status">{loading ? "Loading usage..." : usage?.coverage ? `Observed ${new Date(usage.coverage.observedAt).toLocaleString()}` : usage ? "Snapshot loaded. Observation time unavailable on this server." : "No usage snapshot available."}</p>
    <div aria-busy={loading}><UsageContent usage={usage} /></div>
  </div>;
};
