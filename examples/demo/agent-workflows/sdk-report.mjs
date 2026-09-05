import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { HarakiriClient } from '@h-sandbox/sdk';

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const model = process.env.OPENCODE_MODEL ?? 'opencode/mimo-v2.5-free';
if (!apiUrl || !apiKey) throw new Error('Set HARAKIRI_API_URL and HARAKIRI_API_KEY');
if (!/^opencode\/[a-z0-9.-]+-free$/.test(model)) throw new Error('This example only permits explicit free models');

const prompt = [
  'Read orders.csv.',
  'Write analyze.py using only the Python standard library.',
  'It must sum total_cents only for paid rows and count refunded rows.',
  'Execute it to create report.json with exactly paid_orders,',
  'revenue_cents, refunded_orders integer fields,',
  'and summary.md with a short business summary.',
  'Do not modify orders.csv.',
  'Use your tools to write and execute the program, not just describe it.',
].join(' ');
// commands.start executes a shell string; keep the prompt one literal argument.
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const agentCommand =
  `opencode run --format json --model ${model} ${shellQuote(prompt)}`;

const csv = await readFile(new URL('./orders.csv', import.meta.url), 'utf8');
const client = new HarakiriClient({ apiUrl, apiKey });
const { sandbox } = await client.createSandbox({
  template: 'opencode', name: process.env.DEMO_RUN ?? 'sdk-order-report',
  ttlSeconds: 600, wait: true,
});
console.log('Created', sandbox.id);
try {
  await client.waitForSandbox(sandbox.id, { statuses: ['running'], timeoutMs: 90000 });
  await client.files.write(sandbox.id, {
    path: '/workspace/orders.csv', content: csv,
    encoding: 'utf8', createParents: true,
  });
  await client.files.write(sandbox.id, {
    path: '/workspace/opencode.json',
    content: JSON.stringify({
      model, small_model: model, enabled_providers: ['opencode'],
      share: 'disabled', autoupdate: false, permission: { '*': 'allow' },
    }),
    encoding: 'utf8',
  });

  const started = await client.commands.start(sandbox.id, {
    command: agentCommand, cwd: '/workspace',
    timeoutMs: 240000, detached: true,
  });
  console.log('OpenCode job', started.command.id);
  const result = await client.commands.wait(
    sandbox.id, started.command.id, { timeoutMs: 260000 },
  );
  assert.equal(result.command.exitCode, 0, 'Agent command failed');
  const logs = await client.commands.logs(sandbox.id, started.command.id);
  const trace = logs.stdout.split('\n').flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const steps = trace.filter((event) => event.type === 'step_finish');
  assert.ok(steps.length > 0 && steps.every((event) => event.part.cost === 0), 'Free-model execution must report zero cost');
  const tools = trace.filter((event) => event.type === 'tool_use');
  assert.ok(tools.length > 0 && tools.every((event) => event.part.state.status === 'completed'), 'Agent tools must complete');
  for (const event of tools) console.log('Agent tool:', event.part.tool);
  const downloaded = await client.files.download(sandbox.id, '/workspace/report.json');
  const summaryFile = await client.files.download(sandbox.id, '/workspace/summary.md');
  const original = await client.files.download(sandbox.id, '/workspace/orders.csv');
  assert.equal(Buffer.from(original.contentBase64, 'base64').toString('utf8'), csv, 'Agent modified input data');
  const report = JSON.parse(Buffer.from(downloaded.contentBase64, 'base64').toString('utf8'));
  const summary = Buffer.from(summaryFile.contentBase64, 'base64').toString('utf8');
  assert.deepEqual(report, { paid_orders: 3, revenue_cents: 29600, refunded_orders: 1 });
  assert.ok(summary.trim().length > 0, 'Agent did not write the requested summary');
  await writeFile(new URL('./report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(new URL('./summary.md', import.meta.url), summary);
  console.log('Downloaded and verified report:', JSON.stringify(report));
  console.log('Downloaded summary.md; review prose separately from verified totals.');
  if (process.env.DEMO_EVIDENCE) {
    await writeFile(process.env.DEMO_EVIDENCE, JSON.stringify({
      sandbox, command: result.command, model, prompt, agentCommand,
      report, summary, inputUnchanged: true, trace: logs.stdout,
    }));
  }
} finally {
  await client.killSandbox(sandbox.id);
  const ended = await client.waitForSandbox(sandbox.id, {
    statuses: ['terminated'], timeoutMs: 30000,
  });
  assert.equal(ended.sandbox.status, 'terminated');
  console.log('Cleaned up', sandbox.id);
}
