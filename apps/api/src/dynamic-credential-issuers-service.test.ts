import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialProviderPresetCatalog,
  type DynamicCredentialIssuerSummary
} from "@harakiri/shared";
import type { DynamicCredentialIssuerRegistry } from "./providers/credentials/provider.js";
import {
  createDynamicCredentialIssuer,
  issueDynamicCredential,
  listDynamicCredentialIssuers,
  updateDynamicCredentialIssuer,
  validateDynamicCredentialIssuer
} from "./services/dynamic-credential-issuers.js";

const now = new Date("2026-09-03T12:00:00.000Z");

type IssuerRow = Omit<
  DynamicCredentialIssuerSummary,
  "sourceType" | "providerPresetId" | "status" | "usePolicy" | "validation" | "usage" |
  "capabilities" | "createdAt" | "updatedAt" | "disabledAt" | "deletedAt" | "lastIssuedAt"
> & {
  issuerType: "github_app_installation";
  memberUseAllowed: boolean;
  validationState: DynamicCredentialIssuerSummary["validation"]["state"];
  validationMessage: string | null;
  validatedAt: Date | null;
  lastIssuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  deletedAt: Date | null;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: Date | null;
};

const baseRow = (overrides: Partial<IssuerRow> = {}): IssuerRow => ({
  id: "dci_github",
  name: "Agent repositories",
  issuerType: "github_app_installation",
  scope: {
    installationId: "321",
    repositories: ["agent-runtime"],
    permissions: { contents: "write", metadata: "read" }
  },
  memberUseAllowed: true,
  version: 1,
  fakeEnv: credentialProviderPresetCatalog.github.fakeEnv,
  binding: credentialProviderPresetCatalog.github.binding,
  egressDomains: credentialProviderPresetCatalog.github.egressDomains,
  metadata: {},
  validationState: "unvalidated",
  validationMessage: null,
  validatedAt: null,
  lastIssuedAt: null,
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

const createQuery = (input: { role?: "admin" | "member"; rows?: IssuerRow[] } = {}) => {
  const rows = input.rows ?? [];
  const role = input.role ?? "admin";
  const parameters: unknown[][] = [];
  const query = async (text: string, params: unknown[] = []) => {
    parameters.push(params);
    if (text.includes("SELECT role FROM memberships")) return { rows: [{ role }], rowCount: 1 };
    if (text.includes("SELECT id FROM dynamic_credential_issuers")) {
      const match = rows.find((row) => row.name.toLowerCase() === String(params[1]).toLowerCase() && !row.deletedAt && row.id !== params[2]);
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }
    if (text.includes("INSERT INTO dynamic_credential_issuers")) {
      rows.push(baseRow({
        id: String(params[0]),
        name: String(params[2]),
        issuerType: params[3] as "github_app_installation",
        scope: JSON.parse(String(params[4])),
        memberUseAllowed: Boolean(params[5]),
        fakeEnv: JSON.parse(String(params[6])),
        binding: JSON.parse(String(params[7])),
        egressDomains: JSON.parse(String(params[8])),
        metadata: JSON.parse(String(params[9])),
        createdByUserId: String(params[10]),
        createdByLabel: String(params[11])
      }));
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("SET validation_state")) {
      const row = rows.find((candidate) => candidate.id === params[1]);
      if (row) {
        row.validationState = params[2] as IssuerRow["validationState"];
        row.validationMessage = params[3] as string | null;
        row.validatedAt = now;
        if (params[4]) row.lastIssuedAt = now;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("SET name = $3")) {
      const row = rows.find((candidate) => candidate.id === params[1]);
      if (row) {
        row.name = String(params[2]);
        row.scope = JSON.parse(String(params[3]));
        row.memberUseAllowed = Boolean(params[4]);
        row.fakeEnv = JSON.parse(String(params[5]));
        row.binding = JSON.parse(String(params[6]));
        row.egressDomains = JSON.parse(String(params[7]));
        row.metadata = JSON.parse(String(params[8]));
        row.version += 1;
        row.validationState = "unvalidated";
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("FROM dynamic_credential_issuers dynamic_issuer")) {
      const visible = text.includes("member_use_allowed = true")
        ? rows.filter((row) => row.memberUseAllowed && !row.deletedAt)
        : rows;
      const selected = params[1] ? visible.filter((row) => row.id === params[1]) : visible;
      return { rows: selected, rowCount: selected.length };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { query: query as never, rows, parameters };
};

const successfulIssuers: DynamicCredentialIssuerRegistry = {
  github_app_installation: {
    type: "github_app_installation",
    validate: async () => ({ kind: "ok" }),
    issue: async () => ({
      kind: "ok",
      value: "ghs_transient_token",
      expiresAt: "2026-09-03T13:00:00.000Z",
      metadata: { installationId: "321", repositories: ["agent-runtime"] }
    })
  }
};

test("dynamic issuer creation persists only sanitized issuer configuration", async () => {
  const database = createQuery();
  const result = await createDynamicCredentialIssuer({
    organizationId: "org_1",
    actorUserId: "user_admin",
    actorLabel: "admin@example.com",
    body: {
      name: "Agent repositories",
      issuerType: "github_app_installation",
      scope: {
        installationId: "321",
        repositories: ["agent-runtime"],
        permissions: { contents: "write", metadata: "read" }
      },
      usePolicy: "organization_members"
    }
  }, { query: database.query, idFactory: () => "dci_created" });

  assert.equal(result.kind, "ok");
  assert.equal(database.rows[0]?.id, "dci_created");
  assert.equal(JSON.stringify(database.parameters).includes("ghs_"), false);
  assert.equal(result.kind === "ok" && "value" in result.issuer, false);
});

test("dynamic issuer rejects an invalid or unbounded installation scope", async () => {
  const database = createQuery();
  const result = await createDynamicCredentialIssuer({
    organizationId: "org_1",
    actorUserId: "user_admin",
    actorLabel: "admin@example.com",
    body: {
      name: "Invalid",
      issuerType: "github_app_installation",
      scope: { installationId: "0", repositories: ["owner/repository"], permissions: {} }
    }
  }, { query: database.query });

  assert.equal(result.kind, "invalid");
  assert.equal(database.rows.length, 0);
});

test("members discover and issue only explicitly shared dynamic credentials", async () => {
  const shared = baseRow();
  const privateIssuer = baseRow({ id: "dci_private", name: "Private", memberUseAllowed: false });
  const database = createQuery({ role: "member", rows: [shared, privateIssuer] });

  const listed = await listDynamicCredentialIssuers({
    organizationId: "org_1",
    actorUserId: "user_member"
  }, database.query);
  assert.equal(listed.kind, "ok");
  if (listed.kind === "ok") assert.deepEqual(listed.issuers.map((issuer) => issuer.id), [shared.id]);

  const issued = await issueDynamicCredential({
    organizationId: "org_1",
    actorUserId: "user_member",
    issuerId: shared.id
  }, { query: database.query, issuers: successfulIssuers });
  assert.equal(issued.kind, "ok");
  assert.equal(issued.kind === "ok" ? issued.value : null, "ghs_transient_token");
  assert.equal(JSON.stringify(database.parameters).includes("ghs_transient_token"), false);

  const denied = await issueDynamicCredential({
    organizationId: "org_1",
    actorUserId: "user_member",
    issuerId: privateIssuer.id
  }, { query: database.query, issuers: successfulIssuers });
  assert.deepEqual(denied, { kind: "forbidden" });
});

test("validation persists sanitized state and update invalidates it", async () => {
  const row = baseRow();
  const database = createQuery({ rows: [row] });
  const validated = await validateDynamicCredentialIssuer({
    organizationId: "org_1",
    actorUserId: "user_admin",
    issuerId: row.id
  }, { query: database.query, issuers: successfulIssuers });
  assert.equal(validated.kind, "ok");
  assert.equal(validated.kind === "ok" ? validated.issuer.validation.state : null, "valid");

  const updated = await updateDynamicCredentialIssuer({
    organizationId: "org_1",
    actorUserId: "user_admin",
    issuerId: row.id,
    body: { scope: { ...row.scope, repositories: ["agent-runtime", "agent-ui"] } }
  }, database.query);
  assert.equal(updated.kind, "ok");
  assert.equal(updated.kind === "ok" ? updated.issuer.validation.state : null, "unvalidated");
  assert.equal(updated.kind === "ok" ? updated.issuer.version : null, 2);
});

test("provider failures are persisted and returned without sensitive upstream detail", async () => {
  const row = baseRow();
  const database = createQuery({ rows: [row] });
  const issuers: DynamicCredentialIssuerRegistry = {
    github_app_installation: {
      type: "github_app_installation",
      validate: async () => ({ kind: "forbidden", message: "GitHub denied App access" }),
      issue: async () => ({ kind: "forbidden", message: "GitHub denied App access" })
    }
  };
  const result = await issueDynamicCredential({
    organizationId: "org_1",
    actorUserId: "user_admin",
    issuerId: row.id
  }, { query: database.query, issuers });

  assert.deepEqual(result, { kind: "issuer_forbidden", message: "GitHub denied App access" });
  assert.equal(row.validationState, "forbidden");
});
