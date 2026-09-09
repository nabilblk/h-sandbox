import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { chromium, expect, type Page } from '@playwright/test';
import { demoApi, poll, cleanupRuntime } from './api.js';
import { exec, fileHash, json, required, root, workspace, writeJson, sha256 } from './io.js';
import { fullFrameClip, type TourInput } from './full-frame-clip.js';
import { assertSanitized } from './sanitize.js';
import { tourViewport, uiTourSchema, type UiTour } from '../src/data/ui-tour-schema.js';
import { uiProductTourSteps } from '../../web/src/ui-product-tour.js';

process.umask(0o077);
const identityFile = resolve(required('HARAKIRI_DEMO_IDENTITY'));
const identity = await json(identityFile);
const output = resolve(root, 'docs/artifacts/demo/ui-product-tour', String(Date.now()));
await mkdir(output, { recursive: true, mode: 0o700 });
const api = demoApi(identity.api, identity.apiKey);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: tourViewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const runtimes: string[] = [];
let workspaceId = '', bearer = '', routeUrl = '', stage = 'login', succeeded = false;
const clips: UiTour['clips'] = [];
const origins = ['https://sb.harakiri.io', identity.api, 'https://registry.npmjs.org', 'https://example.com'];
const inventory = () => writeJson(join(output, 'private-inventory.json'), { runtimes, workspaceId, routeUrl, api: identity.api });
page.on('request', (req) => { if (req.url().startsWith(identity.api + '/v1/') && req.headers().authorization?.startsWith('Bearer ')) bearer = req.headers().authorization; });
const human = async (path: string, method = 'GET') => {
  const response = await fetch(identity.api + '/v1/' + path, { method, headers: { authorization: bearer }, signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Human request: ${response.status}`);
  return response.json();
};
const tab = (name: string) => page.locator('.detail-tabs').getByRole('button', { name, exact: true });
const nav = (name: string) => page.locator('.side-nav .side-link').filter({ hasText: new RegExp(`^${name}$`) });
const workspaceRow = () => page.locator('.workspace-row[role=row]').filter({ hasText: 'release-checks' });
const readWorkspace = async () => (await api('/v1/workspaces')).workspaces.find((item: { id: string }) => item.id === workspaceId);
const ready = async () => {
  await expect(page.locator('.detail-id')).toBeVisible({ timeout: 120000 });
  const id = (await page.locator('.detail-id').innerText()).trim();
  if (!runtimes.includes(id)) runtimes.push(id);
  await inventory();
  await poll(() => api('/v1/sandboxes/' + id), result => result.sandbox.status === 'running', 120000);
  return id;
};
const record = async (id: typeof uiProductTourSteps[number]['id'], action: (input: TourInput) => Promise<void>, target: Page = page) => {
  stage = id;
  const step = uiProductTourSteps.find(item => item.id === id)!;
  assert.equal(uiProductTourSteps[clips.length]!.id, id);
  await target.evaluate(() => document.fonts.ready);
  const screenText = async () => stripVTControlCharacters(await target.locator('body').innerText({ timeout: 3000 })).replace(/\r/g, '');
  assertSanitized(await screenText(), origins);
  let scanFailure: unknown;
  let stopped = false;
  const scan = async () => {
    while (!stopped) {
      try { assertSanitized(await screenText(), origins); }
      catch (error) { scanFailure = error; await writeFile(join(output, 'private-scan-text.txt'), await screenText().catch(() => ''), { mode: 0o600 }); }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };
  const scanner = scan();
  let result;
  try { result = await fullFrameClip(target, output, id, step.seconds, action); }
  finally { stopped = true; await scanner; }
  if (scanFailure) throw scanFailure;
  const file = id + '.mp4';
  await target.screenshot({ path: join(output, id + '.png') });
  clips.push({ id, file, sha256: await fileHash(join(output, file)), seconds: step.seconds, ...tourViewport, crop: 'none', speed: 1, recording: result.recording, pointer: result.pointer });
  await writeJson(join(output, 'private-progress.json'), clips);
  console.log(`Recorded full-frame chapter ${clips.length}/${uiProductTourSteps.length}: ${id}`);
};
const create = async (input: TourInput, name: string) => {
  await input.click(workspaceRow().getByRole('button', { name: 'Create sandbox', exact: true }));
  const modal = page.locator('.modal-sandbox-create');
  await expect(modal.getByRole('button', { name: 'Create sandbox', exact: true })).toBeEnabled();
  await input.select(modal.locator('select').first(), 'node-20');
  await input.type(modal.getByPlaceholder('agent-eval-runner'), name);
  await input.type(modal.getByLabel('Lifetime (seconds)'), '1800');
  await expect(modal.getByLabel('Persistent workspace')).toHaveValue(workspaceId);
  await input.pause(1500);
  await input.click(modal.getByRole('button', { name: 'Create sandbox', exact: true }));
};
const run = async (input: TourInput, command: string, expected: string) => {
  await input.click(tab('Commands'));
  await input.type(page.getByLabel('Working directory', { exact: true }), '/workspace');
  await input.type(page.getByLabel('Command', { exact: true }), command);
  await input.click(page.getByRole('button', { name: 'Run', exact: true }));
  await expect(page.getByLabel('Command output', { exact: true })).toContainText(expected);
};
try {
  await page.goto(identity.web + '/#dashboard/sandboxes');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('input[name=username]').fill(identity.username);
  await page.locator('input[name=password]').fill(identity.password);
  await page.locator('#kc-login').click();
  await expect(page.locator('.side-nav')).toBeVisible({ timeout: 45000 });
  const me = await human('me');
  assert.equal(me.organization.id, identity.organizationId, 'Only the isolated tour organization may be recorded');
  assert.equal(me.user.email, identity.username);
  assert.equal((await api('/v1/sandboxes')).sandboxes.filter((s: { status: string }) => s.status !== 'terminated').length, 0);
  assert.ok((await api('/v1/workspaces')).workspaces.every((w: { status: string }) => w.status === 'archived'), 'The recording organization must have no active project storage');
  await expect(page.locator('.org-name')).toHaveText(me.organization.slug);
  await record('orientation', async input => { await input.pause(1200); await input.click(nav('Sandboxes')); });
  await record('templates', async input => {
    await input.click(nav('Templates'));
    await expect(page.locator('.tmpl-row[role=button]').filter({ hasText: 'Node 20' }).first()).toBeVisible();
    await input.type(page.getByPlaceholder('Search by name or ID...'), 'Node 20');
    await input.pause(1800);
    await input.click(page.locator('.tmpl-row[role=button]').filter({ hasText: 'Node 20' }).first());
    await expect(page.locator('.template-detail-title')).toContainText('Node 20');
  });
  await record('workspace', async input => {
    await input.click(nav('Workspaces'));
    await input.click(page.getByRole('button', { name: 'New workspace', exact: true }));
    await input.type(page.getByPlaceholder('agent-project'), 'release-checks');
    const response = page.waitForResponse(r => r.url().endsWith('/v1/workspaces') && r.request().method() === 'POST');
    await input.click(page.getByRole('button', { name: 'Create workspace', exact: true }));
    const created = await response;
    assert.ok(created.ok());
    workspaceId = (await created.json()).workspace.id;
    await inventory();
    await expect(workspaceRow()).toContainText('Available');
  });
  await record('launch', input => create(input, 'release-checks-01'));
  const first = await ready();
  await expect(page.locator('.terminal-status')).toContainText('attached', { timeout: 60000 });
  await record('terminal', async input => {
    await input.type(page.locator('.term-input input'), 'pwd && node --version');
    await page.locator('.term-input input').press('Enter');
    await expect(page.locator('.term')).toContainText('v20.');
  });
  const fixtureHashes: Record<string, string> = {};
  for (const name of ['README.md', 'check.mjs', 'server.mjs', 'prepare-tools.sh']) {
    const path = join(workspace, 'fixtures/ui-product-tour', name);
    const content = await readFile(path, 'utf8');
    fixtureHashes[name] = sha256(content);
    await api(`/v1/sandboxes/${first}/files`, 'PUT', { path: '/workspace/' + name, content, encoding: 'utf8', createParents: true });
  }
  await record('tools', input => run(input, 'sh prepare-tools.sh', 'Installing connectivity tools.'));
  await expect(page.locator('.command-output-toolbar')).toContainText('exit 0', { timeout: 120000 });
  const baseline = await api(`/v1/sandboxes/${first}/egress/test`, 'POST', { target: 'https://example.com' });
  assert.equal(baseline.ok, true);
  const openProject = async (input: TourInput) => {
    await input.click(tab('Filesystem'));
    await expect(page.locator('.files-table .files-row.clickable').filter({ hasText: 'workspace' })).toBeVisible();
    await input.click(page.locator('.files-table .files-row.clickable').filter({ hasText: 'workspace' }));
    await expect(page.locator('.files-table')).toContainText('check.mjs');
  };
  await record('files', openProject);
  await record('commands', async input => { await run(input, 'node check.mjs', '3 checks passed. Saved report.json.'); await expect(page.locator('.command-output-toolbar')).toContainText('exit 0'); });
  const report = await api(`/v1/sandboxes/${first}/files/read?path=${encodeURIComponent('/workspace/report.json')}`);
  const reportSha256 = sha256(report.content);
  await record('reconnect', async input => {
    await openProject(input);
    await expect(page.locator('.files-table')).toContainText('report.json');
    await input.pause(2000);
    await input.click(tab('Commands'));
    await input.click(page.locator('.command-list-item').filter({ hasText: 'node check.mjs' }));
    await expect(page.getByLabel('Command output', { exact: true })).toContainText('3 checks passed');
  });
  await record('server', input => run(input, 'node server.mjs', 'Release preview ready on port 3000.'));
  await record('preview', async input => {
    await input.click(tab('Network'));
    await input.click(page.getByRole('radio', { name: 'Public', exact: true }));
    const response = page.waitForResponse(r => r.url().includes('/routes') && r.request().method() === 'POST');
    await input.click(page.getByRole('button', { name: 'Expose port', exact: true }));
    const exposed = await response;
    assert.ok(exposed.ok());
    const route = (await exposed.json()).route;
    routeUrl = route.url;
    origins.push(new URL(routeUrl).origin);
    await inventory();
    await expect(page.locator('.network-url a').first()).toBeVisible();
    await input.pause(1500);
    // Same browser tab keeps every preview pixel in the full-frame recording.
    await page.goto(routeUrl);
    await expect(page.getByRole('heading', { name: 'Release checks' })).toBeVisible();
    await expect(page.getByText('3 / 3 checks passed', { exact: true })).toBeVisible();
  });
  await page.goBack();
  await expect(page.locator('.detail-tabs')).toBeVisible();
  await tab('Network').click();
  const egress = (await api(`/v1/sandboxes/${first}/egress`)).egress;
  assert.equal(egress.providerStatus.available, true);
  await record('egress', async input => {
    await input.click(page.getByRole('radio', { name: 'Selected destinations Presets and added domains' }));
    await input.click(page.locator('.egress-presets button').filter({ hasText: 'Node packages' }));
    await input.type(page.locator('.egress-test input'), 'https://registry.npmjs.org');
    await input.click(page.getByRole('button', { name: 'Test access', exact: true }));
    await expect(page.locator('.egress-test-result.ok')).toContainText('Reachable', { timeout: 12000 });
    await input.pause(1600);
    await input.type(page.locator('.egress-test input'), 'https://example.com');
    await input.click(page.getByRole('button', { name: 'Test access', exact: true }));
    await expect(page.locator('.egress-test-result.blocked')).toContainText('Blocked or unreachable', { timeout: 12000 });
  });
  await record('inspect', async input => {
    await input.click(tab('Logs')); await expect(page.locator('.logs-pane')).not.toBeEmpty(); await input.pause(2500);
    await input.click(tab('Metrics')); await expect(page.locator('.metrics-kpis')).toBeVisible();
    assert.equal(await page.locator('.network-warning').count(), 0);
  });
  await record('release', async input => { await input.click(page.getByRole('button', { name: 'Kill', exact: true })); await expect(page.locator('.detail-title-line .pill')).toContainText('terminated'); });
  await poll(readWorkspace, w => w.status === 'available', 120000);
  await page.getByRole('link', { name: /Workspace:/ }).click();
  await expect(workspaceRow()).toContainText('Available');
  await record('replacement', input => create(input, 'release-checks-02'));
  const second = await ready();
  assert.notEqual(second, first);
  await record('verify', input => run(input, `node -e 'const r=require("./report.json");if(r.results.length!==3||!r.results.every(x=>x.passed))process.exit(1);console.log("Retained report: 3 checks passed")'`, 'Retained report: 3 checks passed'));
  const retained = await api(`/v1/sandboxes/${second}/files/read?path=${encodeURIComponent('/workspace/report.json')}`);
  assert.equal(sha256(retained.content), reportSha256);
  // Wait for release off-camera so the archive chapter never promises instant storage handoff.
  await page.getByRole('button', { name: 'Kill', exact: true }).click();
  await poll(readWorkspace, w => w.status === 'available', 120000);
  await record('cleanup', async input => {
    await input.click(page.getByRole('link', { name: /Workspace:/ }));
    await input.click(workspaceRow().getByRole('button', { name: 'Archive', exact: true }));
    await input.pause(2200);
    await input.click(page.getByRole('button', { name: 'Archive and retain files', exact: true }));
    await input.select(page.getByLabel('Workspace status'), 'archived');
    await expect(workspaceRow()).toContainText('Storage retained');
  });
  for (const id of runtimes) await cleanupRuntime(api, id, id === first ? routeUrl : undefined);
  assert.equal((await readWorkspace()).status, 'archived');
  await human('api-keys/' + identity.apiKeyId, 'DELETE');
  identity.apiKey = ''; identity.apiKeyId = ''; identity.expiresAt = '';
  await writeJson(identityFile, identity);
  const sourceFiles: Record<string, string> = {};
  const tracked = (await exec('git', ['ls-files', 'apps/web/src', 'apps/web/public/config.js'], { cwd: root })).stdout.trim().split('\n');
  for (const file of [...new Set([...tracked, 'apps/web/src/ui-product-tour.ts', 'apps/demo-video/scripts/capture-ui-tour.ts', 'apps/demo-video/scripts/full-frame-clip.ts'])]) sourceFiles[file] = await fileHash(join(root, file));
  const tour = uiTourSchema.parse({ schemaVersion: 1, id: 'ui-product-tour', capturedAt: new Date().toISOString(), sourceRevision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), sourceFiles, appOrigin: 'https://sb.harakiri.io', frontend: 'local-source-preview-against-live-api', apiOrigin: identity.api, previewOrigin: new URL(routeUrl).origin, viewport: { ...tourViewport, deviceScaleFactor: 1, browserZoom: 1 }, fixtureHashes, reportSha256, replacementVerified: true, networkProof: { baselineReachable: true, allowedReachable: true, unlistedDenied: true }, cleanup: { runtimesTerminated: 2, routesInactive: true, workspace: 'archived-files-retained', captureKeyRevoked: true }, clips });
  await writeJson(join(output, 'tour.json'), tour);
  await writeJson(join(root, 'docs/artifacts/demo/ui-product-tour/latest.json'), { directory: output });
  succeeded = true;
  console.log('Capture complete. Both runtimes terminated, workspace archived, capture key revoked. Raw media remains private pending review.');
} catch (error) {
  await writeFile(join(output, 'private-error.txt'), String(error), { mode: 0o600 });
  await page.screenshot({ path: join(output, 'private-error.png') }).catch(() => undefined);
  console.error(`Tour capture failed at ${stage}; private diagnostics and resource inventory were saved.`);
  process.exitCode = 1;
} finally {
  if (!succeeded) {
    for (const id of runtimes) await cleanupRuntime(api, id).catch(() => { console.error('Owned runtime needs cleanup; see private inventory.'); });
    if (workspaceId) await poll(readWorkspace, w => w.status === 'available' || w.status === 'archived', 120000).then(async w => { if (w.status === 'available') await api('/v1/workspaces/' + workspaceId + '/archive', 'POST'); }).catch(() => { console.error('Owned workspace needs release/archive; see private inventory.'); });
    if (bearer && identity.apiKeyId) await human('api-keys/' + identity.apiKeyId, 'DELETE').then(async () => { identity.apiKey = ''; identity.apiKeyId = ''; identity.expiresAt = ''; await writeJson(identityFile, identity); }).catch(() => { console.error('Capture key revocation needs retry; it has an explicit expiry.'); });
  }
  await browser.close();
}
