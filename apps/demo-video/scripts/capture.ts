import { access, mkdir, statfs } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { DemoCli } from './cli.js';
import { DemoBrowser } from './browser.js';
import { demoApi, poll, cleanupRuntime } from './api.js';
import { captureSchema, type Capture } from '../src/data/capture-schema.js';
import { exec, required, root, sha256, writeJson } from './io.js';
import { assertSanitized, sanitize } from './sanitize.js';

async function capture() {
  const apiUrl = required('HARAKIRI_API_URL').replace(/\/$/, '');
  const webUrl = required('HARAKIRI_WEB_URL').replace(/\/$/, '');
  const apiKey = required('HARAKIRI_API_KEY');
  const user = required('HARAKIRI_DEMO_USER');
  const password = required('HARAKIRI_DEMO_PASSWORD');
  const release = required('HARAKIRI_DEMO_RELEASE');
  const version = process.env.HARAKIRI_DEMO_CLI_VERSION ?? release.replace(/^v/, '');
  const templateId = process.env.HARAKIRI_DEMO_TEMPLATE ?? 'open-agents-dev';
  const ttl = Number(process.env.HARAKIRI_DEMO_TTL ?? 300);
  assert.ok(Number.isInteger(ttl) && ttl >= 60 && ttl <= 1800, 'TTL must be 60-1800 seconds');
  for (const url of [apiUrl, webUrl]) assert.equal(new URL(url).protocol, 'https:', 'Publishing capture requires public HTTPS');
  const runId = `product-demo-${new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, '')}`;
  const directory = resolve(process.env.HARAKIRI_DEMO_OUTPUT ?? join(root, 'docs/artifacts/demo'), runId);
  await exec('git', ['check-ignore', '--quiet', join(directory, 'recovery.json')], { cwd: root });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const disk = await statfs(directory);
  assert.ok(disk.bavail * disk.bsize > 1024 ** 3, 'At least 1 GiB free space is required');
  await exec('ffmpeg', ['-version']);
  await access(chromium.executablePath());
  const api = demoApi(apiUrl, apiKey);
  const template = (await api(`/v1/templates/${encodeURIComponent(templateId)}`)).template;
  assert.ok(template.status === 'ready', 'Demo template must be ready');
  const specText = await (await fetch(`${apiUrl}/openapi.json`)).text();
  const apiVersion = JSON.parse(specText).info.version;
  assert.equal(apiVersion, release.replace(/^v/, ''), 'API specification version must match capture release');
  const webHtml = await (await fetch(webUrl)).text();
  const scriptMatch = webHtml.match(/src="(\/assets\/[^" ]+\.js)"/);
  assert.ok(scriptMatch, 'Web release bundle is missing');
  const webBundle = await (await fetch(`${webUrl}${scriptMatch[1]}`)).text();
  const sourceRevision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const cli = new DemoCli(runId, apiUrl, apiKey, version);
  let sandboxId = '';
  let routeUrl = '';
  let browser: DemoBrowser | undefined;
  let terminal: Capture['terminal'] | undefined;
  let sandbox: any;
  let checkpoints: Capture['checkpoints'] = [];
  let cleanupComplete = false;
  const recovery = () => writeJson(join(directory, 'recovery.json'), { runId, apiUrl, sandboxId, routeUrl });
  let cleaning: Promise<void> | undefined;
  const clean = () => cleaning ??= (async () => {
    try {
      if (sandboxId) await cleanupRuntime(api, sandboxId, routeUrl || undefined);
      else {
        const matching = (await api(`/v1/sandboxes?q=${encodeURIComponent(runId)}`)).sandboxes.filter((item: any) => item.name === runId);
        for (const item of matching) await cleanupRuntime(api, item.id);
      }
    } finally { await cli.remove(); }
    cleanupComplete = true;
  })();
  let interrupted = false;
  const interrupt = (exitCode = 130) => {
    if (interrupted) return;
    interrupted = true;
    void (async () => {
      try { await browser?.abort(); await clean(); process.exitCode = exitCode; }
      catch { console.error(`Cleanup needed: ${join(directory, 'recovery.json')}`); process.exitCode = 1; }
      finally { process.exit(process.exitCode); }
    })();
  };
  const terminate = () => interrupt(143);
  const fatal = (error: unknown) => { console.error(sanitize(`Capture interrupted: ${String(error)}`, [apiKey, password])); interrupt(1); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  process.once('uncaughtException', fatal);
  process.once('unhandledRejection', fatal);
  await recovery();
  try {
    await cli.prepare();
    console.log(`Capturing published CLI ${version}`);
    const result = await cli.run('create', ['create', '--template', templateId, '--name', runId, '--ttl', String(ttl), '--env', `DEMO_RUN=${runId}`, '--env', `DEMO_TEMPLATE=${templateId}`]);
    sandboxId = result.split('\n').find((line) => /^sbx_[a-zA-Z0-9_-]+$/.test(line.trim()))?.trim() ?? '';
    assert.ok(sandboxId, 'CLI did not return a sandbox ID');
    await recovery();
    console.log('Sandbox created; cleanup recovery is recorded.');
    sandbox = (await poll(() => api(`/v1/sandboxes/${sandboxId}`), (value) => value.sandbox.status === 'running')).sandbox;
    assert.equal(sandbox.name, runId);
    for (const [file, name] of [['server.mjs', 'upload-server'], ['index.html', 'upload-html'], ['mark.svg', 'upload-logo']]) {
      await cli.run(name, ['file-upload', sandboxId, '--from', `/demo/${file}`, '--path', `/workspace/${file}`, '--parents']);
    }
    const files = await api(`/v1/sandboxes/${sandboxId}/files?path=%2Fworkspace`);
    assert.ok(files.files.some((file: any) => file.name === 'server.mjs'));
    terminal = await cli.attach(sandboxId);
    await cli.run('start', ['command', 'run', sandboxId, '--cwd', '/workspace', '--cmd', 'node server.mjs', '--detached']);
    const commandList = await api(`/v1/sandboxes/${sandboxId}/commands`);
    const command = commandList.commands.find((item: any) => item.command === 'node server.mjs');
    assert.ok(command, 'Tracked server command is missing');
    await poll(() => api(`/v1/sandboxes/${sandboxId}/commands/${command.id}`), (value) => value.command.status === 'running');
    const exposed = await cli.run('expose', ['expose', sandboxId, '--port', '3000', '--wait', '--wait-path', '/health', '--expect-status', '200']);
    routeUrl = exposed.split('\n').find((line) => /^https:\/\//.test(line.trim()))?.trim() ?? '';
    assert.ok(routeUrl, 'CLI did not return a public HTTPS route');
    await recovery();
    const response = await fetch(`${routeUrl.replace(/\/$/, '')}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).run, runId);
    await cli.run('routes', ['routes', sandboxId]);
    const logs = await api(`/v1/sandboxes/${sandboxId}/commands/${command.id}/logs`);
    assert.match(logs.stdout, /Harakiri demo listening/);
    const metrics = await api(`/v1/sandboxes/${sandboxId}/metrics`);
    assert.equal(typeof metrics.current.cpu, 'number');
    assert.ok(Number.isFinite(metrics.current.mem));
    const origins = [apiUrl, webUrl, new URL(routeUrl).origin];
    browser = new DemoBrowser({ web: webUrl, api: apiUrl, user, password, directory, sandboxId, publicOrigins: origins });
    await browser.open();
    await browser.preview(routeUrl, runId);
    await browser.runtime();
    await cli.run('kill', ['kill', sandboxId]);
    await cleanupRuntime(api, sandboxId, routeUrl);
    await browser.terminated();
    checkpoints = await browser.finish();
  } catch (error) {
    console.error(sanitize(`Scenario failed: ${(error as Error).message}`, [apiKey, password]));
    throw error;
  } finally {
    await browser?.abort();
    try { await clean(); }
    catch { console.error(`Cleanup failed; recover using ${join(directory, 'recovery.json')}`); throw new Error('Demo cleanup incomplete'); }
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    process.off('uncaughtException', fatal);
    process.off('unhandledRejection', fatal);
  }
  assert.ok(terminal && cleanupComplete);
  const manifest = captureSchema.parse({
    schemaVersion: 1, source: 'live', status: 'captured', publishable: false,
    runId, capturedAt: new Date().toISOString(), cliVersion: version, release, sourceRevision,
    publicOrigins: [apiUrl, webUrl, new URL(routeUrl).origin],
    releaseEvidence: { apiSpecSha256: sha256(specText), webAssetSha256: sha256(webBundle) },
    sandbox: { id: sandboxId, template: templateId, version: sandbox.templateVersionId ?? template.currentVersionId ?? template.versionId, status: 'terminated', ttl },
    route: { url: routeUrl, port: 3000, readyStatus: 200, runMatched: true },
    events: cli.events, terminal, checkpoints,
    cleanup: { status: 'complete', sandboxTerminal: true, routeInactive: true, containerRemoved: true, completedAt: new Date().toISOString() }, review: null,
  });
  assertSanitized(JSON.stringify(manifest), manifest.publicOrigins);
  await writeJson(join(directory, 'capture.json'), manifest);
  console.log(`Verified live run and cleanup. Review candidate: ${join(directory, 'capture.json')}`);
}

capture().catch((error) => {
  console.error(sanitize(`Capture failed: ${error.message}`, [process.env.HARAKIRI_API_KEY ?? '', process.env.HARAKIRI_DEMO_PASSWORD ?? '']));
  process.exitCode = 1;
});
