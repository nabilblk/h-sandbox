import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DemoCli } from './cli.js';
import { cleanupRuntime, demoApi, poll } from './api.js';
import { agentEvidence, verifyRepair } from './agent-evidence.js';
import { exec, root, required, writeJson, sha256 } from './io.js';

const apiUrl = required('HARAKIRI_API_URL');
const apiKey = required('HARAKIRI_API_KEY');
const model = 'opencode/mimo-v2.5-free';
const version = '0.4.0';
const runId = `agent-demos-${Date.now()}`;
const directory = join(root, 'docs/artifacts/demo', runId);
const fixtures = join(root, 'examples/demo/agent-workflows');
await mkdir(directory, { recursive: true, mode: 0o700 });
await exec('git', ['check-ignore', '--quiet', directory], { cwd: root });
const api = demoApi(apiUrl, apiKey);
const cli = new DemoCli(runId, apiUrl, apiKey, version, fixtures);
let sandboxId = '';
let sdkSandbox = '';
const sdkName = `${runId}-sdk`;
await writeJson(join(directory, 'recovery.json'), { runId, apiUrl, sdkName });
let cleaning: Promise<void> | undefined;
async function cleanup() {
  return cleaning ??= (async () => {
    try {
      if (sandboxId) await cleanupRuntime(api, sandboxId);
      const candidates = (await api(`/v1/sandboxes?q=${sdkName}`)).sandboxes.filter((item: any) => item.name === sdkName);
      for (const item of candidates) { sdkSandbox = item.id; await cleanupRuntime(api, item.id); }
    } finally { await cli.remove(); }
  })();
}
const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
try {
  await cli.prepare();
  if (process.env.DEMO_ONLY !== 'sdk') {
  const created = await cli.run('create', ['create', '--template', 'opencode', '--name', `${runId}-cli`, '--ttl', '600']);
  sandboxId = created.split('\n').find((line) => /^sbx_[\w-]+$/.test(line.trim()))?.trim() ?? '';
  assert.ok(sandboxId);
  await writeJson(join(directory, 'recovery.json'), { runId, apiUrl, sandboxId, sdkName });
  const sandbox = (await poll(() => api(`/v1/sandboxes/${sandboxId}`), (value) => value.sandbox.status === 'running')).sandbox;
  for (const file of ['invoice.mjs', 'invoice.spec.mjs']) await cli.run(`upload-${file}`, ['file-upload', sandboxId, '--from', `/demo/${file}`, '--path', `/workspace/${file}`, '--parents']);
  const config = { model, small_model: model, enabled_providers: ['opencode'], share: 'disabled', autoupdate: false, permission: { '*': 'allow' } };
  await cli.run('configure', ['run', sandboxId, '--cwd', '/workspace', '--cmd', `printf '%s' '${JSON.stringify(config)}' > opencode.json`]);
  await cli.run('git-baseline', ['run', sandboxId, '--cwd', '/workspace', '--cmd', 'git init -q && git add invoice.mjs invoice.spec.mjs']);
  const run = async (command: string) => (await api(`/v1/sandboxes/${sandboxId}/run`, 'POST', { command, cwd: '/workspace', timeoutMs: 30000 })).result;
  const initialHash = (await run('sha256sum invoice.spec.mjs')).stdout.trim();
  await cli.run('tests-before', ['run', sandboxId, '--cwd', '/workspace', '--cmd', 'node --test invoice.spec.mjs']);
  const before = await run('node --test invoice.spec.mjs');
  assert.notEqual(before.exitCode, 0);
  const prompt = 'Fix invoice.mjs so subtotal is discounted by discountPercent, rounded to integer cents, then shipping is added unchanged. Run node --test invoice.spec.mjs to verify your fix. Do not modify invoice.spec.mjs. Use your tools to edit and run tests, not just describe a fix.';
  const started = JSON.parse(await cli.run('agent-start', ['command', 'run', sandboxId, '--cwd', '/workspace', '--cmd', `opencode run --format json --model ${model} '${prompt}'`, '--timeout-ms', '240000', '--detached', '--json']));
  const job = await poll(() => api(`/v1/sandboxes/${sandboxId}/commands/${started.command.id}`), (value) => ['succeeded', 'failed', 'killed'].includes(value.command.status), 260000);
  assert.equal(job.command.exitCode, 0);
  const logs = await api(`/v1/sandboxes/${sandboxId}/commands/${started.command.id}/logs`);
  await writeJson(join(directory, 'cli-private-trace.json'), logs);
  const agent = agentEvidence(logs.stdout);
  await cli.run('tests-after', ['run', sandboxId, '--cwd', '/workspace', '--cmd', 'node --test invoice.spec.mjs']);
  const after = await run('node --test invoice.spec.mjs');
  const finalHash = (await run('sha256sum invoice.spec.mjs')).stdout.trim();
  const diff = await cli.run('diff', ['run', sandboxId, '--cwd', '/workspace', '--cmd', 'git diff -- invoice.mjs']);
  verifyRepair(before, after, initialHash, finalHash, diff);
  await cli.run('kill', ['kill', sandboxId]);
  await cleanupRuntime(api, sandboxId);
  await writeJson(join(directory, 'cli.json'), { id: 'cli-agent-repair', capturedAt: new Date().toISOString(), model, version, sandbox: { id: sandboxId, templateVersionId: sandbox.templateVersionId }, prompt, agent, before, after, initialHash, finalHash, diff, events: cli.events, cleanup: true });
  console.log('CLI: real repair, immutable tests pass, zero cost, terminated.');
  }

  await exec('docker', ['exec', cli.container, 'mkdir', '-p', '/work']);
  await exec('docker', ['exec', '-w', '/work', cli.container, 'npm', 'install', '--ignore-scripts', `@h-sandbox/sdk@${version}`], { timeout: 180000 });
  for (const file of ['sdk-report.mjs', 'orders.csv']) await exec('docker', ['exec', cli.container, 'cp', `/demo/${file}`, `/work/${file}`]);
  const result = await exec('docker', ['exec', '-e', 'HARAKIRI_API_KEY', '-e', `HARAKIRI_API_URL=${apiUrl}`, '-e', `OPENCODE_MODEL=${model}`, '-e', `DEMO_RUN=${sdkName}`, '-e', 'DEMO_EVIDENCE=/work/evidence.json', '-w', '/work', cli.container, 'node', 'sdk-report.mjs'], { env: { ...process.env, HARAKIRI_API_KEY: apiKey }, timeout: 360000, maxBuffer: 8000000 });
  const evidence = JSON.parse((await exec('docker', ['exec', cli.container, 'cat', '/work/evidence.json'])).stdout);
  sdkSandbox = evidence.sandbox.id;
  assert.equal((await api(`/v1/sandboxes/${sdkSandbox}`)).sandbox.status, 'terminated');
  // Keep full traces private; render only reviewed tool names and verified artifacts.
  await writeJson(join(directory, 'sdk-private-trace.json'), evidence.trace);
  assert.equal(evidence.inputUnchanged, true);
  assert.ok(evidence.summary.trim());
  await writeJson(join(directory, 'sdk.json'), { id: 'sdk-agent-report', capturedAt: new Date().toISOString(), model, version, sandbox: { id: sdkSandbox, templateVersionId: evidence.sandbox.templateVersionId }, sourceSha256: sha256(await readFile(join(fixtures, 'sdk-report.mjs'))), stdout: result.stdout, prompt: evidence.prompt, agentCommand: evidence.agentCommand, report: evidence.report, summary: evidence.summary, inputUnchanged: evidence.inputUnchanged, agent: agentEvidence(evidence.trace), cleanup: true });
  console.log('SDK: published package, exact report verified, zero cost, terminated.');
} finally {
  await cleanup();
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
}
console.log(`Verified evidence: ${directory}`);
