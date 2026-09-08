import type { FastifyReply, FastifyRequest } from "fastify";
import { apiErrorResponse } from "@harakiri/shared";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { config } from "./config.js";
import { hashApiKey } from "./crypto.js";
import { query as defaultQuery } from "./db.js";
import { acceptPendingOrganizationInvitations } from "./services/account.js";
import { readApiKeyPrincipal } from "./services/api-key-principals.js";
import type { Query } from "./services/query.js";
import type { AuthContext } from "./auth-context.js";

export type { AuthContext } from "./auth-context.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type JwtSettings = Pick<typeof config, "keycloakIssuerAllowlist" | "keycloakAudience" | "keycloakJwksUrl" | "keycloakSigningAlgorithms">;

export const verifyAccessToken = async (token: string, settings: JwtSettings = config, keyResolver?: JWTVerifyGetKey) => {
  if (!settings.keycloakAudience || !settings.keycloakIssuerAllowlist.length || !settings.keycloakSigningAlgorithms.length) {
    throw new Error("JWT issuer, audience and signing algorithms must be configured");
  }
  if (!keyResolver) {
    if (!settings.keycloakJwksUrl) throw new Error("JWT keys are not configured");
    if (!keySets.has(settings.keycloakJwksUrl)) keySets.set(settings.keycloakJwksUrl, createRemoteJWKSet(new URL(settings.keycloakJwksUrl)));
    keyResolver = keySets.get(settings.keycloakJwksUrl)!;
  }
  const { payload } = await jwtVerify(token, keyResolver, {
    issuer: settings.keycloakIssuerAllowlist,
    audience: settings.keycloakAudience,
    algorithms: settings.keycloakSigningAlgorithms,
    requiredClaims: ["iss", "sub", "aud", "exp"]
  });
  if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("JWT subject is missing");
  return payload;
};

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

const ensureWorkspaceForUser = async (input: { userId: string; email: string; name: string }, query: Query) => {
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

const ensureDevIdentity = async (query: Query) => {
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

const authFromJwt = async (token: string, query: Query, verify: typeof verifyAccessToken): Promise<AuthContext | null> => {
  const payload = await verify(token);
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name : email;
  const subject = payload.sub!;
  if (!email) return null;

  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, keycloak_subject)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name, keycloak_subject = EXCLUDED.keycloak_subject
       WHERE users.keycloak_subject = EXCLUDED.keycloak_subject
          OR (users.keycloak_subject IS NULL AND $4::boolean)
     RETURNING id`,
    [email, name, subject, payload.email_verified === true]
  );
  if (!user.rows[0]) return null;
  if (payload.email_verified === true) await acceptPendingOrganizationInvitations({ userId: user.rows[0].id, email, keycloakSubject: subject }, query);
  const org = await query<{ id: string; role: "admin" | "member" }>(
    "SELECT organization_id AS id, role FROM memberships WHERE user_id = $1 AND role IN ('admin', 'member') ORDER BY created_at, id LIMIT 1", [user.rows[0].id]);
  const identity = { authType: "keycloak" as const, actorLabel: email, subject, expiresAt: new Date(payload.exp! * 1000).toISOString() };
  if (org.rowCount) {
    return { ...identity, userId: user.rows[0].id, organizationId: org.rows[0].id, role: org.rows[0].role };
  }
  const workspace = await ensureWorkspaceForUser({ userId: user.rows[0].id, email, name }, query);
  return { ...identity, userId: user.rows[0].id, organizationId: workspace.organizationId, role: "admin" };
};

export const createAuthHandler = (dependencies: { query?: Query; verify?: typeof verifyAccessToken; devAllowed?: () => boolean } = {}) => async (request: FastifyRequest, reply: FastifyReply) => {
  const query = dependencies.query ?? defaultQuery;
  const apiKeyHeader = request.headers["x-api-key"] ?? request.headers.authorization;
  if (apiKeyHeader !== undefined) {
    if (typeof apiKeyHeader !== "string" || !apiKeyHeader.trim()) return reply.code(401).send(apiErrorResponse("unauthorized"));
    const raw = apiKeyHeader.startsWith("Bearer ") ? apiKeyHeader.slice(7) : apiKeyHeader;
    const context = raw.startsWith("hk_")
      ? await readApiKeyPrincipal({ hash: hashApiKey(raw) }, query)
      : await authFromJwt(raw, query, dependencies.verify ?? verifyAccessToken).catch(() => null);
    if (context) {
      if (context.authType === "api_key") await query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [context.apiKeyId]);
      request.auth = context;
      return;
    }
    return reply.code(401).send(apiErrorResponse("unauthorized"));
  }

  if ((dependencies.devAllowed ?? (() => config.authDevAllow))()) {
    const dev = await ensureDevIdentity(query);
    request.auth = { ...dev, actorLabel: "dev@harakiri.local", authType: "dev", role: "admin" };
    return;
  }

  return reply.code(401).send(apiErrorResponse("unauthorized"));
};

export const requireAuth = createAuthHandler();

// Revalidation never provisions users or switches the connection's organization.
export const revalidatePrincipal = async (auth: AuthContext, query: Query = defaultQuery): Promise<AuthContext | null> => {
  if (auth.authType === "api_key") return readApiKeyPrincipal({ id: auth.apiKeyId, organizationId: auth.organizationId }, query);
  if (auth.authType === "dev" && !config.authDevAllow) return null;
  if (auth.authType === "keycloak" && (!auth.subject || !auth.expiresAt || !(Date.parse(auth.expiresAt) > Date.now()))) return null;
  const member = await query<{ role: "admin" | "member" }>(
    `SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.user_id = $2 AND m.role IN ('admin', 'member')
       AND ($3::text IS NULL OR u.keycloak_subject = $3)`,
    [auth.organizationId, auth.userId, auth.authType === "keycloak" ? auth.subject : null]
  );
  return member.rows[0] ? { ...auth, role: member.rows[0].role } : null;
};

export const streamAuthValid = async (request: Pick<FastifyRequest, "auth" | "headers">, query: Query = defaultQuery) => {
  const value = request.headers["x-api-key"] ?? request.headers.authorization;
  const header = Array.isArray(value) ? value[0] : value;
  try {
    if (request.auth.authType === "keycloak") {
      if (!header) return false;
      const payload = await verifyAccessToken(header.startsWith("Bearer ") ? header.slice(7) : header);
      if (payload.sub !== request.auth.subject) return false;
    }
    const current = await revalidatePrincipal(request.auth, query);
    if (!current) return false;
    request.auth = current;
    return true;
  } catch { return false; }
};
