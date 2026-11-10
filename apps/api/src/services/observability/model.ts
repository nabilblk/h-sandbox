import type { TelemetryWindow, TelemetrySpan, TelemetryLog, TelemetrySnapshot } from "@harakiri/shared";
export type { TelemetryWindow, TelemetrySpan, TelemetryLog, TelemetrySnapshot, TelemetryIssue, TelemetryContentState } from "@harakiri/shared";

/** Resolved by the control plane; never accept these fields from a query caller. */
export type TelemetryQueryScope = {
  tenantId: number;
  organizationId: string;
  runId: string;
  includeContent: boolean;
};

export type TelemetryQuery = TelemetryQueryScope & TelemetryWindow & {
  limit: number;
  traceId?: string;
  spanId?: string;
};

export interface TelemetryStore {
  spans(query: TelemetryQuery): Promise<TelemetrySnapshot<TelemetrySpan>>;
  logs(query: TelemetryQuery): Promise<TelemetrySnapshot<TelemetryLog>>;
}
