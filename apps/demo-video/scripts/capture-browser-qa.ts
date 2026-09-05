import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DemoCli } from './cli.js';
import { cleanupRuntime, demoApi } from './api.js';
import { agentEvidence } from './agent-evidence.js';
import { exec, root, required, writeJson, fileHash } from './io.js';

const apiUrl = required('HARAKIRI_API_URL');
const apiKey = required('HARAKIRI_API_KEY');
const name = `browser-qa-${Date.now()}`;
const directory = join(root, 'docs/artifacts/demo', name);
const fixtures = join(root, 'examples/demo/agent-workflows');
const api = demoApi(apiUrl, apiKey);
const cli = new DemoCli(name, apiUrl, apiKey, '0.4.0', fixtures);
await mkdir(directory, { recursive: true, mode: 0o700 });
await exec('git', ['check-ignore', '--quiet', directory]);
await writeJson(join(directory, 'recovery.json'), { runId: name, apiUrl });
let cleaning: Promise<void> | undefined;
const cleanup = () => cleaning ??= (async () => {
  try {
    const candidates = (await api(`/v1/sandboxes?q=${name}`)).sandboxes.filter((item: any) => item.name === name);
    for (const sandbox of candidates) await cleanupRuntime(api, sandbox.id);
  } finally { await cli.remove(); }
})();
const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
try {
  await cli.prepare();
  await exec('docker', ['exec', cli.container, 'mkdir', '-p', '/work']);
  await exec('docker', ['exec', '-w', '/work', cli.container, 'npm', 'install', '--ignore-scripts', '@h-sandbox/sdk@0.4.0'], { timeout: 180000 });
  const sources = ['browser-qa.mjs', 'browser-app.html', 'browser-server.mjs', 'browser-prompt.txt'];
  for (const file of sources) await exec('docker', ['exec', cli.container, 'cp', `/demo/${file}`, `/work/${file}`]);
  const result = await exec('docker', ['exec', '-e', 'HARAKIRI_API_KEY', '-e', `HARAKIRI_API_URL=${apiUrl}`, '-e', `DEMO_RUN=${name}`, '-e', 'DEMO_EVIDENCE=/work/evidence.json', '-w', '/work', cli.container, 'node', 'browser-qa.mjs'], { env: { ...process.env, HARAKIRI_API_KEY: apiKey }, timeout: 850000, maxBuffer: 8000000 });
  console.log(result.stdout);
  const evidence = JSON.parse((await exec('docker', ['exec', cli.container, 'cat', '/work/evidence.json'])).stdout);
  await writeJson(join(directory, 'private-evidence.json'), evidence);
  assert.equal((await api(`/v1/sandboxes/${evidence.sandbox.id}`)).sandbox.status, 'terminated');
  await writeJson(join(directory, 'private-trace.json'), evidence.trace);
  const assets: Record<string, string> = {};
  for (const image of ['desktop.png', 'mobile.png']) {
    await exec('docker', ['cp', `${cli.container}:/work/browser-output/${image}`, join(directory, image)]);
    const metadata = await sharp(join(directory, image)).metadata();
    assert.equal(metadata.width, image === 'desktop.png' ? 1280 : 390);
    assert.equal(metadata.height, image === 'desktop.png' ? 720 : 844);
    const pixels = await sharp(join(directory, image)).removeAlpha().raw().toBuffer();
    let dark = 0; let light = 0;
    for (let index = 0; index < pixels.length; index += 3) {
      if (pixels[index]! < 100) dark++;
      if (pixels[index]! > 210) light++;
    }
    assert.ok(dark > 500 && light > 5000, 'Screenshot must contain visible content and background');
    assets[image] = await fileHash(join(directory, image));
  }
  const sourceHashes: Record<string, string> = {};
  for (const file of sources) sourceHashes[file] = await fileHash(join(fixtures, file));
  const { trace, ...reviewed } = evidence;
  await writeJson(join(directory, 'browser.json'), { ...reviewed, id: 'browser-agent-qa', capturedAt: new Date().toISOString(), version: '0.4.0', sourceHashes, assets, agent: agentEvidence(trace), cleanup: true });
  console.log(`Verified browser evidence: ${directory}`);
} catch (error) {
  await exec('docker', ['cp', `${cli.container}:/work/evidence.json`, join(directory, 'private-failed-evidence.json')]).catch(() => undefined);
  await exec('docker', ['cp', `${cli.container}:/work/browser-output`, join(directory, 'failed-output')]).catch(() => undefined);
  throw error;
} finally {
  await cleanup();
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
}
