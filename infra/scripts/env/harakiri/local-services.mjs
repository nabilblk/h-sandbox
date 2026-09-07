import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const originForwards = [
  { name: 'api', namespace: 'harakiri', service: 'harakiri-api', port: 18082, target: 8080 },
  { name: 'web', namespace: 'harakiri', service: 'harakiri-web', port: 15173, target: 80 },
  { name: 'keycloak', namespace: 'keycloak', service: 'keycloak', port: 18084, target: 8080 },
  { name: 'ingress-https', namespace: 'ingress-nginx', service: 'ingress-nginx-controller', port: 18087, target: 443 },
];

const prefix = 'io.harakiri.lab.';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
const available = (command, args) => { try { run(command, args); return true; } catch { return false; } };
const executable = (name) => run('/usr/bin/which', [name]).trim();

export function definitions({ home, repo, bin, config, logs }) {
  const common = {
    RunAtLoad: true, KeepAlive: true, ThrottleInterval: 5,
    EnvironmentVariables: { HOME: home, PATH: `${dirname(bin.kubectl)}:${dirname(bin.limactl)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` },
  };
  const job = (name, args, overrides = {}) => ({
    ...common, Label: `${prefix}${name}`, ProgramArguments: args,
    StandardOutPath: join(logs, `${name}.log`), StandardErrorPath: join(logs, `${name}.log`), ...overrides,
  });
  return [
    job('cluster', [bin.limactl, 'start', '--tty=false', 'harakiri-k0s'], { KeepAlive: { SuccessfulExit: false }, ThrottleInterval: 30, AbandonProcessGroup: true }),
    ...originForwards.map((item) => job(`forward-${item.name}`, [bin.kubectl, '--kubeconfig', join(repo, 'infra/k0s/harakiri.kubeconfig'), '-n', item.namespace, 'port-forward', '--address=127.0.0.1', `svc/${item.service}`, `${item.port}:${item.target}`])),
    job('tunnel', [bin.cloudflared, 'tunnel', '--config', config, '--no-autoupdate', 'run', 'harakiri-dev']),
  ];
}

function main() {
  assert.equal(process.platform, 'darwin', 'This host-specific helper requires macOS launchd. Kubernetes installs do not need it.');
  const command = process.argv[2] ?? 'status';
  assert.ok(['install', 'status', 'uninstall', 'rotate-logs'].includes(command), 'Use install [--migrate-tmux], status, rotate-logs, or uninstall.');
  const home = homedir();
  const agents = join(home, 'Library/LaunchAgents');
  const logs = join(home, 'Library/Logs/harakiri-lab');
  const config = join(home, '.cloudflared/config.yml');
  const names = ['cluster', ...originForwards.map(({ name }) => `forward-${name}`), 'tunnel', 'log-rotation'];
  const domain = `gui/${process.getuid()}`;
  if (command === 'status') {
    for (const name of names) {
      const label = `${prefix}${name}`;
      if (!available('launchctl', ['print', `${domain}/${label}`])) { console.log(`${name}: not installed`); continue; }
      const state = run('launchctl', ['print', `${domain}/${label}`]).split('\n').filter((line) => /^\t(state|pid|last exit code) =/.test(line));
      console.log(`${name}: ${state.map((line) => line.trim()).join('; ')}`);
    }
    return;
  }
  if (command === 'uninstall') {
    for (const name of names.reverse()) {
      const label = `${prefix}${name}`;
      if (available('launchctl', ['print', `${domain}/${label}`])) run('launchctl', ['bootout', `${domain}/${label}`]);
      rmSync(join(agents, `${label}.plist`), { force: true });
    }
    console.log('Removed only Harakiri lab launch agents. Cluster, storage, tunnel configuration and unrelated agents retained.');
    return;
  }
  if (command === 'rotate-logs') {
    // Keep file descriptors valid: truncate bounded diagnostic logs in place.
    for (const name of names) {
      const path = join(logs, `${name}.log`);
      if (existsSync(path) && statSync(path).size > 10 * 1024 * 1024) writeFileSync(path, '', { mode: 0o600 });
    }
    return;
  }
  assert.ok(existsSync(config), 'Missing existing named tunnel configuration.');
  assert.ok(existsSync(join(root, 'infra/k0s/harakiri.kubeconfig')), 'Missing k0s kubeconfig.');
  const bin = Object.fromEntries(['kubectl', 'limactl', 'cloudflared'].map((name) => [name, executable(name)]));
  run(bin.cloudflared, ['tunnel', '--config', config, 'ingress', 'validate']);
  const migrate = process.argv.includes('--migrate-tmux');
  for (const origin of originForwards) {
    const managed = available('launchctl', ['print', `${domain}/${prefix}forward-${origin.name}`]);
    const listening = available('lsof', ['-tiTCP:' + origin.port, '-sTCP:LISTEN']);
    const tmux = available('tmux', ['has-session', '-t', `harakiri-port-forwards:${origin.name}`]);
    assert.ok(managed || !listening || (migrate && tmux), `Port ${origin.port} has an unmanaged listener. Inspect it; this helper will not kill arbitrary processes.`);
  }
  mkdirSync(agents, { recursive: true }); mkdirSync(logs, { recursive: true, mode: 0o700 });
  const jobs = definitions({ home, repo: root, bin, config, logs });
  for (const definition of jobs) {
    const target = `${domain}/${definition.Label}`;
    const path = join(agents, `${definition.Label}.plist`);
    if (available('launchctl', ['print', target])) {
      const previous = existsSync(path) ? JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path])) : null;
      if (isDeepStrictEqual(previous, definition)) { console.log(`${definition.Label}: already supervised`); continue; }
      run('launchctl', ['bootout', target]);
    }
    const name = definition.Label.replace(`${prefix}forward-`, '');
    if (migrate && originForwards.some((origin) => origin.name === name) && available('tmux', ['has-session', '-t', `harakiri-port-forwards:${name}`])) {
      run('tmux', ['kill-window', '-t', `harakiri-port-forwards:${name}`]);
    }
    writeFileSync(path, run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(definition) }), { mode: 0o600 });
    writeFileSync(definition.StandardOutPath, '', { mode: 0o600 });
    run('launchctl', ['bootstrap', domain, path]);
    console.log(`${definition.Label}: installed`);
  }
  const rotation = {
    Label: `${prefix}log-rotation`, ProgramArguments: [process.execPath, fileURLToPath(import.meta.url), 'rotate-logs'],
    StartInterval: 3600, RunAtLoad: true,
  };
  const rotationPath = join(agents, `${rotation.Label}.plist`);
  if (!available('launchctl', ['print', `${domain}/${rotation.Label}`])) {
    writeFileSync(rotationPath, run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(rotation) }), { mode: 0o600 });
    run('launchctl', ['bootstrap', domain, rotationPath]);
  }
  console.log('Supervised at user login. Host sleep/power-off and pre-login availability are not covered.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Local service operation failed'); process.exitCode = 1; }
}
