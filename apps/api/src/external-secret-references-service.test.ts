import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialProviderPresetCatalog,
  type ExternalSecretReferenceSummary
} from "@harakiri/shared";
import type { ExternalSecretResolverRegistry } from "./providers/secrets/provider.js";
import {
  createExternalSecretReference,
  listExternalSecretReferences,
  resolveExternalSecretReferenceMaterial,
  updateExternalSecretReference,
  validateExternalSecretReference
} from "./services/external-secret-references.js";

const now = new Date("2026-09-03T12:00:00.000Z");

type ReferenceRow = Omit<
  ExternalSecretReferenceSummary,
  "sourceType" | "status" | "usePolicy" | "validation" | "usage" | "capabilities" |
  "createdAt" | "updatedAt" | "disabledAt" | "deletedAt"
> & {
  resolverType: "kubernetes_secret";
  memberUseAllowed: boolean;
  validationState: ExternalSecretReferenceSummary["validation"]["state"];
  validationMessage: string | null;
  resolvedVersionRef: string | null;
  validatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  deletedAt: Date | null;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: Date | null;
};

const baseRow = (overrides: Partial<ReferenceRow> = {}): ReferenceRow => ({
  id: "xsr_openai",
  name: "OpenAI from cluster",
  providerPresetId: "openai",
  customProfile: null,
  resolverType: "kubernetes_secret",
  reference: { namespace: "harakiri", name: "agent-credentials", key: "OPENAI_API_KEY" },
  memberUseAllowed: true,
  version: 1,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: credentialProviderPresetCatalog.openai.binding,
  egressDomains: credentialProviderPresetCatalog.openai.egressDomains,
  metadata: {},
  validationState: "unvalidated",
  validationMessage: null,
  resolvedVersionRef: null,
  validatedAt: null,
  createdByUserId: "user_admin",
  createdByLabel: "admin@example.com",
  createdAt: now,
  updatedAt: now,
  disabledAt: null,
  deletedAt: null,
  activeSandboxCount: 0,
  attachmentCount: 0,
  lastAttachedAt: null,
  ...overrides
});

const createQuery = (input: { role?: "admin" | "member"; rows?: ReferenceRow[] } = {}) => {
  const rows = input.rows ?? [];
  const role = input.role ?? "admin";
  const query = async (text: string, params: unknown[] = []) => {
    if (text.includes("SELECT role FROM memberships")) return { rows: [{ role }], rowCount: 1 };
    if (text.includes("SELECT id FROM external_secret_references")) {
      const match = rows.find((row) => row.name.toLowerCase() === String(params[1]).toLowerCase() && !row.deletedAt && row.id !== params[2]);
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }
    if (text.includes("INSERT INTO external_secret_references")) {
      rows.push(baseRow({
        id: String(params[0]),
        name: String(params[2]),
        providerPresetId: params[3] as ReferenceRow["providerPresetId"],
        customProfile: JSON.parse(String(params[4])),
        resolverType: params[5] as "kubernetes_secret",
        reference: JSON.parse(String(params[6])),
        memberUseAllowed: Boolean(params[7]),
        fakeEnv: JSON.parse(String(params[8])),
        binding: JSON.parse(String(params[9])),
        egressDomains: JSON.parse(String(params[10])),
        metadata: JSON.parse(String(params[11])),
        createdByUserId: String(params[12]),
        createdByLabel: String(params[13])
      }));
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("SET validation_state")) {
      const row = rows.find((candidate) => candidate.id === params[1]);
      if (row) {
        row.validationState = params[2] as ReferenceRow["validationState"];
        row.validationMessage = params[3] as string | null;
        row.resolvedVersionRef = params[4] as string | null;
        row.validatedAt = now;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("SET name = $3")) {
      const row = rows.find((candidate) => candidate.id === params[1]);
      if (row) {
        row.name = String(params[2]);
        row.providerPresetId = params[3] as ReferenceRow["providerPresetId"];
        row.customProfile = JSON.parse(String(params[4]));
        row.reference = JSON.parse(String(params[5]));
        row.memberUseAllowed = Boolean(params[6]);
        row.fakeEnv = JSON.parse(String(params[7]));
        row.binding = JSON.parse(String(params[8]));
        row.egressDomains = JSON.parse(String(params[9]));
        row.metadata = JSON.parse(String(params[10]));
        row.version += 1;
        row.validationState = "unvalidated";
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("FROM external_secret_references external_reference")) {
      const visible = text.includes("member_use_allowed = true")
        ? rows.filter((row) => row.memberUseAllowed && !row.deletedAt)
        : rows;
      const selected = params[1] ? visible.filter((row) => row.id === params[1]) : visible;
      return { rows: selected, rowCount: selected.length };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { query: query as never, rows };
};

const successfulResolvers: ExternalSecretResolverRegistry = {
  kubernetes_secret: {
    type: "kubernetes_secret",
    resolve: async () => ({ kind: "ok", value: "real-secret", versionRef: "rv-42" })
  }
};

test("external reference creation stores locator metadata but no secret value", async () => {
  const database = createQuery();
  const result = await createExternalSecretReference({
    organizationId: "org_1",
    actorUserId: "user_admin",
    actorLabel: "admin@example.com",
    body: {
      name: "OpenAI from cluster",
      providerPresetId: "openai",
      resolverType: "kubernetes_secret",
      reference: { namespace: "harakiri", name: "agent-credentials", key: "OPENAI_API_KEY" },
      usePolicy: "organization_members"
    }
  }, { query: database.query, idFactory: () => "xsr_created" });

  assert.equal(result.kind, "ok");
  assert.equal(database.rows[0]?.id, "xsr_created");
  assert.equal(JSON.stringify(database.rows).includes("real-secret"), false);
  assert.equal(result.kind === "ok" && "value" in result.reference, false);
});

test("member discovery and resolution require explicit member-use policy", async () => {
  const shared = baseRow();
  const privateReference = baseRow({ id: "xsr_private", name: "Private", memberUseAllowed: false });
  const database = createQuery({ role: "member", rows: [shared, privateReference] });

  const listed = await listExternalSecretReferences({
    organizationId: "org_1",
    actorUserId: "user_member"
  }, database.query);
  assert.equal(listed.kind, "ok");
  if (listed.kind === "ok") {
    assert.deepEqual(listed.references.map((reference) => reference.id), ["xsr_openai"]);
  }

  const resolved = await resolveExternalSecretReferenceMaterial({
    organizationId: "org_1",
    actorUserId: "user_member",
    referenceId: shared.id
  }, { query: database.query, resolvers: successfulResolvers });
  assert.equal(resolved.kind, "ok");
  assert.equal(resolved.kind === "ok" ? resolved.secretValue : null, "real-secret");

  const denied = await resolveExternalSecretReferenceMaterial({
    organizationId: "org_1",
    actorUserId: "user_member",
    referenceId: privateReference.id
  }, { query: database.query, resolvers: successfulResolvers });
  assert.deepEqual(denied, { kind: "forbidden" });
});

test("validation persists sanitized resolver state and update resets it", async () => {
  const row = baseRow();
  const database = createQuery({ rows: [row] });
  const validated = await validateExternalSecretReference({
    organizationId: "org_1",
    actorUserId: "user_admin",
    referenceId: row.id
  }, { query: database.query, resolvers: successfulResolvers });
  assert.equal(validated.kind, "ok");
  assert.equal(validated.kind === "ok" ? validated.reference.validation.state : null, "valid");
  assert.equal(validated.kind === "ok" ? validated.reference.validation.versionRef : null, "rv-42");

  const updated = await updateExternalSecretReference({
    organizationId: "org_1",
    actorUserId: "user_admin",
    referenceId: row.id,
    body: { reference: { namespace: "harakiri", name: "rotated-credentials", key: "OPENAI_API_KEY" } }
  }, database.query);
  assert.equal(updated.kind, "ok");
  assert.equal(updated.kind === "ok" ? updated.reference.validation.state : null, "unvalidated");
  assert.equal(updated.kind === "ok" ? updated.reference.version : null, 2);
});

test("resolver failures never expose the external value", async () => {
  const row = baseRow();
  const database = createQuery({ rows: [row] });
  const resolvers: ExternalSecretResolverRegistry = {
    kubernetes_secret: {
      type: "kubernetes_secret",
      resolve: async () => ({ kind: "not_found", message: "Secret was not found" })
    }
  };
  const result = await resolveExternalSecretReferenceMaterial({
    organizationId: "org_1",
    actorUserId: "user_admin",
    referenceId: row.id
  }, { query: database.query, resolvers });
  assert.deepEqual(result, { kind: "resolver_not_found", message: "Secret was not found" });
  assert.equal(row.validationState, "not_found");
});
