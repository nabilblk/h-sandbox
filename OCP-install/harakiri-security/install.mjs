import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
import { assertInstallationOwner, backgroundSecret, buildConfig, installationAnnotation, operatorEnvironment, validateRenderVariables } from './install-config.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const stage = process.argv[2] || 'help';
const stages = ['prepare', 'dependencies', 'opensandbox', 'sandbox', 'background-agent', 'verify', 'all'];
const { env, docker } = operatorEnvironment();
const state = resolve(env.INSTALL_STATE_DIR || join(directory, 'state', env.NAMESPACE || 'harakiri-security'));
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options });
const privateFile = (name, content) => { const path = join(state, name); writeFileSync(path, content, { mode: 0o600 }); chmodSync(path, 0o600); return path; };
const jsonFile = (name, data) => privateFile(name, JSON.stringify(data, null, 2) + '\n');
const apply = (file) => { run('oc', ['apply', '-f', join(state, file)]); console.log(`Applied ${file}`); };
const storedConfig = () => { assert.ok(existsSync(join(state, 'config.json')), 'Run prepare first with the same INSTALL_STATE_DIR'); return JSON.parse(readFileSync(join(state, 'config.json'), 'utf8')); };
const chartPath = (config, name) => join(state, 'charts', name, `${name === 'opensandbox' ? name : 'harakiri'}-${config.versions[name]}.tgz`);

function prepare() {
  mkdirSync(state, { recursive: true, mode: 0o700 }); chmodSync(state, 0o700);
  const config = existsSync(join(state, 'config.json')) ? storedConfig() : buildConfig(env, docker);
  jsonFile('config.json', config);
  jsonFile('secrets.json', { apiVersion: 'v1', kind: 'List', items: config.secrets });
  privateFile('init-db.sql', config.databaseSql);
  jsonFile('04-background-agent-values.json', config.backgroundValues);
  for (const file of ['00-postgres.yaml', '01-keycloak.yaml', '02-opensandbox-values.yaml', '03-harakiri-values.yaml', '05-routes.yaml']) {
    const source = readFileSync(join(directory, file), 'utf8');
    validateRenderVariables(source, config.render);
    const rendered = run('envsubst', [], { input: source, env: { PATH: process.env.PATH, ...config.render } });
    assert.ok(!rendered.includes('${'), `Unresolved variable in ${file}`);
    privateFile(file, rendered);
  }
  const dockerConfig = JSON.parse(config.secrets.find((item) => item.metadata.name === 'registry-pull').stringData['.dockerconfigjson']);
  const credentials = Buffer.from(dockerConfig.auths[config.registry].auth, 'base64').toString();
  const separator = credentials.indexOf(':');
  run('helm', ['registry', 'login', config.registry, '--username', credentials.slice(0, separator), '--password-stdin'], { input: credentials.slice(separator + 1) });
  const lockFile = join(state, 'charts.lock.json');
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
  for (const name of ['opensandbox', 'sandbox', ...(config.background ? ['background'] : [])]) {
    const file = chartPath(config, name);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!existsSync(file)) run('helm', ['pull', config.charts[name], '--version', config.versions[name], '--destination', dirname(file)]);
    assert.ok(run('helm', ['show', 'chart', file]).split('\n').includes(`version: ${config.versions[name]}`), `Unexpected ${name} chart version`);
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (lock[name]) assert.equal(sha256, lock[name].sha256, `The downloaded ${name} chart differs from the prepared archive`);
    lock[name] = { source: config.charts[name], version: config.versions[name], sha256 };
    console.log(`${name}: ${config.charts[name]}:${config.versions[name]} downloaded and validated`);
  }
  jsonFile('charts.lock.json', lock);
  console.log(`Prepared ${state}. Credentials are private and retained; rerunning prepare does not rotate them. Review generated YAML before installing. No cluster resources changed.`);
}

function namespaceState(config) {
  const data = run('oc', ['get', 'namespace', config.namespace, '-o', 'json', '--ignore-not-found']);
  return data.trim() ? JSON.parse(data) : null;
}

function dependencies(config) {
  const namespace = namespaceState(config);
  assert.ok(config.installationId, 'Prepare a new state directory; this legacy prepared configuration has no installation identity.');
  if (namespace?.metadata?.annotations?.[installationAnnotation]) assertInstallationOwner(namespace, config.installationId);
  else if (namespace) {
    const resources = JSON.parse(run('oc', ['get', 'deploy,statefulset,pvc,job', '-n', config.namespace, '-o', 'json']));
    assert.equal(resources.items.length, 0, 'Namespace contains existing workloads or data. Nothing was changed.');
  }
  jsonFile('namespace.json', { apiVersion: 'v1', kind: 'Namespace', metadata: { name: config.namespace, annotations: { [installationAnnotation]: config.installationId } } });
  apply('namespace.json'); apply('secrets.json'); apply('00-postgres.yaml');
  run('oc', ['wait', '-n', config.namespace, '--for=condition=Available', 'deployment/platform-postgres', '--timeout=300s']);
  run('oc', ['exec', '-i', '-n', config.namespace, 'deploy/platform-postgres', '--', 'sh', '-lc', 'PGPASSWORD="$POSTGRESQL_ADMIN_PASSWORD" psql -U postgres -d platform -v ON_ERROR_STOP=1'], { input: config.databaseSql });
  apply('01-keycloak.yaml');
  run('oc', ['wait', '-n', config.namespace, '--for=condition=Available', 'deployment/keycloak', '--timeout=480s']);
  privateFile('installed-dependencies', config.namespace + '\n');
  console.log('PostgreSQL and Keycloak ready; realm credentials are stored only in Secrets.');
}

function installChart(config, name) {
  assertInstallationOwner(namespaceState(config), config.installationId);
  assert.ok(existsSync(join(state, 'installed-dependencies')), 'Complete the dependencies stage first');
  if (name === 'background') assert.ok(config.background, 'Prepare with INSTALL_BACKGROUND_AGENT=true to enable this stage');
  const file = chartPath(config, name);
  assert.ok(existsSync(file), `Missing ${name} chart; run prepare. No source fallback is allowed.`);
  const lock = JSON.parse(readFileSync(join(state, 'charts.lock.json'), 'utf8'));
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), lock[name]?.sha256, 'Chart archive changed after preparation');
  if (name === 'background') {
    const secret = backgroundSecret(config, env.HARAKIRI_API_KEY);
    config.secrets = config.secrets.map((item) => item.metadata.name === secret.metadata.name ? secret : item);
    jsonFile('config.json', config);
    jsonFile('secrets.json', { apiVersion: 'v1', kind: 'List', items: config.secrets });
    jsonFile('background-agent-secret.json', secret);
    apply('background-agent-secret.json');
  }
  const values = { opensandbox: '02-opensandbox-values.yaml', sandbox: '03-harakiri-values.yaml', background: '04-background-agent-values.json' }[name];
  const release = { opensandbox: 'opensandbox', sandbox: 'harakiri', background: 'background-agent' }[name];
  run('helm', ['upgrade', '--install', release, file, '-n', config.namespace, '-f', join(state, values), '--wait', '--wait-for-jobs', '--timeout=10m']);
  if (name === 'sandbox') apply('05-routes.yaml');
  console.log(`${release}: ready. No SCC mutation, live patch, restart repair, or source-chart fallback.`);
}

function http(config, url, { method = 'GET', body, key } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = request(url, { method, rejectUnauthorized: !config.insecureTls, timeout: 30000, headers: { ...(key ? { 'x-api-key': key } : {}), ...(body ? { 'content-type': 'application/json' } : {}) } }, (response) => {
      let data = ''; response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; if (data.length > 4 * 1024 * 1024) req.destroy(new Error('Response too large')); });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 300) return reject(new Error(`${method} ${new URL(url).pathname}: HTTP ${response.statusCode}`));
        resolveResponse(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timed out: ${new URL(url).pathname}`)));
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function verify(config) {
  if (config.insecureTls) console.log('WARNING: TLS verification is explicitly disabled for this lab profile.');
  await http(config, `https://${config.hosts.api}/health`);
  const web = await http(config, `https://${config.hosts.web}/config.js`);
  assert.ok(web.includes(`https://${config.hosts.api}`) && web.includes(`https://${config.hosts.auth}`) && !/https?:\/\/(?:localhost|127\.0\.0\.1)/.test(web), 'Incorrect hosted runtime origins');
  const discovery = JSON.parse(await http(config, `https://${config.hosts.auth}/realms/harakiri/.well-known/openid-configuration`));
  assert.equal(discovery.issuer, `https://${config.hosts.auth}/realms/harakiri`);
  if (config.background) await http(config, `https://${config.hosts.background}/api/health`);
  if (env.SANDBOX_SMOKE_TEST === 'true') {
    assert.ok(env.HARAKIRI_API_KEY && env.HARAKIRI_TEMPLATE, 'Provide HARAKIRI_API_KEY and an imported HARAKIRI_TEMPLATE for sandbox acceptance');
    const api = (path, options = {}) => http(config, `https://${config.hosts.api}/v1${path}`, { ...options, key: env.HARAKIRI_API_KEY });
    let id;
    try {
      const result = JSON.parse(await api('/sandboxes', { method: 'POST', body: { template: env.HARAKIRI_TEMPLATE, name: 'installation-acceptance', ttlSeconds: 300, wait: true, waitTimeoutMs: 30000 } }));
      id = result.sandbox?.id; assert.ok(id, 'Create returned no sandbox ID');
      const execution = JSON.parse(await api(`/sandboxes/${id}/run`, { method: 'POST', body: { command: 'printf installation-ok', timeoutMs: 30000 } }));
      assert.equal(execution.result?.exitCode, 0); assert.equal(execution.result?.stdout, 'installation-ok');
    } finally {
      if (id) {
        await api(`/sandboxes/${id}`, { method: 'DELETE' });
        const deadline = Date.now() + 90000;
        let terminated = false;
        while (Date.now() < deadline) {
          const result = JSON.parse(await api(`/sandboxes/${id}`));
          if (result.sandbox?.status === 'terminated') { terminated = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        assert.ok(terminated, 'Sandbox termination was requested but not confirmed. Inspect this installation before handing it over.');
      }
    }
    console.log('Sandbox create, command and termination passed.');
  } else console.log('HTTP/OIDC checks only; sandbox acceptance is not yet verified. Set SANDBOX_SMOKE_TEST=true after importing a template and creating an API key.');
  console.log('Endpoint verification passed.');
}

async function main() {
  if (stage === 'help') { console.log(`Usage: ./install.sh <${stages.join('|')}>\nSet INSTALL_ENV_FILE to a private dotenv file; state defaults to state/<namespace>.`); return; }
  assert.ok(stages.includes(stage), 'Unknown installation stage');
  if (stage === 'prepare' || stage === 'all') prepare();
  if (stage === 'prepare') return;
  const config = storedConfig();
  if (stage === 'dependencies' || stage === 'all') dependencies(config);
  if (stage === 'opensandbox' || stage === 'all') installChart(config, 'opensandbox');
  if (stage === 'sandbox' || stage === 'all') installChart(config, 'sandbox');
  if (stage === 'background-agent' || (stage === 'all' && config.background)) installChart(config, 'background');
  if (stage === 'verify' || stage === 'all') await verify(config);
}

main().catch((error) => {
  // Child-process errors may include secret input or generated manifests.
  console.error(error?.spawnargs ? `Installation command failed: ${error.path} (exit ${error.status ?? 'unknown'}). No later stage was run.` : error.message);
  process.exitCode = 1;
});
