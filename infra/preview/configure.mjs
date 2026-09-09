import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function createConfiguration({ webOrigin, apiOrigin, authOrigin, email }) {
  for (const value of [webOrigin, apiOrigin, authOrigin]) {
    const url = new URL(value);
    assert.equal(url.origin, value, "Supply an origin without a path or trailing slash");
    assert.ok(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)), "HTTP is permitted only for local port forwards");
  }
  assert.match(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const secret = () => randomBytes(32).toString("hex");
  const passwords = { postgres: secret(), appDatabase: secret(), keycloakDatabase: secret(), recovery: secret(), operator: secret(), realmClient: secret(), runtime: secret(), vault: randomBytes(32).toString("base64"), registry: secret() };
  const namespace = "harakiri-preview";
  const runtimeNamespace = "harakiri-preview-runtime";
  const issuer = `${authOrigin}/realms/harakiri`;
  const internalAuth = `http://preview-keycloak.${namespace}.svc.cluster.local:8080`;
  const realm = { realm: "harakiri", enabled: true, displayName: "Harakiri Preview", registrationAllowed: false, resetPasswordAllowed: false,
    clients: [
      { clientId: "harakiri-web", enabled: true, publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
        redirectUris: [`${webOrigin}/*`], webOrigins: [webOrigin], attributes: { "pkce.code.challenge.method": "S256", "post.logout.redirect.uris": `${webOrigin}/*` },
        protocolMappers: [{ name: "harakiri-api-audience", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", config: { "included.custom.audience": "harakiri-api", "access.token.claim": "true", "id.token.claim": "false" } }] },
      { clientId: "harakiri-admin", enabled: true, publicClient: false, secret: passwords.realmClient, serviceAccountsEnabled: true, standardFlowEnabled: false, directAccessGrantsEnabled: false }
    ],
    users: [
      { username: email, email, enabled: true, emailVerified: true, firstName: "Preview", lastName: "Operator", credentials: [{ type: "password", value: passwords.operator, temporary: false }] },
      { username: "service-account-harakiri-admin", enabled: true, serviceAccountClientId: "harakiri-admin", clientRoles: { "realm-management": ["manage-users", "view-users", "query-users", "view-realm"] } }
    ] };
  const k8sSecret = (name, stringData) => ({ apiVersion: "v1", kind: "Secret", metadata: { name, namespace }, type: "Opaque", stringData });
  const secrets = { apiVersion: "v1", kind: "List", items: [
    k8sSecret("preview-postgres", { POSTGRES_USER: "postgres", POSTGRES_DB: "postgres", POSTGRES_PASSWORD: passwords.postgres }),
    k8sSecret("preview-postgres-init", { "init.sql": `CREATE USER harakiri PASSWORD '${passwords.appDatabase}';\nCREATE DATABASE harakiri OWNER harakiri;\nCREATE USER keycloak PASSWORD '${passwords.keycloakDatabase}';\nCREATE DATABASE keycloak OWNER keycloak;\n` }),
    k8sSecret("preview-keycloak", { KC_DB: "postgres", KC_DB_URL: "jdbc:postgresql://preview-postgres:5432/keycloak", KC_DB_USERNAME: "keycloak", KC_DB_PASSWORD: passwords.keycloakDatabase, KC_HOSTNAME: authOrigin, KC_BOOTSTRAP_ADMIN_USERNAME: "recovery-admin", KC_BOOTSTRAP_ADMIN_PASSWORD: passwords.recovery }),
    k8sSecret("preview-realm", { "harakiri-realm.json": JSON.stringify(realm) }),
    k8sSecret("preview-api", { DATABASE_URL: `postgres://harakiri:${passwords.appDatabase}@preview-postgres:5432/harakiri`, OPEN_SANDBOX_API_KEY: passwords.runtime, CREDENTIAL_VAULT_KEY: passwords.vault,
      TEMPLATE_REGISTRY_CREDENTIAL_KEY: passwords.registry, KEYCLOAK_ADMIN_CLIENT_SECRET: passwords.realmClient })
  ] };
  const values = { fullnameOverride: "harakiri", registry: { enabled: false }, secret: { create: false, existingSecret: "preview-api" },
    config: {
      AUTH_DEV_ALLOW: "0", SEED_ON_BOOT: "0", HARAKIRI_RUNTIME_PROVIDER: "opensandbox", PERSISTENT_WORKSPACES_ENABLED: "1", WORKSPACE_STORAGE_CLASS: "local-path", WORKSPACE_SIZE_GIB: "1",
      PUBLIC_WEB_URL: webOrigin, PUBLIC_API_URL: apiOrigin, PUBLIC_KEYCLOAK_URL: authOrigin, PUBLIC_KEYCLOAK_REALM: "harakiri", PUBLIC_KEYCLOAK_CLIENT_ID: "harakiri-web", PUBLIC_OPEN_SANDBOX_URL: "",
      KEYCLOAK_ISSUER: issuer, KEYCLOAK_ISSUER_ALLOWLIST: issuer, KEYCLOAK_JWKS_URL: `${internalAuth}/realms/harakiri/protocol/openid-connect/certs`, KEYCLOAK_AUDIENCE: "harakiri-api",
      KEYCLOAK_ADMIN_BASE_URL: internalAuth, KEYCLOAK_ADMIN_REALM: "harakiri", KEYCLOAK_ADMIN_TOKEN_REALM: "harakiri", KEYCLOAK_ADMIN_CLIENT_ID: "harakiri-admin", KEYCLOAK_INVITATION_REDIRECT_URI: `${webOrigin}/#dashboard/sandboxes`,
      OPEN_SANDBOX_BASE_URL: `http://opensandbox-server.${namespace}.svc.cluster.local:80`, OPEN_SANDBOX_GATEWAY_URL: `http://opensandbox-ingress-gateway.${namespace}.svc.cluster.local:80`, OPEN_SANDBOX_ALLOW_FALLBACK: "0", OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "1",
      SANDBOX_ROUTE_MODE: "opensandbox-gateway", SANDBOX_ROUTE_PUBLIC_SCHEME: new URL(apiOrigin).protocol.slice(0, -1),
      TEMPLATE_BUILDER_NAMESPACE: namespace, TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE: runtimeNamespace, TEMPLATE_IMAGE_PREPULL_NAMESPACE: runtimeNamespace,
      TEMPLATE_IMAGE_ALLOW_REGISTRIES: "docker.io,registry-1.docker.io,ghcr.io,core.campus.clusterdiali.me", TEMPLATE_REGISTRY_CREDENTIAL_KEY: "", TEMPLATE_REGISTRY_RUNTIME_HOST: "", TEMPLATE_REGISTRY_PUSH_HOST: ""
    } };
  const opensandbox = { global: {}, "opensandbox-controller": { namespaceOverride: namespace, controller: { image: { repository: "opensandbox/controller", tag: "v0.2.0" }, snapshot: { imageCommitterImage: "opensandbox/image-committer:v0.1.1" } } },
    "opensandbox-server": {
      namespaceOverride: namespace,
      server: { replicaCount: 1, port: 8080, image: { repository: "opensandbox/server", tag: "v0.2.3" },
        resources: { requests: { cpu: "250m", memory: "256Mi" }, limits: { cpu: "1", memory: "1Gi" } },
        gateway: { enabled: true, replicaCount: 1, host: "sandbox.localhost", gatewayRouteMode: "header", dataplaneNamespace: runtimeNamespace, providerType: "batchsandbox", image: { repository: "opensandbox/ingress", tag: "v1.0.10" },
          resources: { requests: { cpu: "100m", memory: "128Mi" }, limits: { cpu: "1", memory: "512Mi" } } } },
      configToml: `[server]\nhost = "0.0.0.0"\nport = 8080\napi_key = "${passwords.runtime}"\n[log]\nlevel = "INFO"\n[runtime]\ntype = "kubernetes"\nexecd_image = "opensandbox/execd:v1.1.0"\n[kubernetes]\nnamespace = "${runtimeNamespace}"\ninformer_enabled = true\nworkload_provider = "batchsandbox"\nbatchsandbox_template_file = "/etc/opensandbox/example.batchsandbox-template.yaml"\n[egress]\nimage = "opensandbox/egress:v1.1.7"\nmode = "dns+nft"\n`
    } };
  return { "secrets.json": secrets, "harakiri-values.json": values, "opensandbox-values.json": opensandbox,
    "operator-login.json": { url: webOrigin, username: email, password: passwords.operator }, "recovery-login.json": { url: `${authOrigin}/admin/master/console/`, username: "recovery-admin", password: passwords.recovery } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const directory = path.resolve(process.env.PREVIEW_CONFIG_DIR || path.join(import.meta.dirname, ".private"));
  const files = createConfiguration({ webOrigin: process.env.PREVIEW_WEB_ORIGIN || "http://127.0.0.1:28480", apiOrigin: process.env.PREVIEW_API_ORIGIN || "http://127.0.0.1:28482", authOrigin: process.env.PREVIEW_AUTH_ORIGIN || "http://127.0.0.1:28484", email: process.env.PREVIEW_OPERATOR_EMAIL || "operator@example.test" });
  fs.mkdirSync(directory, { mode: 0o700 });
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(`Configuration created in ${directory}. Nothing was installed. Preserve these files; do not regenerate during an upgrade.`);
}
