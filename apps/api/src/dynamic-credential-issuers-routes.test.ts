import assert from "node:assert/strict";
import test from "node:test";
import { credentialProviderPresetCatalog } from "@harakiri/shared";
import Fastify, { type FastifyRequest } from "fastify";
import type { DynamicCredentialIssuerRegistry } from "./providers/credentials/provider.js";
import { registerDynamicCredentialIssuerRoutes } from "./routes/dynamic-credential-issuers.js";
import type { Query } from "./services/query.js";

type RouteIssuerRow = {
  id: string;
  name: string;
  issuerType: "github_app_installation";
  scope: { installationId: string; repositories: string[]; permissions: Record<string, "read" | "write" | "admin"> };
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: typeof credentialProviderPresetCatalog.github.binding;
  egressDomains: string[];
  metadata: Record<string, unknown>;
  validationState: "unvalidated" | "valid";
  validationMessage: string | null;
  validatedAt: Date | null;
  lastIssuedAt: Date | null;
  createdByUserId: string;
  createdByLabel: string;
  disabledAt: null;
  deletedAt: null;
  createdAt: Date;
  updatedAt: Date;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: null;
};

const routeAuth = async (request: FastifyRequest) => {
  request.auth = {
    userId: "user_route",
    organizationId: "org_route",
    actorLabel: "route@test.local",
    authType: "dev"
  };
};

const rowFromInsert = (params: unknown[]): RouteIssuerRow => {
  const now = new Date("2026-09-03T00:00:00.000Z");
  return {
    id: String(params[0]),
    name: String(params[2]),
    issuerType: "github_app_installation",
    scope: JSON.parse(String(params[4])),
    memberUseAllowed: Boolean(params[5]),
    version: 1,
    fakeEnv: JSON.parse(String(params[6])),
    binding: JSON.parse(String(params[7])),
    egressDomains: JSON.parse(String(params[8])),
    metadata: JSON.parse(String(params[9])),
    validationState: "unvalidated",
    validationMessage: null,
    validatedAt: null,
    lastIssuedAt: null,
    createdByUserId: String(params[10]),
    createdByLabel: String(params[11]),
    disabledAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    activeSandboxCount: 0,
    attachmentCount: 0,
    lastAttachedAt: null
  };
};

const createIssuerQuery = (role: () => string) => {
  let row: RouteIssuerRow | null = null;
  const query: Query = async (text, params = []) => {
    if (text.includes("SELECT role FROM memberships")) {
      return { rowCount: 1, rows: [{ role: role() }] as never[] };
    }
    if (text.includes("SELECT id FROM dynamic_credential_issuers")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO dynamic_credential_issuers")) {
      row = rowFromInsert(params);
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("SET validation_state")) {
      if (!row) throw new Error("issuer must exist before validation");
      row.validationState = params[2] as "valid";
      row.validationMessage = params[3] as string | null;
      row.validatedAt = new Date("2026-09-03T00:01:00.000Z");
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("FROM dynamic_credential_issuers dynamic_issuer")) {
      const hidden = text.includes("member_use_allowed = true") && !row?.memberUseAllowed;
      const wrongId = params[1] && row?.id !== params[1];
      const rows = row && !hidden && !wrongId ? [row] : [];
      return { rowCount: rows.length, rows: rows as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return query;
};

test("dynamic issuer routes enforce admin custody and never expose an issued token", async () => {
  const app = Fastify();
  let role = "member";
  const audits: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const issuers: DynamicCredentialIssuerRegistry = {
    github_app_installation: {
      type: "github_app_installation",
      validate: async () => ({ kind: "ok" }),
      issue: async () => ({
        kind: "ok",
        value: "ghs_route_secret",
        expiresAt: "2026-09-03T13:00:00.000Z",
        metadata: {}
      })
    }
  };
  app.addHook("preHandler", routeAuth);
  await registerDynamicCredentialIssuerRoutes(app, {
    query: createIssuerQuery(() => role),
    issuers,
    recordAudit: async (_org, _user, _label, action, _type, _id, metadata = {}) => {
      audits.push({ action, metadata });
    }
  });

  try {
    const payload = {
      name: "Agent repositories",
      issuerType: "github_app_installation",
      scope: {
        installationId: "321",
        repositories: ["agent-runtime"],
        permissions: { contents: "write", metadata: "read" }
      },
      usePolicy: "organization_members"
    };
    const forbidden = await app.inject({ method: "POST", url: "/v1/dynamic-credential-issuers", payload });
    assert.equal(forbidden.statusCode, 403);

    role = "admin";
    const created = await app.inject({ method: "POST", url: "/v1/dynamic-credential-issuers", payload });
    assert.equal(created.statusCode, 201);
    const issuerId = JSON.parse(created.body).issuer.id as string;

    const validated = await app.inject({
      method: "POST",
      url: `/v1/dynamic-credential-issuers/${issuerId}/validate`
    });
    assert.equal(validated.statusCode, 200);
    assert.equal(JSON.parse(validated.body).issuer.validation.state, "valid");

    role = "member";
    const listed = await app.inject({ method: "GET", url: "/v1/dynamic-credential-issuers" });
    assert.equal(listed.statusCode, 200);
    assert.equal(JSON.parse(listed.body).issuers[0].id, issuerId);
    assert.equal(`${created.body}${validated.body}${listed.body}${JSON.stringify(audits)}`.includes("ghs_route_secret"), false);
  } finally {
    await app.close();
  }
});
