import { useCallback, useEffect, useRef, useState } from "react";
import type { OrganizationCapacity, OrganizationSettings, UpdateOrganizationSettingsBody } from "@harakiri/shared";
import { api } from "./api";
import { ApiResponseError } from "./api-client/request";
import { Icon } from "./components/icon";

export const useOrganizationCapacity = () => {
  const [capacity, setCapacity] = useState<OrganizationCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true);
    try {
      const result = await api.capacity();
      if (revision.current === request) { setCapacity(result.capacity); setError(""); }
    } catch (cause) {
      if (revision.current === request) setError(cause instanceof ApiResponseError && cause.status === 404 ? "Capacity reporting is unavailable on this server." : "Capacity could not be refreshed.");
    } finally { if (revision.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(visibleRefresh, 15_000);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("harakiri:capacity-changed", visibleRefresh);
    return () => {
      revision.current++;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibleRefresh);
      window.removeEventListener("harakiri:capacity-changed", visibleRefresh);
    };
  }, [refresh]);
  const acceptError = (cause: unknown) => {
    if (cause instanceof ApiResponseError && cause.details?.capacity) {
      revision.current++;
      setCapacity(cause.details.capacity); setError(""); setLoading(false);
    } else void refresh();
  };
  return { capacity, loading, error, refresh, acceptError, blocked: Boolean(!error && capacity && (capacity.state !== "enforced" || capacity.available === 0)) };
};

type CapacityView = Pick<ReturnType<typeof useOrganizationCapacity>, "capacity" | "loading" | "error" | "refresh">;
export const CapacitySummary = ({ state, canManage = false }: { state: CapacityView; canManage?: boolean }) => {
  const { capacity, loading, error, refresh } = state;
  const unavailable = !capacity || capacity.state !== "enforced";
  const full = capacity?.available === 0;
  return <section className={`capacity-summary ${full || unavailable ? "capacity-attention" : ""}`} aria-label="Execution capacity" aria-busy={loading}>
    <div className="capacity-line">
      <span className="capacity-label"><Icon name="box" /> Execution slots</span>
      <strong className="num">{capacity?.inUse !== null && capacity?.inUse !== undefined ? `${capacity.inUse} / ${capacity.limit}` : loading && !capacity ? "Checking..." : "Unknown"}</strong>
      <span className="capacity-state">{error ? "Last observation" : capacity?.state === "enforced" ? `${capacity.available} available` : capacity?.state === "quarantined" ? "Needs operator review" : capacity ? "Verifying inventory" : "Unavailable"}</span>
      <button type="button" className="btn btn-ghost btn-sm capacity-refresh" aria-label="Refresh capacity" title="Refresh capacity" disabled={loading} onClick={() => void refresh()}><Icon name="refresh" /></button>
    </div>
    {error ? <p role="status">{error}{capacity ? ` Last checked ${new Date(capacity.observedAt).toLocaleTimeString()}.` : ""}</p> : null}
    {!error && capacity?.state !== "enforced" && capacity ? <p>New execution is paused until an operator verifies the inventory.</p> : null}
    {!error && full ? <p>{capacity?.overLimit ? `${capacity.overLimit} above the current limit. Existing work continues. ` : ""}Stop a sandbox and wait for cleanup{canManage ? <> or <a href="#dashboard/settings">adjust the limit</a></> : ", or ask an administrator to raise the limit"}.</p> : null}
    {capacity?.breakdown && (capacity.breakdown.reserved + capacity.breakdown.releasing + capacity.breakdown.uncertain > 0) ? <div className="capacity-breakdown">
      <span>{capacity.breakdown.active} active</span><span>{capacity.breakdown.reserved} starting</span><span>{capacity.breakdown.releasing} stopping</span><span>{capacity.breakdown.uncertain} uncertain</span>
    </div> : null}
  </section>;
};

export const createIntentKeys = () => {
  let previous = "";
  let key = "";
  return {
    forIntent(value: unknown) {
      const serialized = JSON.stringify(value);
      if (!key || serialized !== previous) { key = crypto.randomUUID(); previous = serialized; }
      return key;
    },
    clear() { previous = ""; key = ""; }
  };
};

export const useIntentKeys = () => {
  const keys = useRef<ReturnType<typeof createIntentKeys> | null>(null);
  if (!keys.current) keys.current = createIntentKeys();
  return keys.current;
};

export const changedSettings = (current: OrganizationSettings, previous: OrganizationSettings): UpdateOrganizationSettingsBody => {
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "slug", "idleTtlSeconds", "maxConcurrency", "defaultTemplateId", "defaultEgressPolicy", "egressAllowedPresets", "egressCustomDomainsEnabled", "egressMaxRules", "egressRedactDomains"] as const) {
    if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) patch[key] = current[key];
  }
  if ("maxConcurrency" in patch) patch.expectedCapacityRevision = previous.capacityRevision;
  return patch as UpdateOrganizationSettingsBody;
};
