import { query as defaultQuery } from "../db.js";
import { averageTemplateBootMs as defaultAverageTemplateBootMs } from "../templates.js";
import type { Query } from "./query.js";

export type UsageSummary = {
  sandboxesSpawned: number;
  computeHours: number;
  avgColdStartMs: number;
  avgRuntimeSeconds: number;
  concurrentNow: number;
  concurrentPeak: number;
  series: number[];
  topTemplates: Array<{ label: string; value: number }>;
  statusBreakdown: Array<{ label: string; value: number }>;
};

export const getUsageSummary = async (
  input: { organizationId: string },
  options: { query?: Query; averageTemplateBootMs?: typeof defaultAverageTemplateBootMs } = {}
): Promise<UsageSummary> => {
  const query = options.query ?? defaultQuery;
  const counts = await query<{ status: string; count: string }>(
    "SELECT status, count(*) FROM sandboxes WHERE organization_id = $1 GROUP BY status",
    [input.organizationId]
  );
  const topTemplates = await query<{ label: string; value: string }>(
    `SELECT template_id AS label, count(*)::text AS value
     FROM sandboxes
     WHERE organization_id = $1
     GROUP BY template_id
     ORDER BY count(*) DESC, template_id ASC
     LIMIT 5`,
    [input.organizationId]
  );
  const runtime = await query<{ compute_hours: string | null; avg_runtime_seconds: string | null }>(
    `SELECT
       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))) / 3600, 0)::numeric(10,2) AS compute_hours,
       COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))), 0)::numeric(10,2) AS avg_runtime_seconds
     FROM sandboxes
     WHERE organization_id = $1 AND started_at IS NOT NULL`,
    [input.organizationId]
  );
  const total = counts.rows.reduce((sum, row) => sum + Number(row.count), 0);
  const concurrentNow = Number(counts.rows.find((row) => row.status === "running")?.count ?? 0);
  const avgColdStartMs = total ? await (options.averageTemplateBootMs ?? defaultAverageTemplateBootMs)(input.organizationId) : 0;
  return {
    sandboxesSpawned: total,
    computeHours: Number(runtime.rows[0]?.compute_hours ?? 0),
    avgColdStartMs,
    avgRuntimeSeconds: Number(runtime.rows[0]?.avg_runtime_seconds ?? 0),
    concurrentNow,
    concurrentPeak: concurrentNow,
    series: Array.from({ length: 14 * 24 }, () => concurrentNow),
    topTemplates: topTemplates.rows.map((row) => ({ label: row.label, value: Number(row.value) })),
    statusBreakdown: counts.rows.map((row) => ({ label: row.status, value: Number(row.count) }))
  };
};
