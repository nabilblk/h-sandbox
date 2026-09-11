import { query as defaultQuery } from "../db.js";
import type { UsageSummary } from "@harakiri/shared";
import type { Query } from "./query.js";
import { readOrganizationCapacity } from "./organization-capacity.js";

export type { UsageSummary } from "@harakiri/shared";

export const getUsageSummary = async (
  input: { organizationId: string },
  options: { query?: Query; now?: () => Date } = {}
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
  const total = counts.rows.reduce((sum, row) => sum + Number(row.count), 0);
  const concurrentNow = Number(counts.rows.find((row) => row.status === "running")?.count ?? 0);
  const capacity = await readOrganizationCapacity(input.organizationId, query);
  return {
    sandboxesSpawned: total,
    // Preserve numeric wire types for existing clients, but never invent observations.
    computeHours: 0,
    avgColdStartMs: 0,
    avgRuntimeSeconds: 0,
    concurrentNow,
    capacity,
    concurrentPeak: 0,
    series: [],
    topTemplates: topTemplates.rows.map((row) => ({ label: row.label, value: Number(row.value) })),
    statusBreakdown: counts.rows.map((row) => ({ label: row.status, value: Number(row.count) })),
    coverage: {
      source: "control_plane_records",
      period: "retained_records",
      observedAt: (options.now?.() ?? new Date()).toISOString(),
      unavailableMetrics: ["computeHours", "avgColdStartMs", "avgRuntimeSeconds", "concurrentPeak", "series"],
      concurrencyLimitEnforced: capacity.state === "enforced"
    }
  };
};
