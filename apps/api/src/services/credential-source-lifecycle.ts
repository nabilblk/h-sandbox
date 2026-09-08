import type { SandboxCredentialAttachmentSummary } from "@harakiri/shared";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import { redactText } from "../redaction.js";
import {
  detachSandboxCredential,
  rehydrateSandboxCredentials
} from "./credential-vault.js";
import type { Query } from "./query.js";
import type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";

type ReusableCredentialSourceType = Exclude<
  SandboxCredentialAttachmentSummary["sourceType"],
  "inline_ephemeral"
>;

type SourceAttachment = {
  id: string;
  sandboxId: string;
  sandboxStatus: string;
};

type RevokeSourceAttachmentsInput = {
  organizationId: string;
  sourceType: ReusableCredentialSourceType;
  sourceRef: string;
  actorUserId: string | null; actorApiKeyId?: string;
  actorLabel: string;
  reason: "source_disabled" | "source_deleted";
};

type RevokeSourceAttachmentsDependencies = {
  query: Query;
  runtimeProvider: RuntimeProvider;
  recordEvent: SandboxEventRecorder;
  recordAudit: Audit;
  detach?: typeof detachSandboxCredential;
};

export type RevokeSourceAttachmentsResult =
  | { kind: "ok"; detached: number }
  | { kind: "incomplete"; detached: number; failedAttachmentIds: string[]; message: string };

type ReinjectSourceAttachmentsInput = Omit<
  RevokeSourceAttachmentsInput,
  "reason"
>;

type ReinjectSourceAttachmentsDependencies = Omit<
  RevokeSourceAttachmentsDependencies,
  "detach"
> & {
  rehydrate?: typeof rehydrateSandboxCredentials;
};

export type ReinjectSourceAttachmentsResult =
  | { kind: "ok"; marked: number; rehydrated: number; deferred: number }
  | {
    kind: "incomplete";
    marked: number;
    rehydrated: number;
    deferred: number;
    failedSandboxIds: string[];
    message: string;
  };

const runtimeGoneStates = new Set(["pending", "paused", "error", "terminated"]);

const listActiveSourceAttachments = async (
  input: RevokeSourceAttachmentsInput,
  query: Query
) => {
  const result = await query<SourceAttachment>(
    `SELECT attachment.id,
            attachment.sandbox_id AS "sandboxId",
            sandbox.status AS "sandboxStatus"
     FROM sandbox_credential_attachments attachment
     JOIN sandboxes sandbox
       ON sandbox.id = attachment.sandbox_id
      AND sandbox.organization_id = attachment.organization_id
     WHERE attachment.organization_id = $1
       AND attachment.source_type = $2
       AND attachment.source_ref = $3
       AND attachment.detached_at IS NULL
     ORDER BY attachment.created_at ASC`,
    [input.organizationId, input.sourceType, input.sourceRef]
  );
  return result.rows;
};

const recordDetachedAttachment = async (
  input: RevokeSourceAttachmentsInput,
  attachment: SourceAttachment,
  dependencies: Pick<RevokeSourceAttachmentsDependencies, "recordEvent" | "recordAudit">
) => {
  const metadata = {
    attachmentId: attachment.id,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    reason: input.reason
  };
  await dependencies.recordEvent(
    input.organizationId,
    attachment.sandboxId,
    "credential.detached",
    "credential detached because its source is unavailable",
    metadata
  );
  await dependencies.recordAudit(
    input.organizationId,
    input.actorUserId,
    input.actorLabel,
    "sandbox.credential.detached",
    "sandbox",
    attachment.sandboxId,
    metadata
  );
};

const finalizeAttachmentWithoutRuntime = async (
  input: RevokeSourceAttachmentsInput,
  attachment: SourceAttachment,
  dependencies: RevokeSourceAttachmentsDependencies
) => {
  const result = await dependencies.query(
    `UPDATE sandbox_credential_attachments
     SET status = 'detached',
         provider_state = 'missing',
         provider_checked_at = now(),
         detached_at = now(),
         last_error = NULL,
         updated_at = now()
     WHERE organization_id = $1 AND sandbox_id = $2 AND id = $3
       AND detached_at IS NULL`,
    [input.organizationId, attachment.sandboxId, attachment.id]
  );
  if (!result.rowCount) return 0;
  await recordDetachedAttachment(input, attachment, dependencies);
  return 1;
};

const detachLiveAttachment = async (
  input: RevokeSourceAttachmentsInput,
  attachment: SourceAttachment,
  dependencies: RevokeSourceAttachmentsDependencies
) => {
  const detach = dependencies.detach ?? detachSandboxCredential;
  const result = await detach(
    {
      organizationId: input.organizationId,
      sandboxId: attachment.sandboxId,
      attachmentId: attachment.id,
      actorUserId: input.actorUserId, actorApiKeyId: input.actorApiKeyId,
      actorLabel: input.actorLabel,
      reason: input.reason
    },
    dependencies
  );
  if (result.kind === "ok" || result.kind === "attachment_not_found") return { detached: 1 };
  if (result.kind === "sandbox_not_running" && runtimeGoneStates.has(result.status)) {
    return { detached: await finalizeAttachmentWithoutRuntime(input, attachment, dependencies) };
  }
  const detail = "message" in result ? result.message : `sandbox state is ${"status" in result ? result.status : result.kind}`;
  return { detached: 0, error: redactText(detail) };
};

const revokeAttachment = (
  input: RevokeSourceAttachmentsInput,
  attachment: SourceAttachment,
  dependencies: RevokeSourceAttachmentsDependencies
) => runtimeGoneStates.has(attachment.sandboxStatus)
  ? finalizeAttachmentWithoutRuntime(input, attachment, dependencies).then((detached) => ({ detached }))
  : detachLiveAttachment(input, attachment, dependencies);

export const revokeCredentialSourceAttachments = async (
  input: RevokeSourceAttachmentsInput,
  dependencies: RevokeSourceAttachmentsDependencies
): Promise<RevokeSourceAttachmentsResult> => {
  const attachments = await listActiveSourceAttachments(input, dependencies.query);
  let detached = 0;
  const failedAttachmentIds: string[] = [];
  for (const attachment of attachments) {
    const result = await revokeAttachment(input, attachment, dependencies);
    detached += result.detached;
    if ("error" in result) failedAttachmentIds.push(attachment.id);
  }
  if (!failedAttachmentIds.length) return { kind: "ok", detached };
  return {
    kind: "incomplete",
    detached,
    failedAttachmentIds,
    message: `${failedAttachmentIds.length} credential attachment(s) could not be revoked from the runtime`
  };
};

const markSourceAttachmentsForReinjection = async (
  input: ReinjectSourceAttachmentsInput,
  query: Query
) => {
  const result = await query<SourceAttachment>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'requires_reinjection',
           refresh_attempted_at = NULL,
           last_error = NULL,
           updated_at = now()
       WHERE organization_id = $1
         AND source_type = $2
         AND source_ref = $3
         AND detached_at IS NULL
       RETURNING id, sandbox_id
     )
     SELECT updated.id,
            updated.sandbox_id AS "sandboxId",
            sandbox.status AS "sandboxStatus"
     FROM updated
     JOIN sandboxes sandbox
       ON sandbox.id = updated.sandbox_id
      AND sandbox.organization_id = $1
     ORDER BY updated.id ASC`,
    [input.organizationId, input.sourceType, input.sourceRef]
  );
  return result.rows;
};

const activeRuntimeStates = new Set(["running", "idle"]);

export const reinjectCredentialSourceAttachments = async (
  input: ReinjectSourceAttachmentsInput,
  dependencies: ReinjectSourceAttachmentsDependencies
): Promise<ReinjectSourceAttachmentsResult> => {
  const attachments = await markSourceAttachmentsForReinjection(input, dependencies.query);
  const activeSandboxIds = [...new Set(
    attachments
      .filter((attachment) => activeRuntimeStates.has(attachment.sandboxStatus))
      .map((attachment) => attachment.sandboxId)
  )];
  const deferred = attachments.filter(
    (attachment) => !activeRuntimeStates.has(attachment.sandboxStatus)
  ).length;
  const rehydrate = dependencies.rehydrate ?? rehydrateSandboxCredentials;
  const failedSandboxIds: string[] = [];
  let rehydrated = 0;

  for (const sandboxId of activeSandboxIds) {
    const result = await rehydrate({
      organizationId: input.organizationId,
      sandboxId,
      actorUserId: input.actorUserId, actorApiKeyId: input.actorApiKeyId,
      actorLabel: input.actorLabel
    }, dependencies);
    if (result.kind !== "ok" || result.failed > 0) {
      failedSandboxIds.push(sandboxId);
      continue;
    }
    rehydrated += result.rehydrated;
  }

  if (!failedSandboxIds.length) {
    return { kind: "ok", marked: attachments.length, rehydrated, deferred };
  }
  return {
    kind: "incomplete",
    marked: attachments.length,
    rehydrated,
    deferred,
    failedSandboxIds,
    message: `${failedSandboxIds.length} sandbox credential runtime(s) could not be reinjected`
  };
};
