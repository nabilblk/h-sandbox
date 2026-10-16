import { useCallback } from "react";
import { api } from "../api";
import { Icon } from "../components/icon";
import { useWorkbenchQuery } from "../use-workbench-query";
import { formatDateTime } from "../format";

export function SandboxMetricsPane({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => api.metrics(id, signal), [id]);
  const snapshot = useWorkbenchQuery(load, 5000);
  const data = snapshot.error ? undefined : snapshot.data;
  const fields = data?.availableFields ?? ["cpu", "mem"];
  const observedAt = data?.observedAt === undefined ? data?.series.at(-1)?.ts : data.observedAt;
  const metrics = [
    { key: "cpu", label: "CPU used", unit: "%" },
    { key: "mem", label: "Memory used", unit: "MiB" },
    { key: "diskIo", label: "Disk I/O", unit: "KB/s" },
    { key: "networkOut", label: "Network out", unit: "KB/s" }
  ] as const;
  return <section className="workbench-metrics" aria-label="Sandbox metrics">
    <header className="workbench-toolbar"><strong>Runtime observations</strong><span className="workbench-path">{data ? `Measured ${observedAt ? formatDateTime(observedAt) : "at an unknown time"}` : snapshot.loading ? "Loading" : "Unavailable"}</span><button className="btn btn-sm" disabled={snapshot.loading} onClick={snapshot.refresh} title="Refresh metrics" aria-label="Refresh metrics"><Icon name="refresh" /></button></header>
    {snapshot.error ? <p role="alert" className="workbench-notice">{snapshot.error}</p> : null}
    <dl className="workbench-observations">
      {metrics.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{data && fields.includes(key) ? <>{data.current[key]} <small>{unit}</small></> : <span className="muted">Unavailable</span>}</dd></div>)}
    </dl>
    <dl className="workbench-facts">
      <div><dt>Visible CPUs</dt><dd>{data?.current.cpuCount ?? "Unavailable"}</dd></div>
      <div><dt>Visible memory</dt><dd>{data?.current.memTotal === undefined ? "Unavailable" : `${data.current.memTotal} MiB`}</dd></div>
      <div><dt>Last successful fetch</dt><dd>{snapshot.observedAt ? formatDateTime(snapshot.observedAt) : "None"}</dd></div>
    </dl>
  </section>;
}
