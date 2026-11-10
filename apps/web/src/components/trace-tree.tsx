import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { TelemetrySpan } from "@harakiri/shared";
import { Icon } from "./icon";
import { durationLabel, stepKind, timelineBar, traceRange, traceRows } from "../observability";

export function TraceTree({ spans, selected, onSelect }: { spans: TelemetrySpan[]; selected?: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState(false);
  const [kind, setKind] = useState<ReturnType<typeof stepKind> | "">("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"timeline" | "tree">("timeline");
  const tree = useRef<HTMLDivElement>(null);
  const revealed = useRef<string | undefined>(undefined);
  const rows = useMemo(() => traceRows(spans, collapsed, search, errors, kind || undefined), [spans, collapsed, search, errors, kind]);
  const range = useMemo(() => traceRange(spans), [spans]);
  const tabStop = rows.some(({ span }) => span.id === selected) ? selected : rows[0]?.span.id;
  const filtering = Boolean(search.trim() || errors || kind);
  useEffect(() => {
    if (!selected || revealed.current === selected) return;
    const hierarchy = traceRows(spans, new Set());
    const index = hierarchy.findIndex(({ span }) => span.id === selected);
    if (index < 0) return;
    revealed.current = selected;
    // A cross-link is an explicit navigation request; reveal its destination.
    if (!rows.some(({ span }) => span.id === selected)) {
      setSearch(""); setErrors(false); setKind("");
    }
    const ancestors = new Set<string>();
    let depth = hierarchy[index].depth;
    for (let i = index - 1; i >= 0 && depth > 0; i--) {
      if (hierarchy[i].depth < depth) { ancestors.add(hierarchy[i].span.id); depth = hierarchy[i].depth; }
    }
    setCollapsed((previous) => [...previous].some((id) => ancestors.has(id))
      ? new Set([...previous].filter((id) => !ancestors.has(id))) : previous);
  }, [selected, spans, rows]);
  useEffect(() => {
    const current = tree.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!current || !tree.current) return;
    const row = current.getBoundingClientRect(), viewport = tree.current.getBoundingClientRect();
    if (row.top < viewport.top) tree.current.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) tree.current.scrollTop += row.bottom - viewport.bottom;
  }, [selected, collapsed, rows]);
  const toggle = (id: string, close?: boolean) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (close ?? !next.has(id)) next.add(id); else next.delete(id);
    return next;
  });
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, id: string, hasChildren: boolean) => {
    const elements = () => [...tree.current!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const nodes = elements();
      const index = nodes.indexOf(event.currentTarget);
      const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
      nodes[Math.max(0, Math.min(nodes.length - 1, next))]?.focus();
    } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
    else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const nodes = elements(), index = rows.findIndex((row) => row.span.id === id);
      if (event.key === "ArrowRight" && hasChildren) {
        if (!filtering && collapsed.has(id)) toggle(id, false);
        else nodes[index + 1]?.focus();
      } else if (event.key === "ArrowLeft") {
        if (hasChildren && !filtering && !collapsed.has(id)) toggle(id, true);
        else {
          let parent = index - 1;
          while (parent >= 0 && rows[parent].depth >= rows[index].depth) parent--;
          nodes[parent]?.focus();
        }
      }
    }
  };
  return <section className="trace-navigation" aria-label="Trace navigation">
    <div className="trace-nav-heading"><h2>Trace</h2><div className="trace-view-switch" role="group" aria-label="Trace view">
      <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}><Icon name="chart" size={12} />Timeline</button>
      <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}><Icon name="logs" size={12} />Tree</button>
    </div></div>
    <div className="runs-tools">
      <label className="runs-search"><Icon name="search" /><input aria-label="Search steps" type="search" placeholder="Search steps" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="workbench-toggle"><input type="checkbox" checked={errors} onChange={(event) => setErrors(event.target.checked)} /> Errors only</label>
      <select className="input trace-kind-filter" aria-label="Step type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="">All types</option><option value="model">Model calls</option><option value="tool">Tools</option><option value="agent">Agent / spans</option><option value="command">Commands</option>
      </select>
    </div>
    <div className={`trace-columns view-${view}`}><span>Step <small>{rows.length} / {spans.length}</small></span>{view === "timeline" ? <div className="trace-axis"><span>0</span><span>{range.observedDuration === null ? "" : durationLabel((range.observedDuration / 2n).toString())}</span><span>{durationLabel(range.observedDuration?.toString() ?? null)}</span></div> : <span>Duration</span>}</div>
    {filtering && selected && !rows.some(({ span }) => span.id === selected) ? <p className="runs-notice">Selected step is filtered out.<button className="btn btn-sm" onClick={() => { setSearch(""); setErrors(false); setKind(""); }}>Clear filters</button></p> : null}
    <div ref={tree} role="tree" aria-label="Agent trace steps" className={`trace-tree view-${view}`}>
      {rows.map(({ span, depth, hasChildren }) => {
        const bar = timelineBar(span, range), kind = stepKind(span);
        return <div key={span.id} role="treeitem" aria-level={depth + 1} aria-selected={span.id === selected}
          aria-expanded={hasChildren ? filtering || !collapsed.has(span.id) : undefined} tabIndex={span.id === tabStop ? 0 : -1}
          className={`trace-row ${span.id === selected ? "selected" : ""} trace-${kind} ${span.status === "error" ? "trace-error" : ""}`}
          onClick={() => onSelect(span.id)} onKeyDown={(event) => keyboard(event, span.id, hasChildren)}>
          <div className="trace-row-name" style={{ paddingLeft: Math.min(depth, 8) * 14 }}>
            {hasChildren ? <button className="trace-fold" tabIndex={-1} aria-label={`${collapsed.has(span.id) ? "Expand" : "Collapse"} ${span.name}`}
              onClick={(event) => { event.stopPropagation(); toggle(span.id); }}><Icon name={collapsed.has(span.id) ? "chevron" : "chevDown"} size={11} /></button> : <span className="trace-fold-placeholder" aria-hidden="true" />}
            <span className="trace-kind" title={kind}><Icon name={kind === "model" ? "bolt" : kind === "command" ? "terminal" : kind === "tool" ? "settings" : "box"} size={12} /></span>
            <span className="trace-name" title={span.name}>{span.name}<small>{kind}{span.issues.length ? " / partial" : ""}</small></span>
            {span.status === "error" ? <span className="trace-error-label">Error</span> : null}
          </div>
          <div className="trace-timing"><div className="trace-track" aria-hidden="true"><span title={`${span.name}: ${durationLabel(span.durationNano)}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /></div><span className="trace-duration">{durationLabel(span.durationNano)}</span></div>
        </div>;
      })}
      {!rows.length ? <p className="runs-empty">{spans.length ? "No matching steps." : "No spans observed in this window."}</p> : null}
    </div>
    <footer className="trace-legend"><span><i className="legend-agent" />Agent / span</span><span><i className="legend-model" />Model</span><span><i className="legend-tool" />Tool</span><span><i className="legend-error" />Error</span></footer>
  </section>;
}
