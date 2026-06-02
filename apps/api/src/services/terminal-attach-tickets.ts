import { config } from "../config.js";
import { hashApiKey, makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import type { AuthContext } from "../auth.js";
import type { Query } from "./query.js";

export const terminalAttachTicketQueryParam = "ticket";

export type CreateTerminalAttachTicketResult =
  | { kind: "ok"; ticket: string; expiresAt: string; attachUrl: string }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string };

export type ConsumeTerminalAttachTicketResult =
  | { kind: "ok"; auth: AuthContext }
  | { kind: "invalid" };

const terminalAttachTicketTtlMs = () => Math.max(5, config.terminalAttachTicketTtlSeconds) * 1000;

const terminalAttachUrl = (sandboxId: string, ticket: string) => {
  const url = new URL(`${config.publicApiUrl.replace(/\/+$/, "")}/v1/sandboxes/${encodeURIComponent(sandboxId)}/terminal/attach`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set(terminalAttachTicketQueryParam, ticket);
  return url.toString();
};

const normalizeAuthType = (value: string): AuthContext["authType"] =>
  value === "keycloak" || value === "api_key" || value === "dev" ? value : "dev";

export const createTerminalAttachTicket = async (
  input: {
    sandboxId: string;
    auth: AuthContext;
  },
  dependencies: { query?: Query; idFactory?: typeof makeId } = {}
): Promise<CreateTerminalAttachTicketResult> => {
  const query = dependencies.query ?? defaultQuery;
  const idFactory = dependencies.idFactory ?? makeId;
  const sandbox = await query<{ id: string; status: string }>(
    "SELECT id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.auth.organizationId]
  );
  const row = sandbox.rows[0];
  if (!row) return { kind: "not_found" };
  if (row.status !== "running" && row.status !== "idle") return { kind: "sandbox_not_running", status: row.status };

  const ticket = idFactory("hat", 40);
  const expiresAt = new Date(Date.now() + terminalAttachTicketTtlMs()).toISOString();
  await query(
    `INSERT INTO terminal_attach_tickets
       (token_hash, sandbox_id, organization_id, user_id, actor_label, auth_type, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      hashApiKey(ticket),
      input.sandboxId,
      input.auth.organizationId,
      input.auth.userId,
      input.auth.actorLabel,
      input.auth.authType,
      expiresAt
    ]
  );
  return { kind: "ok", ticket, expiresAt, attachUrl: terminalAttachUrl(input.sandboxId, ticket) };
};

export const consumeTerminalAttachTicket = async (
  input: { sandboxId: string; ticket?: string },
  dependencies: { query?: Query } = {}
): Promise<ConsumeTerminalAttachTicketResult> => {
  if (!input.ticket) return { kind: "invalid" };
  const query = dependencies.query ?? defaultQuery;
  const consumed = await query<{
    organizationId: string;
    userId: string;
    actorLabel: string;
    authType: string;
  }>(
    `UPDATE terminal_attach_tickets
       SET used_at = now()
     WHERE token_hash = $1
       AND sandbox_id = $2
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING organization_id::text AS "organizationId",
               user_id AS "userId",
               actor_label AS "actorLabel",
               auth_type AS "authType"`,
    [hashApiKey(input.ticket), input.sandboxId]
  );
  const row = consumed.rows[0];
  if (!row) return { kind: "invalid" };
  return {
    kind: "ok",
    auth: {
      organizationId: row.organizationId,
      userId: row.userId,
      actorLabel: row.actorLabel,
      authType: normalizeAuthType(row.authType)
    }
  };
};
