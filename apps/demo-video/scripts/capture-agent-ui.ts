import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect, type Locator } from '@playwright/test';
import { demoApi, cleanupRuntime, poll } from './api.js';
import { recordClip } from './record-clip.js';
import { agentEvidence } from './agent-evidence.js';
import { exec, required, root, writeJson, fileHash } from './io.js';

const apiUrl = required('HARAKIRI_API_URL');
const api = demoApi(apiUrl, required('HARAKIRI_API_KEY'));
const web = required('HARAKIRI_WEB_URL');
const model = 'opencode/mimo-v2.5-free';
const runId = `ui-agent-${Date.now()}`;
const directory = join(root, 'docs/artifacts/demo', runId);
await exec('git', ['check-ignore', '--quiet', directory], { cwd: root });
await mkdir(directory, { recursive: true, mode: 0o700 });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const clips: { name: string; video: string; sha256: string; durationMs: number }[] = [];
let sandboxId = '';
let routeUrl = '';
let clean: Promise<void> | undefined;
const cleanup = () => clean ??= (async () => {
  try {
    const matches = sandboxId ? [{ id: sandboxId }] : (await api(`/v1/sandboxes?q=${runId}`)).sandboxes.filter((item: any) => item.name === runId);
    for (const item of matches) await cleanupRuntime(api, item.id, routeUrl || undefined);
  } finally { await browser.close(); }
})();
const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
async function clip(name: string, target?: Locator | { x: number; y: number; width: number; height: number }, action?: () => Promise<void>, duration = 6) {
  if (target && 'boundingBox' in target) await target.scrollIntoViewIfNeeded();
  const region = target ? ('boundingBox' in target ? (await target.boundingBox())! : target) : { x: 0, y: 0, width: 1180, height: 820 };
  assert.ok(region && region.y >= 0 && region.y + region.height <= 821, 'Capture region must be visible');
  const recorded = await recordClip(page, directory, name, region, { duration, action });
  await page.screenshot({ path: join(directory, `${name}.png`), clip: region, animations: 'disabled' });
  clips.push({ name, video: `${name}.mp4`, sha256: await fileHash(join(directory, `${name}.mp4`)), durationMs: recorded.durationMs });
}
async function terminal(command: string, expected: string, timeout = 30000) {
  const input = page.locator('.term-input input');
  await input.fill(command);
  await input.press('Enter');
  await expect(page.locator('.term-line').filter({ hasText: expected }).last()).toBeVisible({ timeout });
}
try {
  await page.goto(`${web}/#dashboard/sandboxes`);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.locator('input[name="username"]').fill(required('HARAKIRI_DEMO_USER'));
  await page.locator('input[name="password"]').fill(required('HARAKIRI_DEMO_PASSWORD'));
  await page.locator('#kc-login').click();
  await page.locator('.page-head').getByRole('button', { name: 'New sandbox' }).click({ timeout: 60000 });
  const modal = page.locator('.modal-sandbox-create');
  await modal.locator('select').first().selectOption('opencode');
  await modal.getByPlaceholder('agent-eval-runner').fill(runId);
  await modal.locator('input[type="number"]').fill('600');
  await modal.locator('textarea').fill(`OPENCODE_CONFIG_CONTENT=${JSON.stringify({ model, small_model: model, enabled_providers: ['opencode'], share: 'disabled', autoupdate: false, permission: { '*': 'allow' } })}`);
  await modal.locator('.modal-body').evaluate((element) => { element.scrollTop = 0; });
  await clip('create', modal);
  await modal.getByRole('button', { name: 'Create sandbox' }).click();
  await expect(page.locator('.detail-id')).toBeVisible({ timeout: 90000 });
  sandboxId = (await page.locator('.detail-id').innerText()).trim();
  await writeJson(join(directory, 'recovery.json'), { runId, apiUrl, sandboxId });
  await expect(page.locator('.terminal-status')).toContainText('attached', { timeout: 90000 });
  const prompt = (await readFile(join(root, 'examples/demo/agent-workflows/ui-prompt.txt'), 'utf8')).trim();
  const command = `cd /workspace && opencode run --format json --model ${model} '${prompt}' > agent.jsonl 2>&1; printf '\\nAGENT_FINISHED\\n'`;
  await page.locator('.term-input input').fill(command);
  await page.locator('.term-input input').press('Enter');
  // Do not mistake the echoed command for the actual completion marker.
  await expect(page.locator('.term-line').filter({ hasText: /^AGENT_FINISHED$/ })).toBeVisible({ timeout: 270000 });
  const trace = await api(`/v1/sandboxes/${sandboxId}/run`, 'POST', { command: 'cat /workspace/agent.jsonl', timeoutMs: 10000 });
  await writeJson(join(directory, 'private-trace.json'), trace);
  const agent = agentEvidence(trace.result.stdout);
  await terminal("jq -Rr 'fromjson? | select(.type == \"tool_use\") | .part.tool' /workspace/agent.jsonl", 'bash');
  await expect(page.locator('.term-line').filter({ hasText: /^bash$/ }).last()).toBeVisible();
  // Capture the visible tool summary, not private reasoning or terminal bootstrap IDs.
  const term = page.locator('.term');
  await page.locator('.term-input').scrollIntoViewIfNeeded();
  const termBox = (await term.boundingBox())!;
  const firstToolLine = (await page.locator('.term-line.cmd').filter({ hasText: /^jq -Rr/ }).last().boundingBox())!;
  const inputBox = (await page.locator('.term-input').boundingBox())!;
  await clip('agent-tools', { x: termBox.x, y: firstToolLine.y, width: termBox.width, height: inputBox.y + inputBox.height - firstToolLine.y });
  await terminal('cd /workspace && node --check server.mjs && nohup node server.mjs > server.log 2>&1 < /dev/null &', 'nohup');
  await poll(() => api(`/v1/sandboxes/${sandboxId}/run`, 'POST', { command: 'curl -fsS http://127.0.0.1:3000/health', timeoutMs: 10000 }), (value) => value.result.exitCode === 0, 30000);
  await page.getByRole('button', { name: 'Filesystem', exact: true }).click();
  await expect(page.locator('.files-table')).toContainText('server.mjs');
  await clip('files', page.locator('.files-pane'));
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.locator('.network-port').fill('3000');
  await page.getByRole('radiogroup', { name: 'Route access mode' }).getByRole('radio', { name: /Public/ }).click();
  await page.getByRole('button', { name: 'Expose port', exact: true }).click();
  await expect(page.locator('.route-table')).toContainText('3000');
  const routes = await poll(() => api(`/v1/sandboxes/${sandboxId}/routes`), (value) => value.routes.some((route: any) => route.port === 3000 && route.url));
  routeUrl = routes.routes.find((route: any) => route.port === 3000).url;
  await writeJson(join(directory, 'recovery.json'), { runId, apiUrl, sandboxId, routeUrl });
  await clip('network', page.locator('.route-table'));
  const health = await poll(async () => { const response = await fetch(`${routeUrl}/health`); return { status: response.status, text: await response.text() }; }, (value) => value.status === 200);
  assert.deepEqual(JSON.parse(health.text), { ok: true });
  await page.goto(routeUrl);
  await expect(page.getByRole('heading', { name: 'Release board', exact: true })).toBeVisible();
  await expect(page.locator('[data-status]:visible')).toHaveCount(3);
  await clip('preview', undefined, async () => {
    await page.waitForTimeout(1000);
    await page.locator('#status-filter').selectOption('passed');
    await expect(page.locator('[data-status]:visible')).toHaveCount(1);
    await expect(page.locator('[data-status]:visible')).toContainText('Portal');
    await page.waitForTimeout(1500);
    await page.locator('#status-filter').selectOption('All');
    await expect(page.locator('[data-status]:visible')).toHaveCount(3);
  }, 8);
  await page.goto(`${web}/#dashboard/sandboxes/${sandboxId}`);
  await page.getByRole('button', { name: 'Kill', exact: true }).click();
  await expect(page.locator('.detail-top')).toContainText('terminated', { timeout: 60000 });
  await clip('terminated', page.locator('.detail-top'));
  await cleanupRuntime(api, sandboxId, routeUrl);
  const sandbox = (await api(`/v1/sandboxes/${sandboxId}`)).sandbox;
  await writeJson(join(directory, 'ui.json'), { id: 'ui-agent-app', capturedAt: new Date().toISOString(), model, version: '0.4.0', sandbox: { id: sandboxId, templateVersionId: sandbox.templateVersionId }, prompt, agent, routeUrl, clips, assertions: ['Agent wrote server and HTML', 'Node syntax check passed', 'Public /health returned 200 and ok:true', 'Three rows displayed', 'Passed filter displayed Portal only', 'All restored three rows', 'UI Kill terminated sandbox and route'], cleanup: true });
  console.log(`UI workflow verified and cleaned: ${directory}`);
} catch (error) {
  await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => undefined);
  throw error;
} finally {
  await cleanup();
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
}
