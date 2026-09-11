import { query as defaultQuery, transaction as defaultTransaction, type Transaction } from "../db.js";
import { recordAuditEvent } from "../audit.js";
import type { RuntimeProvider, RuntimeSandboxSummary } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { CapacityError, lockOrganizationCapacity, readOrganizationCapacity, releaseSandboxCapacity } from "./organization-capacity.js";
import { lockEffectSandbox, readRuntimeFence } from "./sandbox-runtime-effects.js";
import { normalizeRuntimeState } from "./sandbox-lease.js";
import { persistSandboxTermination, runtimeIsAbsent } from "./sandbox-termination.js";

type InventoryInput = {
  organizationId: string;
  apply?: boolean;
  writersStopped?: boolean;
  recovery?: boolean;
  absenceEvidence?: Record<string, string>;
};
type InventoryRow = { id: string; opensandbox_id: string | null; status: string; generation: number | null; released_at: Date | null; reason: string | null };
type Classification = { sandboxId: string; providerId: string | null; state: string; action: "hold" | "release" | "unresolved"; phase?: "active" | "reserved" | "uncertain"; evidence: string };

const matchesLegacyIdentity = (runtime: RuntimeSandboxSummary, input: { organizationId: string; sandboxId: string }) =>
  (runtime.metadata?.["harakiri.org"] ?? runtime.metadata?.["harakiri.organization"]) === input.organizationId &&
  (runtime.metadata?.["harakiri.sandbox"] ?? runtime.metadata?.["harakiri.id"]) === input.sandboxId;

export const reconcileCapacityInventory = async (
  input: InventoryInput,
  dependencies: { query?: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider }
) => {
  const query = dependencies.query ?? defaultQuery;
  const transaction = dependencies.transaction ?? defaultTransaction;
  const provider = dependencies.runtimeProvider;
  if (input.apply && !input.writersStopped) throw new Error("Stop every older API and worker before activation. Pass writersStopped only after verifying this operational prerequisite.");
  if (input.apply) await transaction(async (q) => {
    await lockOrganizationCapacity(input.organizationId, q);
    await q("UPDATE organizations SET capacity_state='reconciling' WHERE id=$1", [input.organizationId]);
    // Include records written after the migration's backfill, before old writers stopped.
    await q(`INSERT INTO sandbox_capacity_reservations(organization_id,sandbox_id,generation,phase,reason)
      SELECT s.organization_id,s.id,1,'uncertain','legacy_inventory' FROM sandboxes s
      WHERE s.organization_id=$1 AND NOT EXISTS (SELECT 1 FROM sandbox_capacity_reservations r WHERE r.sandbox_id=s.id)`, [input.organizationId]);
    await recordAuditEvent({ organizationId: input.organizationId, actorLabel: "capacity-inventory", action: "capacity.inventory.started", targetType: "organization", targetId: input.organizationId, metadata: { writersStopped: true, recovery: Boolean(input.recovery) } }, { query: q });
  });
  const rows = await query<InventoryRow>(`SELECT s.id,s.opensandbox_id,s.status,r.generation,r.released_at,r.reason
    FROM sandboxes s LEFT JOIN LATERAL (SELECT * FROM sandbox_capacity_reservations WHERE sandbox_id=s.id ORDER BY generation DESC LIMIT 1) r ON true
    WHERE s.organization_id=$1 ORDER BY s.id`, [input.organizationId]);
  const listed = await provider.list(); // Only positive evidence: this adapter does not promise complete listing.
  const foreign = listed.filter((runtime) => (runtime.metadata?.["harakiri.org"] ?? runtime.metadata?.["harakiri.organization"]) === input.organizationId &&
    !rows.rows.some((row) => row.opensandbox_id === runtime.providerSandboxId || matchesLegacyIdentity(runtime, { ...input, sandboxId: row.id })));
  const classifications: Classification[] = [];
  for (const row of rows.rows) {
    const fence = await transaction(async (q) => { await lockEffectSandbox(input.organizationId, row.id, q); return readRuntimeFence(row.id, q); });
    const matches = listed.filter((runtime) => matchesLegacyIdentity(runtime, { ...input, sandboxId: row.id }));
    let classification: Classification = { sandboxId: row.id, providerId: row.opensandbox_id, state: row.status, action: "unresolved", evidence: "runtime_identity_unknown" };
    if (fence.busy) classification.evidence = "runtime_effect_unsettled";
    else if (matches.length > 1 || (row.opensandbox_id && matches.some((runtime) => runtime.providerSandboxId !== row.opensandbox_id))) classification.evidence = "duplicate_runtime_identity";
    else {
      const providerId = row.opensandbox_id ?? matches[0]?.providerSandboxId;
      const runtime = providerId ? await provider.get({ provider: provider.kind, providerSandboxId: providerId }) : undefined;
      const state = normalizeRuntimeState(runtime?.state);
      classification.providerId = providerId ?? null;
      classification.state = runtime?.state ?? "absent_or_unknown";
      if (providerId && runtimeIsAbsent(provider, runtime ?? null)) {
        classification = { ...classification, action: "release", evidence: "provider_absent" };
      } else if (runtime && state === "paused" && provider.capabilities.pauseStopsExecution) {
        classification = { ...classification, action: "release", evidence: "provider_suspended" };
      } else if (runtime && provider.capabilities.authoritativeLifecycle) {
        classification = { ...classification, action: "hold", phase: ["running", "idle", "paused"].includes(state ?? "") ? "active" : state === "error" ? "uncertain" : "reserved", evidence: "provider_present" };
      } else if (!providerId && input.absenceEvidence?.[row.id]?.trim()) {
        classification = { ...classification, action: "release", evidence: "operator_verified_absent" };
      }
    }
    if (input.apply && classification.action !== "unresolved") {
      const applied = await transaction(async (q) => {
        const current = await lockEffectSandbox(input.organizationId, row.id, q);
        const currentFence = await readRuntimeFence(row.id, q);
        if (currentFence.busy || currentFence.version !== fence.version || current.opensandbox_id !== row.opensandbox_id) return false;
        const latest = await q<{ generation: number; released_at: Date | null }>("SELECT generation,released_at FROM sandbox_capacity_reservations WHERE sandbox_id=$1 ORDER BY generation DESC LIMIT 1", [row.id]);
        if (latest.rows[0]?.generation !== row.generation) return false;
        let generation = row.generation!;
        if (classification.action === "hold" && latest.rows[0].released_at) {
          if (!input.recovery) return false;
          generation++;
          await q("INSERT INTO sandbox_capacity_reservations(organization_id,sandbox_id,generation,phase,reason) VALUES ($1,$2,$3,'uncertain','backup_recovery')", [input.organizationId, row.id, generation]);
        }
        if (classification.action === "hold") {
          await q("UPDATE sandboxes SET opensandbox_id=$3,status=$4,updated_at=now() WHERE id=$1 AND organization_id=$2", [row.id, input.organizationId, classification.providerId, normalizeRuntimeState(classification.state) ?? "error"]);
          await q("UPDATE sandbox_capacity_reservations SET phase=$3,reason='inventory_verified',updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [row.id, generation, classification.phase]);
        } else {
          if (classification.evidence !== "provider_suspended") await persistSandboxTermination({ organizationId: input.organizationId, sandboxId: row.id }, q);
          else await q("UPDATE sandboxes SET opensandbox_id=$3,status='paused',updated_at=now() WHERE id=$1 AND organization_id=$2", [row.id, input.organizationId, classification.providerId]);
          await releaseSandboxCapacity({ organizationId: input.organizationId, sandboxId: row.id, generation, reason: classification.evidence === "provider_suspended" ? "provider_suspended" : "provider_absent" }, q);
        }
        await recordAuditEvent({ organizationId: input.organizationId, actorLabel: "capacity-inventory", action: "capacity.inventory.verified", targetType: "sandbox", targetId: row.id, metadata: { generation, ...classification, operatorEvidence: input.absenceEvidence?.[row.id] } }, { query: q });
        return true;
      });
      if (!applied) classification = { ...classification, action: "unresolved", evidence: "inventory_changed_or_recovery_required" };
    }
    classifications.push(classification);
  }
  const unresolved = classifications.filter((item) => item.action === "unresolved").length + foreign.length;
  if (input.apply) await transaction(async (q) => {
    await lockOrganizationCapacity(input.organizationId, q);
    const invalid = await q("SELECT id FROM organizations WHERE id=$1 AND max_concurrency NOT BETWEEN 1 AND 10000", [input.organizationId]);
    const unchecked = await q(`SELECT id FROM sandboxes s WHERE organization_id=$1 AND NOT EXISTS (
      SELECT 1 FROM sandbox_capacity_reservations r WHERE r.sandbox_id=s.id AND r.reason<>'legacy_inventory')`, [input.organizationId]);
    const state = foreign.length || classifications.some((item) => item.evidence === "duplicate_runtime_identity") ? "quarantined" : unresolved || invalid.rows.length || unchecked.rows.length ? "reconciling" : "enforced";
    await q("UPDATE organizations SET capacity_state=$2 WHERE id=$1", [input.organizationId, state]);
    await recordAuditEvent({ organizationId: input.organizationId, actorLabel: "capacity-inventory", action: "capacity.inventory.finished", targetType: "organization", targetId: input.organizationId, metadata: { state, unresolved, untrackedRuntimeIds: foreign.map((r) => r.providerSandboxId) } }, { query: q });
  });
  return { dryRun: !input.apply, capacity: await readOrganizationCapacity(input.organizationId, query), classifications, untrackedRuntimeIds: foreign.map((r) => r.providerSandboxId), unresolved };
};
