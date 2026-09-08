import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const token = () => randomBytes(24).toString('hex');
const semver = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
const hostPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export function registryHost(value) {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  assert.ok(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Registry must be an origin without credentials or a repository path');
  return url.host;
}

export function buildConfig(env, docker = {}) {
  const namespace = env.NAMESPACE || 'harakiri-security';
  assert.match(namespace, /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/, 'Invalid namespace');
  const registry = registryHost(env.CLIENT_REGISTRY_URL || 'https://core.campus.clusterdiali.me');
  const sourceRegistry = registryHost(env.SOURCE_REGISTRY_URL || `https://${registry}`);
  const project = env.HARBOR_PROJECT || 'harakiri';
  assert.match(project, /^[a-z0-9][a-z0-9._-]*$/, 'Invalid registry project');
  const domain = env.APPS || 'apps-crc.testing';
  const hosts = { web: env.WEB_HOST || `hs.${domain}`, api: env.API_HOST || `hs-api.${domain}`, auth: env.AUTH_HOST || `hs-auth.${domain}`, background: env.BACKGROUND_AGENT_HOST || `hs-background-agent.${domain}`, sandbox: env.SBX_DOMAIN || `hs-sbx.${domain}` };
  for (const host of Object.values(hosts)) assert.match(host, hostPattern, 'Invalid public hostname');
  const versions = { sandbox: env.SANDBOX_CHART_VERSION || '0.4.0', image: env.SANDBOX_IMAGE_TAG || '0.4.0', opensandbox: env.OPEN_SANDBOX_CHART_VERSION || '0.2.2-harakiri.2', background: env.BACKGROUND_AGENT_CHART_VERSION || '0.1.0', backgroundImage: env.BACKGROUND_AGENT_IMAGE_TAG || env.BACKGROUND_AGENT_CHART_VERSION || '0.1.0' };
  for (const version of Object.values(versions)) assert.match(version, semver, 'Chart/image versions must be explicit SemVer values');
  const background = env.INSTALL_BACKGROUND_AGENT === 'true';
  const secretEnv = {};
  if (background && env.BACKGROUND_AGENT_WORKSPACE) {
    for (const file of ['.env', '.env.local']) {
      const path = join(env.BACKGROUND_AGENT_WORKSPACE, 'apps/web', file);
      if (existsSync(path)) Object.assign(secretEnv, parseEnv(readFileSync(path, 'utf8')));
    }
  }
  const password = env.POSTGRES_PASSWORD || token();
  const postgresAdmin = env.POSTGRES_ADMIN_PASSWORD || token();
  const keycloak = env.KEYCLOAK_ADMIN_PASSWORD || token();
  const openSandboxKey = env.OPEN_SANDBOX_API_KEY || token();
  for (const value of [password, postgresAdmin, keycloak, openSandboxKey]) assert.ok(value.length >= 12 && !value.includes('\0'), 'Service credentials need at least 12 characters and no NUL');
  const auth = env.CLIENT_REGISTRY_USERNAME && env.CLIENT_REGISTRY_PASSWORD
    ? { auth: Buffer.from(`${env.CLIENT_REGISTRY_USERNAME}:${env.CLIENT_REGISTRY_PASSWORD}`).toString('base64') }
    : docker.auths?.[registry];
  assert.ok(auth?.auth, 'Log in to the target registry with Docker, or set CLIENT_REGISTRY_USERNAME and CLIENT_REGISTRY_PASSWORD');
  const postgresImage = env.POSTGRES_IMAGE || `${registry}/${project}/mirror/postgresql-16:c9s-20260907`;
  assert.match(postgresImage, /^[a-zA-Z0-9][a-zA-Z0-9./:@_-]+$/, 'Invalid PostgreSQL image');
  const storage = env.POSTGRES_STORAGE || '20Gi';
  assert.match(storage, /^[1-9]\d*(?:Mi|Gi|Ti)$/, 'Invalid PostgreSQL storage size');
  const backgroundRepository = env.BACKGROUND_AGENT_IMAGE_REPOSITORY || `${project}/background-agents/harakiri-web`;
  assert.match(backgroundRepository, /^[a-z0-9][a-z0-9/._-]+$/, 'Invalid BackgroundAgent image repository');
  const schemas = [['harakiri_sandbox', 'harakiri_sandbox'], ['keycloak', 'keycloak'], ...(background ? [['background_agent', 'public']] : [])];
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  let delimiter = '$bootstrap$';
  while (password.includes(delimiter)) delimiter = `$bootstrap_${randomBytes(8).toString('hex')}$`;
  const databaseSql = 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;\n' + schemas.map(([role, schema]) => `DO ${delimiter} BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} LOGIN PASSWORD ${quote(password)}; END IF; END ${delimiter};\nCREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${role};\nGRANT CONNECT ON DATABASE platform TO ${role};\nGRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role};\nALTER ROLE ${role} IN DATABASE platform SET search_path TO ${schema}, public;`).join('\n');
  const databaseUrl = (role) => `postgres://${role}:${encodeURIComponent(password)}@platform-postgres.${namespace}.svc:5432/platform`;
  const users = env.BOOTSTRAP_USER_EMAIL && env.BOOTSTRAP_USER_PASSWORD ? [{ username: env.BOOTSTRAP_USER_EMAIL, email: env.BOOTSTRAP_USER_EMAIL, enabled: true, emailVerified: true, credentials: [{ type: 'password', value: env.BOOTSTRAP_USER_PASSWORD, temporary: true }] }] : [];
  assert.equal(Boolean(env.BOOTSTRAP_USER_EMAIL), Boolean(env.BOOTSTRAP_USER_PASSWORD), 'Provide both bootstrap email and password, or neither');
  const clientSecret = env.BACKGROUND_AGENT_CLIENT_SECRET || secretEnv.KEYCLOAK_CLIENT_SECRET || token();
  const apiAudience = {
    name: 'harakiri-api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper', consentRequired: false,
    config: { 'included.custom.audience': 'harakiri-api', 'id.token.claim': 'false', 'access.token.claim': 'true', 'introspection.token.claim': 'true' }
  };
  const realm = (name, clientId, host, publicClient) => ({
    realm: name, enabled: true, loginWithEmailAllowed: true, registrationAllowed: false,
    clients: [{ clientId, enabled: true, publicClient, standardFlowEnabled: true, directAccessGrantsEnabled: false,
      redirectUris: [`https://${host}/*`], webOrigins: [`https://${host}`],
      attributes: { 'pkce.code.challenge.method': 'S256' },
      ...(name === 'harakiri' ? { protocolMappers: [apiAudience] } : {}),
      ...(publicClient ? {} : { secret: clientSecret }) }], users
  });
  const object = (name, stringData, type = 'Opaque') => ({ apiVersion: 'v1', kind: 'Secret', metadata: { name, namespace }, type, stringData });
  const imported = ['JWE_SECRET', 'ENCRYPTION_KEY', 'NEXT_PUBLIC_GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'OPENROUTER_API_KEY', 'AI_GATEWAY_API_KEY', 'REDIS_URL', 'KV_URL'];
  const secrets = [
    object('registry-pull', { '.dockerconfigjson': JSON.stringify({ auths: { [registry]: auth } }) }, 'kubernetes.io/dockerconfigjson'),
    object('platform-postgres', { POSTGRESQL_PASSWORD: password, POSTGRESQL_ADMIN_PASSWORD: postgresAdmin }),
    object('keycloak-admin', { KC_BOOTSTRAP_ADMIN_PASSWORD: keycloak, KC_DB_PASSWORD: password }),
    object('keycloak-realms', { 'harakiri-realm.json': JSON.stringify(realm('harakiri', 'harakiri-web', hosts.web, true)), ...(background ? { 'background-agent-realm.json': JSON.stringify(realm('background-agent', 'open-agents-web', hosts.background, false)) } : {}) }),
    object('harakiri-api', { DATABASE_URL: databaseUrl('harakiri_sandbox'), OPEN_SANDBOX_API_KEY: openSandboxKey, CONTROL_PLANE_SECRET_KEY: env.CONTROL_PLANE_SECRET_KEY || randomBytes(32).toString('base64'), KEYCLOAK_ADMIN_USERNAME: 'admin', KEYCLOAK_ADMIN_PASSWORD: keycloak }),
    ...(background ? [object('background-agent-secrets', { ...Object.fromEntries(imported.map((key) => [key, env[key] || secretEnv[key] || ''])), POSTGRES_URL: databaseUrl('background_agent'), KEYCLOAK_CLIENT_SECRET: clientSecret, HARAKIRI_API_KEY: env.HARAKIRI_API_KEY || '' })] : []),
  ];
  const render = { NAMESPACE: namespace, HARBOR: registry, HARBOR_PROJECT: project, POSTGRES_IMAGE: postgresImage, POSTGRES_STORAGE: storage, KEYCLOAK_IMAGE: `${registry}/${project}/mirror/keycloak:26.4`, SANDBOX_IMAGE_TAG: versions.image, HARAKIRI_SEED_ON_BOOT: '0', TEMPLATE_REGISTRY_HOST: `${registry}/${project}/templates`, WEB_HOST: hosts.web, API_HOST: hosts.api, AUTH_HOST: hosts.auth, SBX_DOMAIN: hosts.sandbox };
  const backgroundValues = {
    image: { repository: `${registry}/${backgroundRepository}`, tag: versions.backgroundImage, pullPolicy: 'IfNotPresent' }, imagePullSecrets: [{ name: 'registry-pull' }], app: { publicUrl: `https://${hosts.background}` },
    auth: { keycloak: { issuerUrl: `https://${hosts.auth}/realms/background-agent`, internalIssuerUrl: `http://keycloak.${namespace}.svc:8080/realms/background-agent`, clientId: 'open-agents-web' }, secureCookies: 'true', postLogoutRedirectUri: `https://${hosts.background}/`, allowedEmails: secretEnv.HARAKIRI_ALLOWED_EMAILS || env.BOOTSTRAP_USER_EMAIL || '', allowedEmailDomains: secretEnv.HARAKIRI_ALLOWED_EMAIL_DOMAINS || '', adminEmails: secretEnv.HARAKIRI_ADMIN_EMAILS || env.BOOTSTRAP_USER_EMAIL || '' },
    github: { appSlug: secretEnv.NEXT_PUBLIC_GITHUB_APP_SLUG || '', botLogins: secretEnv.HARAKIRI_GITHUB_BOT_LOGINS || '' }, models: { openrouterBaseUrl: secretEnv.OPENROUTER_BASE_URL || '', openrouterAppName: secretEnv.OPENROUTER_APP_NAME || '', openrouterAppUrl: secretEnv.OPENROUTER_APP_URL || '', utilityModel: secretEnv.UTILITY_MODEL || '' },
    sandbox: { enabledProviders: 'harakiri', defaultProvider: 'harakiri', harakiriApiUrl: `https://${hosts.api}`, harakiriTemplate: env.BACKGROUND_AGENT_HARAKIRI_TEMPLATE || 'open-agents-dev' },
    postgres: { mode: 'external' }, keycloak: { mode: 'external' }, secrets: { existingSecret: 'background-agent-secrets' }, ingress: { enabled: false }, route: { enabled: true, host: hosts.background, tls: { enabled: true, termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' } },
  };
  return { installationId: randomUUID(), namespace, registry, sourceRegistry, project, versions, hosts, background, render, secrets, databaseSql, backgroundValues, insecureTls: env.INSTALL_INSECURE_TLS === 'true', charts: { opensandbox: `oci://${registry}/${project}/charts/opensandbox`, sandbox: `oci://${registry}/${project}/charts/harakiri`, background: `oci://${registry}/${project}/background-agents/charts/harakiri` } };
}

export const installationAnnotation = 'harakiri.io/installation-id';

export function backgroundSecret(config, apiKey) {
  const secret = config.secrets.find((item) => item.metadata.name === 'background-agent-secrets');
  assert.ok(secret, 'Prepare with INSTALL_BACKGROUND_AGENT=true before installing BackgroundAgent');
  const key = apiKey || secret.stringData.HARAKIRI_API_KEY;
  assert.ok(key && /^hk_[A-Za-z0-9_-]+$/.test(key), 'Create a Harakiri API key after onboarding and set HARAKIRI_API_KEY in your private INSTALL_ENV_FILE');
  return { ...secret, stringData: { ...secret.stringData, HARAKIRI_API_KEY: key } };
}

export function assertInstallationOwner(namespace, installationId) {
  assert.ok(installationId && namespace?.metadata?.annotations?.[installationAnnotation] === installationId,
    'Namespace is not owned by this prepared installation. Existing installations and data will not be overwritten.');
}

export function validateRenderVariables(source, variables) {
  for (const match of source.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
    assert.ok(Object.hasOwn(variables, match[1]), `Missing installation variable: ${match[1]}`);
  }
}

export function operatorEnvironment() {
  const env = { ...(process.env.INSTALL_ENV_FILE ? parseEnv(readFileSync(process.env.INSTALL_ENV_FILE, 'utf8')) : {}), ...process.env };
  const dockerFile = join(homedir(), '.docker/config.json');
  const docker = existsSync(dockerFile) ? JSON.parse(readFileSync(dockerFile, 'utf8')) : {};
  return { env, docker };
}
