import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertInstallationOwner, backgroundSecret, buildConfig, installationAnnotation, registryHost, validateRenderVariables } from './install-config.mjs';
const env = { CLIENT_REGISTRY_USERNAME: 'robot$install', CLIENT_REGISTRY_PASSWORD: 'sample-registry-value', POSTGRES_PASSWORD: 'sample-password-with-\'"$chars' };

test('fresh install defaults use current artifacts and need no third-party checkout', () => {
  const config = buildConfig(env);
  assert.equal(config.versions.sandbox, '0.4.0');
  assert.equal(config.versions.opensandbox, '0.2.2-harakiri.2');
  assert.equal(config.background, false);
  assert.ok(!JSON.stringify(config.render).includes(env.POSTGRES_PASSWORD));
  const realms = config.secrets.find((secret) => secret.metadata.name === 'keycloak-realms');
  assert.equal(realms.kind, 'Secret');
  assert.equal(JSON.parse(realms.stringData['harakiri-realm.json']).clients[0].directAccessGrantsEnabled, false);
  const mapper = JSON.parse(realms.stringData['harakiri-realm.json']).clients[0].protocolMappers[0];
  assert.equal(mapper.protocolMapper, 'oidc-audience-mapper');
  assert.equal(mapper.config['included.custom.audience'], 'harakiri-api');
  assert.equal(mapper.config['access.token.claim'], 'true');
  assert.equal(mapper.config['id.token.claim'], 'false');
  assert.ok(config.databaseSql.includes("''"));
  assert.ok(!config.databaseSql.includes('GRANT CREATE ON DATABASE'));
});

test('customer inputs reject credential URLs, unversioned tags and YAML injection', () => {
  for (const input of [{ WEB_HOST: 'x.test"\nprivileged: true' }, { SANDBOX_IMAGE_TAG: 'latest' }, { NAMESPACE: '../other' }, { POSTGRES_STORAGE: '1Gi\n---' }]) assert.throws(() => buildConfig({ ...env, ...input }));
  assert.throws(() => registryHost('https://user:secret@registry.example.com'));
  assert.throws(() => registryHost('https://registry.example.com/project'));
  assert.throws(() => buildConfig({}));
});

test('standalone and generated Harakiri realms use the same API audience mapper', () => {
  const realm = JSON.parse(readFileSync(new URL('../../infra/keycloak/harakiri-realm.json', import.meta.url), 'utf8'));
  const generated = buildConfig(env).secrets.find((secret) => secret.metadata.name === 'keycloak-realms');
  const client = realm.clients.find((entry) => entry.clientId === 'harakiri-web');
  const generatedClient = JSON.parse(generated.stringData['harakiri-realm.json']).clients[0];
  assert.deepEqual(client.protocolMappers, generatedClient.protocolMappers);
});

test('optional BackgroundAgent gets only its own realm and Harakiri provider', () => {
  const config = buildConfig({ ...env, INSTALL_BACKGROUND_AGENT: 'true', BOOTSTRAP_USER_EMAIL: 'admin@example.test', BOOTSTRAP_USER_PASSWORD: 'temporary-example-password' });
  assert.equal(config.backgroundValues.sandbox.enabledProviders, 'harakiri');
  assert.equal(config.backgroundValues.image.repository, 'core.campus.clusterdiali.me/harakiri/background-agents/harakiri-web');
  const realms = config.secrets.find((secret) => secret.metadata.name === 'keycloak-realms');
  assert.ok(realms.stringData['background-agent-realm.json']);
  assert.equal(JSON.parse(realms.stringData['background-agent-realm.json']).clients[0].protocolMappers, undefined);
  assert.ok(!JSON.stringify(config.render).includes('temporary-example-password'));
});

test('an installation can resume only with its own namespace identity', () => {
  const first = buildConfig(env);
  const second = buildConfig(env);
  const namespace = { metadata: { annotations: { [installationAnnotation]: first.installationId } } };
  assertInstallationOwner(namespace, first.installationId);
  assert.throws(() => assertInstallationOwner(namespace, second.installationId));
  assert.throws(() => assertInstallationOwner(null, first.installationId));
  assert.throws(() => assertInstallationOwner({ metadata: {} }, first.installationId));
});

test('missing manifest variables fail before envsubst can silently erase them', () => {
  validateRenderVariables('namespace: ${NAMESPACE}', { NAMESPACE: 'test' });
  assert.throws(() => validateRenderVariables('namespace: ${NAMESPACE}', {}));
});

test('BackgroundAgent receives the key created after preparation without replacing other secrets', () => {
  const config = buildConfig({ ...env, INSTALL_BACKGROUND_AGENT: 'true' });
  assert.throws(() => backgroundSecret(config));
  const updated = backgroundSecret(config, 'hk_test_acceptance');
  assert.equal(updated.stringData.HARAKIRI_API_KEY, 'hk_test_acceptance');
  assert.equal(updated.stringData.POSTGRES_URL, config.secrets.find((secret) => secret.metadata.name === updated.metadata.name).stringData.POSTGRES_URL);
  assert.equal(config.secrets.find((secret) => secret.metadata.name === updated.metadata.name).stringData.HARAKIRI_API_KEY, '');
});
