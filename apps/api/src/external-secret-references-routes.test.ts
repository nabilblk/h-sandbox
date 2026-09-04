import assert from "node:assert/strict";
import test from "node:test";
import { credentialProviderPresetCatalog } from "@harakiri/shared";
import Fastify, { type FastifyRequest } from "fastify";
import type { ExternalSecretResolverRegistry } from "./providers/secrets/provider.js";
import { registerExternalSecretReferenceRoutes } from "./routes/external-secret-references.js";
import type { Query } from "./services/query.js";

type RouteReferenceRow = {
  id: string;
  name: string;
  providerPresetId: "openai";
  customProfile: null;
  resolverType: "kubernetes_secret";
  reference: Record<string, string>;
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: typeof credentialProviderPresetCatalog.openai.binding;
  egressDomains: string[];
  metadata: Record<string, unknown>;
  validationState: "unvalidated" | "valid";
  validationMessage: string | null;
  resolvedVersionRef: string | null;
  validatedAt: Date | null;
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

const rowFromInsert = (params: unknown[]): RouteReferenceRow => {
  const now = new Date("2026-09-03T00:00:00.000Z");
  return {
    id: String(params[0]),
    name: String(params[2]),
    providerPresetId: params[3] as "openai",
    customProfile: null,
    resolverType: "kubernetes_secret",
    reference: JSON.parse(String(params[6])),
    memberUseAllowed: Boolean(params[7]),
    version: 1,
    fakeEnv: JSON.parse(String(params[8])),
    binding: JSON.parse(String(params[9])),
    egressDomains: JSON.parse(String(params[10])),
    metadata: JSON.parse(String(params[11])),
    validationState: "unvalidated",
    validationMessage: null,
    resolvedVersionRef: null,
    validatedAt: null,
    createdByUserId: String(params[12]),
    createdByLabel: String(params[13]),
    disabledAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    activeSandboxCount: 0,
    attachmentCount: 0,
    lastAttachedAt: null
  };
};

const createReferenceQuery = (role: () => string) => {
  let row: RouteReferenceRow | null = null;
  const query: Query = async (text, params = []) => {
    if (text.includes("SELECT role FROM memberships")) {
      return { rowCount: 1, rows: [{ role: role() }] as never[] };
    }
    if (text.includes("SELECT id FROM external_secret_references")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO external_secret_references")) {
      row = rowFromInsert(params);
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("SET validation_state")) {
      if (!row) throw new Error("reference must exist before validation");
      row.validationState = params[2] as "valid";
      row.validationMessage = params[3] as string | null;
      row.resolvedVersionRef = params[4] as string | null;
      row.validatedAt = new Date("2026-09-03T00:01:00.000Z");
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("FROM external_secret_references external_reference")) {
      const hidden = text.includes("member_use_allowed = true") && !row?.memberUseAllowed;
      const wrongId = params[1] && row?.id !== params[1];
      const rows = row && !hidden && !wrongId ? [row] : [];
      return { rowCount: rows.length, rows: rows as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return query;
};

test("external reference routes enforce admin custody and never return resolved values", async () => {
  const app = Fastify();
  let role = "member";
  const audits: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const resolvers: ExternalSecretResolverRegistry = {
    kubernetes_secret: {
      type: "kubernetes_secret",
      resolve: async () => ({ kind: "ok", value: "resolved-real-secret", versionRef: "resource-42" })
    }
  };
  app.addHook("preHandler", routeAuth);
  await registerExternalSecretReferenceRoutes(app, {
    query: createReferenceQuery(() => role),
    resolvers,
    reinjectSourceAttachments: async () => ({
      kind: "ok",
      marked: 0,
      rehydrated: 0,
      deferred: 0
    }),
    recordAudit: async (_org, _user, _label, action, _type, _id, metadata = {}) => {
      audits.push({ action, metadata });
    }
  });

  try {
    const payload = {
      name: "OpenAI from cluster",
      providerPresetId: "openai",
      resolverType: "kubernetes_secret",
      reference: { namespace: "harakiri", name: "harakiri-vault-agents", key: "OPENAI_API_KEY" },
      usePolicy: "organization_members"
    };
    const forbidden = await app.inject({ method: "POST", url: "/v1/external-secret-references", payload });
    assert.equal(forbidden.statusCode, 403);

    role = "admin";
    const created = await app.inject({ method: "POST", url: "/v1/external-secret-references", payload });
    assert.equal(created.statusCode, 201);
    const referenceId = JSON.parse(created.body).reference.id as string;

    const validated = await app.inject({
      method: "POST",
      url: `/v1/external-secret-references/${referenceId}/validate`
    });
    assert.equal(validated.statusCode, 200);
    assert.equal(JSON.parse(validated.body).reference.validation.state, "valid");
    assert.equal(validated.body.includes("resolved-real-secret"), false);

    role = "member";
    const listed = await app.inject({ method: "GET", url: "/v1/external-secret-references" });
    assert.equal(listed.statusCode, 200);
    assert.equal(JSON.parse(listed.body).references[0].id, referenceId);
    assert.equal(JSON.stringify(audits).includes("resolved-real-secret"), false);
  } finally {
    await app.close();
  }
});
