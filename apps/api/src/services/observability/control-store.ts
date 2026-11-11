import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../../auth-context.js";
import { hasScope } from "../../authorization.js";
import { recordAuditEvent } from "../../audit.js";
import type { Transaction } from "../../db.js";
import type { Query } from "../query.js";
import { readApiKeyPrincipal } from "../api-key-principals.js";
import { ObservabilityControlError, type AgentRunRecord, type AgentOutcome, type ObservabilityLimits } from "./control-model.js";
import { TelemetryIngestionError, telemetryRequestLimit, type TelemetryBinding } from "./ingestion.js";
import type { TelemetryQueryScope } from "./model.js";
import type { AgentRunsOptions, AgentRunsResponse } from "@harakiri/shared";
import { agentRunIdSchema as runIdSchema, telemetrySandboxIdSchema as sandboxIdSchema,
  createAgentRunSchema, observabilityPolicySchema, agentRunsQuerySchema, runCursorSchema } from "./schemas.js";

const limitsSchema = z.object({
  enabled: z.boolean(), allowContent: z.boolean(), retentionDays: z.number().int().min(1).max(30),
  requestsPerMinute: z.number().int().min(1).max(6000), bytesPerMinute: z.number().int().min(1).max(1024 * 1024 * 1024),
  activeRunsPerOrganization: z.number().int().min(1).max(1000), grantsPerRun: z.number().int().min(1).max(64)
}).strict();
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const iso = (date: Date | string) => new Date(date).toISOString();
const optionalIso = (date: Date | string | null) => date === null ? null : iso(date);

type PolicyRow = { tenant_id: number; enabled: boolean; allow_content: boolean };
type RunRow = {
  id: string; name: string; capture: "metadata" | "content"; reported_outcome: AgentOutcome;
  created_at: Date; closed_at: Date | null; retained_until: Date; sandbox_ids: string[];
  last_accepted_at: Date | null; last_rejected_at: Date | null; last_rejection: AgentRunRecord["lastRejection"]; expired: boolean; recording: boolean;
};
const runFields = `r.*, r.retained_until <= clock_timestamp() AS expired,
  (r.closed_at IS NULL AND r.created_at+interval '24 hours'>clock_timestamp() AND r.retained_until>clock_timestamp()) AS recording,
  ARRAY(SELECT b.sandbox_id FROM agent_run_sandboxes b WHERE b.organization_id=r.organization_id AND b.run_id=r.id ORDER BY b.sandbox_id) AS sandbox_ids`;
const serialize = (row: RunRow): AgentRunRecord => ({
  id: row.id, name: row.name, capture: row.capture, reportedOutcome: row.reported_outcome, sandboxIds: row.sandbox_ids,
  createdAt: iso(row.created_at), closedAt: optionalIso(row.closed_at), retainedUntil: iso(row.retained_until), expired: row.expired,
  recording: row.recording,
  lastAcceptedAt: optionalIso(row.last_accepted_at), lastRejectedAt: optionalIso(row.last_rejected_at), lastRejection: row.last_rejection
});

export function createObservabilityControlStore(dependencies: { transaction: Transaction; limits: ObservabilityLimits }) {
  const limits = limitsSchema.parse(dependencies.limits);
  const fail = (status: number, code: string): never => { throw new ObservabilityControlError(status, code); };
  const scope = (actor: AuthContext, permission: "runs:read" | "runs:write" | "runs:content") => {
    if (!hasScope(actor, permission)) fail(403, "forbidden");
  };
  const transact = async <T>(action: (query: Query) => Promise<T>): Promise<T> => {
    if (!limits.enabled) fail(503, "observability_disabled");
    try {
      return await dependencies.transaction(async (query) => {
        await query("SET LOCAL statement_timeout = '2s'");
        await query("SET LOCAL lock_timeout = '1s'");
        return action(query);
      });
    } catch (error) {
      if (error instanceof ObservabilityControlError || error instanceof TelemetryIngestionError) throw error;
      throw new ObservabilityControlError(503, "observability_unavailable");
    }
  };
  const policy = async (query: Query, organizationId: string) => {
    await query("INSERT INTO observability_policies(organization_id) VALUES ($1) ON CONFLICT DO NOTHING", [organizationId]);
    const { rows } = await query<PolicyRow>("SELECT tenant_id,enabled,allow_content FROM observability_policies WHERE organization_id=$1 FOR UPDATE", [organizationId]);
    return rows[0] ?? fail(404, "organization_not_found");
  };
  const getRun = async (query: Query, organizationId: string, runId: string, lock = false) => {
    const { rows } = await query<RunRow>(`SELECT ${runFields} FROM agent_runs r
      WHERE r.organization_id=$1 AND r.id=$2 AND r.deleted_at IS NULL ${lock ? "FOR UPDATE OF r" : ""}`, [organizationId, runId]);
    return rows[0] ?? fail(404, "agent_run_not_found");
  };
  const audit = (query: Query, actor: AuthContext, action: string, targetId: string, metadata: Record<string, unknown> = {}) =>
    recordAuditEvent({ organizationId: actor.organizationId, actorUserId: actor.userId, actorLabel: actor.actorLabel,
      action: `observability.${action}`, targetType: "agent_run", targetId, metadata }, { query });

  const resolveGrant = async (query: Query, field: "token_hash" | "id", value: string): Promise<TelemetryBinding | null> => {
    const { rows } = await query<{
      id: string; organization_id: string; run_id: string; sandbox_id: string; tenant_id: number;
      capture: "metadata" | "content"; allow_content: boolean; user_id: string | null; api_key_id: string | null;
      expires_at: Date; role: "admin" | "member" | null;
    }>(`SELECT g.id,g.organization_id,g.run_id,g.sandbox_id,p.tenant_id,r.capture,p.allow_content,g.user_id,g.api_key_id,m.role,
        LEAST(g.expires_at,r.created_at+interval '24 hours',COALESCE(r.closed_at+interval '2 minutes',g.expires_at),
          CASE WHEN s.status IN ('terminated','error') THEN s.updated_at+interval '2 minutes' ELSE g.expires_at END) AS expires_at
      FROM telemetry_grants g JOIN observability_policies p ON p.organization_id=g.organization_id
      JOIN agent_runs r ON r.organization_id=g.organization_id AND r.id=g.run_id
      JOIN sandboxes s ON s.organization_id=g.organization_id AND s.id=g.sandbox_id
      LEFT JOIN memberships m ON m.organization_id=g.organization_id AND m.user_id=g.user_id
      WHERE g.${field}=$1 AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
        AND p.enabled AND r.deleted_at IS NULL AND r.retained_until>clock_timestamp()`, [value]);
    const row = rows[0];
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
    const principal: AuthContext | null = row.api_key_id
      ? await readApiKeyPrincipal({ id: row.api_key_id, organizationId: row.organization_id }, query)
      : row.user_id && row.role ? { authType: "keycloak", userId: row.user_id, role: row.role, organizationId: row.organization_id, actorLabel: "telemetry" } : null;
    if (!principal || !hasScope(principal, "runs:write") || !hasScope(principal, "sandboxes:write")) return null;
    if (row.capture === "content" && !hasScope(principal, "runs:content")) return null;
    return { grantId: row.id, tenantId: row.tenant_id, organizationId: row.organization_id, runId: row.run_id, sandboxId: row.sandbox_id,
      capture: row.capture === "content" && limits.allowContent && row.allow_content ? "content" : "metadata", expiresAt: new Date(row.expires_at).getTime() };
  };

  return {
    async policy(actor: AuthContext) {
      scope(actor, "runs:read");
      return transact(async (query) => {
        const { rows } = await query<PolicyRow>("SELECT tenant_id,enabled,allow_content FROM observability_policies WHERE organization_id=$1", [actor.organizationId]);
        return { enabled: rows[0]?.enabled ?? false, allowContent: limits.allowContent && (rows[0]?.allow_content ?? false), retentionDays: limits.retentionDays };
      });
    },
    async configure(actor: AuthContext, input: { enabled: boolean; allowContent: boolean }) {
      if (actor.authType === "api_key" || actor.role !== "admin") fail(403, "forbidden");
      const settings = observabilityPolicySchema.parse(input);
      if (settings.allowContent && !limits.allowContent) fail(409, "content_capture_disabled_by_operator");
      return transact(async (query) => {
        await policy(query, actor.organizationId);
        await query("UPDATE observability_policies SET enabled=$2, allow_content=$3, updated_at=clock_timestamp() WHERE organization_id=$1", [actor.organizationId, settings.enabled, settings.allowContent]);
        if (!settings.enabled) await query("UPDATE telemetry_grants SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND revoked_at IS NULL", [actor.organizationId]);
        await audit(query, actor, "policy.updated", actor.organizationId, settings);
        return { ...settings, retentionDays: limits.retentionDays };
      });
    },
    async create(actor: AuthContext, input: z.input<typeof createAgentRunSchema>) {
      scope(actor, "runs:write");
      if (!hasScope(actor, "sandboxes:write")) fail(403, "forbidden");
      const body = createAgentRunSchema.parse(input);
      if (body.capture === "content") scope(actor, "runs:content");
      return transact(async (query) => {
        const settings = await policy(query, actor.organizationId);
        if (!settings.enabled) fail(409, "organization_observability_disabled");
        if (body.capture === "content" && (!limits.allowContent || !settings.allow_content)) fail(409, "content_capture_disabled");
        const { rows: sandboxes } = await query("SELECT id FROM sandboxes WHERE organization_id=$1 AND id=$2 AND status NOT IN ('terminated','error')", [actor.organizationId, body.sandboxId]);
        if (!sandboxes.length) fail(404, "sandbox_not_found");
        const { rows: counts } = await query<{ count: number }>(`SELECT count(*)::int AS count FROM agent_runs WHERE organization_id=$1
          AND closed_at IS NULL AND deleted_at IS NULL AND created_at > clock_timestamp()-interval '24 hours'`, [actor.organizationId]);
        if (counts[0].count >= limits.activeRunsPerOrganization) fail(429, "active_agent_run_limit");
        const id = `run_${randomBytes(16).toString("hex")}`;
        await query(`INSERT INTO agent_runs(id,organization_id,name,capture,created_by_user_id,created_by_api_key_id,retained_until)
          VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+($7::int * interval '1 day'))`,
        [id, actor.organizationId, body.name, body.capture, actor.userId, actor.apiKeyId ?? null, limits.retentionDays]);
        await query("INSERT INTO agent_run_sandboxes(organization_id,run_id,sandbox_id) VALUES ($1,$2,$3)", [actor.organizationId, id, body.sandboxId]);
        await audit(query, actor, "run.created", id, { sandboxId: body.sandboxId, capture: body.capture });
        return serialize(await getRun(query, actor.organizationId, id));
      });
    },
    async list(actor: AuthContext, input: AgentRunsOptions = {}): Promise<AgentRunsResponse> {
      scope(actor, "runs:read");
      const options = agentRunsQuerySchema.parse(input);
      const filter = { sandboxId: options.sandboxId ?? null, outcome: options.outcome ?? null, search: options.search ?? "" };
      let cursor: z.infer<typeof runCursorSchema> | null = null;
      if (options.cursor) {
        try {
          cursor = runCursorSchema.parse(JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")));
        } catch { fail(400, "agent_run_cursor_invalid"); }
        if (!cursor || cursor.sandboxId !== filter.sandboxId || cursor.outcome !== filter.outcome || cursor.search !== filter.search) {
          fail(400, "agent_run_cursor_invalid");
        }
      }
      return transact(async (query) => {
        const { rows } = await query<RunRow & { cursor_time: string }>(`SELECT ${runFields},
          to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
          FROM agent_runs r WHERE r.organization_id=$1 AND r.deleted_at IS NULL
            AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM agent_run_sandboxes b WHERE b.organization_id=r.organization_id AND b.run_id=r.id AND b.sandbox_id=$2))
            AND ($3::text IS NULL OR r.reported_outcome=$3)
            AND ($4::text='' OR strpos(lower(r.name),lower($4))>0 OR strpos(r.id,$4)>0)
            AND ($5::timestamptz IS NULL OR (r.created_at,r.id)<($5::timestamptz,$6::text))
          ORDER BY r.created_at DESC,r.id DESC LIMIT $7`,
        [actor.organizationId, filter.sandboxId, filter.outcome, filter.search, cursor?.time ?? null, cursor?.id ?? null, options.limit + 1]);
        const page = rows.slice(0, options.limit);
        const last = page.at(-1);
        const nextCursor = rows.length > options.limit && last
          ? Buffer.from(JSON.stringify({ version: 1, time: last.cursor_time, id: last.id, ...filter })).toString("base64url") : null;
        return { runs: page.map(serialize), nextCursor };
      });
    },
    async get(actor: AuthContext, runId: string) {
      scope(actor, "runs:read"); runIdSchema.parse(runId);
      return transact(async (query) => serialize(await getRun(query, actor.organizationId, runId)));
    },
    async queryScope(actor: AuthContext, runId: string, includeContent = false): Promise<TelemetryQueryScope> {
      scope(actor, "runs:read"); runIdSchema.parse(runId); z.boolean().parse(includeContent);
      if (includeContent) scope(actor, "runs:content");
      return transact(async (query) => {
        const run = await getRun(query, actor.organizationId, runId);
        if (run.expired) fail(410, "agent_run_expired");
        const { rows } = await query<PolicyRow>("SELECT tenant_id,enabled,allow_content FROM observability_policies WHERE organization_id=$1", [actor.organizationId]);
        if (!rows[0]) fail(404, "agent_run_not_found");
        return { tenantId: rows[0].tenant_id, organizationId: actor.organizationId, runId, includeContent };
      });
    },
    async close(actor: AuthContext, runId: string, outcome: AgentOutcome) {
      scope(actor, "runs:write"); runIdSchema.parse(runId);
      z.enum(["unknown", "succeeded", "failed", "cancelled"]).parse(outcome);
      return transact(async (query) => {
        const run = await getRun(query, actor.organizationId, runId, true);
        if (run.closed_at && run.reported_outcome !== outcome) fail(409, "agent_run_already_closed");
        await query("UPDATE agent_runs SET closed_at=COALESCE(closed_at,clock_timestamp()),reported_outcome=$3 WHERE organization_id=$1 AND id=$2", [actor.organizationId, runId, outcome]);
        if (!run.closed_at) await audit(query, actor, "run.closed", runId, { outcome });
        return serialize(await getRun(query, actor.organizationId, runId));
      });
    },
    async issueGrant(actor: AuthContext, runId: string, sandboxId: string) {
      scope(actor, "runs:write");
      if (!hasScope(actor, "sandboxes:write")) fail(403, "forbidden");
      runIdSchema.parse(runId); sandboxIdSchema.parse(sandboxId);
      if (actor.expiresAt && !(Date.parse(actor.expiresAt) > Date.now())) fail(401, "unauthorized");
      return transact(async (query) => {
        const settings = await policy(query, actor.organizationId);
        const run = await getRun(query, actor.organizationId, runId, true);
        if (!settings.enabled || !run.recording) fail(409, "agent_run_not_recording");
        if (run.capture === "content") {
          scope(actor, "runs:content");
          if (!limits.allowContent || !settings.allow_content) fail(409, "content_capture_disabled");
        }
        const { rows: sandboxes } = await query("SELECT id FROM sandboxes WHERE organization_id=$1 AND id=$2 AND status NOT IN ('terminated','error')", [actor.organizationId, sandboxId]);
        if (!sandboxes.length) fail(404, "sandbox_not_found");
        const { rows: counts } = await query<{ count: number }>("SELECT count(*)::int AS count FROM telemetry_grants WHERE organization_id=$1 AND run_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()", [actor.organizationId, runId]);
        if (counts[0].count >= limits.grantsPerRun) fail(429, "telemetry_grant_limit");
        await query("INSERT INTO agent_run_sandboxes(organization_id,run_id,sandbox_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [actor.organizationId, runId, sandboxId]);
        const token = `htg_${randomBytes(32).toString("base64url")}`;
        // One clock value is essential: independent volatile evaluations can
        // exceed the database's exact fifteen-minute lifetime constraint.
        const { rows } = await query<{ id: string; expires_at: Date }>(`WITH issued AS MATERIALIZED (SELECT clock_timestamp() AS issued_at)
          INSERT INTO telemetry_grants(organization_id,run_id,sandbox_id,token_hash,user_id,api_key_id,created_at,expires_at)
          SELECT $1,$2,$3,$4,$5,$6,issued_at,LEAST(issued_at+interval '15 minutes',$7::timestamptz) FROM issued RETURNING id,expires_at`,
        [actor.organizationId, runId, sandboxId, hash(token), actor.userId, actor.apiKeyId ?? null, actor.expiresAt ?? null]);
        await audit(query, actor, "grant.issued", runId, { grantId: rows[0].id, sandboxId });
        return { id: rows[0].id, token, expiresAt: iso(rows[0].expires_at), capture: run.capture };
      });
    },
    async revokeGrant(actor: AuthContext, runId: string, grantId: string) {
      scope(actor, "runs:write"); runIdSchema.parse(runId); z.uuid().parse(grantId);
      return transact(async (query) => {
        await getRun(query, actor.organizationId, runId);
        const result = await query("UPDATE telemetry_grants SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE organization_id=$1 AND run_id=$2 AND id=$3", [actor.organizationId, runId, grantId]);
        if (!result.rowCount) fail(404, "telemetry_grant_not_found");
        await audit(query, actor, "grant.revoked", runId, { grantId });
      });
    },
    async authorizeGrant(token: string): Promise<TelemetryBinding | null> {
      if (!/^htg_[A-Za-z0-9_-]{43}$/.test(token)) return null;
      return transact((query) => resolveGrant(query, "token_hash", hash(token)));
    },
    async recordIngestion(binding: TelemetryBinding, rejection: AgentRunRecord["lastRejection"] = null) {
      return transact(async (query) => {
        if (rejection === null) {
          await query("UPDATE agent_runs SET last_accepted_at=clock_timestamp() WHERE organization_id=$1 AND id=$2 AND deleted_at IS NULL", [binding.organizationId, binding.runId]);
        } else {
          await query("UPDATE agent_runs SET last_rejected_at=clock_timestamp(),last_rejection=$3 WHERE organization_id=$1 AND id=$2 AND deleted_at IS NULL", [binding.organizationId, binding.runId, rejection]);
        }
      });
    },
    async admit(binding: TelemetryBinding, decodedBytes: number): Promise<TelemetryBinding> {
      if (!z.uuid().safeParse(binding.grantId).success || !Number.isInteger(decodedBytes) || decodedBytes < 0 || decodedBytes > telemetryRequestLimit) {
        throw new TelemetryIngestionError(400, "telemetry_admission_invalid");
      }
      return transact(async (query) => {
        const current = await resolveGrant(query, "id", binding.grantId);
        if (!current || current.organizationId !== binding.organizationId || current.runId !== binding.runId
          || current.sandboxId !== binding.sandboxId || current.tenantId !== binding.tenantId) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
        if (decodedBytes > limits.bytesPerMinute) throw new TelemetryIngestionError(429, "telemetry_rate_limited");
        const result = await query(`INSERT INTO telemetry_ingestion_budgets(organization_id,window_start,requests,bytes)
          VALUES ($1,date_trunc('minute',clock_timestamp()),1,$2)
          ON CONFLICT (organization_id) DO UPDATE SET
            window_start=EXCLUDED.window_start,
            requests=CASE WHEN telemetry_ingestion_budgets.window_start=EXCLUDED.window_start THEN telemetry_ingestion_budgets.requests+1 ELSE 1 END,
            bytes=CASE WHEN telemetry_ingestion_budgets.window_start=EXCLUDED.window_start THEN telemetry_ingestion_budgets.bytes+EXCLUDED.bytes ELSE EXCLUDED.bytes END
          WHERE (telemetry_ingestion_budgets.window_start<>EXCLUDED.window_start
            OR (telemetry_ingestion_budgets.requests<$3 AND telemetry_ingestion_budgets.bytes+EXCLUDED.bytes<=$4))
          RETURNING organization_id`, [current.organizationId, decodedBytes, limits.requestsPerMinute, limits.bytesPerMinute]);
        if (!result.rowCount) throw new TelemetryIngestionError(429, "telemetry_rate_limited");
        return current;
      });
    }
  };
}
