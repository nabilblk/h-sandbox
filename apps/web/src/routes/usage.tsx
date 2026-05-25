import { useEffect, useState } from "react";
import type { UsageSummary } from "@harakiri/shared";
import { api } from "../api";
import { Chart, KPI } from "../components/ui";

const emptyUsage: UsageSummary = {
  sandboxesSpawned: 0,
  computeHours: 0,
  avgColdStartMs: 0,
  avgRuntimeSeconds: 0,
  concurrentNow: 0,
  concurrentPeak: 0,
  series: [1, 2, 3],
  topTemplates: [],
  statusBreakdown: []
};

export const UsageRoute = () => {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => { api.usage().then(setUsage).catch(() => undefined); }, []);
  const u = usage ?? emptyUsage;
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">Usage</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Across all sandboxes - last 14 days</span></div></div><button className="btn btn-sm active">14d</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}><KPI label="Sandboxes spawned" v={String(u.sandboxesSpawned)} delta="+18.4%" /><KPI label="Total compute-hours" v={String(u.computeHours)} delta="+9.1%" /><KPI label="Avg cold start" v={`${u.avgColdStartMs}ms`} delta="-3ms" /><KPI label="Avg runtime" v={`${u.avgRuntimeSeconds}s`} delta="-0.21s" /></div><div className="card" style={{ padding: 24 }}><div style={{ marginBottom: 18 }}><div style={{ fontSize: 13, color: "var(--muted)" }}>Concurrent sandboxes</div><div className="num" style={{ fontSize: 24 }}>peak <b>{u.concurrentPeak}</b> - now <b>{u.concurrentNow}</b></div></div><Chart data={u.series} /></div></div>;
};
