import type React from "react";

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="field">
    <div className="field-l">{label}</div>
    {children}
    {hint ? <div className="field-h">{hint}</div> : null}
  </div>
);

export const Chart = ({ data }: { data: number[] }) => {
  const w = 880;
  const h = 200;
  const pad = 8;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2), h - pad - (v / max) * (h - pad * 2)]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 200, display: "block" }}>
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={pad} x2={w - pad} y1={h * t} y2={h * t} stroke="var(--border)" strokeDasharray="2 4" />)}
      <path d={`${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`} fill="oklch(0.15 0.01 90 / 0.05)" />
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
};

export const KPI = ({ label, v, delta }: { label: string; v: string; delta: string }) => <div className="card" style={{ padding: 18 }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div><div className="num" style={{ fontSize: 22, marginTop: 6 }}>{v}</div><div style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)" }}>{delta}</div></div>;
