import type { FastifyReply, FastifyRequest } from "fastify";
import { apiErrorResponse } from "@harakiri/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config.js";
import { hashApiKey } from "./crypto.js";
import { query } from "./db.js";
import { acceptPendingOrganizationInvitations } from "./services/account.js";

export type AuthContext = {
  userId: string;
  organizationId: string;
  actorLabel: string;
  authType: "keycloak" | "api_key" | "dev";
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const workspaceBase = (email: string) => {
  const localPart = email.split("@")[0] || "workspace";
  const base = slugify(localPart) || "workspace";
  return `${base}-labs`;
};

const workspaceName = (email: string, name: string) => {
  const label = name.trim() || email.split("@")[0] || "Harakiri";
  const first = label.split(/\s+/)[0] || "Harakiri";
  return `${first} Labs`;
};

const ensureWorkspaceForUser = async (input: { userId: string; email: string; name: string }) => {
  const baseSlug = workspaceBase(input.email);
  const name = workspaceName(input.email, input.name);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const created = await query<{ id: string }>(
      `INSERT INTO organizations (name, slug, default_template_id, idle_ttl_seconds, max_concurrency)
       VALUES ($1, $2, 'python-3.12-data', 300, 200)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [name, slug]
    );
    const orgId = created.rows[0]?.id;
    if (!orgId) continue;
    await query(
      `INSERT INTO memberships (user_id, organization_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [input.userId, orgId]
    );
    return { userId: input.userId, organizationId: orgId };
  }
  throw new Error("unable_to_create_workspace");
};

const ensureDevIdentity = async () => {
  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, keycloak_subject)
     VALUES ('dev@harakiri.local', 'Development User', 'dev-local')
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name, keycloak_subject = EXCLUDED.keycloak_subject
     RETURNING id`
  );
  const org = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug, default_template_id, idle_ttl_seconds, max_concurrency)
     VALUES ('Development Labs', 'development-labs', 'python-3.12-data', 300, 200)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`
  );
  await query(
    `INSERT INTO memberships (user_id, organization_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (user_id, organization_id) DO NOTHING`,
    [user.rows[0].id, org.rows[0].id]
  );
  return { userId: user.rows[0].id, organizationId: org.rows[0].id };
};

const authFromApiKey = async (token: string): Promise<AuthContext | null> => {
  const hash = hashApiKey(token);
  const result = await query<{
    user_id: string | null;
    organization_id: string;
    name: string;
    id: string;
  }>(
    `SELECT ak.id, ak.organization_id, ak.name, m.user_id
     FROM api_keys ak
     LEFT JOIN memberships m ON m.organization_id = ak.organization_id
     WHERE ak.key_hash = $1 AND ak.revoked_at IS NULL
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [hash]
  );
  if (!result.rowCount) return null;
  await query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [result.rows[0].id]);
  return {
    userId: result.rows[0].user_id ?? "00000000-0000-0000-0000-000000000000",
    organizationId: result.rows[0].organization_id,
    actorLabel: `api-key:${result.rows[0].name}`,
    authType: "api_key"
  };
};

const authFromJwt = async (token: string): Promise<AuthContext | null> => {
  if (!config.keycloakJwksUrl || !config.keycloakIssuer) return null;
  jwks ??= createRemoteJWKSet(new URL(config.keycloakJwksUrl));
  const verified = await jwtVerify(token, jwks);
  if (config.keycloakIssuerAllowlist.length && !config.keycloakIssuerAllowlist.includes(String(verified.payload.iss))) {
    return null;
  }
  const email = String(verified.payload.email ?? "");
  const name = String(verified.payload.name ?? email);
  const subject = String(verified.payload.sub);
  if (!email || !subject) return null;

  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, keycloak_subject)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name, keycloak_subject = EXCLUDED.keycloak_subject
     RETURNING id`,
    [email, name, subject]
  );
  await acceptPendingOrganizationInvitations({ userId: user.rows[0].id, email, keycloakSubject: subject }, query);
  const org = await query<{ id: string }>("SELECT organization_id AS id FROM memberships WHERE user_id = $1 LIMIT 1", [user.rows[0].id]);
  if (org.rowCount) {
    return { userId: user.rows[0].id, organizationId: org.rows[0].id, actorLabel: email, authType: "keycloak" };
  }
  const workspace = await ensureWorkspaceForUser({ userId: user.rows[0].id, email, name });
  return { userId: user.rows[0].id, organizationId: workspace.organizationId, actorLabel: email, authType: "keycloak" };
};

export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKeyHeader = request.headers["x-api-key"] ?? request.headers.authorization;
  const headerValue = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
  if (headerValue) {
    const raw = headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;
    const context = raw.startsWith("hk_") ? await authFromApiKey(raw) : await authFromJwt(raw).catch(() => null);
    if (context) {
      request.auth = context;
      return;
    }
  }

  if (config.authDevAllow) {
    const dev = await ensureDevIdentity();
    request.auth = { ...dev, actorLabel: "dev@harakiri.local", authType: "dev" };
    return;
  }

  return reply.code(401).send(apiErrorResponse("unauthorized"));
};

// Recheck a stream without provisioning an account or changing its bound organization.
export const streamAuthValid = async (request: FastifyRequest) => {
  if (request.auth.authType === "dev") return config.authDevAllow;
  const value = request.headers["x-api-key"] ?? request.headers.authorization;
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return false;
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (request.auth.authType === "api_key") {
    const result = await query("SELECT id FROM api_keys WHERE organization_id = $1 AND key_hash = $2 AND revoked_at IS NULL", [request.auth.organizationId, hashApiKey(token)]);
    return Boolean(result.rowCount);
  }
  if (!config.keycloakJwksUrl || !config.keycloakIssuer) return false;
  try {
    jwks ??= createRemoteJWKSet(new URL(config.keycloakJwksUrl));
    const { payload } = await jwtVerify(token, jwks);
    if (!config.keycloakIssuerAllowlist.includes(String(payload.iss))) return false;
    const member = await query(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND m.user_id = $2 AND u.keycloak_subject = $3`, [request.auth.organizationId, request.auth.userId, payload.sub]);
    return Boolean(member.rowCount);
  } catch { return false; }
};
