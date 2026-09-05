import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { HarakiriClient } from '@h-sandbox/sdk';

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const model = process.env.OPENCODE_MODEL ?? 'opencode/mimo-v2.5-free';
if (!apiUrl || !apiKey) throw new Error('Set HARAKIRI_API_URL and HARAKIRI_API_KEY');
if (!/^opencode\/[a-z0-9.-]+-free$/.test(model)) throw new Error('Select an explicit free model');
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const prompt = (await readFile(new URL('./browser-prompt.txt', import.meta.url), 'utf8')).trim();
const agentCommand = `opencode run --format json --model ${model} ${shellQuote(prompt)}`;
const client = new HarakiriClient({ apiUrl, apiKey });
const { sandbox } = await client.createSandbox({
  template: 'opencode', name: process.env.DEMO_RUN ?? 'browser-qa',
  ttlSeconds: 1200, wait: true,
});
console.log('Created', sandbox.id);
const evidence = { sandbox, prompt, agentCommand, model };
const download = async (path) => Buffer.from((await client.files.download(sandbox.id, `/workspace/${path}`)).contentBase64, 'base64');
const run = async (command, timeoutMs = 60000, expectSuccess = true) => {
  const started = await client.commands.start(sandbox.id, { command, cwd: '/workspace', timeoutMs, detached: true });
  const result = await client.commands.wait(sandbox.id, started.command.id, {
    timeoutMs: timeoutMs + 20000, statuses: ['succeeded', 'failed', 'killed'],
  });
  const logs = await client.commands.logs(sandbox.id, started.command.id);
  if (expectSuccess) assert.equal(result.command.exitCode, 0, `Remote command failed: ${logs.stderr.slice(-1200)} ${logs.stdout.slice(-1200)}`);
  return { command: result.command, ...logs };
};
try {
  await client.waitForSandbox(sandbox.id, { statuses: ['running'], timeoutMs: 90000 });
  const fixtures = {};
  for (const name of ['browser-app.html', 'browser-server.mjs']) {
    fixtures[name] = await readFile(new URL(`./${name}`, import.meta.url), 'utf8');
    await client.files.write(sandbox.id, { path: `/workspace/${name}`, content: fixtures[name], encoding: 'utf8', createParents: true });
  }
  await client.files.write(sandbox.id, {
    path: '/workspace/opencode.json', encoding: 'utf8',
    content: JSON.stringify({ model, small_model: model, enabled_providers: ['opencode'], share: 'disabled', autoupdate: false, permission: { '*': 'allow' } }),
  });
  // Cold setup for the stock OpenCode image. Bake these pinned tools into a
  // custom template for repeated runs; do not elevate a restricted runtime.
  const setupStarted = Date.now();
  await run('npm install --save-exact playwright@1.60.0 && npx playwright install --with-deps chromium', 360000);
  evidence.setupSeconds = Math.round((Date.now() - setupStarted) / 1000);
  console.log('Browser dependencies ready in', evidence.setupSeconds, 'seconds');
  await client.commands.start(sandbox.id, {
    command: 'node browser-server.mjs', cwd: '/workspace', timeoutMs: 600000, detached: true,
  });
  await run('curl --fail --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/health');
  const agent = await run(`BASE_URL=http://127.0.0.1:3000 ${agentCommand}`, 240000);
  evidence.trace = agent.stdout;
  const events = agent.stdout.split('\n').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const steps = events.filter((event) => event.type === 'step_finish');
  const tools = events.filter((event) => event.type === 'tool_use');
  assert.ok(steps.length && steps.every((event) => event.part.cost === 0), 'Missing zero-cost model steps');
  assert.ok(tools.length && tools.every((event) => event.part.state.status === 'completed'), 'Missing completed tools');
  for (const [name, original] of Object.entries(fixtures)) assert.equal((await download(name)).toString(), original, `Agent changed ${name}`);
  evidence.inputUnchanged = true;
  const generatedTest = await download('qa.mjs');
  // A fresh caller-triggered run must recreate artifacts, not reuse agent output.
  await run('rm -f qa-report.json desktop.png mobile.png && BASE_URL=http://127.0.0.1:3000 node qa.mjs');
  const report = JSON.parse((await download('qa-report.json')).toString());
  assert.deepEqual(report, { initialRows: 3, passedNames: ['Portal'], restoredRows: 3, mobileOverflow: false });
  evidence.report = report;
  evidence.testSource = generatedTest.toString();
  const output = new URL('./browser-output/', import.meta.url);
  await mkdir(output, { recursive: true });
  for (const name of ['qa.mjs', 'qa-report.json', 'desktop.png', 'mobile.png']) await writeFile(new URL(name, output), await download(name));
  console.log('Independent browser run passed', JSON.stringify(report));

  // The mutation is introduced only after generation. Reuse the exact test
  // against a second local server whose filter intentionally returns all rows.
  const needle = "filter.value === 'all' || item.status === filter.value";
  assert.ok(fixtures['browser-app.html'].includes(needle));
  await client.files.write(sandbox.id, { path: '/workspace/mutant/browser-app.html', content: fixtures['browser-app.html'].replace(needle, 'true'), encoding: 'utf8', createParents: true });
  await client.files.write(sandbox.id, { path: '/workspace/mutant/browser-server.mjs', content: fixtures['browser-server.mjs'], encoding: 'utf8' });
  await client.commands.start(sandbox.id, {
    command: 'PORT=3001 node mutant/browser-server.mjs', cwd: '/workspace', timeoutMs: 120000, detached: true,
  });
  await run('curl --fail --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3001/health');
  const mutant = await run('BASE_URL=http://127.0.0.1:3001 node qa.mjs', 60000, false);
  assert.ok(mutant.command.exitCode !== null && mutant.command.exitCode !== 0, 'Tests missed the broken filter');
  assert.match(mutant.stderr + mutant.stdout, /AssertionError|ERR_ASSERTION/, 'Mutation must fail an assertion, not a browser startup error');
  assert.deepEqual(await download('qa.mjs'), generatedTest, 'Generated test changed during verification');
  evidence.mutationExitCode = mutant.command.exitCode;
  evidence.mutationOutput = mutant.stderr + mutant.stdout;
  evidence.testUnchanged = true;
  console.log('Broken filter rejected; original generated test unchanged.');
} finally {
  if (process.env.DEMO_EVIDENCE) await writeFile(process.env.DEMO_EVIDENCE, JSON.stringify(evidence)).catch(() => console.error('Could not retain private evidence'));
  await client.killSandbox(sandbox.id);
  await client.waitForSandbox(sandbox.id, { statuses: ['terminated'], timeoutMs: 30000 });
  console.log('Cleaned up', sandbox.id);
}
