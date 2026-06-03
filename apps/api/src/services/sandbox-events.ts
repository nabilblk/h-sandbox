import { query as defaultQuery } from "../db.js";
import { redactRecord, redactText } from "../redaction.js";
import type { Query } from "./query.js";

export type SandboxEventRecorder = (
  organizationId: string,
  sandboxId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export const recordSandboxEvent = (query: Query = defaultQuery): SandboxEventRecorder =>
  async (organizationId, sandboxId, type, message, metadata = {}) => {
    await query(
      `INSERT INTO sandbox_events (sandbox_id, organization_id, type, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [sandboxId, organizationId, type, redactText(message), redactRecord(metadata)]
    );
  };
