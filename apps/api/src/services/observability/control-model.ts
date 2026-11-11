export type { AgentCapture, AgentOutcome, AgentRunRecord } from "@harakiri/shared";

export type ObservabilityLimits = {
  enabled: boolean;
  allowContent: boolean;
  retentionDays: number;
  requestsPerMinute: number;
  bytesPerMinute: number;
  activeRunsPerOrganization: number;
  grantsPerRun: number;
};

export class ObservabilityControlError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "ObservabilityControlError";
  }
}
