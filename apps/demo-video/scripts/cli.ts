import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { exec, root } from './io.js';
import { sanitize } from './sanitize.js';
import type { Capture } from '../src/data/capture-schema.js';

export class DemoCli {
  readonly container: string;
  readonly events: Capture['events'] = [];
  readonly started = performance.now();
  constructor(readonly runId: string, readonly apiUrl: string, readonly apiKey: string, readonly version: string, readonly fixtureDirectory = resolve(root, 'examples/demo/product-tour')) {
    this.container = `harakiri-${runId}`;
  }
  private options() { return { timeout: 180_000, maxBuffer: 8_000_000, env: { ...process.env, HARAKIRI_API_KEY: this.apiKey } }; }
  async prepare() {
    await exec('docker', ['run', '--detach', '--name', this.container, '--label', 'io.harakiri.demo=true', '--mount', `type=bind,source=${this.fixtureDirectory},target=/demo,readonly`, 'node:22-bookworm-slim', 'sleep', 'infinity'], this.options());
    await exec('docker', ['exec', this.container, 'npm', 'install', '--global', '--ignore-scripts', `@h-sandbox/cli@${this.version}`], this.options());
    const actual = (await this.run('version', ['--version'])).trim();
    if (actual !== this.version) throw new Error('Published CLI version did not match requested version');
    await this.run('login', ['login', '--api-url', this.apiUrl]);
  }
  async run(name: string, args: string[]) {
    const startedMs = performance.now() - this.started;
    const display = args.map((arg) => arg.includes(' ') ? `'${arg.replace(/'/g, `'\\''`)}'` : arg).join(' ');
    const result = await exec('docker', ['exec', '-e', 'HARAKIRI_API_KEY', this.container, 'harakiri', ...args], this.options());
    this.events.push({ name, command: `harakiri ${display}`, startedMs, durationMs: performance.now() - this.started - startedMs, exitCode: 0, stdout: sanitize(result.stdout, [this.apiKey]), stderr: sanitize(result.stderr, [this.apiKey]) });
    return result.stdout;
  }
  async attach(sandboxId: string): Promise<Capture['terminal']> {
    const args = ['attach', sandboxId, '--cwd', '/workspace', '--cols', '94', '--rows', '20', '--no-raw'];
    const child = spawn('docker', ['exec', '-i', '-e', 'HARAKIRI_API_KEY', this.container, 'harakiri', ...args], { env: this.options().env, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Capture['terminal']['chunks'] = [];
    const begin = performance.now();
    let raw = '';
    let error = '';
    let done = false;
    const closed = new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => { done = true; resolve(code ?? 1); });
    });
    child.stdout.on('data', (data: Buffer) => { const text = sanitize(data.toString(), [this.apiKey]); raw += text; chunks.push({ atMs: performance.now() - begin, text }); });
    child.stderr.on('data', (data: Buffer) => { error += sanitize(data.toString(), [this.apiKey]); });
    const wait = async (needle: string, since = 0) => {
      const limit = performance.now() + 30_000;
      while (!raw.slice(since).includes(needle)) {
        if (done || performance.now() > limit) throw new Error(`CLI attach did not produce ${needle}: ${error} ${raw.slice(-800)}`);
        await delay(100);
      }
    };
    try {
      for (const [command, expected] of [['pwd', '/workspace'], ['ls -1', 'server.mjs'], ['node --version', 'v22.']]) {
        const offset = raw.length;
        child.stdin.write(`${command}\n`);
        await wait(expected, offset);
        await delay(250);
      }
      child.stdin.write('exit\n');
      const exitCode = await Promise.race([closed, delay(10_000).then(() => { throw new Error('CLI attach failed to close'); })]);
      if (exitCode !== 0) throw new Error(`CLI attach failed (${exitCode}): ${error}`);
      return { command: `harakiri attach ${sandboxId} --cwd /workspace`, stdout: raw, chunks, exitCode: 0 };
    } finally {
      if (!done) { child.kill('SIGTERM'); await closed; }
    }
  }
  async remove() {
    const result = await exec('docker', ['container', 'ls', '-aq', '--filter', `name=^/${this.container}$`], { timeout: 10_000 });
    if (result.stdout.trim()) await exec('docker', ['rm', '-f', this.container], { timeout: 20_000 });
    const remaining = await exec('docker', ['container', 'ls', '-aq', '--filter', `name=^/${this.container}$`], { timeout: 10_000 });
    if (remaining.stdout.trim()) throw new Error('Demo CLI container was not removed');
  }
}
