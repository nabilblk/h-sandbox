import { useState } from "react";
import type { UsageHistoryBucket, UsageHistoryResponse } from "@harakiri/shared";
import { Icon } from "./icon";

const number = (value: number | null, digits = 0) => value === null ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const instant = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function usagePlotBuckets(buckets: UsageHistoryBucket[]) {
  const size = Math.max(1, Math.ceil(buckets.length / 96));
  return Array.from({ length: Math.ceil(buckets.length / size) }, (_, i) => {
    const group = buckets.slice(i * size, (i + 1) * size);
    const seconds = group.reduce((total, bucket) => total + bucket.coveredSeconds, 0);
    const area = group.reduce((total, bucket) => total + (bucket.heldSlotSeconds ?? 0), 0);
    return { from: group[0].from, to: group.at(-1)!.to, value: seconds ? area / seconds : null,
      partial: group.some((bucket) => bucket.coverage !== "complete") };
  });
}

export function UsageHistoryContent({ history }: { history: UsageHistoryResponse }) {
  const [page, setPage] = useState(0);
  const { summary, coverage } = history;
  const accepted = summary.acceptedOperations;
  const plot = usagePlotBuckets(history.buckets);
  const max = Math.max(1, ...plot.map((bucket) => bucket.value ?? 0));
  const lastPage = Math.max(0, Math.ceil(history.buckets.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  return <section className="usage-observations" aria-labelledby="usage-observations-title">
    <div className="usage-section-head"><h2 id="usage-observations-title">Historical activity</h2><span className={`tag ${coverage.status === "complete" ? "" : "usage-coverage-tag"}`}>{coverage.status === "complete" ? "Observed" : coverage.status === "partial" ? "Partial coverage" : "History unavailable"}</span><a href="#docs/usage-observations">Definitions <Icon name="arrowR" size={11} /></a></div>
    <p className="usage-freshness" role="status">{coverage.lastObservedAt ? `Last observed ${instant(coverage.lastObservedAt)} UTC` : "No observations collected yet."}{coverage.observer === "disabled" ? " Collection is disabled." : coverage.observer === "stale" ? " Collection is delayed." : ""}</p>
    <dl className="usage-history-totals">
      <div><dt>Accepted operations</dt><dd>{number(accepted ? accepted.create + accepted.restore + accepted.resume : null)}</dd><small>{accepted ? `${accepted.create} creates / ${accepted.restore} restores / ${accepted.resume} resumes` : "No covered activity"}</small></div>
      <div><dt>Held slot-hours</dt><dd>{number(summary.heldSlotSeconds === null ? null : summary.heldSlotSeconds / 3_600, 2)}</dd><small>{number(summary.coveredSeconds / 3_600, 2)} hours observed</small></div>
      <div><dt>Peak held slots</dt><dd>{number(summary.peakHeldSlots)}</dd><small>Recorded reservations</small></div>
      <div><dt>Observed readiness p95</dt><dd>{summary.readiness.p95Ms === null ? "Unavailable" : `${number(summary.readiness.p95Ms / 1_000, 2)} s`}</dd><small>{summary.readiness.sampleCount} samples / {summary.readiness.unobservedCount} unobserved / {summary.readiness.unsupportedCount} unsupported</small></div>
    </dl>
    <figure className="usage-plot">
      <figcaption><strong>Average held slots</strong><span>{number(max, 2)} scale max</span></figcaption>
      <div className="usage-plot-bars" role="img" aria-label={`Average held execution slots over ${instant(history.window.from)} to ${instant(history.window.to)} UTC. ${coverage.status} coverage.`}>
        {plot.map((bucket) => <div className={`usage-plot-column ${bucket.value === null ? "missing" : bucket.partial ? "partial" : "observed"}`} key={bucket.from}
          title={`${instant(bucket.from)} - ${instant(bucket.to)} UTC: ${number(bucket.value, 2)} held slots${bucket.partial ? " (incomplete coverage)" : ""}`}>
          {bucket.value !== null ? <span style={{ height: `${100 * bucket.value / max}%` }} /> : null}
        </div>)}
      </div>
      <div className="usage-plot-axis"><span>{instant(history.window.from)}</span><span>{instant(history.window.to)} UTC</span></div>
      <div className="usage-plot-legend"><span><i className="observed" />Observed</span><span><i className="partial" />Partial</span><span><i className="missing" />No observation</span></div>
    </figure>
    {coverage.gaps.length ? <p className="workspace-notice">{coverage.gaps.length} uncovered interval{coverage.gaps.length === 1 ? "" : "s"}. Totals include observed time only.</p> : null}
    <p className="usage-definition-note">Held slots include starting and cleanup-pending work. They are not CPU consumption or billable compute. Readiness is the first successful observation, including queue and sampling delay.</p>
    <details className="usage-values"><summary>Bucket values</summary>
      <table><caption className="sr-only">Usage buckets in UTC</caption><thead><tr><th scope="col">Start (UTC)</th><th scope="col">Average slots</th><th scope="col">Peak slots</th><th scope="col">Coverage</th></tr></thead>
        <tbody>{history.buckets.slice(currentPage * 20, currentPage * 20 + 20).map((bucket) => <tr key={bucket.from}><td>{instant(bucket.from)}</td><td>{number(bucket.averageHeldSlots, 2)}</td><td>{number(bucket.peakHeldSlots)}</td><td>{bucket.coverage}</td></tr>)}</tbody>
      </table>
      <nav aria-label="Usage bucket pages" className="usage-pagination"><button className="btn btn-ghost btn-sm" title="Previous buckets" aria-label="Previous buckets" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="arrowR" style={{ transform: "rotate(180deg)" }} /></button><span>{currentPage + 1} / {lastPage + 1}</span><button className="btn btn-ghost btn-sm" title="Next buckets" aria-label="Next buckets" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><Icon name="arrowR" /></button></nav>
    </details>
  </section>;
}
