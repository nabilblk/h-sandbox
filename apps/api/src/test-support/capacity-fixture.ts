import type { Query } from "../services/query.js";
import type { Transaction } from "../db.js";

// Fast domain tests stub the capacity protocol; PostgreSQL tests prove its locking and constraints.
// This fixture is intentionally not a SQL engine or a concurrency test.
export const capacityFixture = (domainQuery: Query, initial: { sandboxId?: string; organizationId?: string; providerId?: string | null; status?: string } = {}) => {
  let sandboxId = initial.sandboxId ?? "sbx_test";
  let organizationId = initial.organizationId ?? "org_sbx";
  let providerId = initial.providerId ?? null;
  let status = initial.status ?? "pending";
  let hold: Record<string, unknown> | null = initial.sandboxId ? { organization_id: organizationId, sandbox_id: sandboxId, generation: 1, operation_id: null, phase: "active", released_at: null } : null;
  let operation: Record<string, any> | null = null;
  let effect: Record<string, any> | null = null;
  let version = 0;
  let observedInitialStatus = false;
  const rows = (...items: Record<string, unknown>[]) => ({ rows: items as never[], rowCount: items.length });
  const query: Query = async (text, params = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SET LOCAL")) return rows();
    if (sql.startsWith("SELECT capacity_state FROM organizations")) return rows({ capacity_state: "enforced" });
    if (sql.startsWith("SELECT o.max_concurrency")) return rows({ max_concurrency: 100, capacity_state: "enforced", capacity_revision: 1, reserved: 0, active: 0, releasing: 0, uncertain: 0, observed_at: new Date() });
    if (sql.startsWith("SELECT clock_timestamp()")) return rows({ now: new Date() });
    if (sql.startsWith("SELECT opensandbox_id, status FROM sandboxes") && sql.includes("FOR UPDATE")) {
      sandboxId = String(params[0]); organizationId = String(params[1]);
      return rows({ opensandbox_id: providerId, status });
    }
    if (sql.startsWith("SELECT count(*)::text AS version")) return rows({ version: String(version), busy: Boolean(effect && !effect.settled_at) });
    if (sql.startsWith("SELECT") && sql.includes("FROM sandbox_capacity_reservations") && !sql.includes("FROM sandboxes s")) return hold && !hold.released_at ? rows(hold) : rows();
    if (sql.startsWith("INSERT INTO sandbox_capacity_reservations")) {
      hold = { organization_id: params[0], sandbox_id: params[1], generation: Number(hold?.generation ?? 0) + 1, operation_id: params[2], phase: "reserved", reason: null, released_at: null };
      return rows(hold);
    }
    if (sql.startsWith("UPDATE sandbox_capacity_reservations")) {
      if (hold) {
        if (sql.includes("phase = 'released'") || sql.includes("phase='released'")) hold.released_at = new Date();
        if (sql.includes("operation_id=$2")) { hold.operation_id = params[1]; hold.phase = "reserved"; }
        else if (sql.includes("phase='active'")) hold.phase = "active";
        else if (sql.includes("phase='releasing'")) hold.phase = "releasing";
        else if (sql.includes("phase='uncertain'")) hold.phase = "uncertain";
        else if (sql.includes("phase=$3")) hold.phase = params[2];
      }
      return { rows: [], rowCount: hold ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO sandbox_runtime_effects")) {
      effect = { id: params[0], organization_id: params[1], sandbox_id: params[2], operation_id: params[3], kind: params[4], generation: params[5], provider_id: params[6], context: JSON.parse(String(params[7])), dispatched_at: null, acknowledged_at: null, uncertain_at: null, settled_at: null };
      version++;
      return rows({ ...effect });
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM sandbox_runtime_effects") && !sql.includes("FROM sandboxes s") && !sql.includes("FROM sandbox_operations")) return effect && !effect.settled_at ? rows({ ...effect }) : rows();
    if (sql.startsWith("UPDATE sandbox_runtime_effects")) {
      if (!effect || effect.id !== params[0] || effect.settled_at) return rows();
      if (sql.includes("SET dispatched_at=")) effect.dispatched_at = new Date();
      if (sql.includes("SET acknowledged_at=")) { effect.acknowledged_at = new Date(); if (params[1]) effect.provider_id = params[1]; }
      if (sql.includes("SET uncertain_at=")) effect.uncertain_at = new Date();
      if (sql.includes("SET settled_at=")) effect.settled_at = new Date();
      if (sql.includes("SET context=")) effect.context = { ...effect.context, ...JSON.parse(String(params[1])) };
      return rows({ ...effect });
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM sandbox_operations") && (sql.includes("FOR UPDATE") || sql.includes("WHERE id=$1")) && operation) return rows({ ...operation });
    if (sql.startsWith("INSERT INTO sandbox_operation_secrets")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT") && sql.includes("FROM sandbox_operations") && sql.includes("kind='provision'") && sql.includes("idempotency_key=$2")) return rows();
    if (sql.startsWith("UPDATE sandbox_operations") && sql.includes("request=request")) {
      if (operation) operation.request = { ...operation.request, ...JSON.parse(String(params[1])) };
      return operation ? rows({ ...operation }) : rows();
    }
    const result = await domainQuery(text, params);
    if (sql.startsWith("WITH candidate") && result.rows[0] && "sandboxId" in result.rows[0]) {
      operation = { ...result.rows[0] };
      sandboxId = operation.sandboxId; organizationId = operation.organizationId;
      providerId = operation.kind === "provision" ? null : "provider_sbx";
      status = operation.kind === "provision" ? "pending" : "running";
      hold = { organization_id: organizationId, sandbox_id: sandboxId, generation: 1, operation_id: operation.id, phase: operation.kind === "provision" ? "reserved" : "active", released_at: null };
    }
    if (sql.startsWith("INSERT INTO sandboxes")) {
      sandboxId = String(params[0]); organizationId = String(params[1]); providerId = null; status = "pending";
    }
    if (sql.startsWith("INSERT INTO sandbox_operations") && result.rows[0]) operation = {
      ...result.rows[0], organizationId, sandboxId, kind: params[3], request: JSON.parse(String(params[5]))
    };
    if (sql.startsWith("UPDATE sandbox_operations") && operation && result.rowCount) {
      operation = { ...operation, state: sql.includes("SET state = 'succeeded'") ? "succeeded" : sql.includes("SET state = 'failed'") ? "failed" : sql.includes("SET state = 'running'") ? "running" : operation.state };
      if (sql.includes("attempts = attempts + 1")) operation.attempts++;
      return rows({ ...operation });
    }
    if (sql.startsWith("UPDATE sandboxes")) {
      if (sql.includes("opensandbox_id=$2")) { providerId = String(params[1]); status = String(params[3]); return { rows: [], rowCount: 1 }; }
      else if (sql.includes("SET status=$3") || sql.includes("SET status = $3")) status = String(params[2]);
      else if (sql.includes("status='terminated'")) status = "terminated";
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM sandboxes") && result.rows[0] && "status" in result.rows[0]) {
      const row = result.rows[0] as Record<string, any>;
      if (!observedInitialStatus) { status = row.status; observedInitialStatus = true; }
      if (!providerId) providerId = row.opensandbox_id ?? row.opensandboxId ?? null;
    }
    return { ...result, rows: result.rows as never[] };
  };
  const transaction: Transaction = (work) => work(query);
  return { query, transaction };
};
