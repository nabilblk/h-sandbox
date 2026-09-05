import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import type { Checkpoint } from '../src/data/capture-schema.js';
import { fileHash } from './io.js';
import { assertSanitized } from './sanitize.js';
import { recordClip } from './record-clip.js';

export class DemoBrowser {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  readonly checkpoints: Checkpoint[] = [];
  private recordingStarted = 0;
  constructor(readonly options: { web: string; api: string; user: string; password: string; directory: string; sandboxId: string; publicOrigins: string[] }) {}
  async open() {
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
    this.page = await this.context.newPage();
    this.recordingStarted = performance.now();
    this.page.setDefaultTimeout(30_000);
    await this.page.goto(`${this.options.web}/#dashboard/sandboxes/${this.options.sandboxId}`);
    const signIn = this.page.getByRole('button', { name: /Sign in/i });
    await signIn.click();
    await this.page.locator('input[name="username"]').fill(this.options.user);
    await this.page.locator('input[name="password"]').fill(this.options.password);
    await this.page.locator('#kc-login').click();
    await expect(this.page.locator('.detail-id')).toHaveText(this.options.sandboxId, { timeout: 60_000 });
    await this.page.evaluate(() => document.fonts.ready);
  }
  private async checkpoint(name: Checkpoint['name'], assertion: string, crop?: Checkpoint['crop']) {
    const { page, options } = this;
    assertSanitized(await page.locator('body').innerText(), options.publicOrigins);
    const at = performance.now() - this.recordingStarted;
    const region = crop ?? { x: 0, y: 0, width: 1440, height: 900 };
    region.x = Math.floor(region.x); region.y = Math.floor(region.y);
    region.width = Math.floor(region.width / 2) * 2; region.height = Math.floor(region.height / 2) * 2;
    const recording = await recordClip(page, options.directory, name, region);
    const image = `${name}.png`;
    await page.screenshot({ path: join(options.directory, image), animations: 'disabled', clip: region });
    this.checkpoints.push({ name, sandboxId: options.sandboxId, assertion, atMs: at, image, imageSha256: await fileHash(join(options.directory, image)), video: `${name}.mp4`, videoSha256: await fileHash(join(options.directory, `${name}.mp4`)), ...recording, crop: region });
    console.log(`Verified UI: ${name}`);
  }
  async preview(url: string, runId: string) {
    await this.page.goto(url);
    await expect(this.page.locator('#status')).toHaveText('Application running');
    await expect(this.page.locator('#run')).toHaveText(runId);
    await this.checkpoint('preview', `HTTP 200; application run matches ${runId}`);
    await this.page.goto(`${this.options.web}/#dashboard/sandboxes/${this.options.sandboxId}`);
    await expect(this.page.locator('.detail-id')).toHaveText(this.options.sandboxId);
  }
  async runtime() {
    const page = this.page;
    await expect(page.locator('.terminal-status')).toContainText('attached', { timeout: 60_000 });
    await page.locator('.term-input input').fill('pwd && ls -1');
    await page.locator('.term-input input').press('Enter');
    await expect(page.locator('.term')).toContainText('server.mjs');
    const term = (await page.locator('.term').boundingBox())!;
    const firstCommand = (await page.locator('.term-line').filter({ hasText: 'pwd && ls -1' }).first().boundingBox())!;
    const input = (await page.locator('.term-input').boundingBox())!;
    await this.checkpoint('terminal', 'PTY attached; shell output contains /workspace and server.mjs', { x: term.x + 12, y: firstCommand.y, width: term.width - 24, height: input.y + input.height - firstCommand.y + 12 });

    await page.getByRole('button', { name: 'Filesystem', exact: true }).click();
    await expect(page.locator('.files-table')).toContainText('server.mjs');
    await expect(page.locator('.files-toolbar code')).toHaveText('/workspace');
    const toolbar = (await page.locator('.files-toolbar').boundingBox())!;
    const table = (await page.locator('.files-table').boundingBox())!;
    await this.checkpoint('files', 'Provider filesystem contains the uploaded server and HTML', { x: toolbar.x, y: toolbar.y, width: toolbar.width, height: table.y + table.height - toolbar.y });

    await page.getByRole('button', { name: 'Logs', exact: true }).click();
    await expect(page.locator('.logs-row').nth(1)).toBeVisible();
    await expect(page.locator('.logs-pane')).toContainText('control-plane');
    const lifecycle = page.locator('.logs-row').filter({ hasText: 'control-plane' }).first();
    await lifecycle.scrollIntoViewIfNeeded();
    await this.checkpoint('logs', 'Real creation lifecycle event loaded with explicit source label', (await lifecycle.boundingBox())!);

    await page.getByRole('button', { name: 'Metrics', exact: true }).click();
    await expect(page.getByText('CPU snapshot', { exact: true })).toBeVisible();
    await expect(page.locator('.metrics-kpis')).toContainText('MB');
    await expect(page.locator('.metrics-pane .network-warning')).toHaveCount(0);
    const cpu = (await page.locator('.metrics-kpis > *').nth(0).boundingBox())!;
    const memory = (await page.locator('.metrics-kpis > *').nth(1).boundingBox())!;
    await this.checkpoint('metrics', 'Provider CPU/memory snapshot loaded successfully', { x: cpu.x, y: cpu.y, width: memory.x + memory.width - cpu.x, height: cpu.height });

    await page.getByRole('button', { name: 'Network', exact: true }).click();
    await expect(page.locator('.route-table')).toContainText('3000');
    await this.checkpoint('network', 'Port 3000 appears in the real route table', (await page.locator('.route-table').boundingBox())!);
  }
  async terminated() {
    await this.page.reload();
    await expect(this.page.locator('.detail-top')).toContainText('terminated', { timeout: 45_000 });
    await this.checkpoint('terminated', 'Same sandbox now reports terminated', (await this.page.locator('.detail-top').boundingBox())!);
  }
  async finish() {
    await this.browser.close();
    return this.checkpoints;
  }
  async abort() { await this.browser?.close(); }
}
