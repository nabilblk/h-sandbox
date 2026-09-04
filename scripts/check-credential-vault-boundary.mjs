import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const forbiddenResponseFields = new Set([
  "accessToken",
  "credentialValue",
  "privateKey",
  "privateKeyPem",
  "refreshToken",
  "secretCiphertext",
  "secretIv",
  "secretTag",
  "secretValue",
  "token",
  "value"
]);

const credentialResponsePaths = [
  "/v1/audit-events",
  "/v1/sandboxes",
  "/v1/sandboxes/{id}",
  "/v1/sandboxes/{id}/credentials",
  "/v1/sandboxes/{id}/credentials/rehydrate",
  "/v1/sandboxes/{id}/credentials/inspect",
  "/v1/sandboxes/{id}/credentials/{attachmentId}",
  "/v1/sandboxes/{id}/credentials/{attachmentId}/refresh",
  "/v1/sandboxes/{id}/credentials/{attachmentId}/test",
  "/v1/credential-presets",
  "/v1/credential-presets/{id}",
  "/v1/credential-secrets",
  "/v1/credential-secrets/{id}",
  "/v1/credential-secrets/{id}/rotate",
  "/v1/credential-secrets/{id}/disable",
  "/v1/credential-secrets/{id}/enable",
  "/v1/external-secret-references",
  "/v1/external-secret-references/{id}",
  "/v1/external-secret-references/{id}/validate",
  "/v1/dynamic-credential-issuers",
  "/v1/dynamic-credential-issuers/{id}",
  "/v1/dynamic-credential-issuers/{id}/validate",
  "/v1/dynamic-credential-issuers/{id}/disable",
  "/v1/dynamic-credential-issuers/{id}/enable"
];

const fail = (message) => {
  throw new Error(`Credential Vault boundary check failed: ${message}`);
};

const resolveSchema = (document, schema) => {
  if (!schema?.$ref) return schema;
  const parts = schema.$ref.replace(/^#\//, "").split("/");
  return parts.reduce((value, part) => value?.[part], document);
};

const assertSanitizedSchema = (document, schema, location, seen = new Set()) => {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return;
    seen.add(schema.$ref);
    assertSanitizedSchema(document, resolveSchema(document, schema), schema.$ref, seen);
    return;
  }
  for (const key of Object.keys(schema.properties ?? {})) {
    if (forbiddenResponseFields.has(key)) fail(`${location} exposes response field ${key}`);
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    assertSanitizedSchema(document, child, `${location}.${key}`, new Set(seen));
  }
  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    for (const child of schema[keyword] ?? []) {
      assertSanitizedSchema(document, child, `${location}.${keyword}`, new Set(seen));
    }
  }
  assertSanitizedSchema(document, schema.items, `${location}[]`, new Set(seen));
  if (typeof schema.additionalProperties === "object") {
    assertSanitizedSchema(document, schema.additionalProperties, `${location}{}`, new Set(seen));
  }
};

const checkOpenApiResponses = async () => {
  const document = JSON.parse(await read("docs/openapi.json"));
  for (const path of credentialResponsePaths) {
    const pathItem = document.paths[path];
    if (!pathItem) fail(`OpenAPI path ${path} is missing`);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation?.responses) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        const schema = response?.content?.["application/json"]?.schema;
        assertSanitizedSchema(document, schema, `${method.toUpperCase()} ${path} ${status}`);
      }
    }
  }
};

const tableBody = (sql, table) => {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\);`, "i"));
  if (!match) fail(`migration table ${table} is missing`);
  return match[1];
};

const checkMetadataOnlyTables = async () => {
  const tables = [
    ["db/migrations/025_credential_vault_foundation.sql", "sandbox_credential_attachments"],
    ["db/migrations/029_external_secret_references.sql", "external_secret_references"],
    ["db/migrations/030_dynamic_credential_issuers.sql", "dynamic_credential_issuers"]
  ];
  const forbiddenColumns = /\b(plaintext|raw_value|secret_value|access_token|refresh_token|private_key)\b/i;
  for (const [path, table] of tables) {
    const body = tableBody(await read(path), table);
    if (forbiddenColumns.test(body)) fail(`${table} contains a credential-value column`);
  }
};

const checkProviderBoundary = async () => {
  const files = [
    "apps/api/src/services/credential-vault.ts",
    "apps/api/src/services/credential-source-material.ts",
    "apps/api/src/providers/runtime/opensandbox-credential-vault.ts"
  ];
  const forbiddenRuntimeShortcuts = /\b(kubectl|child_process|execFile|spawnSync|spawn)\b|pods\/exec/i;
  for (const path of files) {
    if (forbiddenRuntimeShortcuts.test(await read(path))) {
      fail(`${path} bypasses the runtime provider boundary`);
    }
  }
};

const checkSnapshots = async () => {
  const source = await read("apps/api/src/services/sandbox-snapshots.ts");
  const credentialState = /sandbox_credential_attachments|workspace_credential_secrets|external_secret_references|dynamic_credential_issuers/i;
  if (credentialState.test(source)) fail("snapshot persistence references credential custody or attachment tables");
};

await checkOpenApiResponses();
await checkMetadataOnlyTables();
await checkProviderBoundary();
await checkSnapshots();
console.log("Credential Vault boundary check passed");
